import sys
import os
import shutil
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Ensure project root is in sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.api.schemas import (
    QueryRequest,
    QueryResponse,
    UploadResponse,
    DocumentListResponse,
    DocumentListItem,
)
from backend.ingestion.pipeline import process_path
from backend.embeddings.vector_store import store_chunks, get_or_create_collection
from backend.rag.generator import generate_answer

# Temp upload directory
UPLOADS_DIR = Path(__file__).parent.parent.parent / "data" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="ScholarsMate API",
    description="Source-Locked Retrieval-Augmented Generation REST API",
    version="1.0.0",
)

# Enable CORS for React frontend (Phase 6)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "ScholarsMate Backend"}


@app.post("/api/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """Uploads a PDF file, processes it via ingestion pipeline, and stores embeddings in ChromaDB."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_path = UPLOADS_DIR / file.filename

    # Save uploaded file to temp disk storage
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Process and embed document
    try:
        chunks = process_path(str(file_path))
        if not chunks:
            raise HTTPException(status_code=400, detail="No readable text extracted from PDF.")

        store_chunks(chunks)
        return UploadResponse(
            message="Document successfully processed and indexed.",
            filename=file.filename,
            chunks_processed=len(chunks),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


@app.post("/api/query", response_model=QueryResponse)
def query_rag(request: QueryRequest):
    """Accepts a query, retrieves context from ChromaDB, and returns a source-locked answer."""
    try:
        result = generate_answer(query=request.query, top_k=request.top_k)
        return QueryResponse(
            query=result["query"],
            answer=result["answer"],
            sources_used=result["sources_used"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query generation failed: {str(e)}")


@app.get("/api/documents", response_model=DocumentListResponse)
def list_documents():
    """Lists all documents stored in the vector database and their chunk counts."""
    try:
        collection = get_or_create_collection()
        all_data = collection.get(include=["metadatas"])

        doc_counts = {}
        if all_data and all_data.get("metadatas"):
            for meta in all_data["metadatas"]:
                source = meta.get("source", "Unknown")
                doc_counts[source] = doc_counts.get(source, 0) + 1

        docs_list = [
            DocumentListItem(doc_name=name, chunk_count=count)
            for name, count in doc_counts.items()
        ]

        return DocumentListResponse(
            documents=docs_list,
            total_documents=len(docs_list),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve documents: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.api.main:app", host="0.0.0.0", port=8000, reload=True)