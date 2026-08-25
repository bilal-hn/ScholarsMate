import sys
import os
import shutil
import httpx
from pathlib import Path
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

# Ensure project root is added to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.db.session import init_db, get_db
from backend.db import crud
from backend.db.models import User
from backend.api.auth import get_current_user, AuthResponse
from backend.api.schemas import (
    QueryRequest,
    QueryResponse,
    UploadResponse,
    DocumentListResponse,
    DocumentListItem,
    ChatSessionResponse,
    ChatSessionDetailResponse,
    FetchModelsRequest,
    ModelItem,
)
from backend.ingestion.pipeline import process_path
from backend.embeddings.vector_store import store_chunks, get_or_create_collection
from backend.rag.generator import generate_answer
from backend.rag.literature_review import generate_literature_review
from backend.rag.runtime import normalize_litellm_model_id

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
    research_focus: Optional[str] = ""
    depth: Optional[str] = "detailed"
    model_name: Optional[str] = None
    custom_keys: Optional[Dict[str, Any]] = None


class CreateSessionRequest(BaseModel):
    title: str = "New Research Chat"
    doc_names: List[str] = []


def detect_provider(api_key: str) -> str:
    key = api_key.strip()
    if key.startswith("gsk_"):
        return "groq"
    if key.startswith("AIzaSy") or key.startswith("AQ.") or key.startswith("AQ"):
        return "gemini"
    if key.startswith("sk-ant-"):
        return "anthropic"
    if key.startswith("sk-or-"):
        return "openrouter"
    if key.startswith("sk-"):
        return "openai"
    return "custom"


# Configure CORS to allow authenticated requests from frontend origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Authorization", "X-Guest-ID", "Content-Type"],
    expose_headers=["*"],
)

app.include_router(documents_router)


@app.get("/api/health")
def health_check():
    """Health check endpoint to verify backend status."""
    return {"status": "ok", "service": "ScholarsMate Backend API"}


# =============================================================================
# BYOK LIVE MODEL DISCOVERY ENDPOINT
# =============================================================================

ACTIVE_PRODUCTION_GEMINI = [
    {"id": "gemini/gemini-3.7-flash", "name": "Gemini 3.7 Flash", "provider": "gemini"},
    {"id": "gemini/gemini-3.6-flash", "name": "Gemini 3.6 Flash", "provider": "gemini"},
    {"id": "gemini/gemini-3.5-flash", "name": "Gemini 3.5 Flash", "provider": "gemini"},
    {"id": "gemini/gemini-3.5-flash-lite", "name": "Gemini 3.5 Flash Lite", "provider": "gemini"},
]


