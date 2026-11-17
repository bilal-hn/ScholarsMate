# Retrieval Strategies & Token Budgeting

## The Problem: Starvation & Context Explosion
In academic research, two common retrieval failure modes exist:
1. **Document Starvation:** A user asks to compare Paper A (10 pages) and Paper B (60 pages). A naive global similarity search returns 8 chunks all from Paper B because it has higher raw term frequency, completely ignoring Paper A.
2. **Context Window / TPM Bomb:** Loading too many chunks triggers rate limits (e.g. Groq free tier's 6,000 TPM limit) or causes the model to suffer from "Lost in the Middle" syndrome.

ScholarsMate overcomes this with a **3-Strategy Retrieval Architecture** (`backend/rag/retriever.py`) and **Strict Token Packing** (`backend/rag/runtime.py`).

---

## 1. The Three Retrieval Strategies

```mermaid
flowchart TD
    ModeSelector{Retrieval Mode} -->|vector_search| GlobalSearch[Standard Global Vector Search\nFiltered by Target Documents]
    ModeSelector|per_document_search| BalancedSearch[Per-Document Isolated Search\nk Chunks from Paper A + k Chunks from Paper B]
    ModeSelector -->|full_text| ExhaustiveSearch[Exhaustive Landmark Retrieval\nIntro, Method, Results, Conclusion]
    
    GlobalSearch --> DedupPack[Chunk Deduplication & Token Packing]
    BalancedSearch --> DedupPack
    ExhaustiveSearch --> DedupPack
    DedupPack --> ContextBlock[4,200 Token Context Block]
```

### Strategy A: `per_document_search` (Fair Multi-Paper Synthesis)
When a comparison is detected across 2+ papers, the system loops over each document individually, retrieving $k$ chunks per document:
```python
retrieved_chunks = []
for doc in target_docs:
    doc_results = search_similar_chunks(query=query, top_k=per_doc_k, doc_names=[doc])
    retrieved_chunks.extend(doc_results)
```
This guarantees that **every target paper is represented equally** in the LLM's prompt context.

### Strategy B: `vector_search` with Query Expansion
For single-document or deep technical queries, the user's prompt is expanded into sub-aspects (e.g. terminology synonyms) to maximize recall across dense vector space.

### Strategy C: `full_text`
Used when broad structural comprehension is required without relying on semantic similarity.

---

## 2. Hard Context Budgeting: `pack_chunks`
Before chunks are passed to the generator, they are packed under a hard token threshold (4,200 tokens):
```python
def pack_chunks(chunks: List[Dict[str, Any]], max_tokens: int = 4200) -> List[Dict[str, Any]]:
    packed = []
    current_tokens = 0
    for chunk in chunks:
        chunk_tokens = len(chunk["content"]) // 4  # Fast heuristic
        if current_tokens + chunk_tokens > max_tokens:
            break
        packed.append(chunk)
        current_tokens += chunk_tokens
    return packed
```

### Why 4,200 Tokens?
1. Leaves ample headroom for the System Prompt (~200 tokens), Chat History (~600 tokens), Brain Memories (~300 tokens), and Output Generation (~1,500 tokens).
2. Prevents provider 429 Rate Limit crashes on free-tier providers.

---

## Linked Notes
- [[31_Multi_Tier_Defensive_Guardrails]] — Gate 2 Distance & Token Rails
- [[30_Source_Locked_Generation]] — Feeding context to the generator
- [[64_Token_Economics_and_Free_Tier_Viability]] — Token breakdown analysis
