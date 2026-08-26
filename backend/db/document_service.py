# backend/db/document_service.py

import sqlite3
import uuid
from datetime import datetime
from typing import Optional

DB_PATH = "scholarsmate.db"


def update_schema_for_summary_cache(db_path: str = DB_PATH):
    """Safely adds summary cache columns to user_documents if they don't exist."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA table_info(user_documents)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if "summary_cache" not in columns:
            cursor.execute("ALTER TABLE user_documents ADD COLUMN summary_cache TEXT;")
            print("[DB Migration] Added 'summary_cache' column to user_documents.")
            
        if "summary_generated_at" not in columns:
            cursor.execute("ALTER TABLE user_documents ADD COLUMN summary_generated_at DATETIME;")
            print("[DB Migration] Added 'summary_generated_at' column to user_documents.")
            
        conn.commit()
    except Exception as e:
        print(f"[DB Migration Error] {e}")
    finally:
        conn.close()


def get_cached_document_summary(doc_name: str) -> Optional[str]:
    """Fetches pre-computed summary from SQLite cache if available."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
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
        return row[0] if row and row[0] else None
    except Exception as e:
        print(f"[Document Service Error] Failed to read summary cache for '{doc_name}': {e}")
        return None
    finally:
        conn.close()


def save_cached_document_summary(doc_name: str, summary_content: str):
    """
    Persists pre-computed summary to the database record.
    Performs an update or fallback insert if the document row doesn't exist yet.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        now = datetime.utcnow().isoformat()
        
        # Check if record exists
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
            # Fallback insert so summary isn't discarded if worker finishes first
            cursor.execute(
                """
                INSERT INTO user_documents (id, user_id, doc_name, file_hash, summary_cache, summary_generated_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (str(uuid.uuid4()), "system", doc_name, "auto_hash", summary_content, now, now)
            )
        
        conn.commit()
    except Exception as e:
        print(f"[Document Service Error] Failed to save summary cache for '{doc_name}': {e}")
    finally:
        conn.close()