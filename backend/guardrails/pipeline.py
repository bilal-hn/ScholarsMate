from typing import Tuple, List, Dict, Any, Optional
from .schemas import GuardrailResult, RailAction
from .input_rails import check_input_rails
from .retrieval_rails import check_retrieval_rails
from .output_rails import check_output_rails


class GuardrailPipeline:
    """
    Unified 3-Tier Guardrail Orchestrator for ScholarsMate:
    - Tier 1: Input Rails (Adversarial injection, jailbreaks, PII scrubbing)
    - Tier 2: Retrieval Rails (Workspace scoping, Gate 2 similarity, token budget)
    - Tier 3: Output Rails (Citation provenance verification, credential leaks)
    """

    @staticmethod
    def run_input_rails(query: str, max_chars: int = 3000) -> GuardrailResult:
        """Runs pre-retrieval validation on user queries."""
        return check_input_rails(query=query, max_chars=max_chars)

    @staticmethod
    def run_retrieval_rails(
        chunks: List[Dict[str, Any]],
        allowed_docs: Optional[List[str]] = None,
        max_distance: float = 0.75,
        max_context_tokens: int = 4200,
    ) -> Tuple[List[Dict[str, Any]], GuardrailResult]:
        """Runs pre-injection validation on retrieved vector passages."""
        return check_retrieval_rails(
            chunks=chunks,
            allowed_docs=allowed_docs,
            max_distance=max_distance,
            max_context_tokens=max_context_tokens,
        )

    @staticmethod
    def run_output_rails(
        generated_text: str,
        extracted_citations: List[Dict[str, Any]],
        retrieved_chunks: List[Dict[str, Any]],
    ) -> Tuple[str, List[Dict[str, Any]], GuardrailResult]:
        """Runs post-generation verification on answer text and citations."""
        return check_output_rails(
            generated_text=generated_text,
            extracted_citations=extracted_citations,
            retrieved_chunks=retrieved_chunks,
        )