@app.post("/api/byok/fetch-models", response_model=List[ModelItem])
async def fetch_available_models(req: FetchModelsRequest):
    """Probes provider API using key and returns normalized, production-ready generation models."""
    provider = req.provider if req.provider != "auto" else detect_provider(req.api_key)
    key = req.api_key.strip()
    models = []

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            if provider == "gemini":
                res = await client.get(
                    "https://generativelanguage.googleapis.com/v1beta/models",
                    headers={"x-goog-api-key": key, "Content-Type": "application/json"}
                )
                if res.status_code == 200:
                    models = [
                        ModelItem(
                            id=normalize_litellm_model_id(m["id"], provider="gemini"),
                            name=m["name"],
                            provider="gemini"
                        )
                        for m in ACTIVE_PRODUCTION_GEMINI
                    ]
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Gemini API authentication failed ({res.status_code}): {res.text}"
                    )

            elif provider == "groq":
                res = await client.get(
                    "https://api.groq.com/openai/v1/models",
                    headers={"Authorization": f"Bearer {key}"}
                )
                if res.status_code == 200:
                    data = res.json()
                    models = [
                        ModelItem(
                            id=normalize_litellm_model_id(m["id"], provider="groq"),
                            name=m["id"],
                            provider="groq"
                        )
                        for m in data.get("data", [])
                        if not any(x in m["id"].lower() for x in ["whisper", "guard", "vision", "tts", "embedding"])
                    ]

            elif provider == "openai":
                res = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {key}"}
                )
                if res.status_code == 200:
                    data = res.json()
                    valid_prefixes = ("gpt-4o", "gpt-4", "o1", "o3", "chatgpt")
                    models = [
                        ModelItem(
                            id=normalize_litellm_model_id(m["id"], provider="openai"),
                            name=m["id"],
                            provider="openai"
                        )
                        for m in data.get("data", [])
                        if m["id"].startswith(valid_prefixes)
                        and not any(x in m["id"].lower() for x in ["audio", "realtime", "tts", "transcription", "embedding"])
                    ]

            elif provider == "openrouter":
                res = await client.get(
                    "https://openrouter.ai/api/v1/models",
                    headers={"Authorization": f"Bearer {key}"}
                )
                if res.status_code == 200:
                    data = res.json()
                    models = [
                        ModelItem(
                            id=normalize_litellm_model_id(m["id"], provider="openrouter"),
                            name=m.get("name", m["id"]),
                            provider="openrouter"
                        )
                        for m in data.get("data", [])[:30]
                    ]

            elif provider == "anthropic":
                claude_models = [
                    {"id": "anthropic/claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet", "provider": "anthropic"},
                    {"id": "anthropic/claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku", "provider": "anthropic"},
                    {"id": "anthropic/claude-3-opus-20240229", "name": "Claude 3 Opus", "provider": "anthropic"},
                ]
                models = [
                    ModelItem(
                        id=normalize_litellm_model_id(m["id"], provider="anthropic"),
                        name=m["name"],
                        provider="anthropic"
                    )
                    for m in claude_models
                ]

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to fetch {provider} models: {str(e)}")

    if not models:
        raise HTTPException(status_code=400, detail="Invalid API key or no supported text models returned by provider.")

    return models


# =============================================================================
# AUTHENTICATION & IDENTITY ENDPOINTS
# =============================================================================

