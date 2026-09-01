# Feature: Intent Classification & Routing (F-02)

## 1. Overview
* **Status:** In Progress (Refining)
* **Priority:** High
* **Module:** Module 1 — Enterprise Response Engine

## 2. Purpose
Dynamically routes user messages into the appropriate processing pipeline (`CONVERSATIONAL`, `GENERAL_KNOWLEDGE`, `FOLLOW_UP`, or `NEW_QUERY`). This prevents unnecessary vector database retrieval for conversational banter or non-document questions, eliminates forced/awkward paper syntheses on conversational remarks, preserves LLM token limits, and avoids fragile hardcoded pattern matching.

## 3. Requirements
* **FR-02.1:** A single-pass semantic intent classification step shall evaluate incoming user queries alongside available workspace documents and sliding conversation history.
* **FR-02.2 (Conversational & Acknowledgments):** Messages classified as `CONVERSATIONAL` (greetings, banter, acknowledgments like *"okay got it"*, *"makes sense"*, and thinking pauses like *"let me think"*, *"give me a moment"*) shall trigger a zero-retrieval conversational path, returning `sources_used = []` without searching ChromaDB or generating paper literature reviews.
* **FR-02.3 (General Knowledge):** Messages classified as `GENERAL_KNOWLEDGE` (broad programming questions, common math facts, general reasoning unrelated to uploaded papers) shall be answered directly by the LLM without forcing document vector retrieval.
* **FR-02.4 (Follow-up Inquiries):** Messages classified as `FOLLOW_UP` (active follow-up questions or clarification requests on previous points such as *"why is that?"*, *"can you explain that simpler?"*, *"give an example of that method"*) shall be routed through the Context Query Rewriter prior to executing vector retrieval.
* **FR-02.5 (New Research Queries):** Self-contained research inquiries about workspace papers shall proceed directly to designated vector retrieval strategies (`vector_search`, `full_text`, or `per_document_search`).
* **FR-02.6 (Non-Brittle Fallback):** The intent fallback subsystem shall evaluate communicative information need (interrogatives, request verbs) rather than relying on arbitrary word-count thresholds.

## 4. Technical Implementation
* **System Component:** `backend/rag/router.py` (`classify_query_intent`) & `backend/rag/runtime.py` (`heuristic_intent`).
* **Execution Flow:**
  1. Frontend submits user query and sliding message history payload to `/api/query`.
  2. `classify_query_intent()` performs semantic classification with clear definitions of information-seeking vs. non-information-seeking utterances.
  3. Based on the returned JSON schema (`intent`, `retrieval_mode`, `generation_mode`, `target_docs`, `recommended_top_k`), the generator branches to conversational completion, direct general knowledge generation, vector context retrieval, or Map-Reduce synthesis.

## 5. University Mapping
* **SRS Requirement:** FR-02 (Conversational & Intent-Aware Routing)
* **SDD Component:** Intent Router Subsystem