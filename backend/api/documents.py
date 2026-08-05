# backend/api/documents.py

import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

# Matches UPLOADS_DIR from main.py
DOCUMENTS_DIR = Path(__file__).parent.parent.parent / "data" / "uploads"

@router.get("/api/documents/{filename}")
async def get_document(filename: str):
    """Streams requested PDF file to the frontend PDF viewer."""
    file_path = DOCUMENTS_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Document '{filename}' not found on server.")
        
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=filename
    )