import pytest
from unittest.mock import patch
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from backend.db.session import Base
from backend.db.models import User, ChatSession, Workspace, BrainMemory
from backend.db import crud
from backend.rag.brain import build_brain_context, consolidate_batch_memories_async

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

@pytest.mark.anyio
async def test_brain_consolidation_and_context_pull():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    user_id = "test_user_hypertrophy"
    workspace_id = "ws_hypertrophy_001"
    session_1 = "session_chat_1"
    session_2 = "session_chat_2"

    async with async_session() as db:
        user = User(id=user_id, email="hypertrophy@example.com")
        db.add(user)
        ws = Workspace(id=workspace_id, name="Muscle Hypertrophy Research", user_id=user_id)
        db.add(ws)
        s1 = ChatSession(id=session_1, title="Chat 1 - Hypertrophy Mechanisms", user_id=user_id, workspace_id=workspace_id)
        s2 = ChatSession(id=session_2, title="Chat 2 - Followup Study", user_id=user_id, workspace_id=workspace_id)
        db.add_all([s1, s2])
        await db.commit()

    # The 4-turn dialogue from user's transcript
    dialogue = [
        {"sender": "user", "text": "hello what is muscle hyperthrophy?"},
        {"sender": "assistant", "text": "I can only answer questions grounded in your uploaded documents..."},
        {"sender": "user", "text": "what are the papers about?"},
        {"sender": "assistant", "text": "Your active workspace currently contains 3 document(s)..."},
        {"sender": "user", "text": "summarise all three papers"},
        {"sender": "assistant", "text": "I can only answer questions grounded in your uploaded documents..."},
        {"sender": "user", "text": "what is hyperthropy?"},
        {"sender": "assistant", "text": "Molecular Mechanisms of Skeletal Muscle Hypertrophy [Schiaffino et al., 2020]... Titin kinase domain and muscle LIM protein mediate muscle growth."},
    ]

    mock_llm_json = """{
      "memories": [
        {
          "thought": "Skeletal muscle hypertrophy is driven by mechanical overload and hormonal influences like androgens [Schiaffino et al., 2020]",
          "scope": "workspace",
          "category": "finding"
        },
        {
          "thought": "Titin kinase domain and muscle LIM protein mediate muscle growth and homeostasis",
          "scope": "workspace",
          "category": "finding"
        }
      ]
    }"""

    class MockCompletion:
        class Choice:
            class Message:
                content = mock_llm_json
            message = Message()
        choices = [Choice()]

    with patch("backend.rag.generator._execute_completion_with_fallback", return_value=MockCompletion()), \
         patch("backend.rag.brain.SessionLocal", async_session):
        await consolidate_batch_memories_async(
            user_id=user_id,
            session_id=session_1,
            dialogue_window=dialogue,
            model_name="openrouter/qwen/qwen-2.5-72b-instruct",
            custom_keys={"openrouter": "sk-test-mock-key"},
            workspace_id=workspace_id
        )

    # Verify memories were persisted
    async with async_session() as db:
        memories = await crud.get_brain_memories(db, user_id=user_id, workspace_id=workspace_id)
        assert len(memories) == 2
        thoughts = [m.thought for m in memories]
        assert any("Skeletal muscle hypertrophy" in t for t in thoughts)
        assert any("Titin kinase" in t for t in thoughts)

        # Verify context points can be discovered from Chat 2
        context_points = await crud.get_workspace_context_points(
            db,
            workspace_id=workspace_id,
            exclude_session_id=session_2,
            user_id=user_id
        )
        assert len(context_points) == 2
        assert context_points[0]["session_title"] == "Chat 1 - Hypertrophy Mechanisms"

        # Import them into Chat 2 (simulating user selecting them or importing in New Chat)
        cp_ids = [cp["id"] for cp in context_points]
        await crud.import_context_points(
            db,
            target_session_id=session_2,
            memory_ids=cp_ids,
            user_id=user_id
        )

        # Verify Chat 2 now has the workspace blueprint context injected!
        c2_context = await build_brain_context(db, user_id=user_id, workspace_id=workspace_id, session_id=session_2)
        assert "<workspace_blueprint>" in c2_context
        assert "Skeletal muscle hypertrophy" in c2_context
        assert "Titin kinase" in c2_context

    await engine.dispose()
