# Dual Synthesis Modes: Paper Assistant vs. Deep Research

Researchers have two distinct operational workflows:
1. **Targeted Reading:** Digging into a single specific document (equations, proofs, definitions).
2. **Cross-Document Synthesis:** Comparing findings, architectures, and benchmarks across 5-10 papers.

ScholarsMate adapts its pipeline parameters dynamically based on the active mode (`backend/rag/modes.py` and `generator.py`).

---

## Mode Comparison Matrix

| Parameter / Feature | 📄 Paper Assistant Mode | 🔬 Deep Research Mode |
|---|---|---|
| **Primary Use Case** | Single-paper deep dive, detailed methodology, equation analysis. | Broad thematic synthesis, comparative literature reviews. |
| **Target Document Scope** | 1 Document (Active Paper) | Multi-Document (Entire Workspace Collection) |
| **Default Retrieval Top-K** | `top_k = 6` | `top_k = 8` (or 3 chunks per document in multi-doc search) |
| **Retrieval Strategy** | `vector_search` with focused query expansion | `per_document_search` with fair chunk allocation |
| **Map-Reduce Trigger** | Disabled (Direct synthesis) | Automatically triggers when retrieved chunks $\ge 8$ across distinct papers |
| **Average Input Tokens** | ~2,550 tokens | ~3,270 to ~6,000 tokens |
| **Output Style** | Scannable, direct, bullet-focused | Multi-paragraph academic prose, comparative Markdown tables |

---

## Map-Reduce Cross-Document Synthesis (`execute_map_reduce_synthesis`)
When an inquiry spans multiple papers and retrieved chunks exceed the single-prompt threshold, ScholarsMate invokes a Map-Reduce pipeline:

1. **Map Step:** Groups chunks by origin document. Runs independent sub-summaries per paper highlighting findings relevant to the user query.
2. **Reduce Step:** Feeds the parallel paper syntheses into a final meta-synthesis LLM call to generate a cohesive comparative monograph with zero document omission.

---

## Linked Notes
- [[30_Source_Locked_Generation]] — Prompt styling rules
- [[23_Retrieval_Strategies_and_Token_Budget]] — Token packing & per-document search
- [[51_Literature_Review_Monograph_Studio]] — 5-stage monograph generation
