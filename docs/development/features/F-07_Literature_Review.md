# Feature: Literature Review & Global Workspace Synthesis (F-07)

## 1. Overview
* **Status:** Complete (Refined)
* **Priority:** High
* **Module:** Module 4 — Scaling Literature Reviews

## 2. Purpose
Allows users to upload multiple research papers into a workspace and generate a publication-grade literature review without exceeding LLM rate limits (TPM) or vector chunk retrieval thresholds.

## 3. Requirements
* **FR-07.1:** Map Step: A structured technical extraction (methodology, datasets, strengths, limitations) shall be generated per paper using Gemini 1.5 Flash.
* **FR-07.2:** Reduce Step: A global synthesis pass shall aggregate paper extractions to build a cohesive literature review featuring an Abstract, Methodological Comparison Matrix (Markdown Table), and Critical Gaps analysis.
* **FR-07.3:** The synthesis pipeline shall include exponential backoff and multi-model failover (`gemini-flash-latest`, `gemini-2.5-flash`, `gemini-pro-latest`) to withstand upstream API capacity spikes (HTTP 503).

## 4. Technical Implementation
* **Backend:** Map-Reduce Literature Review pipeline in `backend/rag/literature_review.py` & `/api/workspace/literature-review` route in `backend/api/main.py`.

## 5. University Mapping
* **SRS Requirement:** FR-07 (Multi-Document Global Synthesis)
* **SDD Component:** Map-Reduce Literature Review Subsystem