# Feature: Multi-Stage Semantic Quality & Guardrail Subsystem (F-16)

## 1. Overview
* **Status:** Complete (Verified with 100% Test Coverage)
* **Priority:** High
* **Module:** Module 1 — Enterprise RAG & Defensive Security Engine

## 2. Purpose
Provides an industry-standard **3-Tier Guardrail Pipeline** (Input Rails, Retrieval Rails, and Output Rails) to protect ScholarsMate against adversarial prompt injections, jailbreaks, workspace data leakage, context token overflow, and citation hallucinations. Every guardrail runs deterministically and provides structured violation telemetry.

## 3. Requirements
* **FR-16.1 (Input Rails — Adversarial Defense):** The system shall intercept raw user queries before the RAG router or ChromaDB are invoked, detecting prompt injection patterns (`ignore previous instructions`, `DAN`, `jailbreak`, system prompt dumping) and returning a standard HTTP 400 rejection with zero LLM token consumption.
* **FR-16.2 (Input Rails — PII & Credential Redaction):** Queries containing exposed API keys (Google AI, Groq, OpenAI, Anthropic) shall be sanitized with redaction tokens (`[REDACTED_API_KEY]`) before reaching inference engines.
* **FR-16.3 (Retrieval Rails — Workspace Isolation):** Vector search results shall be filtered to ensure chunks strictly belong to documents within the active workspace.
* **FR-16.4 (Retrieval Rails — Gate 2 Distance & Token Budget):** Retrieved passages with cosine distance $> 0.75$ shall be dropped, and total prompt context shall be capped at 4,200 tokens to prevent provider rate limit errors (TPM).
* **FR-16.5 (Output Rails — Citation Provenance Verification):** The system shall cross-reference all extracted `[Doc, p.X]` citations against the ground-truth set of retrieved chunk pages. Any citation referencing unretrieved pages or unindexed documents shall be flagged as `[Unverified]` with a computed `grounding_ratio`.
* **FR-16.6 (Output Rails — Secret Leak Prevention):** LLM generated text shall be scrubbed to prevent accidental reflection of internal keys or sensitive environment variables.

## 4. Technical Implementation
* **Architecture:** Modular 3-Tier Pipeline in `backend/guardrails/`:
  - `schemas.py`: `GuardrailResult`, `RailAction` (`ALLOW`, `MODIFY`, `BLOCK`), and `Violation`.
  - `input_rails.py`: Regex and heuristic pattern matching for injection signatures and PII scrubbing.
  - `retrieval_rails.py`: Semantic distance thresholding, tenant isolation, and token budgeting.
  - `output_rails.py`: Ground-truth citation cross-referencing and leak scrubbing.
  - `pipeline.py`: Centralized `GuardrailPipeline` facade.
* **Integration Points:**
  - `backend/rag/generator.py`: Enforces Input Rails at entry, Retrieval Rails post-search, and Output Rails post-generation.
  - `backend/api/main.py`: Persists guardrail violation telemetry in session metadata.
* **Unit Tests:** `backend/tests/test_guardrails.py` (12 dedicated unit tests covering benign queries, injection attacks, credential redaction, distance filters, and hallucinated citations).

## 5. University Mapping
* **SRS Requirement:** FR-16 (Multi-Stage Semantic Quality & Academic Guardrails)
* **SDD Component:** Section 4.3 — RAG Defensive Security & Quality Assurance Subsystem
