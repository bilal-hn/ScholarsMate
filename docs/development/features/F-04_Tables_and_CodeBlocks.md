# Feature:Table Engine & Code Extraction (F-04)

## 1. Overview
* **Status:** In Progress
* **Priority:** High
* **Module:** Module 1 — Enterprise Response Engine

## 2. Purpose
Enforces explicit Markdown tables when comparing papers, metrics, or datasets, and extracts paper code/formulas into syntax-highlighted code blocks.

## 3. Requirements
* **FR-04.1:** Multi-paper comparisons or quantitative benchmarks shall automatically render in Markdown table syntax (`| Paper | Method | Results |`).
* **FR-04.2:** Algorithms, pseudocode, and mathematical logic from context shall be rendered inside syntax-highlighted code blocks (` ```python `).
* **FR-04.3:** The LLM shall not generate fabricated code that does not exist in the retrieved context.

## 4. Technical Implementation
* **Backend:** System prompt instructions in `backend/rag/prompt_templates.py`.
* **Frontend:** `ChatMessage.jsx` `ReactMarkdown` table & code components.

## 5. University Mapping
* **SRS Requirement:** FR-04 (Structured Data & Code Rendering)
* **SDD Component:** Output Synthesizer