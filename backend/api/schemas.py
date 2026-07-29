from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    query: str = Field(..., example="Compare the methodology in Arslan et al. with other papers.")
    top_k: int = Field(default=10, ge=1, le=30, example=10)
    doc_names: list[str] | None = Field(default=None, example=["sample.pdf"])


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