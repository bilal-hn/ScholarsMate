import sys
import os
import shutil
from pathlib import Path
from typing import List
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

# Ensure project root is added to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.db.session import init_db, get_db
from backend.db import crud
from backend.api.schemas import (
    QueryRequest,
    QueryResponse,
    UploadResponse,
    DocumentListResponse,
    DocumentListItem,
    ChatSessionResponse,
    ChatSessionDetailResponse,
)
from backend.ingestion.pipeline import process_path
from backend.embeddings.vector_store import store_chunks, get_or_create_collection
from backend.rag.generator import generate_answer
from backend.rag.literature_review import generate_literature_review

# Import PDF streaming router
from backend.api.documents import router as documents_router

UPLOADS_DIR = Path(__file__).parent.parent.parent / "data" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager to handle DB initialization on startup."""
    await init_db()
    yield


app = FastAPI(
    title="ScholarsMate API",
    description="Source-Locked Retrieval-Augmented Generation REST API",
    version="1.0.0",
    lifespan=lifespan,
)


class ReviewRequest(BaseModel):
    doc_names: List[str] = []


class CreateSessionRequest(BaseModel):
    title: str = "New Research Chat"
    doc_names: List[str] = []


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents_router)


@app.get("/api/health")
def health_check():
    """Health check endpoint to verify backend status."""
    return {"status": "ok", "service": "ScholarsMate Backend API"}


# =============================================================================
# CHAT SESSION MANAGEMENT ENDPOINTS
# =============================================================================

@app.post("/api/sessions", response_model=ChatSessionResponse)
async def create_session(req: CreateSessionRequest, db: AsyncSession = Depends(get_db)):
    """Creates a new persistent chat session thread."""
    session = await crud.create_chat_session(db, title=req.title, doc_names=req.doc_names)
    return session


@app.get("/api/sessions", response_model=List[ChatSessionResponse])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    """Lists all historical chat sessions ordered by latest update."""
    return await crud.get_all_sessions(db)


@app.get("/api/sessions/{session_id}", response_model=ChatSessionDetailResponse)
async def get_session_details(session_id: str, db: AsyncSession = Depends(get_db)):
    """Retrieves full chat message history for a specific session ID."""
    messages = await crud.get_session_messages(db, session_id)
    sessions = await crud.get_all_sessions(db)
    session_meta = next((s for s in sessions if s.id == session_id), None)
    
    if not session_meta:
        raise HTTPException(status_code=404, detail="Chat session not found.")
        
    return {
        "id": session_meta.id,
        "title": session_meta.title,
        "created_at": session_meta.created_at,
        "messages": messages,
    }


@app.delete("/api/sessions/{session_id}")
async def delete_session_endpoint(session_id: str, db: AsyncSession = Depends(get_db)):
    """Deletes a chat session and its associated message history."""
    deleted = await crud.delete_session(db, session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    return {"message": "Chat session successfully deleted."}


# =============================================================================
# CORE RAG QUERY ENDPOINT WITH AUTOMATIC DB PERSISTENCE & STALE SESSION HANDLING
# =============================================================================

@app.post("/api/query", response_model=QueryResponse)
async def query_rag(request: QueryRequest, db: AsyncSession = Depends(get_db)):
    """Accepts a query, routes execution plan, saves chat turn to DB, and returns answer with citations."""
    try:
        # 1. Resolve active workspace document list
        target_documents = getattr(request, "doc_names", None) or getattr(request, "selected_docs", None) or []

        # 2. Check session existence to prevent foreign key errors on stale frontend sessions
        session_id = request.session_id
        session_exists = False
        
        if session_id:
            all_sessions = await crud.get_all_sessions(db)
            session_exists = any(s.id == session_id for s in all_sessions)

        # Fallback: create fresh session if none provided or session ID is obsolete
        if not session_id or not session_exists:
            new_session = await crud.create_chat_session(
                db, 
                title=request.query[:40] + "...", 
                doc_names=target_documents
            )
            session_id = new_session.id

        # 3. Fetch history from DB or fallback to payload chat_history
        db_messages = await crud.get_session_messages(db, session_id)
        if db_messages:
            history_list = [{"sender": m.sender, "text": m.text} for m in db_messages[-6:]]
        else:
            history_list = [
                msg.model_dump() if hasattr(msg, "model_dump") else msg.dict() 
                for msg in (request.chat_history or [])
            ]

        # 4. Generate answer via RAG Pipeline (Locked to workspace)
        result = generate_answer(
            query=request.query, 
            top_k=getattr(request, "top_k", 10), 
            explicit_docs=target_documents,
            chat_history=history_list,
        )

        # 5. Save User prompt & Bot answer to Database
        await crud.add_message(db, session_id=session_id, sender="user", text=request.query)
        await crud.add_message(
            db, 
            session_id=session_id, 
            sender="bot", 
            text=result["answer"], 
            sources=result["sources_used"],
        )

        return QueryResponse(
            query=result["query"],
            answer=result["answer"],
            sources_used=result["sources_used"],
            session_id=session_id,
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Query generation failed: {str(e)}")


# =============================================================================
# UPLOAD & LITERATURE REVIEW ENDPOINTS
# =============================================================================

@app.post("/api/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """Uploads a single PDF file, processes it, and stores embeddings in ChromaDB."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF documents are supported.")

    file_path = UPLOADS_DIR / file.filename

    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    try:
        chunks = process_path(str(file_path))
        if chunks:
            store_chunks(chunks)

        return UploadResponse(
            message="Document successfully processed and indexed.",
            filename=file.filename,
            chunks_processed=len(chunks) if chunks else 0,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


@app.post("/api/workspace/create", response_model=UploadResponse)
async def create_workspace(
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Uploads a batch of PDF papers, applies SHA-256 deduplication,
    enforces a maximum of 3 identical duplicate workspaces, and indexes new chunks.
    """
    total_chunks = 0
    processed_files = []

    for file in files:
        filename = Path(file.filename).name
        if not filename.lower().endswith(".pdf"):
            continue

        file_path = UPLOADS_DIR / filename
        try:
            with file_path.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            # process_path returns [] if already indexed via SHA-256 deduplication
            chunks = process_path(str(file_path))
            if chunks:
                store_chunks(chunks)
                total_chunks += len(chunks)

            # Always track filename whether newly embedded or deduplicated
            processed_files.append(filename)
        except Exception as e:
            print(f"Failed to process file {filename}: {str(e)}")

    if not processed_files:
        raise HTTPException(
            status_code=400, 
            detail="No valid readable PDF files were processed.",
        )

    # -------------------------------------------------------------------------
    # Enforce Maximum 3 Duplicate Workspaces via Exact Document List Matching
    # -------------------------------------------------------------------------
    target_docs_sorted = sorted(list(set(processed_files)))
    existing_sessions = await crud.get_all_sessions(db)
    
    matching_workspaces_count = 0
    for session in existing_sessions:
        session_docs = getattr(session, "doc_names", None)
        if session_docs and isinstance(session_docs, list):
            if sorted(session_docs) == target_docs_sorted:
                matching_workspaces_count += 1

    print(f"\n[Workspace Limit Check] Found {matching_workspaces_count} existing sessions with documents: {target_docs_sorted}")

    if matching_workspaces_count >= 3:
        raise HTTPException(
            status_code=400,
            detail=(
                f"You already have {matching_workspaces_count} workspaces with this exact set of papers. "
                "Please delete or reuse one of your existing workspaces to proceed."
            )
        )

    # Register initial session with its exact paper set
    default_title = f"{Path(processed_files[0]).stem} Workspace" if len(processed_files) == 1 else f"{len(processed_files)} Papers Workspace"
    await crud.create_chat_session(db, title=default_title, doc_names=target_docs_sorted)

    return UploadResponse(
        message=f"Workspace created with {len(processed_files)} document(s).",
        filename=", ".join(processed_files),
        chunks_processed=total_chunks,
    )


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