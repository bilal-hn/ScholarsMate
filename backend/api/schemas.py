from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    query: str = Field(..., example="What is the primary contribution of this paper?")
    top_k: int = Field(default=5, ge=1, le=20, example=5)


class SourceItem(BaseModel):
    chunk_id: str
    doc_name: str
    page_number: int


class QueryResponse(BaseModel):
    query: str
    answer: str
    sources_used: list[SourceItem]


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