import asyncio
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.db.session import SessionLocal, init_db
from backend.db import crud
from backend.rag.brain import consolidate_batch_memories_async


async def main():
    await init_db()
    test_user_id = "test_user_fyp_001"
    async with SessionLocal() as db:
        user = await crud.get_or_create_guest_user(db, test_user_id)

    # Simulate a short multi-turn window: user mentions their FYP across two turns
    test_dialogue = [
        {"sender": "user",      "text": "so im working on my bachelors fyp."},
        {"sender": "assistant", "text": "That's awesome! Building an LLM for your bachelor's FYP is a great milestone."},
        {"sender": "user",      "text": "yeah, i want to use pytorch and ieee citations"},
        {"sender": "assistant", "text": "Noted! I'll use PyTorch examples and IEEE citation format throughout."},
    ]

    print("Testing batch consolidation on a 2-turn window...")
    await consolidate_batch_memories_async(
        user_id=test_user_id,
        session_id="test_session_01",
        dialogue_window=test_dialogue,
        model_name="gemini/gemini-2.5-flash",
        custom_keys={}
    )

    async with SessionLocal() as db:
        memories = await crud.get_brain_memories(db, user_id=test_user_id)
        print(f"Total memories found: {len(memories)}")
        for m in memories:
            print(f" - [{m.category}|{m.scope}] {m.thought}")


if __name__ == "__main__":
    asyncio.run(main())
