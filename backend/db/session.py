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

            # Automated migrations for user_documents table
            result_docs = await conn.execute(text("PRAGMA table_info(user_documents);"))
            doc_columns = [row[1] for row in result_docs.fetchall()]
            if doc_columns:
                if "summary_cache" not in doc_columns:
                    print("\n[DB Migration] Adding missing 'summary_cache' column to user_documents...")
                    await conn.execute(text("ALTER TABLE user_documents ADD COLUMN summary_cache TEXT;"))
                    print("[DB Migration] Column 'summary_cache' added successfully.")
                if "summary_generated_at" not in doc_columns:
                    print("\n[DB Migration] Adding missing 'summary_generated_at' column to user_documents...")
                    await conn.execute(text("ALTER TABLE user_documents ADD COLUMN summary_generated_at DATETIME;"))
                    print("[DB Migration] Column 'summary_generated_at' added successfully.")

            # Automated migrations for chat_messages table
            result_msgs = await conn.execute(text("PRAGMA table_info(chat_messages);"))
            msg_columns = [row[1] for row in result_msgs.fetchall()]
            if msg_columns:
                if "model_name" not in msg_columns:
                    print("\n[DB Migration] Adding missing 'model_name' column to chat_messages...")
                    await conn.execute(text("ALTER TABLE chat_messages ADD COLUMN model_name VARCHAR;"))
                    print("[DB Migration] Column 'model_name' added successfully.")
                if "meta" not in msg_columns:
                    print("\n[DB Migration] Adding missing 'meta' column to chat_messages...")
                    await conn.execute(text("ALTER TABLE chat_messages ADD COLUMN meta JSON;"))
                    print("[DB Migration] Column 'meta' added successfully.")
        except Exception as e:
            print(f"[DB Migration Warning] Column verification skipped: {e}")