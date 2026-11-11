import re
from typing import List, Dict, Any, Tuple
from .schemas import GuardrailResult, RailAction, Violation

# Redaction patterns for model output to prevent accidental leak of keys or system prompts
LEAK_PATTERNS = [
    (r"AIza[0-9A-Za-z-_]{30,45}", "[REDACTED_API_KEY]"),
    (r"gsk_[a-zA-Z0-9]{30,}", "[REDACTED_API_KEY]"),
    (r"sk-[a-zA-Z0-9]{30,}", "[REDACTED_API_KEY]"),
    (r"sk-ant-[a-zA-Z0-9_-]{30,}", "[REDACTED_API_KEY]"),
]


def check_output_rails(
    generated_text: str,
    extracted_citations: List[Dict[str, Any]],
    retrieved_chunks: List[Dict[str, Any]]
) -> Tuple[str, List[Dict[str, Any]], GuardrailResult]:
    """
    Evaluates LLM generation prior to client delivery:
    1. Citation Provenance Verification: Cross-checks every [Doc, p.X] citation against
       the ground truth of actually retrieved chunk pages.
    2. Secret / Key Leak Redaction: Blocks accidental API key leakage.
    """
    violations: List[Violation] = []
    clean_text = generated_text or ""

    # 1. Secret / Credential Leakage in Model Output
    for pattern, placeholder in LEAK_PATTERNS:
        if re.search(pattern, clean_text):
            violations.append(Violation(
                rail_name="secret_leakage_guard",
                severity="critical",
                message="Model response contained sensitive credential, which was redacted."
            ))
            clean_text = re.sub(pattern, placeholder, clean_text)

    # 2. Citation Provenance Verification
    # Build ground truth set of valid (doc_name, page_number) pairs from retrieved context
    ground_truth_pairs = set()
    for chunk in retrieved_chunks:
        doc = chunk.get("doc_name") or chunk.get("source")
        page = chunk.get("page_number")
        if doc and page is not None:
            ground_truth_pairs.add((str(doc).strip().lower(), int(page)))

    verified_citations: List[Dict[str, Any]] = []
    hallucinated_count = 0

    for cite in extracted_citations:
        doc_raw = str(cite.get("doc_name", "")).strip()
        page_raw = cite.get("page_number", 1)

        # Ignore synthetic references like [Image] or general notes
        if doc_raw.startswith("[Image]"):
            cite_copy = dict(cite)
            cite_copy["verified"] = True
            verified_citations.append(cite_copy)
            continue

        pair_key = (doc_raw.lower(), int(page_raw))
        is_verified = pair_key in ground_truth_pairs

        cite_copy = dict(cite)
        cite_copy["verified"] = is_verified

        if not is_verified:
            hallucinated_count += 1
            violations.append(Violation(
                rail_name="citation_provenance_guard",
                severity="medium",
                message=f"Citation '{doc_raw}' page {page_raw} was not found in retrieved context chunks."
            ))
            # Tag visually so frontend and user can distinguish
            cite_copy["status"] = "unverified"
        else:
            cite_copy["status"] = "grounded"

        verified_citations.append(cite_copy)

    action = RailAction.MODIFY if violations else RailAction.ALLOW
    return clean_text, verified_citations, GuardrailResult(
        action=action,
        sanitized_text=clean_text,
        violations=violations,
        metadata={
            "total_citations": len(extracted_citations),
            "verified_citations": len(verified_citations) - hallucinated_count,
            "hallucinated_citations": hallucinated_count,
            "grounding_ratio": round(
                ((len(verified_citations) - hallucinated_count) / max(1, len(verified_citations))), 2
            ),
        }
    )
