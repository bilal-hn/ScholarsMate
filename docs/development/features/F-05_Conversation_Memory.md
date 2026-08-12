# Feature: Conversation Memory (F-05)

## 1. Overview
* **Status:** Complete
* **Priority:** Medium
* **Module:** Module 2 — Chat History & Multi-Turn Context Memory

## 2. Purpose
Maintains conversational context across continuous follow-up questions, allowing users to ask ambiguous queries like *"Summarize its methodology"* without manually repeating document names or concepts.

## 3. Requirements
* **FR-05.1:** A sliding window payload containing up to 6 recent messages (`sender`, `text`) shall be attached to outgoing `/api/query` requests by the frontend (`src/services/api.js`).
* **FR-05.2:** A low-latency pass (`llama-3.1-8b-instant`) in `rewrite_query_with_history()` shall resolve ambiguous pronouns and reformulate follow-up questions into standalone search queries prior to ChromaDB retrieval.

## 4. Technical Implementation
* **Backend Component:** `backend/rag/retriever.py` (`rewrite_query_with_history`), `backend/api/schemas.py` (`MessageItem`), & `backend/api/main.py`.

## 5. University Mapping
* **SRS Requirement:** FR-05 (Contextual Conversation History)
* **SDD Component:** Context Manager Subsystem