import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from backend.api.main import app

pytestmark = pytest.mark.anyio


async def test_assign_documents_to_workspace():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        unique_user_id = f"test-ws-assign-{uuid.uuid4().hex[:8]}"
        headers = {"X-Guest-ID": unique_user_id}

        # 1. Create two manual library items
        resp1 = await ac.post(
            "/api/library/manual",
            json={
                "item_type": "journal_article",
                "title": "Paper A: Deep Learning Foundations",
                "year": "2021",
                "authors": "Author A",
            },
            headers=headers,
        )
        assert resp1.status_code == 200, resp1.text
        doc1 = resp1.json()

        resp2 = await ac.post(
            "/api/library/manual",
            json={
                "item_type": "journal_article",
                "title": "Paper B: Transformer Architectures",
                "year": "2022",
                "authors": "Author B",
            },
            headers=headers,
        )
        assert resp2.status_code == 200, resp2.text
        doc2 = resp2.json()

        # 2. Create empty workspace
        ws_resp = await ac.post(
            "/api/workspaces",
            json={"name": "Test Collection", "doc_ids": []},
            headers=headers,
        )
        assert ws_resp.status_code == 200, ws_resp.text
        ws = ws_resp.json()

        # 3. Assign both docs to workspace via endpoint
        response = await ac.post(
            f"/api/workspaces/{ws['id']}/assign-documents",
            headers=headers,
            json={"doc_ids": [doc1["id"], doc2["id"]]},
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["success"] is True
        assert data["assigned_count"] == 2
        assert doc1["doc_name"] in data["doc_names"]
        assert doc2["doc_name"] in data["doc_names"]


async def test_remove_documents_from_workspace():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        unique_user_id = f"test-ws-remove-{uuid.uuid4().hex[:8]}"
        headers = {"X-Guest-ID": unique_user_id}

        resp1 = await ac.post(
            "/api/library/manual",
            json={
                "item_type": "journal_article",
                "title": "Temporary Paper to Remove",
                "year": "2020",
            },
            headers=headers,
        )
        assert resp1.status_code == 200
        doc1 = resp1.json()

        # Create workspace with doc1
        ws_resp = await ac.post(
            "/api/workspaces",
            json={"name": "Collection to Trim", "doc_ids": [doc1["id"]]},
            headers=headers,
        )
        assert ws_resp.status_code == 200
        ws = ws_resp.json()
        assert doc1["doc_name"] in ws["doc_names"]

        # Remove doc1
        response = await ac.post(
            f"/api/workspaces/{ws['id']}/remove-documents",
            headers=headers,
            json={"doc_ids": [doc1["id"]]},
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["success"] is True
        assert data["removed_count"] == 1
        assert doc1["doc_name"] not in data["doc_names"]


async def test_move_documents_between_workspaces():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        unique_user_id = f"test-ws-move-{uuid.uuid4().hex[:8]}"
        headers = {"X-Guest-ID": unique_user_id}

        resp1 = await ac.post(
            "/api/library/manual",
            json={
                "item_type": "journal_article",
                "title": "Migrating Paper",
                "year": "2023",
            },
            headers=headers,
        )
        assert resp1.status_code == 200
        doc1 = resp1.json()

        source_ws_resp = await ac.post(
            "/api/workspaces",
            json={"name": "Source WS", "doc_ids": [doc1["id"]]},
            headers=headers,
        )
        assert source_ws_resp.status_code == 200
        source_ws = source_ws_resp.json()

        target_ws_resp = await ac.post(
            "/api/workspaces",
            json={"name": "Target WS", "doc_ids": []},
            headers=headers,
        )
        assert target_ws_resp.status_code == 200
        target_ws = target_ws_resp.json()

        # Move doc1
        response = await ac.post(
            "/api/workspaces/move-documents",
            headers=headers,
            json={
                "doc_ids": [doc1["id"]],
                "source_workspace_id": source_ws["id"],
                "target_workspace_id": target_ws["id"],
            },
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["success"] is True
        assert data["moved_count"] == 1

        # Check source WS in list
        list_resp = await ac.get("/api/workspaces", headers=headers)
        assert list_resp.status_code == 200
        workspaces = list_resp.json()

        source_in_list = next(w for w in workspaces if w["id"] == source_ws["id"])
        target_in_list = next(w for w in workspaces if w["id"] == target_ws["id"])

        assert doc1["doc_name"] not in source_in_list["doc_names"]
        assert doc1["doc_name"] in target_in_list["doc_names"]


async def test_create_workspace_with_existing_library_docs():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        unique_user_id = f"test-ws-create-{uuid.uuid4().hex[:8]}"
        headers = {"X-Guest-ID": unique_user_id}

        resp1 = await ac.post(
            "/api/library/manual",
            json={
                "item_type": "book",
                "title": "Dissertation Chapter 1 Study",
                "year": "2024",
            },
            headers=headers,
        )
        assert resp1.status_code == 200
        doc1 = resp1.json()

        response = await ac.post(
            "/api/workspaces",
            headers=headers,
            json={
                "name": "Dissertation Chapter 1",
                "doc_ids": [doc1["id"]],
            },
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["name"] == "Dissertation Chapter 1"
        assert doc1["doc_name"] in data["doc_names"]
        assert len(data["chats"]) >= 1