@app.get("/api/auth/me", response_model=AuthResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Returns the authenticated Google user or active guest profile."""
    return AuthResponse(
        user_id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        avatar_url=current_user.avatar_url,
        is_guest=current_user.is_guest,
    )


# =============================================================================
# CHAT SESSION MANAGEMENT ENDPOINTS (MULTI-TENANT)
# =============================================================================

@app.post("/api/sessions", response_model=ChatSessionResponse)
async def create_session(
    req: CreateSessionRequest, 
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Creates a new persistent chat session thread scoped to current user."""
    session = await crud.create_chat_session(
        db, 
        title=req.title, 
        doc_names=req.doc_names,
        user_id=current_user.id
    )
    return session


@app.get("/api/sessions", response_model=List[ChatSessionResponse])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists historical chat sessions belonging exclusively to current user."""
    return await crud.get_all_sessions(db, user_id=current_user.id)


@app.get("/api/sessions/{session_id}", response_model=ChatSessionDetailResponse)
async def get_session_details(
    session_id: str, 
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves full chat message history for a specific session ID owned by user."""
    sessions = await crud.get_all_sessions(db, user_id=current_user.id)
    session_meta = next((s for s in sessions if s.id == session_id), None)
    
    if not session_meta:
        raise HTTPException(status_code=404, detail="Chat session not found or unauthorized.")

    messages = await crud.get_session_messages(db, session_id)
        
    return {
        "id": session_meta.id,
        "title": session_meta.title,
        "created_at": session_meta.created_at,
        "messages": messages,
    }


@app.delete("/api/sessions/{session_id}")
async def delete_session_endpoint(
    session_id: str, 
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Deletes a chat session belonging to current user."""
    deleted = await crud.delete_session(db, session_id, user_id=current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chat session not found or unauthorized.")
    return {"message": "Chat session successfully deleted."}


# =============================================================================
# CORE RAG QUERY ENDPOINT (TENANT-SCOPED PERSISTENCE)
# =============================================================================

@app.post("/api/query", response_model=QueryResponse)
async def query_rag(
    request: QueryRequest, 
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Accepts query, routes plan, persists chat turn to DB, and returns response with thinking trace."""
    try:
        # 1. Resolve active workspace document list
        target_documents = getattr(request, "doc_names", None) or getattr(request, "selected_docs", None) or []

        # 2. Check session existence for user
        session_id = request.session_id
        session_exists = False
        
        if session_id:
            user_sessions = await crud.get_all_sessions(db, user_id=current_user.id)
            session_exists = any(s.id == session_id for s in user_sessions)

        # Fallback: create fresh session linked to user
        if not session_id or not session_exists:
            new_session = await crud.create_chat_session(
                db, 
                title=request.query[:40] + "...", 
                doc_names=target_documents, 
                user_id=current_user.id
            )
            session_id = new_session.id

        # 3. Fetch history from DB or fallback to payload
        db_messages = await crud.get_session_messages(db, session_id)
        if db_messages:
            history_list = [{"sender": m.sender, "text": m.text} for m in db_messages[-6:]]
        else:
            history_list = [
                msg.model_dump() if hasattr(msg, "model_dump") else msg.dict() 
                for msg in (request.chat_history or [])
            ]

        # 4. Generate answer via RAG Pipeline
        result = generate_answer(
            query=request.query, 
            top_k=getattr(request, "top_k", 10), 
            explicit_docs=target_documents,
            chat_history=history_list,
            model_name=request.model_name,
            custom_keys=request.custom_keys or {},
        )

        # 5. Save User prompt & Bot answer (including thinking trace) to Database
        await crud.add_message(db, session_id=session_id, sender="user", text=request.query)
        await crud.add_message(
            db, 
            session_id=session_id, 
            sender="bot", 
            text=result["answer"], 
            thinking_process=result.get("thinking_process"),
            sources=result["sources_used"],
        )

        return QueryResponse(
            query=result["query"],
            answer=result["answer"],
            thinking_process=result.get("thinking_process"),
            sources_used=result["sources_used"],
            session_id=session_id,
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Query generation failed: {str(e)}")


# =============================================================================
# UPLOAD & WORKSPACE CREATION ENDPOINTS
# =============================================================================

@app.post("/api/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """Uploads single PDF file, processes it, and stores embeddings in ChromaDB."""
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


@app.post("/api/workspace/create")
async def create_workspace(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Uploads a batch of PDF papers, applies SHA-256 deduplication,
    enforces duplicate workspace limit per user, and returns session metadata.
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
            detail="No valid readable PDF files were processed.",
        )

    # Enforce maximum 3 duplicate workspaces per user
    target_docs_sorted = sorted(list(set(processed_files)))
    user_sessions = await crud.get_all_sessions(db, user_id=current_user.id)
    
    matching_workspaces_count = 0
    for session in user_sessions:
        session_docs = getattr(session, "doc_names", None)
        if session_docs and isinstance(session_docs, list):
            if sorted(session_docs) == target_docs_sorted:
                matching_workspaces_count += 1

    if matching_workspaces_count >= 3:
        raise HTTPException(
            status_code=400,
            detail=(
                f"You already have {matching_workspaces_count} workspaces with this exact set of papers. "
                "Please delete or reuse one of your existing workspaces to proceed."
            )
        )

    # Register session scoped to user
    default_title = f"{Path(processed_files[0]).stem} Workspace" if len(processed_files) == 1 else f"{len(processed_files)} Papers Workspace"
    new_session = await crud.create_chat_session(
        db, 
        title=default_title, 
        doc_names=target_docs_sorted, 
        user_id=current_user.id
    )

    return {
        "message": f"Workspace created with {len(processed_files)} document(s).",
        "filename": ", ".join(processed_files),
        "chunks_processed": total_chunks,
        "session_id": new_session.id,
        "title": new_session.title,
        "doc_names": target_docs_sorted,
    }


# =============================================================================
# LITERATURE REVIEW STUDIO ENDPOINT
# =============================================================================

@app.post("/api/workspace/literature-review")
def create_literature_review(request: ReviewRequest):
    """Generates structured academic literature review across workspace documents."""
    try:
        result = generate_literature_review(
            doc_names=request.doc_names,
            research_focus=request.research_focus or "",
            depth=request.depth or "detailed",
            model_name=request.model_name or "gemini/gemini-3.7-flash",
            custom_keys=request.custom_keys or {}
        )
        if "error" in result and not result.get("content"):
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
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