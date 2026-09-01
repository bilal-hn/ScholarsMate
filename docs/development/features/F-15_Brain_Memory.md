# Feature: Persistent Autonomous Brain Memory (F-15)

## 1. Overview
* **Status:** Complete (Verified)
* **Priority:** High
* **Module:** Module 2 — Multi-Turn Working Memory & Long-Horizon Knowledge

## 2. Purpose
Provides a persistent, hierarchical two-tier memory system (**"Brain"**) that autonomously learns researcher preferences, thesis topics, writing styles, and project-specific milestones across conversations and models, while giving the user full visibility, editing control, and privacy toggles via the Brain Window UI.

## 3. Requirements
* **FR-15.1 (Multi-Tier Scoping):** The system shall categorize learned thoughts into `global` (shared across all chats and AI models) and `workspace` (isolated to a specific research workspace).
* **FR-15.2 (Categorized Thought Schema):** Memories shall be tagged with specific categories: `preference` (citation style, math formatting), `profile` (degree, thesis topic, field of study), `insight` (substantive conclusions reached), `milestone` (experimental findings), or `directive`.
* **FR-15.3 (Autonomous Background Extraction):** An asynchronous background worker shall analyze dialogue turns, extract durable facts, deduplicate against existing memories, and persist to the database without adding latency to chat responses.
* **FR-15.4 (Just-in-Time Prompt Injection):** Active memories shall be automatically assembled and injected into `<scholarsmate_brain>` XML context blocks across any chosen AI provider (Gemini, Claude, GPT-4o, Groq, Ollama).
* **FR-15.5 (User Transparency & Control):** The frontend shall provide a dedicated **Brain** window (`BrainModal.jsx`) allowing researchers to search, filter, inline-edit, toggle active state, manually teach, or delete thoughts.

## 4. Technical Implementation
* **Backend Database:** `BrainMemory` model in `backend/db/models.py` and async CRUD in `backend/db/crud.py`.
* **Extraction Engine:** `backend/rag/brain.py` (`extract_and_persist_memories_async` and `build_brain_context`).
* **REST API:** `/api/brain/memories` endpoints in `backend/api/main.py`.
* **Frontend UI:** `frontend/src/components/modals/BrainModal.jsx` and sidebar navigation item in `frontend/src/components/document/DocumentSidebar.jsx`.

## 5. University Mapping
* **SRS Requirement:** FR-15 (Persistent Hierarchical Research Memory)
* **SDD Component:** Brain Memory Subsystem
