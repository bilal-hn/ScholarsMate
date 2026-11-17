# Why Source-Locked Prompting Over Open Creative Synthesis

> **Key Presentation Question:** *"Why enforce strict source-locking with inline [Doc, p.X] brackets instead of allowing the LLM to give smooth, unrestricted answers?"*

---

## The Academic Imperative

In consumer AI products (like conversational search or copywriting bots), fluid, conversational answers are valued over strict provenance. If the model blends information from three different sources into a seamless paragraph, the end-user is satisfied.

In **academic research and thesis literature synthesis**, this behavior is catastrophic:
1. **Academic Dishonesty & Misattribution:** Attributing a theorem or experimental finding to the wrong author or paper can lead to charges of academic misconduct.
2. **Unverifiable Defense:** When defending an FYP or Master's thesis, committee members will ask: *"Which page of this paper proves this 94.2% accuracy claim?"* If the student cannot point to the page, the claim is rejected.
3. **Ghost Citations:** General models frequently create "Frankenstein citations" — real author name, plausible-sounding year, but a completely fabricated journal and paper title.

---

## How ScholarsMate Solves This

### 1. Strict Structural Locking
Every prompt explicitly instructs the LLM:
> *"When using retrieved excerpts from workspace papers, append inline citations: [Doc_Name, p.X]. When answering general conceptual questions not covered by papers, state clearly that it is general knowledge without fabricating citations."*

### 2. Bidirectional UI Navigation
- In ScholarsMate, a citation is not static text.
- Clicking on `[Transformer_Paper.pdf, p. 4]` sends an event to the split-screen PDF viewer (`Pdf_Viewer.png`), automatically navigating to **Page 4** and scrolling into view.
- This closes the verification loop in $< 1\text{ second}$.

---

## Linked Notes
- [[30_Source_Locked_Generation]] — System prompt architecture
- [[32_Citation_Provenance_Verification]] — Output provenance algorithm
- [[62_Deterministic_Guardrails_vs_Pure_LLM_Trust]] — Deterministic safety
