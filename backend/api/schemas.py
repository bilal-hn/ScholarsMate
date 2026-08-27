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