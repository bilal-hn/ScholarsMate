import sys
import os
import time
import shutil
import hashlib
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

from backend.db.session import init_db, get_db, engine, Base
from backend.db import crud
from backend.db.models import User, UserDocument
from backend.db.document_service import update_schema_for_summary_cache
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
    DraftSaveRequest,
    DraftResponse,
    UpdateModeRequest,
    FindCitationsRequest,
    CitationCandidate,
    FindCitationsResponse,
    EditorAskAIRequest,
    EditorAskAIResponse,
)
from backend.ingestion.pipeline import process_path
from backend.ingestion.bibliographic_extractor import extract_bibliographic_metadata
from backend.ingestion.summary_worker import trigger_async_summary_generation
from backend.embeddings.vector_store import store_chunks, get_or_create_collection, search_similar_chunks
from backend.rag.retriever import build_context_block
from backend.rag.generator import generate_answer, _execute_completion_with_fallback
from backend.rag.literature_review import generate_literature_review
from backend.rag.runtime import normalize_litellm_model_id, extract_reasoning_and_content

# Import PDF streaming router
from backend.api.documents import router as documents_router

UPLOADS_DIR = Path(__file__).parent.parent.parent / "data" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def calculate_sha256(file_path: Path) -> str:
    """Calculates SHA-256 hash for document deduplication and tracking."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(65536), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager to handle DB initialization & schema migrations on startup."""
    await init_db()
    update_schema_for_summary_cache()
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
from backend.rag.modes import list_available_modes


@app.get("/api/modes")
def get_modes():
    """Returns available academic reasoning modes and their UI metadata."""
    return {"modes": list_available_modes()}


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


