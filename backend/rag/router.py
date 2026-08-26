import sys
import os
import json
import re
import difflib
from typing import List
from litellm import completion

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.embeddings.vector_store import get_indexed_document_catalog
from backend.db.document_service import get_cached_document_summary
from backend.rag.runtime import (
    extract_reasoning_and_content,
    heuristic_intent,
    normalize_litellm_model_id,
    parse_json_object,
    provider_from_model,
)


def _resolve_router_api_key(provider: str, custom_keys: dict) -> str | None:
    """Finds the provider's custom key or falls back to server environment variables."""
    prov = provider.lower()
    if custom_keys:
        if custom_keys.get(prov):
            return custom_keys[prov]
        for k, v in custom_keys.items():
            if v and v.strip():
                return v.strip()

    env_map = {
        "groq": "GROQ_API_KEY",
        "gemini": "GEMINI_API_KEY",
        "google": "GEMINI_API_KEY",
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "deepseek": "DEEPSEEK_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
    }
    env_var = env_map.get(prov, f"{prov.upper()}_API_KEY")
    return os.getenv(env_var)


def resolve_target_documents(query: str, available_docs: List[str], cutoff: float = 0.6) -> List[str]:
    """
    Deterministic & Fuzzy Entity Resolution:
    Matches target filenames against typos, trailing backticks, quotes, punctuation,
    and partial sub-tokens (e.g., '00945', 's12599', '2504.15909').
    """
    if not available_docs:
        return []

    # Strip markdown backticks, quotes, and symbols
    clean_query = re.sub(r"[`'\"\\/,;:()<>{}[\]]", " ", query.lower()).strip()
    words = clean_query.split()

    matched = set()

    for doc in available_docs:
        doc_lower = doc.lower()
        doc_base = doc_lower.replace(".pdf", "")

        # 1. Exact or substring match in cleaned query
        if doc_lower in clean_query or doc_base in clean_query:
            matched.add(doc)
            continue

        # 2. Match significant numeric/text identifiers (e.g., '00945', '2504.15909')
        doc_subtokens = [t for t in re.split(r"[-_.\s]", doc_base) if len(t) >= 4]
        if any(subtok in clean_query for subtok in doc_subtokens):
            matched.add(doc)
            continue

        # 3. Fuzzy matching on words against document stems to handle typos
        for word in words:
            if len(word) >= 5:
                fuzzy_hits = difflib.get_close_matches(word, [doc_lower, doc_base] + doc_subtokens, n=1, cutoff=cutoff)
                if fuzzy_hits:
                    matched.add(doc)
                    break

    return list(matched)


def evaluate_query_scope_fallback(query: str) -> int:
    """Fallback regex check to determine top_k depth if LLM router fails."""
    query_lower = query.lower().strip()

    global_synthesis_patterns = [
        r"\b(all|every|entire|whole|complete|full)\b",
        r"\b(summary|summarize|overview|synthesis)\b.*(paper|book|document|workspace)",
        r"\bcompare\b.*(all|workspace|papers)",
        r"\blist all\b",
        r"\bextract all\b",
        r"\bacross\b.*(papers|documents|workspace)",
        r"\b(code|algorithm|pseudocode|equation)s?\b",
    ]

    if any(re.search(pattern, query_lower) for pattern in global_synthesis_patterns):
        return 18
    return 6


def _truncate_history(chat_history: list | None, per_message: int = 400) -> str:
    if not chat_history:
        return ""
    lines = []
    for msg in chat_history[-6:]:
        sender = msg.get("sender") if isinstance(msg, dict) else getattr(msg, "sender", "user")
        text = msg.get("text") if isinstance(msg, dict) else getattr(msg, "text", "")
        role = "User" if sender == "user" else "Assistant"
        clipped = (text or "")[:per_message]
        if text and len(text) > per_message:
            clipped += "…"
        lines.append(f"{role}: {clipped}")
    return "\n".join(lines)


