from datetime import datetime
from pydantic import BaseModel, Field


class MessageItem(BaseModel):
    sender: str = Field(..., json_schema_extra={"example": "user"})
    text: str = Field(..., json_schema_extra={"example": "What dataset did the BART paper use?"})


class QueryRequest(BaseModel):
    query: str = Field(..., json_schema_extra={"example": "Compare the methodology in Arslan et al. with other papers."})
    top_k: int = Field(default=10, ge=1, le=30, json_schema_extra={"example": 10})
    doc_names: list[str] | None = Field(default=None, json_schema_extra={"example": ["sample.pdf"]})
    session_id: str | None = Field(default=None, json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174000"})
    chat_history: list[MessageItem] | None = Field(
        default_factory=list, 
        json_schema_extra={
            "example": [
                {"sender": "user", "text": "What dataset did the BART paper use?"},
                {"sender": "bot", "text": "The BART paper evaluated on CNN/DailyMail."}
            ]
        }
    )


class SourceItem(BaseModel):
    chunk_id: str
    doc_name: str
    page_number: int


class QueryResponse(BaseModel):
    query: str
    answer: str
    sources_used: list[SourceItem]
    session_id: str | None = None


# =============================================================================
# CHAT SESSION & DB PERSISTENCE SCHEMAS
# =============================================================================

class ChatMessageResponse(BaseModel):
    id: str
    session_id: str
    sender: str
    text: str
    sources_used: list[SourceItem] | None = None
    timestamp: datetime


class ChatSessionResponse(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime


class ChatSessionDetailResponse(BaseModel):
    id: str
    title: str
    created_at: datetime
    messages: list[ChatMessageResponse]


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
    documents: list[DocumentListItem]
    total_documents: int