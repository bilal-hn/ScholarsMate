# backend/db/document_service.py

import os
import sqlite3
import uuid
from datetime import datetime
from typing import Optional

# Anchor DB path to project data directory
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
DB_PATH = os.path.join(BASE_DIR, "data", "scholarsmate.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


def _get_connection():
    """Returns a SQLite connection with WAL mode and generous busy timeout to prevent database locks."""
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    return conn


def update_schema_for_summary_cache(db_path: str = DB_PATH):
    """Explicit migration hook called during server startup to verify tables and columns."""
    try:
        conn = sqlite3.connect(DB_PATH, timeout=20.0)
        cursor = conn.cursor()

        # 1. Create table if it doesn't exist
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_documents (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                doc_name TEXT UNIQUE,
                file_hash TEXT,
                summary_cache TEXT,
                summary_generated_at DATETIME,
                created_at DATETIME
            )
        """)

        # 2. Check and add summary_cache column if table existed previously without it
        cursor.execute("PRAGMA table_info(user_documents)")
        columns = [row[1] for row in cursor.fetchall()]

        if "summary_cache" not in columns:
            cursor.execute("ALTER TABLE user_documents ADD COLUMN summary_cache TEXT;")
        if "summary_generated_at" not in columns:
            cursor.execute("ALTER TABLE user_documents ADD COLUMN summary_generated_at DATETIME;")

        # 3. FR-15: Check and add active_mode to chat_sessions and mode_applied to chat_messages
        try:
            cursor.execute("PRAGMA table_info(chat_sessions)")
            cs_columns = [row[1] for row in cursor.fetchall()]
            if cs_columns and "active_mode" not in cs_columns:
                cursor.execute("ALTER TABLE chat_sessions ADD COLUMN active_mode VARCHAR(50) DEFAULT 'research';")
        except Exception:
            pass

        try:
            cursor.execute("PRAGMA table_info(chat_messages)")
            cm_columns = [row[1] for row in cursor.fetchall()]
            if cm_columns and "mode_applied" not in cm_columns:
                cursor.execute("ALTER TABLE chat_messages ADD COLUMN mode_applied VARCHAR(50) DEFAULT 'research';")
        except Exception:
            pass

        try:
            cursor.execute("PRAGMA table_info(users)")
            u_columns = [row[1] for row in cursor.fetchall()]
            if u_columns and "password_hash" not in u_columns:
                cursor.execute("ALTER TABLE users ADD COLUMN password_hash TEXT;")
        except Exception:
            pass

        conn.commit()
        conn.close()
        print(f"[DB Service] Initialized and verified database schemas at {DB_PATH}")
    except Exception as e:
        print(f"[DB Service Migration Error] {e}")


def get_cached_document_summary(doc_name: str) -> Optional[str]:
    """Fetches pre-computed summary from SQLite cache."""
    try:
        conn = _get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT summary_cache 
            FROM user_documents 
            WHERE doc_name = ? AND summary_cache IS NOT NULL AND summary_cache != ''
            ORDER BY created_at DESC 
            LIMIT 1
            """,
            (doc_name,)
        )
        row = cursor.fetchone()
        conn.close()
        return row[0] if row and row[0] else None
    except Exception as e:
        print(f"[Document Service Error] Failed to read summary cache for '{doc_name}': {e}")
        return None


def save_cached_document_summary(doc_name: str, summary_content: str):
    """Persists pre-computed summary into user_documents table safely."""
    try:
        conn = _get_connection()
        cursor = conn.cursor()
        now = datetime.utcnow().isoformat()
        
        cursor.execute("SELECT id FROM user_documents WHERE doc_name = ?", (doc_name,))
        row = cursor.fetchone()
        
        if row:
            cursor.execute(
                """
                UPDATE user_documents 
                SET summary_cache = ?, summary_generated_at = ? 
                WHERE doc_name = ?
                """,
                (summary_content, now, doc_name)
            )
        else:
            cursor.execute(
                """
                INSERT INTO user_documents (id, user_id, doc_name, file_hash, summary_cache, summary_generated_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (str(uuid.uuid4()), "system", doc_name, "auto_hash", summary_content, now, now)
            )
        
        conn.commit()
        conn.close()
        print(f"[Document Service] Cached summary saved for '{doc_name}'.")
    except Exception as e:
        print(f"[Document Service Error] Failed to save summary cache for '{doc_name}': {e}")


async def get_cached_document_summary_async(db, doc_name: str) -> Optional[str]:
    """Asynchronous retrieval of pre-computed summary via SQLAlchemy AsyncSession."""
    from sqlalchemy import select
    from backend.db.models import UserDocument

    try:
        stmt = (
            select(UserDocument.summary_cache)
            .where(
                UserDocument.doc_name == doc_name,
                UserDocument.summary_cache.isnot(None),
                UserDocument.summary_cache != "",
            )
            .order_by(UserDocument.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    except Exception as e:
        print(f"[Document Service Async Error] Failed to read summary for '{doc_name}': {e}")
        return None


async def save_cached_document_summary_async(db, doc_name: str, summary_content: str, user_id: str = "system") -> None:
    """Asynchronous persistence of pre-computed summary via SQLAlchemy AsyncSession."""
    from sqlalchemy import select
    from backend.db.models import UserDocument

    try:
        stmt = select(UserDocument).where(UserDocument.doc_name == doc_name).order_by(UserDocument.created_at.desc())
        result = await db.execute(stmt)
        doc = result.scalar_one_or_none()
        now = datetime.utcnow()

        if doc:
            doc.summary_cache = summary_content
            doc.summary_generated_at = now
        else:
            doc = UserDocument(
                id=str(uuid.uuid4()),
                user_id=user_id,
                doc_name=doc_name,
                file_hash="auto_hash",
                summary_cache=summary_content,
                summary_generated_at=now,
                created_at=now,
            )
            db.add(doc)
        await db.commit()
        print(f"[Document Service Async] Cached summary saved for '{doc_name}'.")
    except Exception as e:
        print(f"[Document Service Async Error] Failed to save summary for '{doc_name}': {e}")