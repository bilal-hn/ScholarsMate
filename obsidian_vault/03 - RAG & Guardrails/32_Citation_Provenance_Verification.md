# Citation Provenance Verification & Hallucination Elimination

## The Problem
Even with explicit instructions like *"Only cite what you read"*, LLMs frequently hallucinate:
- Citing a real paper, but a completely fabricated page (e.g. `[Paper.pdf, p. 84]` in a 12-page paper).
- Inventing a paper title out of training memory (e.g. `[Goodfellow2014.pdf, p. 5]`) that was never in the workspace.

If a professor asks a student: *"Where in this paper did you find this claim?"*, and the page does not exist, the credibility of the entire project collapses.

---

## The ScholarsMate Ground-Truth Provenance Algorithm

ScholarsMate solves this algorithmically in `backend/guardrails/output_rails.py`:

```mermaid
flowchart TD
    RetrievedChunks[Retrieved Context Chunks] --> BuildGT[Build Ground Truth Set of Tuples:\n(doc_name, page_number)]
    GeneratedText[LLM Generated Text] --> ExtractCites[Regex Extract all [Doc, p.X] Citations]
    
    BuildGT --> Compare{Is (doc, page) in Ground Truth Set?}
    ExtractCites --> Compare
    
    Compare -->|YES| MarkVerified[Mark Citation: verified = True]
    Compare -->|NO| MarkHallucinated[Mark Citation: verified = False\nFlag: [Unverified Citation]]
    
    MarkVerified --> CalcMetric[Calculate Grounding Ratio:\nVerified / Total Citations]
    MarkHallucinated --> CalcMetric
```

---

## Code Implementation (`output_rails.py`)

```python
# 1. Build ground-truth set of valid (doc_name, page_number) pairs from retrieved chunks
ground_truth_pairs = set()
for chunk in retrieved_chunks:
    doc = chunk.get("doc_name") or chunk.get("source")
    page = chunk.get("page_number")
    if doc and page is not None:
        ground_truth_pairs.add((str(doc).strip().lower(), int(page)))

# 2. Cross-reference generated citations against ground truth
verified_citations = []
hallucinated_count = 0

for cite in extracted_citations:
    doc_raw = str(cite.get("doc_name", "")).strip().lower()
    page_raw = int(cite.get("page_number", 1))

    # Verify against ground-truth set
    if (doc_raw, page_raw) in ground_truth_pairs:
        cite_copy = dict(cite)
        cite_copy["verified"] = True
        verified_citations.append(cite_copy)
    else:
        # Flag hallucinated citation
        cite_copy = dict(cite)
        cite_copy["verified"] = False
        hallucinated_count += 1
        verified_citations.append(cite_copy)

# 3. Calculate telemetry metrics
total_cites = len(verified_citations)
grounding_ratio = 1.0 if total_cites == 0 else (total_cites - hallucinated_count) / total_cites
```

---

## Frontend Integration
In the ScholarsMate UI:
- **Verified Citations:** Rendered as interactive blue badges (e.g. `[Vaswani2017.pdf, p. 3]`). Clicking the badge automatically jumps the split-screen PDF viewer to that exact page!
- **Unverified Citations:** Rendered with an amber warning badge `[Unverified]`, alerting the researcher that the LLM produced a claim not grounded in retrieved chunks.

---

## Linked Notes
- [[31_Multi_Tier_Defensive_Guardrails]] — The full 3-Tier Guardrail subsystem
- [[30_Source_Locked_Generation]] — Source-locked system prompt
- [[62_Deterministic_Guardrails_vs_Pure_LLM_Trust]] — Why algorithmic verification beats prompt engineering
