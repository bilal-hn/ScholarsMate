import sys
import os
import shutil
from pathlib import Path
from typing import List
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Ensure project root is added to sys.path
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
from backend.rag.literature_review import generate_literature_review

# Import the PDF streaming router
from backend.api.documents import router as documents_router

# Directory for uploaded documents
UPLOADS_DIR = Path(__file__).parent.parent.parent / "data" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="ScholarsMate API",
    description="Source-Locked Retrieval-Augmented Generation REST API",
    version="1.0.0",
)


# Request schema for Literature Review synthesis
class ReviewRequest(BaseModel):
    doc_names: List[str] = []


# Enable CORS middleware for React frontend (Vite port 5173 / production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust origin URL list for strict production environments
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include PDF streaming router
app.include_router(documents_router)


@app.get("/api/health")
def health_check():
    """Health check endpoint to verify backend status."""
    return {"status": "ok", "service": "ScholarsMate Backend API"}


@app.post("/api/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """Uploads a single PDF file, processes it via layout-aware pipeline, and stores embeddings in ChromaDB."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF documents are supported.")

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
            raise HTTPException(
                status_code=400, 
                detail="No readable text extracted from PDF. Check if the file is scanned or empty."
            )

        store_chunks(chunks)
        return UploadResponse(
            message="Document successfully processed and indexed.",
            filename=file.filename,
            chunks_processed=len(chunks),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


@app.post("/api/workspace/create", response_model=UploadResponse)
async def create_workspace(files: List[UploadFile] = File(...)):
    """Uploads a batch of PDF papers or folder contents, processes them via ingestion pipeline, and stores embeddings in ChromaDB."""
    total_chunks = 0
    processed_files = []

    for file in files:
        # Extract filename (handles paths passed during folder uploads)
        filename = Path(file.filename).name
        if not filename.lower().endswith(".pdf"):
            continue

        file_path = UPLOADS_DIR / filename
        try:
            with file_path.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            chunks = process_path(str(file_path))
            if chunks:
                store_chunks(chunks)
                total_chunks += len(chunks)
                processed_files.append(filename)
        except Exception as e:
            print(f"Failed to process file {filename}: {str(e)}")

    if not processed_files:
        raise HTTPException(
            status_code=400, 
            detail="No valid readable PDF files were processed from the selected input."
        )

    return UploadResponse(
        message=f"Workspace created with {len(processed_files)} document(s).",
        filename=", ".join(processed_files),
        chunks_processed=total_chunks,
    )


@app.post("/api/query", response_model=QueryResponse)
def query_rag(request: QueryRequest):
    """Accepts a query, routes execution plan, and returns source-locked synthesis."""
    try:
        # Convert chat_history list of models to dictionaries for generator/retriever
        history_list = [
            msg.model_dump() if hasattr(msg, "model_dump") else msg.dict() 
            for msg in (request.chat_history or [])
        ]

        result = generate_answer(
            query=request.query, 
            top_k=request.top_k, 
            explicit_docs=request.doc_names,
            chat_history=history_list  # Pass sliding chat window
        )
        return QueryResponse(
            query=result["query"],
            answer=result["answer"],
            sources_used=result["sources_used"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query generation failed: {str(e)}")


@app.post("/api/workspace/literature-review")
def create_literature_review(request: ReviewRequest):
    """Generates a structured, publication-level academic literature review across workspace documents."""
    try:
        result = generate_literature_review(doc_names=request.doc_names)
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Literature review generation failed: {str(e)}")


@app.get("/api/documents", response_model=DocumentListResponse)
def list_documents():
    """Lists all documents stored in the vector database along with chunk counts."""
    try:
        collection = get_or_create_collection()
        all_data = collection.get(include=["metadatas"], limit=10000)

        doc_counts = {}
        if all_data and all_data.get("metadatas"):
            for meta in all_data["metadatas"]:
                if meta and "source" in meta:
                    source = meta["source"]
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