# Ingestion-Time Document Cache & Summary Worker

## The Problem: Cold-Start Summary Queries
When a user uploads a paper and asks:
> *"Can you summarize this paper for me?"* or *"What is this paper about?"*

A standard RAG system runs a vector search, picks 5-8 random chunks, and generates a shallow, patchy summary. Worse, it consumes 3,000+ LLM input tokens and incurs a 5-second latency delay on every summary query.

---

## The Solution: Asynchronous Ingestion-Time Summarization
ScholarsMate introduces a dedicated background summarizer (`backend/ingestion/summary_worker.py`).

### Workflow:
1. **Upload Trigger:** As soon as a PDF upload completes, `trigger_async_summary_generation()` is spawned as a background task.
2. **Landmark Extraction:** Extracts the critical structural sections:
   - Abstract & Introduction (Pages 1–2)
   - Methodology overview
   - Conclusion & Results (Final pages)
3. **Structured Summary Generation:** Generates an executive 1-paragraph synthesis + 3 key takeaways.
4. **Relational Persistence:** Cached directly in `UserDocument.summary_cache` (SQLite).

---

## The Payoff: Sub-50ms Zero-Token Instant Cache Hits
When the router receives a summary query for an ingested document, it triggers the **Fast-Path Interceptor**:
```python
if is_summary_query and len(target_docs) == 1:
    cached_summary = get_cached_document_summary(target_doc)
    if cached_summary:
        return {
            "retrieval_mode": "cached_summary",
            "generation_mode": "no_llm",
            "cached_content": cached_summary,
            "recommended_top_k": 0
        }
```

### Key Advantages:
- **0 LLM API Tokens Consumed** on repeated queries.
- **Latency drops from ~5,000ms to $< 50\text{ms}$**.
- **100% Comprehensive:** The summary reflects the entire paper structure rather than 6 isolated chunks.

---

## Linked Notes
- [[20_Intelligent_Query_Router]] — How the router intercepts summary queries
- [[40_Academic_Reference_Manager_Overview]] — Displaying TL;DR in the Library Inspector
- [[64_Token_Economics_and_Free_Tier_Viability]] — Saving tokens for free-tier users
