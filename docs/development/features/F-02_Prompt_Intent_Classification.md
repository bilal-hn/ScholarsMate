# Feature: Intent Classification & Routing (F-02)

## 1. Overview
* **Status:** Complete (Refined)
* **Priority:** High
* **Module:** Module 1 — Enterprise Response Engine

## 2. Purpose
Intercepts non-academic user messages (greetings, pleasantries, system meta-queries) and dynamically routes user queries into the appropriate processing pipeline (`CONVERSATIONAL`, `FOLLOW_UP`, or `NEW_QUERY`). This optimizes vector context retrieval, preserves Groq TPM rate limits, prevents hallucinated inline citations, and avoids fragile regex pattern matching.

## 3. Requirements
* **FR-02.1:** A single-pass LLM intent classification step (`llama-3.1-8b-instant`) shall evaluate incoming user queries alongside available workspace documents and sliding conversation history.
* **FR-02.2:** Queries classified as `CONVERSATIONAL` shall trigger a zero-retrieval response path, returning `sources_used = []` without querying ChromaDB.
* **FR-02.3:** Queries classified as `FOLLOW_UP` shall be routed through the Context Query Rewriter before executing vector search to resolve ambiguous pronouns or references.
* **FR-02.4:** Queries classified as `NEW_QUERY` shall bypass context rewriting and proceed directly to the designated vector retrieval strategy (`vector_search`, `full_text`, or `per_document_search`).

## 4. Technical Implementation
* **System Component:** `backend/rag/router.py` (`classify_query_intent`) & `backend/rag/generator.py`.
* **Execution Flow:**
  1. Frontend submits user query and sliding message history payload to `/api/query`.
  2. `classify_query_intent()` issues a single JSON-mode completion call to `llama-3.1-8b-instant`.
  3. Based on the returned JSON schema (`intent`, `retrieval_mode`, `target_docs`), the generator branches to either conversational completion or vector context retrieval.

## 5. University Mapping
* **SRS Requirement:** FR-02 (Conversational & Intent-Aware Routing)
* **SDD Component:** Intent Router Subsystem