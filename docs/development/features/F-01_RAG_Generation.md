# Feature: RAG Synthesis (F-01)

## 1. Overview
* **Status:** In Progress (Refining)
* **Priority:** High
* **Module:** Module 1 — Enterprise Response Engine

## 2. Purpose
Provides accurate, source-grounded textual answers to academic queries using indexed document context. Extracted claims must be traceable back to specific pages to eliminate factual hallucinations, while incorporating semantic quality gates to prevent irrelevant context injection when queries are unrelated to workspace documents.

## 3. Requirements
* **FR-01.1:** The system shall retrieve candidate vector chunks from ChromaDB based on cosine similarity embeddings.
* **FR-01.2 (Vector Similarity Quality Gate):** Retrieved chunks with cosine similarity below a quality cutoff threshold (e.g. cosine distance $> 0.60$ / similarity $< 0.40$) shall be filtered out to prevent irrelevant document chunks from polluting the prompt.
* **FR-01.3 (Adaptive Grounded Synthesis):** If valid relevant chunks exist, the model shall synthesize answers strictly citing retrieved passages using `[doc_name, p.X]` format.
* **FR-01.4 (Irrelevant Context Fallback):** If no retrieved chunks meet the similarity threshold or context is insufficient, the system shall not force an artificial academic literature review; it shall answer from general knowledge and clearly state that the active workspace papers do not contain evidence on this topic.
* **FR-01.5:** Standard grounded answers must include inline page citations traceable in the split-screen PDF reader.

## 4. Technical Implementation
* **Backend:** `backend/rag/generator.py`, `backend/embeddings/vector_store.py`, and `backend/rag/prompt_templates.py`.
* **Inference Engine:** Universal BYOK Provider Architecture (Gemini, Claude, GPT, Groq, Ollama).

## 5. University Mapping
* **SRS Requirement:** FR-01 (Source-Locked Document Synthesis)
* **SDD Component:** RAG Generation Subsystem