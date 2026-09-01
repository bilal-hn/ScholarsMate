import os
import sys
import asyncio

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from backend.db.session import Base
from backend.db.models import User, ChatSession, BrainMemory
from backend.db import crud
from backend.rag.brain import build_brain_context

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


def test_brain_crud_and_scoping():
    async def _runner():
        engine = create_async_engine(TEST_DATABASE_URL, echo=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        async with session_factory() as async_db:
            # 1. Create a user and workspace session
            user = await crud.get_or_create_guest_user(async_db, guest_id="test_researcher_123")
            assert user.id == "test_researcher_123"

            session = await crud.create_chat_session(
                async_db, 
                title="Quantum Error Correction", 
                user_id=user.id,
                doc_names=["surface_codes.pdf"]
            )
            assert session.id is not None

            # 2. Add global preferences to Brain
            mem1 = await crud.add_brain_memory(
                async_db,
                user_id=user.id,
                thought="Always format citations in APA 7th style with DOI links.",
                scope="global",
                category="preference"
            )
            assert mem1.id is not None
            assert mem1.scope == "global"
            assert mem1.is_active is True

            # 3. Add academic profile to Brain
            mem2 = await crud.add_brain_memory(
                async_db,
                user_id=user.id,
                thought="Researcher is writing a master's thesis on topological surface codes.",
                scope="global",
                category="profile"
            )
            assert mem2.category == "profile"

            # 4. Add workspace-scoped insight
            mem3 = await crud.add_brain_memory(
                async_db,
                user_id=user.id,
                thought="Established that threshold for rotated surface code is ~1% under depolarizing noise.",
                scope="workspace",
                category="insight",
                workspace_id=session.id
            )
            assert mem3.workspace_id == session.id
            assert mem3.scope == "workspace"

            # 5. Retrieve all memories
            all_memories = await crud.get_brain_memories(async_db, user_id=user.id)
            assert len(all_memories) == 3

            # 6. Retrieve workspace-scoped memories
            ws_memories = await crud.get_brain_memories(async_db, user_id=user.id, workspace_id=session.id)
            assert len(ws_memories) == 3  # Returns 2 global + 1 workspace

            # 7. Build Brain Context Block
            context = await build_brain_context(async_db, user_id=user.id, workspace_id=session.id)
            assert "<scholarsmate_brain>" in context
            assert "APA 7th" in context
            assert "topological surface codes" in context
            assert "rotated surface code" in context

            # 8. Update and toggle memory
            updated = await crud.update_brain_memory(
                async_db,
                memory_id=mem1.id,
                user_id=user.id,
                thought="Always format citations in IEEE style.",
                is_active=False
            )
            assert updated.thought == "Always format citations in IEEE style."
            assert updated.is_active is False

            # 9. Verify active_only filter excludes disabled memory
            active_context = await build_brain_context(async_db, user_id=user.id, workspace_id=session.id)
            assert "IEEE style" not in active_context
            assert "topological surface codes" in active_context

            # 10. Delete memory
            deleted = await crud.delete_brain_memory(async_db, memory_id=mem2.id, user_id=user.id)
            assert deleted is True

            remaining = await crud.get_brain_memories(async_db, user_id=user.id)
            assert len(remaining) == 2

            # 11. Clear all memories for user
            cleared_count = await crud.clear_brain_memories(async_db, user_id=user.id)
            assert cleared_count == 2

            final_memories = await crud.get_brain_memories(async_db, user_id=user.id)
            assert len(final_memories) == 0

        await engine.dispose()

    asyncio.run(_runner())


if __name__ == "__main__":
    print("Running Brain CRUD and scoping test...")
    test_brain_crud_and_scoping()
    print("ALL BRAIN BACKEND TESTS PASSED SUCCESSFULLY! [OK]")
