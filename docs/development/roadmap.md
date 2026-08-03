# ScholarsMate — Product & Feature Roadmap

This document outlines the phased development roadmap for ScholarsMate. Features are organized into sequential milestones to prevent feature creep and ensure a structured, testable engineering workflow.

---

## Milestone 1: Core Grounded RAG & UI Foundation (V1.0) — *Current Status: Complete / Refining*
**Objective:** Establish a RAG pipeline with high-precision vector search, citation tagging, and a modern Gemini-style dark mode interface.

### Delivered Capabilities:
- [x] **FastAPI & ChromaDB Integration:** PDF chunking, embedding generation, and vector index persistence.
- [x] **Groq LLM Pipeline:** Integration with `llama-3.3-70b-versatile` for single-pass RAG synthesis.
- [x] **Map-Reduce Synthesis Engine:** Two-stage Map-Reduce pass using `llama-3.1-8b-instant` and `llama-3.3-70b` for literature reviews over large context.
- [x] **Gemini-Style UI:** Responsive React interface with borderless chat bubbles, custom gold typography, and scannable visual layout.
- [x] **Page-Level Citations:** Extraction and rendering of `[Doc_Name, p.X]` inline tags and deduplicated context source badges.
- [x] **Intent Guardrails:** Fast-path regex routing for greetings and meta-queries without triggering vector search or empty citation tags.

---

## Milestone 2: Enterprise Response Engine & Multi-Turn Memory (V1.5) — *Next Up*
**Objective:** Enhance synthesis formatting depth (tables, code blocks) and introduce conversational memory for continuous research discussions.

### Target Features:
- [ ] **2.1 Markdown Table Engine:** Enforce automatic Markdown table generation (`| Paper | Method | Results |`) for multi-paper comparisons, metrics, and benchmarks.
- [ ] **2.2 Code & Formula Extraction:** Format algorithm listings, pseudocode, and mathematical equations directly into syntax-highlighted code blocks (` ```python `).
- [ ] **2.3 Stand-Alone Query Rewriting:** Implement a lightweight query contextualization pass using `llama-3.1-8b-instant` to convert follow-up prompts (e.g., *"Summarize its methodology"*) into standalone search queries.
- [ ] **2.4 Conversation Memory Buffer:** Pass a sliding window buffer of recent chat turns (last 4–6 messages) to maintain context across continuous follow-up questions.

---

## Milestone 3: Persistence Layer & Workspace Management (V2.0)
**Objective:** Transition application state from local memory/localStorage to a robust relational database.

### Target Features:
- [ ] **3.1 Relational Database Setup (SQLite / PostgreSQL):**
  - Implement SQLAlchemy ORM models for `Workspaces`, `Documents`, and `ChatThreads`.
- [ ] **3.2 Persistent Chat Threads:** Save, retrieve, and switch between recent chat sessions within the sidebar.
- [ ] **3.3 Workspace Synchronization:** Sync ChromaDB vector collections directly with database workspace instances for clean creation and deletion.

---

## Milestone 4: Scaling Literature Reviews (30+ Papers) (V2.5)
**Objective:** Support global workspace literature reviews over large document collections without hitting token limits.

### Target Features:
- [ ] **4.1 Workspace-Level Summary Index (Tier 1 RAG):** Automatically generate and cache a 150-word paper abstract during PDF ingestion.
- [ ] **4.2 Global Review Pass:** Execute full 30+ paper literature reviews by passing all Tier-1 summaries directly into `llama-3.3-70b` in a single context window.
- [ ] **4.3 Automated Theme Clustering:** Group literature review summaries by research theme, methodology type, and dataset used.

---

## Milestone 5: Polishing, Evaluation & FYP Deliverables (V3.0)
**Objective:** System evaluation, performance optimization, and completion of university documentation.

### Target Features:
- [ ] **5.1 Retrieval Evaluation:** Benchmark retrieval precision, recall, and end-to-end response latency across standard academic datasets.
- [ ] **5.2 University Documentation Finalization:** Compile live dev docs (`docs/development/`) into formal university deliverables (`SRS`, `SDD`, `Test Plan`, and `Final FYP Report`).
- [ ] **5.3 User Manual & Deployment Package:** Create local setup scripts and a comprehensive user guide with interface walkthrough screenshots.

---

## Roadmap Decision & Change Log

| Date | Milestone Affected | Change / Addition | Rationale |
| :--- | :--- | :--- | :--- |
| 2026-08-03 | Milestone 1 | Added Fast-Path Greeting Router | Bypasses ChromaDB for non-academic queries to reduce latency and token usage. |
| 2026-08-03 | Milestone 2 | Prioritized Table & Code Generation | Enhances response readability and scannability for technical readers. |


