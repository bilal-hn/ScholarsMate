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
    future=True
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
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
    """Initializes tables and performs automated schema migrations if columns are missing."""
    async with engine.begin() as conn:
        # Create any missing tables
        await conn.run_sync(Base.metadata.create_all)
        
        # Check and migrate doc_names column if table was created previously
        try:
            result = await conn.execute(text("PRAGMA table_info(chat_sessions);"))
            columns = [row[1] for row in result.fetchall()]
            if "doc_names" not in columns and len(columns) > 0:
                print("\n[DB Migration] Adding missing 'doc_names' column to chat_sessions table...")
                await conn.execute(text("ALTER TABLE chat_sessions ADD COLUMN doc_names JSON DEFAULT '[]';"))
                print("[DB Migration] Column 'doc_names' added successfully.")
        except Exception as e:
            print(f"[DB Migration Warning] Column verification skipped: {e}")