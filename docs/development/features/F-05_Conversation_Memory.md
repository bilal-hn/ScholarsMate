# Feature: Conversation Memory (F-05)

## 1. Overview
* **Status:** Backlog
* **Priority:** Medium
* **Module:** Module 2 — Chat History & Multi-Turn Context Memory

## 2. Purpose
Maintains conversational context across continuous follow-up questions, allowing users to ask queries like *"Summarize its methodology based on that"* without repeating paper names.

## 3. Requirements
* **FR-05.1:** A sliding window of the last 4–6 chat messages shall be included in the API payload.
* **FR-05.2:** A lightweight pass (`llama-3.1-8b-instant`) shall rewrite follow-up questions into standalone search queries before querying ChromaDB.

## 4. Technical Implementation
* **Backend:** Standalone query rewriter module in `backend/rag/retriever.py`.

## 5. University Mapping
* **SRS Requirement:** FR-05 (Contextual Conversation History)
* **SDD Component:** Context Manager Subsystem