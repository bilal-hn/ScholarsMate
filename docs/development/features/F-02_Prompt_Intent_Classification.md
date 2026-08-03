# Feature: Intent CLassification (F-02)

## 1. Overview
* **Status:** Complete (Refinable)
* **Priority:** High
* **Module:** Module 1 — Enterprise Response Engine

## 2. Purpose
Intercepts non-academic user messages (greetings, pleasantries, generic workspace questions) before hitting ChromaDB or Groq, saving API rate limits (TPM) and preventing empty citation badges.

## 3. Requirements
* **FR-02.1:** User prompts shall be evaluated against regex patterns (`GREETING_REGEX`) at the entry point of `generate_answer()`.
* **FR-02.2:** Pleasantries (*"hi"*, *"hello"*, *"thanks"*) shall receive an immediate conversational response with `sources_used = []`.
* **FR-02.3:** Bypasses vector database retrieval to achieve zero-latency responses for non-research prompts.

## 4. Technical Implementation
* **Backend:** `backend/rag/generator.py` (Fast-Path Router block).

## 5. University Mapping
* **SRS Requirement:** FR-02 (Conversational & Greeting Routing)
* **SDD Component:** Intent Router Subsystem