def sanitize_plan(plan: dict, query: str, available_docs: list[str]) -> dict:
    """Normalize router JSON so intent, retrieval mode, and docs stay consistent."""
    fallback_k = evaluate_query_scope_fallback(query)
    intent = (plan.get("intent") or "NEW_QUERY").upper()
    if intent not in {"CONVERSATIONAL", "FOLLOW_UP", "NEW_QUERY"}:
        intent = "NEW_QUERY"

    if intent == "CONVERSATIONAL":
        plan["intent"] = intent
        plan["scope"] = "none"
        plan["target_docs"] = []
        plan["retrieval_mode"] = "none"
        plan["is_meta_query"] = False
        plan["recommended_top_k"] = 0
        return plan

    plan["intent"] = intent
    
    # If LLM failed to identify targets or hallucinated filenames, resolve deterministically
    resolved = resolve_target_documents(query, available_docs)
    if resolved:
        plan["target_docs"] = resolved
    elif not plan.get("target_docs"):
        plan["target_docs"] = available_docs

    retrieval_mode = plan.get("retrieval_mode") or "vector_search"
    target_docs = plan.get("target_docs") or available_docs or []

    # Single-document summary cache check
    if len(target_docs) == 1:
        target_doc = target_docs[0]
        summary_keywords = [r"\b(summarise|summarize|summary|overview|breakdown|brief)\b"]
        is_summary_query = any(re.search(kw, query.lower()) for kw in summary_keywords)
        
        if is_summary_query or retrieval_mode == "full_text":
            cached_summary = get_cached_document_summary(target_doc)
            if cached_summary:
                print(f"[Router Interceptor] Instant cache hit for '{target_doc}'.")
                plan["retrieval_mode"] = "cached_summary"
                plan["generation_mode"] = "no_llm"
                plan["cached_content"] = cached_summary
                plan["recommended_top_k"] = 0
                return plan

    if retrieval_mode == "full_text" and len(target_docs) > 1:
        retrieval_mode = "per_document_search"
    plan["retrieval_mode"] = retrieval_mode

    if "recommended_top_k" not in plan:
        plan["recommended_top_k"] = 18 if plan.get("query_depth") == "broad_synthesis" else fallback_k

    if retrieval_mode == "per_document_search":
        plan["recommended_top_k"] = max(int(plan.get("recommended_top_k") or 6), max(6, 3 * max(len(target_docs), 1)))

    return plan


