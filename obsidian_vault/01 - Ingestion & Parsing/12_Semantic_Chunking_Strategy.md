# Semantic Chunking & Metadata Binding

## Why Chunking Strategy Matters in Academic RAG
Naive chunking (e.g. fixed 500 characters splitting in the middle of equations or citations) destroys semantic coherence. In academic papers:
1. Definitions, proofs, and experimental setups span multiple sentences.
2. Citations and formulas must not be severed mid-expression.
3. Every single chunk must know its **origin document, page number, and bibliographic context** so retrieval can produce accurate page-level citations.

---

## The ScholarsMate Chunking Configuration

| Parameter | Value | Rationale |
|---|---|---|
| **Chunk Size** | **1,200 characters** (~250 - 300 words) | Fits a self-contained academic paragraph, theorem, or experimental result without overflowing context. |
| **Chunk Overlap** | **150 characters** (~30 words) | Preserves cross-boundary semantic flow; guarantees that transitions between paragraphs are not lost. |
| **Separators** | `["\n\n", "\n", ". ", " ", ""]` | Respects structural paragraph breaks and sentence boundaries before resorting to word splits. |
| **Indexing Base** | **1-indexed page numbering** | Matches the actual printed page numbers of the PDF file for human-verifiable citations. |

---

## Rich Metadata Injection
Every chunk written to ChromaDB includes comprehensive metadata:
```python
chunk_metadata = {
    "source": filename,
    "doc_name": filename,
    "page_number": int(page_num),
    "chunk_id": f"{filename}_p{page_num}_c{chunk_idx}",
    "title": bib_meta.get("title", ""),
    "authors": bib_meta.get("authors", ""),
    "year": bib_meta.get("year", ""),
    "user_id": user_id
}
```

### Why Inject Metadata Directly Into Chunks?
- **Zero-Latency Attribution:** When the retriever pulls 6 chunks, the system already knows author, title, and page without querying a secondary database.
- **Tenant Isolation:** Filtering by `{"user_id": user_id}` ensures complete privacy between different students using the same server.

---

## Linked Notes
- [[22_ChromaDB_Vector_Persistence]] — How chunks are stored and queried
- [[32_Citation_Provenance_Verification]] — How chunk page numbers verify citations
- [[13_Ingestion_Time_Document_Cache]] — Pre-generating document summaries during ingestion
