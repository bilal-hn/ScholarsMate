# backend/api/documents.py

from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

# Matches UPLOADS_DIR from main.py
DOCUMENTS_DIR = (Path(__file__).parent.parent.parent / "data" / "uploads").resolve()


@router.get("/api/documents/{filename}")
async def get_document(filename: str):
    """Streams requested PDF file to the frontend PDF viewer."""
    # Strip any directory traversal components — only the bare filename is accepted
    safe_name = Path(filename).name
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    file_path = (DOCUMENTS_DIR / safe_name).resolve()

    # Double-check the resolved path is still inside DOCUMENTS_DIR
    # (guards against symlink attacks and edge-case platform differences)
    if not file_path.is_relative_to(DOCUMENTS_DIR):
        raise HTTPException(status_code=400, detail="Invalid filename.")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Document '{safe_name}' not found on server.")

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=safe_name,
    )