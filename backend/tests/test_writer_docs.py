import uuid

import pytest
from httpx import AsyncClient, ASGITransport

from backend.api.main import app
from backend.api.schemas import WRITER_DOC_MAX_CHARS
from backend.db.session import Base, engine

pytestmark = pytest.mark.anyio


@pytest.fixture
async def client():
    # Tests skip the app lifespan, so make sure the W2 tables exist.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


def _user():
    return {"X-Guest-ID": f"test-writer-{uuid.uuid4().hex[:8]}"}


async def test_chat_draft_is_owner_only(client):
    a, b = _user(), _user()
    sid = (await client.post("/api/sessions", headers=a, json={"title": "A's chat"})).json()["id"]
    body = {"session_id": sid, "title": "t", "content_html": "<p>A</p>", "content_markdown": "A", "citations_data": []}
    assert (await client.post("/api/editor/draft", headers=a, json=body)).status_code == 200
    assert (await client.get(f"/api/editor/draft/{sid}", headers=b)).status_code == 404
    assert (await client.post("/api/editor/draft", headers=b, json={**body, "content_html": "<p>B</p>"})).status_code == 404
    assert (await client.get(f"/api/editor/draft/{sid}", headers=a)).json()["content_html"] == "<p>A</p>"


async def test_writer_doc_round_trip(client):
    h = _user()
    assert (await client.get("/api/writer/docs", headers=h)).json() == []

    r = await client.post(
        "/api/writer/docs", headers=h,
        json={"title": "  My Draft ", "content_html": "<p>hi</p>", "citations_data": [{"key": "a"}]},
    )
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["title"] == "My Draft" and doc["content_html"] == "<p>hi</p>"
    assert doc["citations_data"] == [{"key": "a"}]

    listed = (await client.get("/api/writer/docs", headers=h)).json()
    assert len(listed) == 1 and listed[0]["id"] == doc["id"]
    assert set(listed[0]) == {"id", "title", "created_at", "updated_at"}  # no content in the list

    got = (await client.get(f"/api/writer/docs/{doc['id']}", headers=h)).json()
    assert got["content_html"] == "<p>hi</p>"

    r = await client.put(f"/api/writer/docs/{doc['id']}", headers=h, json={"content_html": "<p>v2</p>"})
    assert r.status_code == 200, r.text
    upd = r.json()
    assert upd["content_html"] == "<p>v2</p>" and upd["title"] == "My Draft"  # title untouched
    assert upd["citations_data"] == [{"key": "a"}]
    assert upd["updated_at"] > doc["updated_at"]
    assert upd["created_at"] == doc["created_at"]

    r = await client.put(f"/api/writer/docs/{doc['id']}", headers=h, json={"title": "Renamed", "citations_data": []})
    assert r.json()["title"] == "Renamed" and r.json()["citations_data"] == []

    assert (await client.delete(f"/api/writer/docs/{doc['id']}", headers=h)).status_code == 200
    assert (await client.get(f"/api/writer/docs/{doc['id']}", headers=h)).status_code == 404
    assert (await client.delete(f"/api/writer/docs/{doc['id']}", headers=h)).status_code == 404
    assert (await client.get("/api/writer/docs", headers=h)).json() == []


async def test_writer_doc_validation(client):
    h = _user()
    assert (await client.post("/api/writer/docs", headers=h, json={"title": "x" * 201})).status_code == 422
    assert (await client.post("/api/writer/docs", headers=h, json={"title": "   "})).status_code == 422
    assert (await client.post("/api/writer/docs", headers=h, json={"title": "x" * 200})).status_code == 201

    doc = (await client.post("/api/writer/docs", headers=h, json={})).json()
    assert doc["title"] == "Untitled Document"
    r = await client.put(f"/api/writer/docs/{doc['id']}", headers=h, json={"title": "x" * 201})
    assert r.status_code == 422


async def test_writer_doc_oversize_content_rejected(client):
    h = _user()
    doc = (await client.post("/api/writer/docs", headers=h, json={"content_html": "<p>ok</p>"})).json()
    big = "a" * (WRITER_DOC_MAX_CHARS + 1)
    assert (await client.put(f"/api/writer/docs/{doc['id']}", headers=h, json={"content_html": big})).status_code == 422
    assert (await client.post("/api/writer/docs", headers=h, json={"content_html": big})).status_code == 422
    # rejected write left the stored content alone
    got = (await client.get(f"/api/writer/docs/{doc['id']}", headers=h)).json()
    assert got["content_html"] == "<p>ok</p>"


async def test_writer_doc_tenant_isolation(client):
    a, b = _user(), _user()
    doc = (await client.post("/api/writer/docs", headers=a, json={"title": "A's", "content_html": "<p>secret</p>"})).json()
    url = f"/api/writer/docs/{doc['id']}"

    assert (await client.get(url, headers=b)).status_code == 404
    assert (await client.put(url, headers=b, json={"title": "pwn"})).status_code == 404
    assert (await client.delete(url, headers=b)).status_code == 404
    assert (await client.get("/api/writer/docs", headers=b)).json() == []

    mine = (await client.get(url, headers=a)).json()
    assert mine["title"] == "A's" and mine["content_html"] == "<p>secret</p>"
