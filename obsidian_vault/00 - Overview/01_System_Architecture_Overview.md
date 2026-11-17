# System Architecture Overview

## Architectural Topology

ScholarsMate follows a decoupled **Client-Server Microservice Architecture** with local-first vector persistence and transactional relational storage:

![[assets/act_rag.png]]

### 1. Ingestion Subsystem (`backend/ingestion/`)
- Handles PDF uploads, layout extraction, bibliographic metadata resolution, and vector embedding.
- Uses **PyMuPDF (`fitz`)** for high-fidelity bounding box extraction, font hierarchy analysis, and vector page coordinate mapping.
- Automatically queries external scholarly APIs (**CrossRef REST** and **arXiv Atom**) when DOIs or arXiv identifiers are detected.

### 2. Retrieval & Embedding Subsystem (`backend/embeddings/`, `backend/rag/retriever.py`)
- Employs **ChromaDB** as an embedded persistent vector database.
- Implements dynamic multi-query expansion and per-document scoped retrieval to prevent broad synthesis queries from starving smaller papers.
- Applies a hard cosine distance threshold ($< 0.75$) to strip irrelevant noise before context packing.

### 3. Routing & Intent Classification (`backend/rag/router.py`)
- Hybrid two-phase routing architecture:
  - **Phase 1 (Microsecond Heuristics):** Matches regex patterns for greetings, metadata questions, and cached summaries.
  - **Phase 2 (LLM Classifier):** Synthesizes structured JSON plans specifying `intent`, `target_docs`, `retrieval_mode`, and `recommended_top_k`.

### 4. 3-Tier Defensive Guardrail Subsystem (`backend/guardrails/`)
- Industry-standard defensive perimeter wrapping the RAG pipeline:
  - **Tier 1 (Input Rails):** Adversarial injection filtering, prompt dump prevention, API key / PII redaction.
  - **Tier 2 (Retrieval Rails):** Workspace isolation enforcement, distance cutoff, context token cap (4,200 tokens).
  - **Tier 3 (Output Rails):** Citation provenance verification against retrieved ground-truth chunks and model leak redaction.

### 5. Academic Reference Manager (`backend/ingestion/`, `frontend/src/components/library/`)
- Central document ledger managing papers across workspaces.
- Duplicate detection engine with normalized title indexing and **Union-Find clustering**.
- Multi-format citation engine generating APA 7th, IEEE, Harvard, MLA 9th, and BibTeX `.bib` files.

---

## Detailed Data Model (ERD)
The relational database tracks users, workspaces, documents, chat sessions, messages, drafts, and brain memories:

![[assets/erd_diagram.png]]

---

## Sequence Flows

### Ingestion Sequence:
![[assets/seq_ingestion.png]]

### RAG Streaming Sequence:
![[assets/seq_rag_streaming.png]]

---

## Linked Notes
- [[10_Layout_Aware_PDF_Parsing]] — Deep dive into PyMuPDF
- [[20_Intelligent_Query_Router]] — Heuristics vs LLM routing
- [[31_Multi_Tier_Defensive_Guardrails]] — Complete guardrails implementation
- [[40_Academic_Reference_Manager_Overview]] — Library & Reference management
