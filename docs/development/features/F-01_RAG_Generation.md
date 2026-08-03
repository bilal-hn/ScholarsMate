# Feature: RAG Synthesis (F-01)

## 1. Overview
* **Status:** Complete (Refining)
* **Priority:** High
* **Module:** Module 1 — Enterprise Response Engine

## 2. Purpose
Provides accurate, source-grounded textual answers to academic queries using indexed document context. Extracted claims must be traceable back to specific pages to eliminate factual hallucinations.

## 3. Requirements
* **FR-01.1:** The system shall retrieve top-k vector chunks from ChromaDB based on semantic similarity.
* **FR-01.2:** The LLM prompt shall instruct `llama-3.3-70b-versatile` to synthesize answers strictly using the retrieved context block.
* **FR-01.3:** If context is insufficient, the system shall execute a strict fallback statement: *"I could not find sufficient information regarding this question in the provided document context."*
* **FR-01.4:** Standard answers must include inline page citations formatted as `[doc_name, p.X]`.

## 4. Technical Implementation
* **Backend:** `backend/rag/generator.py` and `backend/rag/prompt_templates.py`.
* **Inference Engine:** Groq Cloud API (`llama-3.3-70b-versatile`).

## 5. University Mapping
* **SRS Requirement:** FR-01 (Source-Locked Document Synthesis)
* **SDD Component:** RAG Generation Subsystem