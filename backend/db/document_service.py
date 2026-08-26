# backend/database/document_service.py

import sqlite3
from datetime import datetime
from typing import Optional

DB_PATH = "scholarsmate.db"

def get_cached_document_summary(doc_name: str) -> Optional[str]:
    """Fetches pre-computed summary from SQLite cache if available."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT summary_cache FROM indexed_documents WHERE doc_name = ? AND summary_cache IS NOT NULL",
        (doc_name,)
    )
    row = cursor.fetchone()
    conn.close()
    return row[0] if row and row[0] else None


def save_cached_document_summary(doc_name: str, summary_content: str):
    """Persists pre-computed summary to the database record."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE indexed_documents 
        SET summary_cache = ?, summary_generated_at = ? 
        WHERE doc_name = ?
        """,
        (summary_content, datetime.utcnow().isoformat(), doc_name)
    )
    conn.commit()
    conn.close()