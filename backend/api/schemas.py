from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class MessageItem(BaseModel):
    sender: str = Field(..., json_schema_extra={"example": "user"})
    text: str = Field(..., json_schema_extra={"example": "What dataset did the BART paper use?"})


class QueryRequest(BaseModel):
    query: str = Field(..., json_schema_extra={"example": "Compare the methodology in Arslan et al. with other papers."})
    top_k: int = Field(default=10, ge=1, le=30, json_schema_extra={"example": 10})
    doc_names: Optional[List[str]] = Field(default=None, json_schema_extra={"example": ["sample.pdf"]})
    selected_docs: Optional[List[str]] = Field(default=None, json_schema_extra={"example": ["sample.pdf"]})
    session_id: Optional[str] = Field(default=None, json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174000"})
    chat_history: Optional[List[MessageItem]] = Field(
        default_factory=list, 
        json_schema_extra={
            "example": [
                {"sender": "user", "text": "What dataset did the BART paper use?"},
                {"sender": "bot", "text": "The BART paper evaluated on CNN/DailyMail."}
            ]
        }
    )
    model_name: Optional[str] = Field(
        default="gemini/gemini-3.7-flash", 
        json_schema_extra={"example": "gemini/gemini-3.7-flash"}
    )
    custom_keys: Optional[Dict[str, str]] = Field(
        default_factory=dict, 
        json_schema_extra={"example": {"gemini": "AIzaSy...", "groq": "gsk_..."}}
    )


class SourceItem(BaseModel):
    chunk_id: str
    doc_name: str
    page_number: int


class QueryResponse(BaseModel):
    query: str
    answer: str
    thinking_process: Optional[str] = None
    sources_used: List[SourceItem] = Field(default_factory=list)
    session_id: Optional[str] = None
    model_name: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None


# =============================================================================
# BYOK & MODEL DISCOVERY SCHEMAS
# =============================================================================

class FetchModelsRequest(BaseModel):
    api_key: str = Field(..., json_schema_extra={"example": "AIzaSy..."})
    provider: Optional[str] = Field(default="auto", json_schema_extra={"example": "gemini"})


class ModelItem(BaseModel):
    id: str = Field(..., json_schema_extra={"example": "gemini/gemini-3.7-flash"})
    name: str = Field(..., json_schema_extra={"example": "Gemini 3.7 Flash"})
    provider: str = Field(..., json_schema_extra={"example": "gemini"})


# =============================================================================
# CHAT SESSION & DB PERSISTENCE SCHEMAS
# =============================================================================

class ChatMessageResponse(BaseModel):
    id: str
    session_id: str
    sender: str
    text: str
    thinking_process: Optional[str] = None
    sources_used: Optional[List[SourceItem]] = None
    model_name: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    timestamp: datetime


class ChatSessionResponse(BaseModel):
    id: str
    title: str
    doc_names: Optional[List[str]] = None
    created_at: datetime
    updated_at: datetime


class ChatSessionDetailResponse(BaseModel):
    id: str
    title: str
    created_at: datetime
    messages: List[ChatMessageResponse]


# =============================================================================
# UPLOADS & WORKSPACE DOCUMENT SCHEMAS
# =============================================================================

class UploadResponse(BaseModel):
    message: str
    filename: str
    chunks_processed: int


class DocumentListItem(BaseModel):
    doc_name: str
    chunk_count: int


class DocumentListResponse(BaseModel):
    documents: List[DocumentListItem]
    total_documents: int


# =============================================================================
# FR-13: ASSISTED ACADEMIC DOCUMENT WRITER SCHEMAS
# =============================================================================

class DraftSaveRequest(BaseModel):
    session_id: str = Field(..., json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174000"})
    title: str = Field(default="Untitled Academic Draft", json_schema_extra={"example": "Literature Review on Delta-Tuning"})
    content_html: str = Field(default="", json_schema_extra={"example": "<h1>Abstract</h1><p>Recent advances in...</p>"})
    content_markdown: str = Field(default="", json_schema_extra={"example": "# Abstract\n\nRecent advances in..."})
    citations_data: Optional[List[Dict[str, Any]]] = Field(default_factory=list)


class DraftResponse(BaseModel):
    id: str
    session_id: str
    title: str
    content_html: str
    content_markdown: str
    citations_data: List[Dict[str, Any]] = Field(default_factory=list)
    updated_at: datetime


class FindCitationsRequest(BaseModel):
    query: str = Field(..., json_schema_extra={"example": "Dual-encoder retrieval reduces query latency by 32% under multi-hop setups."})
    doc_names: Optional[List[str]] = Field(default=None, json_schema_extra={"example": ["sample.pdf", "sample2.pdf"]})
    top_k: int = Field(default=5, ge=1, le=15)


class CitationCandidate(BaseModel):
    chunk_id: str
    doc_name: str
    page_number: int
    similarity_score: float = Field(..., description="Cosine similarity confidence percentage (0.0 - 1.0)")
    excerpt: str
    formatted_ref: str


class FindCitationsResponse(BaseModel):
    query: str
    candidates: List[CitationCandidate]
    total_matches: int


class EditorAskAIRequest(BaseModel):
    selection: str = Field(..., json_schema_extra={"example": "Dual-encoder retrieval reduces query latency by 32%."})
    instruction: str = Field(..., json_schema_extra={"example": "Critique this claim and suggest how to elaborate with evidence."})
    doc_names: Optional[List[str]] = Field(default=None, json_schema_extra={"example": ["sample2.pdf"]})
    model_name: Optional[str] = Field(default="gemini/gemini-3.7-flash")
    custom_keys: Optional[Dict[str, str]] = Field(default_factory=dict)


class EditorAskAIResponse(BaseModel):
    selection: str
    instruction: str
    result: str
    thinking_process: Optional[str] = None
    sources_used: List[SourceItem] = Field(default_factory=list)