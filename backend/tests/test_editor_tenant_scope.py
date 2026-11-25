import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import delete

from backend.api.auth import get_current_user
from backend.api.main import app
from backend.db.models import User, UserDocument
from backend.db.session import Base, engine, AsyncSessionLocal

pytestmark = pytest.mark.anyio

EMPTY_HITS = {"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}


@pytest.fixture
async def world():
    """Two users; B owns one document, A owns none."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    tag = uuid.uuid4().hex[:8]
    a = User(id=f"scope-a-{tag}", is_guest=True)
    b = User(id=f"scope-b-{tag}", is_guest=True)
    b_doc = f"b-secret-{tag}.pdf"
    a_doc = f"a-own-{tag}.pdf"
    async with AsyncSessionLocal() as db:
        db.add(UserDocument(user_id=b.id, doc_name=b_doc, file_hash=f"h-b-{tag}"))
        await db.commit()
    yield {"a": a, "b": b, "b_doc": b_doc, "a_doc": a_doc, "tag": tag}
    app.dependency_overrides.pop(get_current_user, None)
    async with AsyncSessionLocal() as db:
        await db.execute(delete(UserDocument).where(UserDocument.user_id.in_([a.id, b.id])))
        await db.commit()


async def _call(user, path, body):
    app.dependency_overrides[get_current_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        return await ac.post(path, json=body)


ROUTES = [
    ("/api/editor/find-citations", {"query": "attention is all you need"}),
    ("/api/editor/ask-ai", {"selection": "Dual-encoder retrieval cuts latency.", "instruction": "Tighten this."}),
]


@pytest.mark.parametrize("path,body", ROUTES)
@pytest.mark.parametrize("names", ["none", "b_doc"])
async def test_user_without_documents_never_searches_others(world, path, body, names):
    payload = dict(body)
    if names == "b_doc":
        payload["doc_names"] = [world["b_doc"]]  # naming someone else's document must not work
    with patch("backend.api.main.search_similar_chunks", return_value=EMPTY_HITS) as search, \
         patch("backend.api.main._execute_completion_with_fallback", return_value="ok"):
        r = await _call(world["a"], path, payload)
    assert r.status_code == 200, r.text
    search.assert_not_called()  # A owns nothing, so there is nothing it may search


async def test_owner_search_is_scoped_to_own_documents_only(world):
    async with AsyncSessionLocal() as db:
        db.add(UserDocument(user_id=world["a"].id, doc_name=world["a_doc"], file_hash=f"h-a-{world['tag']}"))
        await db.commit()
    body = {"query": "attention is all you need", "doc_names": [world["a_doc"], world["b_doc"]]}
    with patch("backend.api.main.search_similar_chunks", return_value=EMPTY_HITS) as search:
        r = await _call(world["a"], "/api/editor/find-citations", body)
    assert r.status_code == 200, r.text
    assert search.call_args.kwargs["doc_names"] == [world["a_doc"]]

    # No doc_names: the whole of A's own library, never None and never B's.
    with patch("backend.api.main.search_similar_chunks", return_value=EMPTY_HITS) as search:
        await _call(world["a"], "/api/editor/find-citations", {"query": "attention is all you need"})
    assert search.call_args.kwargs["doc_names"] == [world["a_doc"]]


async def test_literature_review_ignores_other_users_documents(world):
    with patch("backend.api.main.generate_literature_review") as review:
        r = await _call(world["a"], "/api/workspace/literature-review", {"doc_names": [world["b_doc"]]})
        r2 = await _call(world["a"], "/api/workspace/literature-review", {"doc_names": []})
    assert r.status_code == 200 and r2.status_code == 200
    review.assert_not_called()
    assert "error" in r.json() and "error" in r2.json()
