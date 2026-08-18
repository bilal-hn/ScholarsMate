import os
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from sqlalchemy import text

DATABASE_PATH = Path(__file__).parent.parent.parent / "data" / "scholarsmate.db"
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite+aiosqlite:///{DATABASE_PATH.as_posix()}"

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    connect_args={"check_same_thread": False},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db():
    """Dependency for obtaining asynchronous DB sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Initializes tables and performs automated schema migrations for missing tables/columns."""
    # Ensure all models are registered on Base.metadata before creating tables
    from backend.db.models import User, ChatSession, ChatMessage, UserDocument  # noqa

    async with engine.begin() as conn:
        # Create all registered tables if they do not exist
        await conn.run_sync(Base.metadata.create_all)

        # Automated migrations for existing SQLite tables
        try:
            result = await conn.execute(text("PRAGMA table_info(chat_sessions);"))
            columns = [row[1] for row in result.fetchall()]

            if columns:
                if "doc_names" not in columns:
                    print("\n[DB Migration] Adding missing 'doc_names' column to chat_sessions...")
                    await conn.execute(text("ALTER TABLE chat_sessions ADD COLUMN doc_names JSON DEFAULT '[]';"))
                    print("[DB Migration] Column 'doc_names' added successfully.")

                if "user_id" not in columns:
                    print("\n[DB Migration] Adding missing 'user_id' column to chat_sessions...")
                    await conn.execute(text("ALTER TABLE chat_sessions ADD COLUMN user_id VARCHAR;"))
                    print("[DB Migration] Column 'user_id' added successfully.")
        except Exception as e:
            print(f"[DB Migration Warning] Column verification skipped: {e}")