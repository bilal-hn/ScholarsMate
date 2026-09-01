# ScholarsMate — Product & Feature Roadmap

This document outlines the phased development roadmap for ScholarsMate. Features are organized into sequential milestones to prevent feature creep and ensure a structured, testable engineering workflow.

---

## Milestone 1: Core Grounded RAG & UI Foundation (V1.0) — *Status: Complete / Production Ready*
**Objective:** Establish a RAG pipeline with high-precision vector search, citation tagging, and a modern dark mode interface.

### Delivered Capabilities:
- [x] **FastAPI & ChromaDB Integration:** PDF chunking, embedding generation, and vector index persistence.
- [x] **Universal BYOK Multi-Model Engine:** Support for Gemini, Claude, GPT, Groq, and Ollama.
- [x] **Map-Reduce Synthesis Engine:** Two-stage Map-Reduce pass for large-scale literature review synthesis.
- [x] **Academic UI & Themes:** Minimalist dark mode interface with theme switcher (Obsidian, Crimson, Blaze, Aurora, Emerald).
- [x] **Page-Level Inline Citations:** Traceable `[Doc_Name, p.X]` tags linked to split-screen PDF viewer.
- [x] **Relational SQLite / Postgres Database:** Complete persistence for users, chat sessions, messages, and document summary caches.
- [x] **Persistent Autonomous Brain Memory (F-15):** Two-tier memory studio for learned research profiles, citation rules, and workspace milestones.

---

## Milestone 2: 3-Gate Semantic Quality & Intent Routing (V1.5) — *In Progress*
**Objective:** Eliminate irrelevant chunk pollution, recognize conversational thinking/pauses, and provide general knowledge fallbacks.

### Target Capabilities:
- [x] **2.1 Extended Intent Routing (F-02):** Distinguish conversational pauses, acknowledgments, and general knowledge from active research inquiries.
- [ ] **2.2 Vector Similarity Distance Thresholding (F-01 Gate 2):** Drop statistically irrelevant vector chunks ($< 0.40$) before prompt injection.
- [ ] **2.3 Adaptive Synthesis Fallback (F-01 Gate 3):** Answer naturally from general knowledge when workspace documents lack relevant evidence.

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


