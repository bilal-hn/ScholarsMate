# FR-14: Multi-Lens Academic Reasoning Modes & Personas

## 1. Feature Purpose

Researchers, students, and educators interact with academic literature with varying objectives at different stages of their workflow. A researcher drafting a paper requires rigorous methodology comparison and formal citations, while a student learning a complex subfield requires intuitive analogies and step-by-step mathematical derivations. A peer reviewer needs critical analysis to identify methodological gaps, while a busy reader needs high-density executive summaries.

Treating every query with a single generic academic prompt forces users into repetitive prompt engineering (e.g., *"Explain this like I'm a student"*, *"Critique the limitations of this paper"*). 

This feature implements **Multi-Lens Academic Reasoning Modes**, providing 1-click cognitive lenses that dynamically configure prompt directives, reasoning depth, retrieval parameters, and output formatting while maintaining 100% source-locked fidelity to uploaded workspace documents.

---

## 2. Key Objectives

* **Dynamic Cognitive Lenses:** Provide 5 distinct, high-value academic reasoning modes (Research Synthesizer, Socratic Tutor, Peer Reviewer, Executive Brief, Literature Survey).
* **Per-Session State & Instant Toggling:** Maintain mode selection independently for each chat session while allowing instantaneous switching via header controls or slash commands.
* **Source-Locked Grounding:** Ensure all modes strictly respect retrieved workspace context, suppressing hallucinations while altering pedagogical and critical framing.
* **Parameter-Tuned Retrieval:** Adapt LLM temperature, top-$k$ retrieval counts, and structural formatting rules to match the objective of the active lens.

---

## 3. The 5 Core Academic Lenses

| Mode ID | Academic Lens | Target User / Goal | Tone & Output Behavior | System Parameters |
| :--- | :--- | :--- | :--- | :--- |
| `research` | **Research Synthesizer** *(Default)* | Graduate students, researchers drafting papers | Rigorous, source-locked, citation-dense (`[Doc, p.X]`), comparative markdown benchmark tables, quantitative trade-offs. | `temp: 0.0`, `top_k: 8` |
| `socratic` | **Socratic Tutor** *(Educational)* | Students & engineers learning new subfields | Feynman technique: breaks down dense math/jargon with intuitive analogies, step-by-step derivations, and ends with 1 conceptual check. | `temp: 0.2`, `top_k: 6` |
| `reviewer` | **🧐 Peer Reviewer** *(Critique / Red Team)* | Researchers testing claims or prepping paper defense | Actively audits methodology, sample size limitations, unverified assumptions, baseline omissions, and dataset biases in the text. | `temp: 0.1`, `top_k: 10` |
| `executive` | **Executive Brief** *(Rapid Triage)* | Busy researchers scanning many papers | High-density TL;DR: Problem Statement, Core Innovation, Key Results & Metrics, and 3 Practical Takeaways. | `temp: 0.0`, `top_k: 5` |
| `survey` | **Literature Survey** *(Cross-Paper)* | Writing related work / background sections | Compares and contrasts all selected workspace papers, groups approaches by school of thought, and constructs conceptual timelines. | `temp: 0.0`, `top_k: 12` |

---

## 4. Architecture & System Modules

### 4.1 Backend Architecture

* **Mode Registry (`backend/rag/modes.py`):**
  * Defines mode metadata, system prompt directives, temperature, and top-$k$ presets.
* **Dynamic Prompt Builder (`backend/rag/prompt_templates.py`):**
  * Injects active mode instructions into the source-locked prompt envelope alongside retrieved context blocks.
* **Session Persistence (`backend/db/models.py`):**
  * Persists `active_mode` in `chat_sessions` and `chat_messages` tables for historical fidelity.

### 4.2 Frontend Architecture

* **Header Mode Picker (`ChatHeader.jsx`):**
  * A polished pill dropdown with mode icons and descriptions directly adjacent to the model selector.
* **Slash Command Parser (`ChatArea.jsx`):**
  * Recognizes inline shortcuts (`/socratic`, `/critique`, `/brief`, `/survey`, `/research`) in the chat input.
* **Message Lens Indicator (`ChatMessage.jsx`):**
  * Renders a subtle badge indicating the lens applied to each bot response.

---

## 5. User Interaction & Query Execution Matrix

| Action Trigger | Input Context | Backend Mechanism | Output Behavior |
| :--- | :--- | :--- | :--- |
| **Switch Mode (Header Pill)** | User selects mode from dropdown | Session state updated (`PATCH /api/sessions/{id}`) | Next query automatically uses the selected lens |
| **Slash Command (`/critique ...`)** | User types command in chat input | Client auto-selects mode and sends query | Immediate execution with target mode prompt |
| **Query in Socratic Mode** | Technical question on paper algorithm | Step-by-step analogy prompt + vector context | Concept intuition, formula breakdown, and 1 check question |
| **Query in Peer Reviewer Mode** | Inquiry on paper claims/findings | Critical audit prompt + broad context ($k=10$) | Methodological breakdown with highlighted limitations |
| **Query in Executive Mode** | Summary request on document(s) | Structured TL;DR prompt + tight context ($k=5$) | Compact executive brief with key metrics table |

---

## 6. Data Model & Persistence

### 6.1 Database Schema Additions (`chat_sessions` & `chat_messages`)

```sql
ALTER TABLE chat_sessions ADD COLUMN active_mode VARCHAR(50) DEFAULT 'research';
ALTER TABLE chat_messages ADD COLUMN mode_applied VARCHAR(50) DEFAULT 'research';
```

---

## 7. Quality & Verification Standards

1. **Source-Lock Invariance:** Changing modes must never cause the model to introduce unverified external knowledge; all modes remain strictly bounded by retrieved paper passages.
2. **Session Isolation:** Switching modes in Session A must not alter active modes in Session B.
3. **Response Traceability:** Each message retains record of which mode generated it so switching modes mid-conversation maintains clear conversational context.