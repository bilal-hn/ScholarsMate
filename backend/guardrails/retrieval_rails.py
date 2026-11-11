from typing import List, Dict, Any, Tuple, Optional
from .schemas import GuardrailResult, RailAction, Violation


def check_retrieval_rails(
    chunks: List[Dict[str, Any]],
    allowed_docs: Optional[List[str]] = None,
    max_distance: float = 0.75,
    max_context_tokens: int = 4200,
) -> Tuple[List[Dict[str, Any]], GuardrailResult]:
    """
    Evaluates retrieved vector chunks prior to LLM prompt injection:
    1. Workspace Boundary Guard: Ensures chunks only belong to active workspace documents.
    2. Gate 2 Semantic Quality Filter: Drops chunks exceeding cosine distance cutoff.
    3. Token Budget Guard: Caps total prompt context to prevent provider rate limits.
    """
    violations: List[Violation] = []
    retained_chunks: List[Dict[str, Any]] = []
    total_tokens = 0
    allowed_set = set(allowed_docs) if allowed_docs else None

    for c in chunks:
        doc_name = c.get("doc_name") or c.get("source") or "Unknown"

        # 1. Workspace Isolation Rail
        if allowed_set is not None and doc_name not in allowed_set:
            violations.append(Violation(
                rail_name="workspace_isolation_guard",
                severity="high",
                message=f"Chunk from '{doc_name}' excluded as it is not in the active workspace."
            ))
            continue

        # 2. Gate 2 Semantic Quality Cutoff (Cosine distance threshold)
        dist = c.get("distance")
        if dist is not None and dist > max_distance:
            violations.append(Violation(
                rail_name="semantic_relevance_gate",
                severity="low",
                message=f"Dropped chunk from '{doc_name}' with distance {dist:.2f} > {max_distance:.2f}."
            ))
            continue

        # 3. Context Token Budget Guard (~1.33 words per token)
        content = c.get("content", "").strip()
        words = content.split()
        chunk_tokens = max(1, int(len(words) * 1.33))

        if total_tokens + chunk_tokens > max_context_tokens:
            remaining_tokens = max_context_tokens - total_tokens
            if remaining_tokens > 150:
                allowed_words = int(remaining_tokens / 1.33)
                trimmed_content = " ".join(words[:allowed_words]) + " ... [excerpt trimmed for token budget]"
                trimmed_chunk = dict(c)
                trimmed_chunk["content"] = trimmed_content
                retained_chunks.append(trimmed_chunk)
                total_tokens += remaining_tokens
            violations.append(Violation(
                rail_name="token_budget_guard",
                severity="low",
                message=f"Truncated context to enforce {max_context_tokens} token ceiling."
            ))
            break

        retained_chunks.append(c)
        total_tokens += chunk_tokens

    action = RailAction.MODIFY if violations else RailAction.ALLOW
    return retained_chunks, GuardrailResult(
        action=action,
        sanitized_text="",
        violations=violations,
        metadata={
            "input_chunk_count": len(chunks),
            "retained_chunk_count": len(retained_chunks),
            "estimated_tokens": total_tokens,
            "fallback_required": len(retained_chunks) == 0,
        }
    )
