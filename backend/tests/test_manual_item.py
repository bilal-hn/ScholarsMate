import uuid
import pytest
from httpx import AsyncClient, ASGITransport

from backend.api.main import app
from backend.db.session import AsyncSessionLocal
from backend.db import crud

pytestmark = pytest.mark.anyio


async def test_create_manual_book_item():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        user_guest = f"test-manual-{uuid.uuid4().hex[:8]}"
        headers = {"X-Guest-ID": user_guest}

        resp = await ac.post(
            "/api/library/manual",
            json={
                "item_type": "book",
                "title": "Design Patterns: Elements of Reusable Object-Oriented Software",
                "authors": "Erich Gamma; Richard Helm; Ralph Johnson; John Vlissides",
                "year": "1994",
                "venue": "Addison-Wesley",
                "tags": ["#SoftwareEngineering", "#Patterns"],
                "notes": "Classic Gang of Four book on software architecture.",
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["title"] == "Design Patterns: Elements of Reusable Object-Oriented Software"
        assert data["item_type"] == "book"
        assert "Gamma" in data["authors"]
        assert data["year"] == "1994"
        assert data["venue"] == "Addison-Wesley"
        assert data["has_pdf"] is False
        assert data["doc_name"].startswith("manual_")
        assert len(data["tags"]) == 2

        # Verify it appears in library list
        list_resp = await ac.get("/api/library", headers=headers)
        assert list_resp.status_code == 200
        list_data = list_resp.json()
        assert list_data["total_count"] == 1
        assert list_data["items"][0]["id"] == data["id"]


async def test_create_manual_item_with_workspace_binding():
    user_guest = f"test-manual-ws-{uuid.uuid4().hex[:8]}"
    headers = {"X-Guest-ID": user_guest}

    # 1. Create a workspace in DB directly
    async with AsyncSessionLocal() as db:
        ws, _ = await crud.create_workspace(db, name="Architecture Research", user_id=user_guest)
        ws_id = ws.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 2. Create manual paper bound to that workspace
        resp = await ac.post(
            "/api/library/manual",
            json={
                "item_type": "conference_paper",
                "title": "Microservices in Practice",
                "authors": "Martin Fowler",
                "year": "2015",
                "venue": "QCon London",
                "workspace_id": ws_id,
            },
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["workspaces"]) == 1
        assert data["workspaces"][0]["id"] == ws_id
