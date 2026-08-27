# FR-13: Assisted Academic Document Writer & Citation Engine

## 1. Feature Purpose

Researchers frequently context-switch between external reading tools, analytical chat interfaces, and draft editors when writing academic literature reviews or papers. This fragmented workflow creates manual citation overhead, context loss, and an increased risk of unsupported claims in drafted manuscripts.

This feature implements an **Assisted Academic Document Writer & Citation Engine** embedded directly within workspace sessions. It pairs a distraction-free rich-text authoring canvas with inline, vector-backed contextual intelligence: enabling researchers to interrogate highlighted claims via **Ask AI** and instantly ground statements with verified source passages via **Semantic Cite**.

---

## 2. Key Objectives

* **Frictionless In-Editor Synthesis:** Eliminate context switching by co-locating rich text document authoring directly alongside indexed workspace papers.
* **Instant Inline Verification:** Enable one-click semantic search against workspace vector embeddings to validate specific written claims.
* **Automated Bibliography Generation:** Automatically map verified inline citation markers (`[1]`, `[2]`) to a dynamic reference list at the bottom of the document.
* **Context-Anchored In-Line Assistance:** Allow users to query, critique, or expand specific highlighted passages without losing their place in the draft.

---

## 3. Architecture & System Modules

### 3.1 Core Subsystems

* **Rich Text Authoring Canvas (Headless Tiptap / ProseMirror):**
  * Provides distraction-free markdown and rich-text editing (H1–H3, bold, italic, lists, KaTeX math blocks).
  * Implements floating selection bubble menus and custom citation footnote nodes.
  * Persists serialized document state and generated markdown to relational storage.

* **Semantic Citation Engine (`/api/editor/find-citations`):**
  * Takes highlighted text selections and generates query embeddings in real time.
  * Executes cosine similarity search over ChromaDB chunks restricted to active workspace documents.
  * Returns ranked evidence passages with document names, page numbers, and similarity scores.

* **Inline Context Chat Drawer (`/api/query` - Selection Anchor):**
  * Launches an inline slide-over when a user highlights text and selects "Ask AI".
  * Bounds LLM generation strictly to the highlighted excerpt and active workspace context.

---

## 4. User Interaction & Query Execution Matrix

| Action Trigger | Input Context | Backend Mechanism | Output Behavior | Target Latency |
| --- | --- | --- | --- | --- |
| **Highlight Text → "Cite"** | Highlighted sentence / claim | Vector similarity search on workspace chunk embeddings | Ranked drawer of candidate passages with similarity scores | < 400 ms |
| **Insert Citation Click** | Selected passage match | ProseMirror transaction & bibliography sync | Inserts inline `[N]` marker and appends citation to document footer | Instant (Client) |
| **Highlight Text → "Ask AI"** | Highlighted selection + prompt | Context-anchored LLM completion via workspace RAG | Streaming side-drawer response explaining or expanding text | Stream start < 1s |
| **Auto-Save / Workspace Sync** | Active document state | Relational persistence (`workspace_drafts` table) | Saves draft JSON and clean Markdown payload asynchronously | Background |

---

## 5. Automated System Workflows

### 5.1 Semantic Citation & Bibliography Sync Flow

1. **Highlight & Trigger:** The user highlights a draft claim (e.g., *"Dual-encoder retrieval reduces query latency by 32% under multi-hop setups."*) and clicks **Cite** on the bubble menu.
2. **Vector Candidate Retrieval:** The client sends the highlighted sentence to `POST /api/editor/find-citations`. The backend queries ChromaDB for the top-$k$ nearest chunks across active workspace documents.
3. **Candidate Inspection:** The UI displays a ranked list of matched excerpts showing the source paper, page number, and similarity confidence score.
4. **Footnote & Reference Insertion:** When the user clicks **Insert Citation**:
   * An inline citation node (e.g., `[1]`) is inserted adjacent to the highlighted sentence.
   * The document's trailing **References** section automatically updates with the complete citation entry (e.g., `[1] Arslan et al., 2024, p. 12`).

### 5.2 Inline "Ask AI" Workflow

1. **Context Selection:** The user highlights a paragraph or sentence and clicks **Ask AI**.
2. **Context Binding:** A mini slide-over opens with the highlighted text pinned as focal context.
3. **Targeted Prompting:** The user submits an instruction (e.g., *"Critique the methodology described here"* or *"Elaborate into two formal academic paragraphs"*).
4. **Grounded Generation:** The LLM streams a response constrained strictly to the active workspace papers.

---

## 6. Acceptance & Validation Checklist

* [ ] Highlighting text in the editor opens the floating bubble menu with **Ask AI** and **Cite** actions.
* [ ] Clicking **Cite** returns ranked evidence chunks from active workspace documents in under 500 milliseconds.
* [ ] Selecting an evidence match inserts an inline citation anchor (`[1]`) and appends the source reference to the document footer.
* [ ] Highlighted **Ask AI** queries correctly inject selected text as focal context without hallucinating outside workspace papers.
* [ ] Document content and citation state persist automatically across workspace reloads.
* [ ] Drafts can be exported cleanly to standard Markdown (`.md`) preserving all citation anchors and bibliography lists.