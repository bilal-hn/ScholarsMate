# Source-Locked Generation Engine

## The Hallucination Crisis in Academic AI
General-purpose LLMs are probabilistic autocomplete systems trained on internet text. When asked:
> *"What evaluation metric did Vaswani et al. report on the English-to-French benchmark?"*

An unconstrained model might fabricate a confident-sounding number or claim BLEU-44.2 because it "feels" plausible. In academic research, a fabricated citation can invalidate an entire thesis chapter.

ScholarsMate enforces **Source-Locked Generation** (`backend/rag/generator.py` and `backend/rag/prompt_templates.py`).

---

## 1. System Prompt Architecture (`MAIN_RAG_PROMPT`)
```markdown
You are ScholarsMate, an academic research assistant dedicated to clear, evidence-based paper analysis.

### Grounding & Citations:
- When using retrieved excerpts from workspace papers, append inline citations: [Doc_Name, p.X].
- When answering general conceptual questions not covered by the workspace papers, note it briefly and explain clearly without fabricating paper citations.

### Formatting:
- Use clean Markdown tables only when comparing multiple models, datasets, or benchmarks.
- Use syntax-highlighted code blocks for algorithms, formulas, and pseudocode.
```

---

## 2. Dynamic Assembly of Evidence
The context injected into the LLM is explicitly separated from conversation instructions:
```markdown
### RETRIEVED CONTEXT FROM PAPERS:
--- DOCUMENT: Attention_Is_All_You_Need.pdf (Page 4) ---
The Transformer follows this overall architecture using stacked self-attention...

--- DOCUMENT: BERT_Pretraining.pdf (Page 2) ---
We introduce BERT: Bidirectional Encoder Representations from Transformers...

---
### USER QUESTION:
How do self-attention layers differ between Transformer and BERT?
```

---

## 3. Strict Bracket Extraction
When the LLM finishes streaming its response, regex patterns parse all citations:
```python
CITATION_REGEX = re.compile(r"\[([a-zA-Z0-9_\-\.\s]+),\s*(?:p\.|page)?\s*(\d+)\]")
```
These extracted citations are fed directly into the **Output Guardrail** for provenance verification.

---

## Linked Notes
- [[31_Multi_Tier_Defensive_Guardrails]] — The 3-Tier safety harness
- [[32_Citation_Provenance_Verification]] — Cross-checking citations against ground truth
- [[33_Paper_Assistant_vs_Deep_Research]] — Focused vs broad synthesis modes
