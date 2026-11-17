# Intelligent Query Router & Dynamic Execution Planner

## Why a Router is Essential in Enterprise RAG
Treating all user inputs as raw vector search queries is fundamentally flawed:
- Asking *"Hi, how are you?"* shouldn't retrieve 6 vector chunks and burn 2,000 tokens.
- Asking *"How many papers are in this workspace?"* cannot be answered by vector similarity; it requires catalog introspection.
- Asking *"Compare the methodology of paper A and paper B"* requires two-document balanced retrieval, not a single nearest-neighbor search.

ScholarsMate features a multi-tiered **Intelligent Query Router** (`backend/rag/router.py`).

![[assets/Query_Classification.png]]

---

## The Query Classification Taxonomy

The router classifies every prompt into one of four core intents:

| Intent | Definition | Action Taken | LLM Call Needed? |
|---|---|---|---|
| `CONVERSATIONAL` | Small talk, greetings, thank yous | Direct friendly reply; zero vector search | ❌ Fast-path (0 tokens) |
| `GENERAL_KNOWLEDGE` | General CS concepts (e.g. "What is backprop?") | Direct answer with disclaimer that it's outside corpus | ⚠️ Lightweight completion |
| `FOLLOW_UP` | Follow-up referencing prior chat context | Rewrites query incorporating chat history; retrieves targeted chunks | ✅ Targeted RAG |
| `NEW_QUERY` | Direct research questions about papers | Resolves target documents; executes vector or per-doc retrieval | ✅ Full RAG pipeline |

---

## Entity & Document Resolution Engine (`resolve_target_documents`)
Users rarely type exact file names. The router supports 3 resolution layers:

1. **Explicit `@mentions`:** E.g., `@attention.pdf` or `@transformer` matches `Attention_Is_All_You_Need.pdf`.
2. **Word Boundary Matches:** Exact regex boundaries prevent substring collisions (e.g. `sample` won't mistakenly trigger `sample2.pdf`).
3. **Fuzzy Levenshtein Matching (`difflib`):** Allows minor typos (e.g. `vaswani2017` or `transfomer`).

```python
# Word boundary matching prevents substring collisions
doc_pattern = r"\b" + re.escape(doc_lower) + r"\b"
base_pattern = r"\b" + re.escape(doc_base) + r"\b"
if re.search(doc_pattern, clean_query) or re.search(base_pattern, clean_query):
    matched.add(doc)
```

---

## Linked Notes
- [[21_Fast_Path_Heuristics_vs_LLM]] — Heuristic shortcuts vs structured JSON planner
- [[23_Retrieval_Strategies_and_Token_Budget]] — How retrieval modes execute
- [[13_Ingestion_Time_Document_Cache]] — Summary cache interceptor
