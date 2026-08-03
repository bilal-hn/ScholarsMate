# Feature: Literature Review (F-07)

## 1. Overview
* **Status:** Backlog
* **Priority:** High
* **Module:** Module 4 — Scaling Literature Reviews

## 2. Purpose
Allows users to upload 30+ papers into a single workspace and generate a comprehensive literature review without exceeding LLM context windows or vector search chunk limits.

## 3. Requirements
* **FR-07.1:** During PDF upload, an automated 150-word paper summary shall be generated and stored in a Tier-1 Index.
* **FR-07.2:** Global literature review requests shall pull all Tier-1 paper summaries and synthesize them in a single `llama-3.3-70b-versatile` context pass.
* **FR-07.3:** Outputs shall cluster research papers by theme, methodology, and empirical findings.

## 4. Technical Implementation
* **Backend:** Tier-1 Summary Ingestion Pipeline & Global Synthesis Router in `backend/rag/generator.py`.

## 5. University Mapping
* **SRS Requirement:** FR-07 (Multi-Document Global Synthesis)
* **SDD Component:** Hierarchical Summary Index Subsystem