def classify_query_intent(
    query: str,
    available_docs: list[str],
    chat_history: list[dict] | None = None,
    model_name: str = "gemini/gemini-3.6-flash",
    custom_keys: dict | None = None,
) -> dict:
    """
    Dynamically routes query execution plans using fuzzy entity resolution,
    cached summaries, and BYOK settings.
    """
    clean_query = query.strip()
    fallback_k = evaluate_query_scope_fallback(clean_query)
    heuristic = heuristic_intent(clean_query)
    lowered = clean_query.lower()

    # Fast-Path 1: Metadata queries
    meta_patterns = [
        r"\b(how many|list)\s+(papers|documents|files)\b",
        r"\bshow\s+(my\s+)?(papers|documents|files|workspace)\b",
        r"\bwhat\s+(is\s+in\s+this|are\s+the)\s+(workspace|documents)\b",
    ]
    if any(re.search(p, lowered) for p in meta_patterns):
        return {
            "intent": "NEW_QUERY",
            "scope": "full_corpus",
            "target_docs": available_docs,
            "retrieval_mode": "metadata_only",
            "generation_mode": "no_llm",
            "is_meta_query": True,
            "query_depth": "focused",
            "recommended_top_k": 0,
        }

    # Fast-Path 2: Deterministic Target + Summary Cache Check (Bypasses LLM Router entirely)
    resolved_targets = resolve_target_documents(clean_query, available_docs)
    summary_keywords = [r"\b(summarise|summarize|summary|overview|breakdown|brief)\b"]
    is_summary = any(re.search(kw, lowered) for kw in summary_keywords)

    if len(resolved_targets) == 1 and is_summary:
        target_doc = resolved_targets[0]
        cached_summary = get_cached_document_summary(target_doc)
        if cached_summary:
            print(f"[Router Fast-Path] Instant hit on pre-computed cache for '{target_doc}'.")
            return {
                "intent": "NEW_QUERY",
                "scope": "single",
                "target_docs": [target_doc],
                "retrieval_mode": "cached_summary",
                "generation_mode": "no_llm",
                "cached_content": cached_summary,
                "is_meta_query": False,
                "query_depth": "focused",
                "recommended_top_k": 0,
            }

    default_plan = sanitize_plan(
        {
            "intent": heuristic,
            "scope": "single" if len(resolved_targets) == 1 else ("full_corpus" if heuristic != "CONVERSATIONAL" else "none"),
            "target_docs": resolved_targets or (available_docs if heuristic != "CONVERSATIONAL" else []),
            "retrieval_mode": "vector_search" if heuristic != "CONVERSATIONAL" else "none",
            "generation_mode": "single_pass",
            "is_meta_query": False,
            "query_depth": "broad_synthesis" if fallback_k >= 18 else "focused",
            "recommended_top_k": fallback_k if heuristic != "CONVERSATIONAL" else 0,
        },
        clean_query,
        available_docs,
    )

    keys = custom_keys or {}
    model_name = normalize_litellm_model_id(model_name)
    provider = provider_from_model(model_name)
    active_key = _resolve_router_api_key(provider, keys)

    full_catalog = get_indexed_document_catalog()
    catalog = [item for item in full_catalog if item["filename"] in available_docs] if available_docs else full_catalog
    formatted_history = _truncate_history(chat_history)

    prompt = f"""
You are an academic query execution planner for ScholarsMate, a multi-document RAG system.
Return ONLY a JSON object. No prose, no markdown, no chain-of-thought.

Intent labels:
- CONVERSATIONAL: greetings, thanks, or questions about you the assistant. No PDF retrieval.
- FOLLOW_UP: depends on prior turns (summarise it, why, go on, that method).
- NEW_QUERY: a self-contained question about the papers/workspace.

Retrieval:
- vector_search: default focused question.
- per_document_search: compare / overview / "what are these papers about" across multiple files.
- full_text: only when a SINGLE named document must be read end-to-end.
- metadata_only: listing files in the workspace, not their content.

Indexed Documents:
{json.dumps(catalog)}

Recent Chat History:
{formatted_history or "No previous conversation context."}

User Query: "{clean_query}"

JSON schema:
{{
  "intent": "CONVERSATIONAL" | "FOLLOW_UP" | "NEW_QUERY",
  "scope": "single" | "named_subset" | "full_corpus",
  "target_docs": ["filename1.pdf"],
  "retrieval_mode": "full_text" | "vector_search" | "per_document_search" | "metadata_only",
  "generation_mode": "single_pass" | "map_reduce" | "structured_comparison" | "no_llm",
  "is_meta_query": false,
  "query_depth": "broad_synthesis" | "focused",
  "recommended_top_k": 6
}}
""".strip()

    messages = [
        {
            "role": "system",
            "content": "You output only valid JSON execution plans for an academic RAG router. Never include reasoning text.",
        },
        {"role": "user", "content": prompt},
    ]

    try:
        call_kwargs = {
            "model": model_name,
            "messages": messages,
            "api_key": active_key,
            "max_tokens": 400,
            "drop_params": True,
            "reasoning_effort": "none",
        }
        try:
            response = completion(**call_kwargs, response_format={"type": "json_object"})
        except Exception:
            response = completion(**call_kwargs)

        extracted = extract_reasoning_and_content(response)
        plan = parse_json_object(extracted.answer or "")
        return sanitize_plan(plan, clean_query, available_docs)
    except Exception as e:
        print(f"[Router Notice] Intent routing defaulted: {e}")
        return default_plan