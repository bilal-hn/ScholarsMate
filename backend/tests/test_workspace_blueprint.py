import pytest
from httpx import AsyncClient, ASGITransport
import uuid

from backend.api.main import app
from backend.db.session import SessionLocal
from backend.rag.brain import build_brain_context

pytestmark = pytest.mark.anyio


async def test_workspace_blueprint_seeding_and_isolation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        guest_user = f"test-blueprint-user-{uuid.uuid4().hex[:8]}"
        headers = {"X-Guest-ID": guest_user}

        # 1. Create a workspace
        ws_resp = await ac.post(
            "/api/workspaces",
            json={"name": "Computer Vision Research Workspace", "description": "Testing blueprint seeding"},
            headers=headers
        )
        assert ws_resp.status_code == 200, ws_resp.text
        workspace_id = ws_resp.json()["id"]

        # 2. Create Chat 1 in this workspace
        chat1_resp = await ac.post(
            "/api/sessions",
            json={
                "title": "Chat 1 - Methodology Exploration",
                "workspace_id": workspace_id,
                "doc_names": ["resnet.pdf"]
            },
            headers=headers
        )
        assert chat1_resp.status_code == 200
        chat1_id = chat1_resp.json()["id"]

        # Verify Chat 1 has NO blueprint injection (100% clean)
        async with SessionLocal() as db:
            c1_context = await build_brain_context(db, user_id=guest_user, workspace_id=workspace_id, session_id=chat1_id)
            assert c1_context == ""

        # 3. Add 3 project decisions to the workspace blueprint (simulating background extraction / manual note)
        mem1_resp = await ac.post(
            "/api/brain/memories",
            json={
                "thought": "Selected ResNet-50 as baseline architecture",
                "workspace_id": workspace_id,
                "session_id": chat1_id,
                "category": "decision"
            },
            headers=headers
        )
        assert mem1_resp.status_code == 200
        mem1_id = mem1_resp.json()["id"]

        mem2_resp = await ac.post(
            "/api/brain/memories",
            json={
                "thought": "Excluded Vision Transformers (ViT) due to VRAM constraints",
                "workspace_id": workspace_id,
                "session_id": chat1_id,
                "category": "constraint"
            },
            headers=headers
        )
        assert mem2_resp.status_code == 200
        mem2_id = mem2_resp.json()["id"]

        mem3_resp = await ac.post(
            "/api/brain/memories",
            json={
                "thought": "Evaluated on ImageNet-1k validation split",
                "workspace_id": workspace_id,
                "session_id": chat1_id,
                "category": "decision"
            },
            headers=headers
        )
        assert mem3_resp.status_code == 200
        mem3_id = mem3_resp.json()["id"]

        # 4. Fetch context points for this workspace (what the "New Chat" modal sees)
        points_resp = await ac.get(
            f"/api/workspaces/{workspace_id}/context-points",
            headers=headers
        )
        assert points_resp.status_code == 200
        points_data = points_resp.json()["context_points"]
        assert len(points_data) == 3
        thoughts = [p["thought"] for p in points_data]
        assert "Selected ResNet-50 as baseline architecture" in thoughts
        assert "Excluded Vision Transformers (ViT) due to VRAM constraints" in thoughts

        # 5. Create Chat 2 and seed it ONLY with mem1 and mem2 (user deselected mem3)
        chat2_resp = await ac.post(
            "/api/sessions",
            json={
                "title": "Chat 2 - Training Optimization",
                "workspace_id": workspace_id,
                "doc_names": ["resnet.pdf"],
                "seed_memory_ids": [mem1_id, mem2_id]
            },
            headers=headers
        )
        assert chat2_resp.status_code == 200
        chat2_id = chat2_resp.json()["id"]

        # 6. Verify Chat 2 gets ONLY the 2 seeded blueprint points
        async with SessionLocal() as db:
            c2_context = await build_brain_context(db, user_id=guest_user, workspace_id=workspace_id, session_id=chat2_id)
            assert "<workspace_blueprint>" in c2_context
            assert "ResNet-50" in c2_context
            assert "Vision Transformers" in c2_context
            assert "ImageNet-1k" not in c2_context # Mem3 was not selected, so it's not seeded!

        # 7. Create Chat 3 as a completely blank chat (seed_memory_ids = None or empty)
        chat3_resp = await ac.post(
            "/api/sessions",
            json={
                "title": "Chat 3 - Clean Blank Chat",
                "workspace_id": workspace_id,
                "doc_names": ["resnet.pdf"],
                "seed_memory_ids": []
            },
            headers=headers
        )
        assert chat3_resp.status_code == 200
        chat3_id = chat3_resp.json()["id"]

        # Verify Chat 3 has NO blueprint context
        async with SessionLocal() as db:
            c3_context = await build_brain_context(db, user_id=guest_user, workspace_id=workspace_id, session_id=chat3_id)
            assert c3_context == ""