@app.patch("/api/sessions/{session_id}/mode", response_model=ChatSessionResponse)
async def update_session_mode_endpoint(
    session_id: str,
    req: UpdateModeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Updates the active reasoning mode for a specific chat session."""
    session = await crud.update_session_mode(db, session_id=session_id, mode=req.mode, user_id=current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found or unauthorized.")
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
        "active_mode": getattr(session_meta, "active_mode", "research") or "research",
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
    """
    Executes grounded RAG pipeline across selected papers with dynamic model fallbacks,
    active reasoning mode directives, and persists conversation turns to database.
    """
    try:
        # 1. Resolve target documents
        target_documents = None
        if request.doc_names:
            target_documents = request.doc_names
        elif request.selected_docs:
            target_documents = request.selected_docs

        # 2. Manage Session Scope
        session_id = request.session_id
        session_exists = False
        target_mode = getattr(request, "mode", None) or "research"
        
        if session_id:
            user_sessions = await crud.get_all_sessions(db, user_id=current_user.id)
            current_session = next((s for s in user_sessions if s.id == session_id), None)
            if current_session:
                session_exists = True
                # If request explicitly provided a mode and session had a different mode, update session
                if request.mode and request.mode != getattr(current_session, "active_mode", None):
                    await crud.update_session_mode(db, session_id=session_id, mode=request.mode, user_id=current_user.id)
                elif not request.mode and getattr(current_session, "active_mode", None):
                    target_mode = current_session.active_mode

        # Fallback: create fresh session linked to user
        if not session_id or not session_exists:
            new_session = await crud.create_chat_session(
                db, 
                title=request.query[:40] + "...", 
                doc_names=target_documents, 
                user_id=current_user.id,
                active_mode=target_mode
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

        # 4. Generate answer via RAG Pipeline (with mode lens + FR-11 instant summary cache hit)
        start_time = time.perf_counter()
        result = generate_answer(
            query=request.query, 
            top_k=getattr(request, "top_k", 10), 
            explicit_docs=target_documents,
            chat_history=history_list,
            model_name=request.model_name,
            custom_keys=request.custom_keys or {},
            mode=target_mode
        )
        duration_sec = round(time.perf_counter() - start_time, 2)
        prompt_words = len(request.query.split()) + (len(target_documents or []) * 120)
        completion_words = len(result["answer"].split()) + len((result.get("thinking_process") or "").split())
        total_tokens = max(1, int((prompt_words + completion_words) * 1.33))
        
        applied_mode = result.get("mode_applied", target_mode)
        telemetry_meta = {
            "responseTime": f"{duration_sec}s",
            "tokens": total_tokens,
            "model": request.model_name,
            "mode": applied_mode
        }

        # 5. Save User prompt & Bot answer (including thinking trace & telemetry) to Database
        await crud.add_message(db, session_id=session_id, sender="user", text=request.query, mode_applied=applied_mode)
        await crud.add_message(
            db, 
            session_id=session_id, 
            sender="bot", 
            text=result["answer"], 
            thinking_process=result.get("thinking_process"),
            sources=result["sources_used"],
            model_name=request.model_name,
            mode_applied=applied_mode,
            meta=telemetry_meta,
        )

        return QueryResponse(
            query=result["query"],
            answer=result["answer"],
            thinking_process=result.get("thinking_process"),
            sources_used=result["sources_used"],
            session_id=session_id,
            model_name=request.model_name,
            mode_applied=applied_mode,
            meta=telemetry_meta,
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Query generation failed: {str(e)}")


# =============================================================================
# UPLOAD & WORKSPACE CREATION ENDPOINTS
# =============================================================================

@app.post("/api/upload", response_model=UploadResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Uploads single PDF file, processes it, registers ownership, and triggers summary caching."""
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

        # Register document in database
        file_hash = calculate_sha256(file_path)
        doc_entry = UserDocument(
            user_id=current_user.id,
            doc_name=file.filename,
            file_hash=file_hash,
        )
        db.add(doc_entry)
        await db.commit()

        # Trigger background summary worker for instant caching
        await trigger_async_summary_generation(doc_name=file.filename)

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
    Uploads a batch of PDF papers, applies deduplication, registers documents in DB,
    and triggers parallel background summary caching.
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

            # Register document in DB
            file_hash = calculate_sha256(file_path)
            doc_entry = UserDocument(
                user_id=current_user.id,
                doc_name=filename,
                file_hash=file_hash,
            )
            db.add(doc_entry)

            # Dispatch non-blocking background summary worker for this paper
            await trigger_async_summary_generation(doc_name=filename)

            processed_files.append(filename)
        except Exception as e:
            print(f"Failed to process file {filename}: {str(e)}")

    if not processed_files:
        raise HTTPException(
            status_code=400, 
            detail="No valid readable PDF files were processed.",
        )

    await db.commit()

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


# =============================================================================
# FR-13: ASSISTED ACADEMIC DOCUMENT WRITER ENDPOINTS
# =============================================================================

@app.get("/api/editor/draft/{session_id}", response_model=DraftResponse)
async def get_draft(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves the active academic manuscript draft for a workspace session."""
    try:
        draft = await crud.get_workspace_draft(db, session_id)
        if not draft:
            # Create and return a blank initialized draft
            draft = await crud.save_workspace_draft(
                db, 
                session_id=session_id, 
                title="Untitled Academic Draft",
                content_html="<h2>Abstract</h2><p>Begin drafting your academic synthesis or literature review here...</p>",
                content_markdown="## Abstract\n\nBegin drafting your academic synthesis or literature review here...",
                citations_data=[]
            )
        return DraftResponse(
            id=draft.id,
            session_id=draft.session_id,
            title=draft.title or "Untitled Academic Draft",
            content_html=draft.content_html or "",
            content_markdown=draft.content_markdown or "",
            citations_data=draft.citations_data or [],
            updated_at=draft.updated_at
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch draft: {str(e)}")


@app.post("/api/editor/draft", response_model=DraftResponse)
async def save_draft(
    request: DraftSaveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Persists or auto-saves the academic manuscript draft and bibliography."""
    try:
        draft = await crud.save_workspace_draft(
            db,
            session_id=request.session_id,
            title=request.title,
            content_html=request.content_html,
            content_markdown=request.content_markdown,
            citations_data=request.citations_data
        )
        return DraftResponse(
            id=draft.id,
            session_id=draft.session_id,
            title=draft.title,
            content_html=draft.content_html,
            content_markdown=draft.content_markdown,
            citations_data=draft.citations_data or [],
            updated_at=draft.updated_at
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save draft: {str(e)}")


@app.post("/api/editor/find-citations", response_model=FindCitationsResponse)
async def find_citations(
    request: FindCitationsRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Semantic Citation Engine:
    Executes real-time cosine vector similarity search over workspace ChromaDB chunks
    for a highlighted sentence or academic claim.
    """
    clean_query = request.query.strip()
    if not clean_query:
        return FindCitationsResponse(query="", candidates=[], total_matches=0)

    try:
        results = search_similar_chunks(
            query=clean_query,
            top_k=request.top_k,
            doc_names=request.doc_names
        )

        candidates: List[CitationCandidate] = []
        if results and results.get("documents") and results["documents"][0]:
            docs = results["documents"][0]
            metas = results["metadatas"][0]
            distances = results.get("distances", [[]])[0] if results.get("distances") else [0.0] * len(docs)

            for text, meta, dist in zip(docs, metas, distances):
                doc_name = meta.get("source", "Unknown Document")
                page_number = int(meta.get("page_number", 1))
                chunk_id = meta.get("chunk_id", f"chunk_{doc_name}_{page_number}")
                
                # Check if chunk metadata already has complete bibliographic information
                paper_title = meta.get("paper_title")
                authors = meta.get("authors")
                year = meta.get("year")
                formatted_citation = meta.get("formatted_citation")
                
                # If missing or incomplete (legacy index), dynamically extract and cache
                if not authors or not year or not paper_title or paper_title == doc_name:
                    pdf_full_path = UPLOADS_DIR / doc_name
                    if pdf_full_path.exists():
                        bib = extract_bibliographic_metadata(str(pdf_full_path))
                        paper_title = bib.get("title") or paper_title or doc_name
                        authors = bib.get("authors") or authors
                        year = bib.get("year") or year
                        formatted_citation = bib.get("formatted_citation") or formatted_citation

                if not paper_title:
                    paper_title = doc_name.replace(".pdf", "").replace("_", " ").replace("-", " ").title()

                # Cosine distance to similarity percentage
                similarity = max(0.05, min(0.99, round(1.0 - float(dist), 4))) if dist is not None else 0.85
                
                # Clean excerpt snippet
                excerpt_clean = " ".join(text.split())
                if len(excerpt_clean) > 280:
                    excerpt_clean = excerpt_clean[:280] + "…"

                formatted_ref = f"{paper_title}, Page {page_number}"

                candidates.append(
                    CitationCandidate(
                        chunk_id=chunk_id,
                        doc_name=doc_name,
                        page_number=page_number,
                        similarity_score=similarity,
                        excerpt=excerpt_clean,
                        formatted_ref=formatted_ref,
                        paper_title=paper_title,
                        authors=authors,
                        year=year,
                        formatted_citation=formatted_citation
                    )
                )

        # Sort candidates descending by similarity score
        candidates.sort(key=lambda c: c.similarity_score, reverse=True)

        return FindCitationsResponse(
            query=clean_query,
            candidates=candidates,
            total_matches=len(candidates)
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Citation search failed: {str(e)}")


@app.post("/api/editor/ask-ai", response_model=EditorAskAIResponse)
async def editor_ask_ai(
    request: EditorAskAIRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Inline Context Assistant:
    Processes focused instructions (critique, expand, rewrite, formalize)
    on highlighted text excerpts, strictly grounded in workspace papers.
    """
    selection = request.selection.strip()
    instruction = request.instruction.strip()
    keys = request.custom_keys or {}

    if not selection or not instruction:
        raise HTTPException(status_code=400, detail="Selection and instruction must not be empty.")

    try:
        # Retrieve supporting context chunks from workspace documents
        combined_query = f"{selection} {instruction}"
        sim_results = search_similar_chunks(
            query=combined_query,
            top_k=4,
            doc_names=request.doc_names
        )

        retrieved_chunks = []
        sources = []
        if sim_results and sim_results.get("documents") and sim_results["documents"][0]:
            for text, meta in zip(sim_results["documents"][0], sim_results["metadatas"][0]):
                d_name = meta.get("source", "Document")
                p_num = int(meta.get("page_number", 1))
                retrieved_chunks.append({
                    "chunk_id": meta.get("chunk_id", ""),
                    "doc_name": d_name,
                    "page_number": p_num,
                    "content": text
                })
                sources.append({"chunk_id": meta.get("chunk_id", ""), "doc_name": d_name, "page_number": p_num})

        context_block = build_context_block(retrieved_chunks)

        editor_prompt = f"""
You are ScholarsMate's In-Editor Academic Assistant.
The researcher is writing an academic draft and highlighted this focal passage:
---
"{selection}"
---

User Instruction:
"{instruction}"

### RETRIEVED EVIDENCE FROM WORKSPACE PAPERS:
{context_block}

### INSTRUCTIONS:
1. Provide a direct, authoritative, and academic response directly addressing the user's instruction.
2. If rewriting or expanding the passage, output the refined text clearly so the author can immediately replace or insert it.
3. If factual statements are drawn from the retrieved papers, cite them with [Doc_Name, p.X].
4. Maintain formal academic prose and conciseness.
""".strip()

        target_model = normalize_litellm_model_id(request.model_name) or "gemini/gemini-3.7-flash"

        chat_completion = _execute_completion_with_fallback(
            model_name=target_model,
            messages=[{"role": "user", "content": editor_prompt}],
            custom_keys=keys,
            temperature=0.2,
            max_tokens=1500,
        )

        extracted = extract_reasoning_and_content(chat_completion)

        return EditorAskAIResponse(
            selection=selection,
            instruction=instruction,
            result=extracted.answer,
            thinking_process=extracted.thinking,
            sources_used=sources
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"In-Editor AI execution failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.api.main:app", host="0.0.0.0", port=8000, reload=True)