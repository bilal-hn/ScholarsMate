# FR-14: Human-Centered Reasoning Modes (Paper Assistant, Deep Research, Masterclass Teacher)

## 1. Feature Purpose

ScholarsMate is an academic AI research workspace that operates on users' uploaded papers and textbooks as the primary source of truth. Users engage with their documents for different purposes:
* **Everyday Inquiries (Default):** Students and readers who want clear, fast, and reliable answers directly from their documents without needing heavy academic prose or thesis framing.
* **Deep Academic Analysis:** Researchers requiring exhaustive, publication-grade technical breakdowns, mathematical precision, quantitative benchmark tables, and formal citations (`[Doc, p.X]`).
* **Active Conceptual Mastery:** Learners who want to deeply understand difficult algorithms or concepts through first-principles discovery and Socratic checks.

---

## 2. The 3 Core Cognitive Modes

| Mode ID | Mode Name | Icon | Status | Description & Output Behavior | Parameters |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `assistant` | **Paper Assistant** | 📄 | **Default** | Direct, clear, and easy-to-read answers grounded in your uploaded documents. Natural tone, approachable explanations, and precise citations without unnecessary academic stiffness. | `temp: 0.1`, `top_k: 6` |
| `research` | **Deep Research** | 🔬 | Advanced | Exhaustive, publication-grade analysis. Provides comprehensive technical breakdowns, quantitative benchmark tables, mathematical rigor, and exact page citations `[Doc, p.X]` for any query. | `temp: 0.0`, `top_k: 8` |
| `teacher` | **Masterclass Teacher** | 🎓 | Interactive | Modeled after `amosblomqvist/learn` & 3Blue1Brown. 3-Stage Active Learning Loop: Diagnostic Probe $\rightarrow$ First-Principles Motivated Discovery $\rightarrow$ Verification Quiz (💡). | `temp: 0.2`, `top_k: 8` |

---

## 3. Mode Descriptions & Grounding Rules

### 3.1 Paper Assistant (Default)
* **Goal:** Everyday document interaction.
* **Tone:** Friendly, articulate, and focused.
* **Grounding:** Quotes and references document pages when answering questions about uploaded papers; answers general knowledge clearly when asked questions outside the documents.

### 3.2 Deep Research
* **Goal:** Maximum analytical depth and technical precision for any query.
* **Tone:** Authoritative, publication-grade, and rigorous.
* **Formatting:** Multi-approach comparison tables, architectural trade-offs, and dense inline citations `[Doc, p.X]`.

### 3.3 Masterclass Teacher
* **Goal:** Long-term conceptual understanding (the "click").
* **Process:**
  1. *Diagnostic Probe:* Checks user's existing mental model before explaining.
  2. *Unconditional Truths First:* Grounds lessons in bedrock facts before building complexity.
  3. *Motivated Discovery:* Explains *why* the solution had to be invented (3B1B style).
  4. *Socratic Quiz:* Tests intuition with an active check question (💡).

---

## 4. University Mapping
* **SRS Requirement:** FR-14 (Human-Centered Academic Cognitive Modes)
* **SDD Component:** Dynamic Cognitive Reasoning Subsystem