# backend/db/document_service.py

import os
import sqlite3
import uuid
from datetime import datetime
from typing import Optional

# Anchor DB path to project root
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
DB_PATH = os.path.join(BASE_DIR, "scholarsmate.db")


def _get_connection():
    """Returns a SQLite connection and guarantees the table and columns exist."""
    conn = sqlite3.connect(DB_PATH)
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
        
    conn.commit()
    return conn


def update_schema_for_summary_cache(db_path: str = DB_PATH):
    """Explicit migration hook called during server startup."""
    try:
        conn = _get_connection()
        conn.close()
        print(f"[DB Service] Initialized and verified 'user_documents' table at {DB_PATH}")
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