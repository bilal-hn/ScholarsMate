# ScholarsMate — Full Codebase Audit Report
> Generated: 2026-09-28 · Branch: `memory`

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Useless & Inefficient Code](#1-useless--inefficient-code)
3. [Token Budget & Context Overload Analysis](#2-token-budget--context-overload-analysis)
4. [Feature-by-Feature Analysis](#3-feature-by-feature-analysis)
5. [Groq Free Tier Feasibility](#4-groq-free-tier-feasibility)
6. [Quick Fix Priority List](#5-quick-fix-priority-list)

---

## Executive Summary

ScholarsMate has a **well-designed RAG architecture** at its core — the router/retriever/generator pipeline is thoughtful, the Brain memory system is novel, and the Literature Review studio is ambitious. However, the codebase shows signs of rapid iteration: dead code accumulation, duplicated helpers, and mismatched assumptions between components, especially around token budgets.

**The biggest risk for your FYP evaluation:** the system as written exceeds Groq's free-tier TPM limit on nearly every non-trivial query. Deep Research mode and Literature Review Studio are completely broken on free Groq. Paper Assistant works only for light, low-frequency use.

| Category | Status |
|---|---|
| Core RAG pipeline | ✅ Solid |
| Ingestion & chunking | ✅ Good |
| Brain memory | ⚠️ Good design, token-heavy |
| Literature Review | ⚠️ Architecturally correct, Groq-incompatible |
| Token management | ❌ Needs attention |
| Dead code | ❌ Several files/functions unused |
| DB layer | ⚠️ ORM model bug present |
| Security | ⚠️ A few gaps |
| Test coverage | ⚠️ Good unit tests, few integration gaps |

---

## 1. Useless & Inefficient Code

### 🔴 Critical — Delete These

**C1 — `QUERY_REWRITE_PROMPT` and `ROUTER_CLASSIFICATION_PROMPT` are dead code**
- **File:** [`prompt_templates.py` lines 20–64](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/rag/prompt_templates.py#L20-L64)
- Both are defined but **never imported or called anywhere**. The router builds its prompt inline in `router.py:287` and the rewrite prompt is inline in `retriever.py:78`.
- **Similarly:** `construct_prompt()` at line 84 of `prompt_templates.py` is never called. All message construction goes through `build_conversation_messages()`.
- ✂️ **Fix:** Delete lines 20–64 and the `construct_prompt()` function entirely.

**C2 — `indexer.py` is a 14-line stub with no logic**
- **File:** [`backend/ingestion/indexer.py`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/ingestion/indexer.py)
- Contains only `index_pdf_file()` with comments but zero implementation. **Never imported anywhere.** All real indexing happens in `pipeline.py` + `vector_store.py`.
- ✂️ **Fix:** Delete the file.

**C3 — `text_chunker.py` is completely superseded and unused**
- **File:** [`backend/ingestion/text_chunker.py`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/ingestion/text_chunker.py)
- Uses `chunk_size=1000` and 0-indexed pages (PyPDFLoader style). `pipeline.py` uses its own inline splitter with `chunk_size=1200` and 1-indexed pages. **Never imported anywhere.**
- Also queries metadata key `source` but the vector store indexes using `doc_name`. Functionally broken even if called.
- ✂️ **Fix:** Delete the file.

**C4 — `_resolve_api_key` duplicated in 4 separate files**
- `generator.py:29` → `_resolve_api_key()`
- `router.py:21` → `_resolve_router_api_key()`
- `retriever.py:22` → `_resolve_retriever_key()`
- `literature_review.py:28` → `_resolve_key()`
- All four are **functionally identical** — check `custom_keys[provider]`, iterate over all custom_keys, fall back to env var dict. Zero functional difference, ~80 lines of duplication.
- ✂️ **Fix:** Move to `runtime.py` as `resolve_api_key(provider, custom_keys)` and import everywhere.

**C5 — Duplicate imports and imports inside loops in `main.py`**
- `from sqlalchemy import select` re-imported at lines 417 and 465 (already at line 13).
- `import re` inside a `for` loop at line 1057 inside `get_workspace_papers_endpoint()`. Python caches it, but it's confusing and bad practice.
- ✂️ **Fix:** Move both to the top of `main.py`.

---

### 🟠 High — Fix Before Demo

**H1 — O(N) session scan for single session lookup**
- **File:** [`main.py:547`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/api/main.py#L547)
- `get_session_details()` calls `crud.get_all_sessions(db, user_id=...)` then does a Python linear scan with `next(... if s.id == session_id)`. Fetches ALL sessions to find one.
- ✂️ **Fix:** Add `get_session_by_id(db, session_id, user_id)` to `crud.py` using `WHERE id=? AND user_id=?`.

**H2 — PDF files re-opened on every `/api/workspace/papers` request**
- **File:** [`main.py:1049`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/api/main.py#L1049)
- `extract_bibliographic_metadata()` is called synchronously for every paper on every request to this endpoint. For a 10-paper workspace, this opens 10 PDFs per API call. The data is already in ChromaDB chunk metadata from index time.
- ✂️ **Fix:** Read bib metadata from ChromaDB chunk metadata instead of re-opening PDFs.

**H3 — Upload + add-papers code is duplicated ~50 lines**
- **Files:** [`main.py:734–775`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/api/main.py#L734-L775) and [`main.py:929–985`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/api/main.py#L929-L985)
- Both routes do: open file → write to disk → `process_path()` → `store_chunks()` → SHA-256 → `UserDocument` → `trigger_async_summary_generation()`.
- ✂️ **Fix:** Extract a `_process_and_register_pdf(file, user_id, db)` helper.

**H4 — Workspace duplicate check happens AFTER indexing**
- **File:** [`main.py:887`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/api/main.py#L887)
- Files are fully processed and committed to ChromaDB *before* the duplicate workspace check. If the check fails, the PDFs are already indexed.
- ✂️ **Fix:** Move the duplicate session check to before file processing.

**H5 — `document_service.py` uses raw `sqlite3` alongside async SQLAlchemy**
- **File:** [`backend/db/document_service.py`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/db/document_service.py)
- Creates its own synchronous `sqlite3` connections to the same DB file, bypassing the async session. Two independent writers on the same SQLite file = potential locking conflicts. Also duplicates schema migration logic from `session.py`.
- ✂️ **Fix:** Replace `_get_connection()` with proper async SQLAlchemy CRUD calls. Merge its `update_schema_for_summary_cache()` into `init_db()`.

**H6 — `asyncio.get_event_loop()` in `summary_worker.py` is fragile**
- **File:** [`backend/ingestion/summary_worker.py:128`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/ingestion/summary_worker.py#L128)
- In Python 3.10+, `asyncio.get_event_loop()` outside an async context raises a DeprecationWarning and may return a closed loop.
- ✂️ **Fix:** Use `asyncio.get_running_loop().run_in_executor(None, ...)` inside the async function.

**H7 — `generated_at` is hardcoded to `"2026-08-25"` in Literature Review**
- **File:** [`backend/rag/literature_review.py:442`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/rag/literature_review.py#L442)
- Static stale string. Every generated review will say August 25.
- ✂️ **Fix:** `datetime.utcnow().isoformat()`

**H8 — Path traversal vulnerability in `documents.py`**
- **File:** [`backend/api/documents.py:16`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/api/documents.py#L16)
- `file_path = DOCUMENTS_DIR / filename` — if `filename` contains `../../etc/passwd`, FastAPI's `FileResponse` will serve it.
- ✂️ **Fix:**
  ```python
  file_path = (DOCUMENTS_DIR / Path(filename).name).resolve()
  assert file_path.is_relative_to(DOCUMENTS_DIR)
  ```

**Silent Model Swap Bug — `generator.py:337`**
- **File:** [`backend/rag/generator.py:337`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/rag/generator.py#L337)
- Condition `if not target_model or "llama" in target_model:` silently overrides ANY Llama model the user selected with Gemini. If a user picks `groq/llama-3.3-70b-versatile`, it gets swapped to `gemini/gemini-3.6-flash`.
- ✂️ **Fix:** Remove the `"llama" in target_model` part. Only fallback when `not target_model`.

---

### 🟡 Medium — Fix When Possible

**M1 — `WorkspaceDraft` ORM model is missing columns that `crud.py` uses**
- **File:** [`backend/db/models.py:102–111`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/db/models.py#L102-L111)
- `citations_data` and `updated_at` are set by `crud.py:361`, `crud.py:371`, and `crud.py:383` but are **not declared in the SQLAlchemy ORM model**. These attributes exist in the DB (raw SQL via `document_service.py`), but the ORM doesn't know about them — any direct attribute access will raise `AttributeError` at runtime.
- ✂️ **Fix:** Add to `WorkspaceDraft`:
  ```python
  citations_data: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
  updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
  ```

**M2 — JWT secret has a weak hardcoded default**
- **File:** [`backend/api/auth.py:24`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/api/auth.py#L24)
- If `.env` doesn't set `JWT_SECRET_KEY`, the key `"scholarsmate-secret-auth-key-2026"` is used.
- ✂️ **Fix:** `raise RuntimeError("JWT_SECRET_KEY must be set in .env")` or generate on startup with `secrets.token_hex(32)`.

**M3 — `_METADATA_CACHE` in `bibliographic_extractor.py` is unbounded**
- A plain dict with no eviction. Grows indefinitely in a long-running server.
- ✂️ **Fix:** `@functools.lru_cache(maxsize=256)` on the extractor function.

**M4 — `list_indexed_documents()` does a full 10,000-record ChromaDB scan on every query**
- **File:** [`backend/embeddings/vector_store.py:143, 161`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/embeddings/vector_store.py#L143-L161)
- Called on every single query in the router. For a 50-document workspace with 100 chunks each = 5,000 metadata records fetched per turn.
- ✂️ **Fix:** Maintain an in-memory cached set of indexed document names, updated only on `store_chunks()`.

**M5 — Literature Review endpoint has no authentication**
- **File:** [`main.py:1095`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/api/main.py#L1095)
- `create_literature_review()` has no `Depends(get_current_user)` — any anonymous caller can hit this and burn API keys.
- ✂️ **Fix:** Add `current_user: User = Depends(get_current_user)` to the function signature.

**M6 — `list_documents()` is not user-scoped (data isolation issue)**
- **File:** [`main.py:1117`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/api/main.py#L1117)
- Returns ALL documents in ChromaDB across all users. Users can see other users' document names.
- ✂️ **Fix:** Filter ChromaDB query by `user_id` metadata field during indexing and retrieval.

**M7 — `heuristic_intent()` GENERAL_KNOWLEDGE patterns are too narrow**
- **File:** [`backend/rag/runtime.py:236–242`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/rag/runtime.py#L236-L242)
- Only matches hardcoded phrases like `"write a python function"`, `"what is the capital"`. General queries that don't match these patterns fall through to `NEW_QUERY` and trigger full RAG retrieval unnecessarily.

**M8 — Brain context has no memory count cap**
- **File:** [`backend/rag/brain.py`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/rag/brain.py)
- `build_brain_context()` injects all active memories with no cap. A user with 100 memories injects ~3,000 extra tokens per query.
- ✂️ **Fix:** Cap at 15–20 most recent active memories.

**M9 — `doc_names` and `selected_docs` both exist in `QueryRequest`**
- **File:** [`backend/api/schemas.py`](file:///run/media/bihhlal/Shared/Uni/ScholarsMate/backend/api/schemas.py)
- Two fields serving the same purpose from a refactor. `main.py:595–598` handles both. Confusing for future development.
- ✂️ **Fix:** Pick one, mark the other deprecated.

---

### 🟢 Low — Minor / Cosmetic

- `L1`: `detect_provider()` in `main.py:119` checks `"AQ."` and `"AQ"` prefixes for Gemini — actual Gemini keys start with `AIzaSy`.
- `L2`: `get_or_create_google_user()` in `crud.py` is never called — dead code.
- `L3`: `clear_brain_memories()` deletes in a Python loop (100 DELETE statements for 100 memories). Use bulk `DELETE WHERE`.
- `L4`: `ACCESS_TOKEN_EXPIRE_DAYS = 30` is long with no refresh/revocation mechanism.
- `L5`: `_extract_landmark_chunks()` in `summary_worker.py:63` uses `not in` on a list of dicts — O(N²) but only over a small list, acceptable for now.
- `L6`: Stale comment `# Add to backend/rag/prompt_templates.py` at `prompt_templates.py:18`.

---

## 2. Token Budget & Context Overload Analysis

### Per-Query Token Breakdown

| Component | Paper Assistant | Deep Research | Lit Review (per section) |
|---|---|---|---|
| `SOURCE_LOCKED_SYSTEM_PROMPT` | ~190 | ~190 | ~190 |
| Mode directive | ~80 | ~120 | ~120 |
| Brain context (10 memories) | ~200–400 | ~200–400 | 0 (not injected) |
| Chat history (6 msgs × 300 words) | ~600 | ~600 | 0 |
| Retrieved chunks (top_k=6 × 1200 chars) | ~1,440 | — | — |
| Retrieved chunks (top_k=8 × 1200 chars) | — | ~1,920 | — |
| Lit review context block (4500 tokens) | — | — | ~4,500 |
| Rolling section summaries (by section 5) | — | — | ~1,750 |
| Query (~30 words) | ~40 | ~40 | ~40 |
| **Total INPUT tokens** | **~2,550** | **~3,270** | **~6,600** |
| `RAG_MAX_TOKENS` (output) | 4,096 | 4,096 | 3,500 |
| **Total window needed** | **~6,646** | **~7,366** | **~10,100** |

> [!IMPORTANT]
> These numbers are **per main LLM call**. Each query also fires additional LLM calls: the router call (~1,000 tokens), optional query expansion (~500 tokens), and background brain extraction (~4,000 tokens). A single Deep Research turn consumes **~12,000 tokens total from Groq's free-tier quota**.

### Specific Risks

**1. Brain + main query combined exceeds Groq TPM on every turn**
- Brain extraction fires after every query: ~3,500 tokens in + ~512 out = ~4,000 tokens.
- Add to Deep Research main call (~7,366): **~11,366 tokens per user turn** — far over Groq free's ~6,000 TPM.

**2. Router catalog JSON bloat**
- `get_indexed_document_catalog()` result is injected into the router prompt. For 20 documents: ~400 extra tokens added to every router call.

**3. Expansion + rewrite = 2 extra LLM calls before generation**
- `expand_query()` fires for every non-follow-up query (LLM call ~300 tokens).
- `rewrite_query_with_history()` fires on follow-ups (LLM call ~500 tokens).
- These hardcode `gemini/gemini-2.5-flash` as default — will silently fail if user only has Groq key, wasting one API call attempt.

**4. `pack_chunks` vs `build_context_block` mismatch**
- `pack_chunks()` in `runtime.py` allows up to **6,000 tokens** of chunks.
- `build_context_block()` in `retriever.py` truncates at **4,200 tokens**.
- Chunks between 4,200–6,000 tokens are silently discarded after already being packed. The numbers need to be in sync.

**5. Literature Review is 8+ sequential LLM calls**
- Outline call (~2,800 tokens) + 5 section drafts (~9,940 tokens each by section 5) + matrix + conclusion.
- Total: **~55,000+ tokens** for a 5-paper review. Impossible on free Groq.

**6. Inaccurate token telemetry**
- `main.py:664–666` estimates tokens as `len(query.split()) + (len(target_docs) * 120)`. This ignores the context block, brain context, system prompt, and output. The `meta["tokens"]` stored per message is wildly under-reported.

---

## 3. Feature-by-Feature Analysis

### 📄 Ingestion Pipeline

| Component | Status | Notes |
|---|---|---|
| `pipeline.py` | ✅ Solid | PyMuPDF layout-aware parsing, SHA-256 dedup, 1200-char chunks with 150 overlap. Good design. |
| `pdf_parser.py` | ✅ OK | Simpler fallback using LangChain PyPDFLoader. Works but produces lower-quality text for complex PDFs. |
| `bibliographic_extractor.py` | ✅ Good | 3-tier degradation (PDF metadata → font hierarchy → filename). Memory cache works for single-process. |
| `text_chunker.py` | ❌ Dead | Superseded, never imported, uses wrong metadata keys. Delete it. |
| `indexer.py` | ❌ Dead | Empty stub. Delete it. |
| `summary_worker.py` | ⚠️ Fragile | Async loop access anti-pattern. Only uses Gemini key (no BYOK). Summary silently fails without `GEMINI_API_KEY`. |

**Minor issue in `pipeline.py`:** The bib_meta fields (author, title, year) are injected into every chunk at lines 138–141 *after* the text splitter runs — but the splitter already copies the parent Document's metadata to each chunk. This double-injection is harmless but redundant.

---

### 🧠 Vector Store

| Aspect | Status | Notes |
|---|---|---|
| ChromaDB singleton | ✅ Correct | Persistent client, singleton pattern per collection |
| Batched upsert | ✅ Good | batch_size=500 prevents SQLite variable overflow |
| `list_indexed_documents()` | ⚠️ Slow | Full 10,000-record scan on every query call |
| Distance threshold | ⚠️ Missing | `search_similar_chunks()` returns all results regardless of relevance; threshold applied later in `retriever.py` but not in `/find-citations` or `summary_worker.py` |

---

### 🔀 Router

| Aspect | Status | Notes |
|---|---|---|
| Fast-path heuristics | ✅ Good | Catches conversational, follow-up, metadata queries before LLM call |
| LLM classification | ✅ Good | Returns structured JSON plan |
| `sanitize_plan()` | ⚠️ Risky fallback | Falls back to ALL documents if fuzzy matching returns nothing — causes massive context on broad workspaces |
| Cached summary path | ✅ Smart | Bypasses LLM entirely for summary queries |
| `_resolve_router_api_key()` | ❌ Duplicate | Identical to same function in 3 other files (see C4) |

---

### 📥 Retriever

| Aspect | Status | Notes |
|---|---|---|
| 3-strategy retrieval | ✅ Well-designed | `full_text`, `per_document_search`, `vector_search` with expansion |
| `expand_query()` | ⚠️ Expensive | Fires an extra LLM call for every non-follow-up query; hardcodes Gemini as default |
| `rewrite_query_with_history()` | ⚠️ Expensive | Extra LLM call on follow-ups; hardcodes Gemini |
| `build_context_block` 4200-token cap | ⚠️ Mismatch | Conflicts with `pack_chunks` 6000-token budget |
| Per-document search at top_k=18 | ⚠️ Context bomb | 18 × 1,200 chars ≈ 5,760 tokens just for context |

---

### ⚙️ Generator

| Aspect | Status | Notes |
|---|---|---|
| Fallback chain | ✅ Smart | Provider-aware, model-aware fallback sequence |
| BYOK support | ✅ Works | Correctly resolves custom API keys per provider |
| `extract_sources_from_text()` | ✅ Good | Handles complex filenames with parentheses |
| `"llama" in target_model` model swap | ❌ Bug | Silently replaces user-selected Llama model with Gemini (see Silent Model Swap above) |
| Map-reduce threshold at `len(chunks) >= 8` | ⚠️ Edge case | Paper Assistant (top_k=6) never triggers map-reduce. Deep Research (top_k=8) may hit exactly the boundary. |
| `execute_map_reduce_synthesis()` | ⚠️ Expensive | N+1 LLM calls (one per doc), each with 2,048 output tokens |

---

### 🧩 Brain Memory

| Aspect | Status | Notes |
|---|---|---|
| Background extraction | ✅ Correct | `background_tasks.add_task()` — non-blocking |
| Thought deduplication | ✅ Works | String-level dedup prevents obvious duplicates |
| Scope/category system | ✅ Well-designed | `global`/`workspace`, `preference`/`profile`/`insight`/`milestone`/`directive` |
| Memory cap | ❌ Missing | No cap in `build_brain_context()` — power users inject 3,000+ extra tokens/query |
| Deactivated memories in dedup check | ⚠️ Logic | `extract_and_persist_memories_async()` includes inactive memories in dedup `existing[:20]` but doesn't filter by `is_active` |
| BRAIN_EXTRACTION_PROMPT token cost | ⚠️ Heavy | ~4,000 tokens per background call after every query |

---

### 📚 Literature Review Studio

| Aspect | Status | Notes |
|---|---|---|
| 5-stage pipeline | ✅ Architecturally correct | Outline → 5 sections → matrix → conclusion is publication-grade design |
| Section rolling_memory | ✅ Coherent | Keeps sections contextually linked |
| Token consumption | ❌ Critical | ~55,000 tokens for a 5-paper review — impossible on Groq free tier |
| Synchronous event loop blocking | ❌ Bug | `create_literature_review()` in `main.py` is `def` not `async def`, blocks FastAPI event loop for entire duration (could be minutes) |
| No authentication on endpoint | ❌ Security | Anyone can call it and burn your API key |
| `generated_at` hardcoded | ❌ Bug | Static `"2026-08-25"` string on every review |

---

### 💬 Prompt Templates

| Aspect | Status | Notes |
|---|---|---|
| `SOURCE_LOCKED_SYSTEM_PROMPT` | ✅ Well-written | ~190 tokens, appropriate scope locking |
| `build_conversation_messages()` | ✅ Works | Correct history injection with 300-word truncation per message |
| Dead code | ❌ 3 items | `QUERY_REWRITE_PROMPT`, `ROUTER_CLASSIFICATION_PROMPT`, `construct_prompt()` — none are called anywhere |
| History truncation off-by-one | ⚠️ Minor | Checks `> 300 words` but truncates to 280 — 20-word inconsistency |

---

### 🗄️ Database Layer

| Aspect | Status | Notes |
|---|---|---|
| Async SQLAlchemy | ✅ Correct | `expire_on_commit=False`, proper async sessions |
| JSON normalization guards | ✅ Good | `_normalize_json_list()` / `_normalize_json_dict()` handle legacy serialization |
| `WorkspaceDraft` ORM | ❌ Bug | Missing `citations_data` and `updated_at` columns — `crud.py` sets these but they're not in the ORM model |
| `document_service.py` | ❌ Wrong | Uses raw `sqlite3` alongside async SQLAlchemy — potential locking conflicts |
| Manual schema migrations | ⚠️ Fragile | No Alembic, no version table — adding a column requires changes in two places |
| `get_or_create_google_user()` in crud.py | ❌ Dead | Never called anywhere |
| `clear_brain_memories()` | ⚠️ Inefficient | Deletes in a Python loop — N round-trips to DB |

---

### 🔐 Auth & Security

| Aspect | Status | Notes |
|---|---|---|
| PBKDF2-HMAC-SHA256 password hashing | ✅ Secure | 100,000 iterations, random salt |
| `secrets.compare_digest()` | ✅ Correct | Timing-safe comparison |
| Google ID token re-validation per request | ⚠️ Expensive | Network call to Google cert endpoint on every auth'd request using Google token |
| `JWT_SECRET_KEY` weak default | ⚠️ Risk | Falls back to a predictable string if not set in `.env` |
| Path traversal in `documents.py` | ❌ Vulnerability | Filename not sanitized before serving as `FileResponse` |
| No input sanitization on session title | ⚠️ Minor | Session title auto-generated from raw query — could contain control chars |
| `EmailStr` not used for email fields | ⚠️ Weak | Plain `str` with manual `"@" in email` check in `schemas.py` / `auth.py` |

---

### ✅ Tests

| Test File | Status | Notes |
|---|---|---|
| `test_brain.py` | ✅ Good | Comprehensive async CRUD tests with in-memory SQLite. All Brain operations covered. |
| `test_rag.py` | ✅ Good | Unit tests for `build_context_block`, `construct_prompt`, intent routing. Properly mocked. |
| `test_router_and_quality.py` | ✅ Good | Good coverage of `heuristic_intent()`, `sanitize_plan()`, citation extraction regex. |
| `test_pipeline.py` | ⚠️ Integration | Hits real file system and ChromaDB — no mocking. Fails in CI without real files. |
| `test_extract_fyp.py` | ⚠️ Integration | Hits real LLM API. No mocking. Should be tagged `@pytest.mark.integration`. |
| Missing tests | ❌ Gap | No tests for: `generate_answer()`, `generate_literature_review()`, auth token functions, `build_fallback_chain()`, concurrent brain memory CRUD. |

---

## 4. Groq Free Tier Feasibility

### What WORKS on Free Groq (llama-3.3-70b-versatile)

| Feature | Status | Notes |
|---|---|---|
| Conversational fast-path | ✅ Works | ~500 tokens — well within limits |
| Cached summary response | ✅ Works | 0 LLM calls |
| Workspace metadata queries | ✅ Works | 0 LLM calls |
| Paper Assistant (top_k=6, short queries) | ⚠️ Limited | ~4,000 tokens/turn. ~1 req/min before hitting 6,000 TPM |
| Single-document questions | ⚠️ OK | Works if no brain injection and no expansion |

### What BREAKS on Free Groq

| Feature | Status | Why |
|---|---|---|
| Deep Research mode (top_k=8) | ❌ Broken | Single turn ~7,000–8,000 tokens > TPM limit |
| Multi-turn sessions with Brain active | ❌ Broken | Brain extraction adds ~4,000 tokens — combined ~11,000/turn |
| Literature Review Studio (5 docs) | ❌ Completely broken | ~55,000+ tokens, 8+ API calls |
| Broad synthesis queries (top_k=18) | ❌ Broken | ~10,000+ tokens per turn |
| Any 3-LLM-call query path | ❌ Broken | Router + expansion + generation = ~8,000+ tokens |

> [!NOTE]
> Groq free tier limits are approximately **6,000 tokens/min (TPM)** and **30 requests/min (RPM)** for `llama-3.3-70b-versatile`. The context window is 128k, so that's not the issue — it's the **throughput limit** that breaks everything.

### Recommendations for Groq Free Tier

If you want to demo on free Groq, apply these changes:

1. **Detect Groq provider** and auto-apply conservative settings:
   - Reduce `top_k` from 6/8 to **4**
   - Reduce `build_context_block` budget from 4200 to **2000 tokens**
   - **Disable `expand_query()`** — use raw query only
   - **Cap brain injection to 5 memories**
   - **Skip background brain extraction** (or delay it)
2. **Show a UI warning** before Deep Research / Literature Review when Groq free key detected
3. **Literature Review:** Reduce section drafts to 2000 tokens max, disable `rolling_memory` injection

### For Best Results: Use Gemini Flash

Gemini 2.5 Flash free tier is **much better suited** to this system:
- 1 million token context window
- 1500 RPD (requests/day) and 1M TPM on free tier
- Already the hardcoded default model for `expand_query()` and `rewrite_query_with_history()`
- Literature Review, Deep Research, and Brain all work properly with Gemini Flash

**Recommendation: Get a free Gemini API key from [ai.google.dev](https://ai.google.dev) and test with that. Keep Groq as a fallback for speed-sensitive simple queries.**

---

## 5. Quick Fix Priority List

These are the fixes that will most improve your FYP demo — in order of priority:

| # | Fix | Files | Effort | Impact |
|---|---|---|---|---|
| 1 | Fix `WorkspaceDraft` ORM — add `citations_data` + `updated_at` columns | `models.py` | 5 min | 🔴 Prevents runtime crash in Document Writer |
| 2 | Fix silent Llama→Gemini model swap | `generator.py:337` | 2 min | 🔴 Prevents broken BYOK behavior |
| 3 | Add auth to Literature Review endpoint | `main.py:1095` | 2 min | 🔴 Security |
| 4 | Fix path traversal in `documents.py` | `documents.py:16` | 5 min | 🔴 Security |
| 5 | Fix `generated_at` hardcoded date | `literature_review.py:442` | 1 min | 🟠 Demo quality |
| 6 | Cap `build_brain_context()` at 15–20 memories | `brain.py` | 5 min | 🟠 Prevents token overload |
| 7 | Add Groq-provider token reduction logic | `generator.py`, `retriever.py` | 30 min | 🟠 Makes free Groq viable |
| 8 | Delete dead files: `indexer.py`, `text_chunker.py`, unused prompts | multiple | 10 min | 🟡 Code cleanliness |
| 9 | Consolidate `_resolve_api_key()` to `runtime.py` | 4 files | 20 min | 🟡 Maintainability |
| 10 | Fix O(N) session scan → direct DB lookup | `main.py:547`, `crud.py` | 15 min | 🟡 Performance |
| 11 | Fix Literature Review to be `async def` | `main.py:1095` | 10 min | 🟡 Prevents server freezes |
| 12 | Fix `asyncio.get_event_loop()` in `summary_worker.py` | `summary_worker.py:128` | 5 min | 🟡 Python 3.10+ compat |
| 13 | Add integration test tags to `test_pipeline.py`, `test_extract_fyp.py` | test files | 5 min | 🟢 Test hygiene |
| 14 | Fix `document_service.py` to use SQLAlchemy async | `document_service.py` | 45 min | 🟢 Long-term stability |



 ## ✅ What Has Been Implemented

  1. [Quick Fix #1 / M1] WorkspaceDraft ORM Missing Columns Fixed
      • File: models.py:111-112
      • citations_data: Mapped[Optional[list]] and updated_at: Mapped[datetime]
      have been added to the WorkspaceDraft ORM class, preventing runtime
      attribute crashes.
  2. [Quick Fix #2 / Silent Model Swap] Resolved Model and Key Resolution
      • Files: runtime.py:130-190, generator.py:315
      • Replaced the hardcoded "llama" in target_model fallback with
      resolve_model_and_key(). User-selected models (such as groq/llama-3.3-70b-
      versatile) are now properly respected with full unit tests in
      test_model_resolution.py.
  3. [Quick Fix #5 / H7] Literature Review Hardcoded Timestamp Fixed
      • File: literature_review.py:447
      • Hardcoded "2026-08-25" was replaced with dynamic datetime.utcnow().
      isoformat().
  4. [Quick Fix #6 / M8] Brain Memory Token Explosion Capped
      • File: brain.py:80-83
      • build_brain_context() now caps injected memories to 10 global + 10
      workspace memories (maximum 20 total) instead of injecting all unbounded
      memories.
  5. [Quick Fix #12 / H6] Fragile Event Loop & BYOK in Summary Worker Fixed
      • File: summary_worker.py:113-116
      • Replaced deprecated asyncio.get_event_loop() with asyncio.
      get_running_loop().
      • Also integrated pick_best_model_from_keys(), allowing background summary
      caching to use any user BYOK provider instead of failing when Gemini is
      absent.
  6. [C1 (Partial) & L6] Dead Prompts & Stale Comments Removed
      • File: prompt_templates.py
      • Dead QUERY_REWRITE_PROMPT and ROUTER_CLASSIFICATION_PROMPT definitions and
      stale comments were cleaned up.

  ──────
  ## ⚠ What Was Partially Addressed

  1. [Quick Fix #9 / C4] Consolidate _resolve_api_key() into runtime.py
      • Status: resolve_api_key was centralized in runtime.py and imported into
      generator.py, router.py, and retriever.py.
      • Remaining: literature_review.py:30 still keeps its own duplicate
      _resolve_key() function (~40 lines).
  2. [Quick Fix #14 / H5] Database Concurrency in document_service.py
      • Status: Added SQLite PRAGMA journal_mode=WAL; and PRAGMA busy_timeout=5000;
      to alleviate table locks.
      • Remaining: Still creates raw, synchronous sqlite3 connections rather than
      migrating to async SQLAlchemy sessions used across the rest of the
      application.
  3. [L1] Gemini Key Prefix Detection
      • Status: Added standard Google API key prefix AIzaSy in main.py:124, but
      left the legacy "AQ." / "AQ" checks intact.

  ──────
  ## ❌ What Is Remaining to be Implemented

  ### 🔴 Critical & Security

  1. [Quick Fix #3 / M5] Literature Review Endpoint Has No Authentication
      • File: main.py:1122-1124
      • /api/workspace/literature-review does not declare current_user: User =
      Depends(get_current_user). Any unauthenticated client can trigger heavy
      multi-stage LLM generation and consume backend API quota.
  2. [Quick Fix #11 / Bug 322] Literature Review Blocks FastAPI Event Loop
      • File: main.py:1123
      • Endpoint is defined as synchronous def create_literature_review(...)
      rather than running asynchronously or dispatching to an executor thread,
      stalling all concurrent HTTP traffic for the entire duration of the review.
  3. [Quick Fix #4 / H8] Path Traversal Vulnerability in Document Viewer
      • File: documents.py:16
      • file_path = DOCUMENTS_DIR / filename directly serves the requested path
      without sanitization (Path(filename).name or checking .
      is_relative_to(DOCUMENTS_DIR)).
  4. [M2] Weak Hardcoded JWT Secret Default
      • File: auth.py:24
      • Falls back to "scholarsmate-secret-auth-key-2026" if JWT_SECRET_KEY is
      omitted from .env.

  ──────
  ### 🟠 Performance & Logic Bugs

  5. [Quick Fix #10 / H1] O(N) Session Lookup Scan
      • File: main.py:548-549 and main.py:1064-1065
      • Fetches all sessions belonging to a user (crud.get_all_sessions(...)) and
      performs an in-memory python loop next(s for s in sessions if s.id ==
      session_id) instead of a direct WHERE id = :id AND user_id = :user_id query.
  6. [H2] Redundant PDF Reading on /api/workspace/{session_id}/papers
      • File: main.py:1072-1079
      • Re-opens every PDF from disk synchronously with PyMuPDF on every call to
      fetch workspace papers rather than reading existing metadata from ChromaDB
      chunks.
  7. [H3] Duplicated PDF Ingestion Code
      • File: Duplicated across /api/upload, /api/workspace/create, and
      /api/workspace/{session_id}/papers. Should be unified into a single helper
      _process_and_register_pdf().
  8. [H4] Workspace Duplicate Check Occurs AFTER ChromaDB Ingestion
      • File: main.py:866-923
      • PDF files are parsed, chunked, and written to ChromaDB before checking if
      the user already has 3 identical workspaces. If the check triggers 400,
      orphaned chunks remain in the vector index.
  9. [M4] Uncached 10,000-Record ChromaDB Scan Per Query Turn
      • File: vector_store.py:143
      • list_indexed_documents() and get_indexed_document_catalog() execute
      collection.get(include=["metadatas"], limit=10000) on every user query.
  10. [M6] Document Catalog Endpoint is Not User-Scoped
      • File: main.py:1144-1160
      • /api/documents exposes every indexed document across all users without
      isolation.

  ──────
  ### 🟡 Dead Code & Cleanliness

  11. [Quick Fix #8 / C2 & C3] Dead Ingestion Files Still Present
      • indexer.py (empty stub) and text_chunker.py (broken/superseded chunker)
      are still in the repository and not deleted.
      • construct_prompt() is still defined and imported in generator.py despite
      build_conversation_messages() being the active pipeline.
      • crud.get_or_create_google_user() is defined but never called (L2).
  12. [C5] Duplicate Imports & In-Loop Import in main.py
      • from sqlalchemy import select re-imported at main.py:418 and main.py:466.
      • import re inside a for loop at main.py:1085.
  13. [M9] Duplicate Schema Fields in QueryRequest
      • schemas.py:14-15 still defines both doc_names and selected_docs.
  14. [L3] Brain Memory Clear Deletes Row-by-Row in Python Loop
      • crud.py:527-528 runs await db.delete(m) sequentially inside a loop rather
      than an atomic SQL bulk delete().
  ──────
  ### 🟢 Token Management & Groq Free Tier Feasibility

  15. [Section 2 Item 4] Chunk Packing Budget Mismatch
      • MAX_CONTEXT_TOKENS in runtime.py:29 is 6,000 tokens, but
      build_context_block() truncates at 4,200 tokens. Packed chunks between 4,200
      and 6,000 tokens are discarded.
  16. [Section 2 Item 6] Inaccurate Token Telemetry
      • main.py:665-667 estimates prompt tokens using len(query.split()) +
      (len(target_documents or []) * 120), ignoring the actual retrieved chunks,
      system prompt, and brain context.
  17. [Quick Fix #7 / Section 4] Groq Adaptive Throughput Modes
      • No provider-adaptive token throttling exists yet: when Groq is used,
      queries still execute query expansion and default top_k=10, which risks
      exceeding Groq's 6,000 TPM limit.
  18. [Quick Fix #13] Integration Test Tags
      • Test files test_pipeline.py and test_extract_fyp.py still execute against
      live disk/API without @pytest.mark.integration decorators./
