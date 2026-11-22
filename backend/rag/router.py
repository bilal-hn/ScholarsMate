import sys
import os
import json
import re
import difflib
from typing import List
from litellm import completion

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.db.document_service import get_cached_document_summary
from backend.rag.runtime import (
    extract_reasoning_and_content,
    heuristic_intent,
    normalize_litellm_model_id,
    parse_json_object,
    provider_from_model,
    resolve_api_key,
    resolve_model_and_key,
    sanitize_messages_for_llm,
)

# Alias for backward compatibility
_resolve_router_api_key = resolve_api_key


def resolve_target_documents(query: str, available_docs: List[str], cutoff: float = 0.6) -> List[str]:
    """
    Matches target filenames against @ mentions, exact word tokens, and fuzzy typos
    while preventing substring collisions (e.g. 'sample' matching inside 'sample2').
    """
    if not available_docs:
        return []

    matched = set()
    query_lower = query.lower()

    # 1. Check for explicit @mentions (e.g., @paper2.pdf, @paper2)
    at_mentions = re.findall(r"@([a-zA-Z0-9_\-\.]+)", query)
    if at_mentions:
        for mention in at_mentions:
            mention_lower = mention.lower()
            mention_base = mention_lower.replace(".pdf", "")
            for doc in available_docs:
                doc_lower = doc.lower()
                doc_base = doc_lower.replace(".pdf", "")
                if mention_lower == doc_lower or mention_base == doc_base:
                    matched.add(doc)
        if matched:
            return list(matched)

    # Clean query for word boundary token checks
    clean_query = re.sub(r"[`'\"\\/,;:()<>{}[\]@]", " ", query_lower).strip()
    words = clean_query.split()

    # 2. Exact word boundary match for full document filename or base stem
    for doc in available_docs:
        doc_lower = doc.lower()
        doc_base = doc_lower.replace(".pdf", "")

        # Word boundary matching so 'sample' does not match 'sample2'
        doc_pattern = r"\b" + re.escape(doc_lower) + r"\b"
        base_pattern = r"\b" + re.escape(doc_base) + r"\b"

        if re.search(doc_pattern, clean_query) or re.search(base_pattern, clean_query):
            matched.add(doc)

    if matched:
        return list(matched)

    # 3. Match significant numeric/text identifiers (e.g., '00945', '2504.15909')
    for doc in available_docs:
        doc_lower = doc.lower()
        doc_base = doc_lower.replace(".pdf", "")
        doc_subtokens = [t for t in re.split(r"[-_.\s]", doc_base) if len(t) >= 4]
        if any(re.search(r"\b" + re.escape(subtok) + r"\b", clean_query) for subtok in doc_subtokens):
            matched.add(doc)

    if matched:
        return list(matched)

    # 4. Fuzzy matching on words against document stems to handle typos
    for doc in available_docs:
        doc_lower = doc.lower()
        doc_base = doc_lower.replace(".pdf", "")
        doc_subtokens = [t for t in re.split(r"[-_.\s]", doc_base) if len(t) >= 4]
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
    if intent not in {"CONVERSATIONAL", "GENERAL_KNOWLEDGE", "FOLLOW_UP", "NEW_QUERY"}:
        intent = "NEW_QUERY"

    if intent in {"CONVERSATIONAL", "GENERAL_KNOWLEDGE"}:
        # If the user has active workspace documents and is asking a question or substantive query,
        # DO NOT suppress retrieval! Always search the workspace documents.
        has_substantive_query = (
            "?" in query or
            any(query.lower().strip().startswith(w) for w in [
                "what", "how", "why", "which", "who", "when", "where",
                "can you", "could you", "tell", "explain", "describe",
                "summarise", "summarize", "compare", "is", "are", "does", "do"
            ]) or
            len(query.split()) >= 4
        )
        if available_docs and has_substantive_query:
            plan["intent"] = "NEW_QUERY"
            plan["scope"] = "full_corpus" if len(available_docs) > 1 else "single"
            plan["target_docs"] = available_docs
            plan["retrieval_mode"] = "vector_search" if len(available_docs) <= 1 else "per_document_search"
            plan["is_meta_query"] = False
            plan["recommended_top_k"] = fallback_k
            return plan

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
        summary_keywords = [
            r"\b(summarise|summarize|summary|overview|breakdown|brief)\b",
            r"\b(tldr|tl;dr|tl dr)\b",
            r"\bwhat.{0,15}(paper|document|doc|article|study|research).{0,15}about\b",
            r"\b(explain|describe|tell me about)\s+(this|the)\s+(paper|document|doc|article|study)\b",
            r"\b(give me|what.{0,5}(the|a)).{0,10}(gist|essence|key points|main points|highlights)\b",
        ]
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
    model_name: str = "bedrock/us.amazon.nova-lite-v1:0",
    custom_keys: dict | None = None,
) -> dict:
    """
    Dynamically routes query execution plans using fuzzy entity resolution,
    cached summaries, and BYOK settings.
    """
    clean_query = query.strip()
    fallback_k = evaluate_query_scope_fallback(clean_query)
    heuristic = heuristic_intent(clean_query, chat_history)
    lowered = clean_query.lower()

    # Fast-Path 1: Pure file listing metadata queries
    # Must NOT trigger if user asks about content/summary/topics (e.g. "what are the papers about?")
    meta_patterns = [
        r"\b(how many|list)\s+(papers|documents|files)\b",
        r"\bshow\s+(my\s+)?(papers|documents|files|workspace)\b",
        r"\bwhat\s+files\s+are\s+in\s+this\s+(workspace|chat)\b",
    ]
    content_intent_cues = ["about", "summary", "summarise", "summarize", "topic", "topics", "content", "contents", "explain", "findings", "discuss", "cover", "tell me"]
    has_content_intent = any(w in lowered for w in content_intent_cues)
    if not has_content_intent and any(re.search(p, lowered) for p in meta_patterns):
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

    # Fast-Path 1B: Multi-Document Overview / Summary Requests
    multi_doc_summary_keywords = [
        r"\b(summarise|summarize|summary|overview|breakdown)\s+(all|the|these|my|both|three|four|five|\d+)?\s*(papers|documents|studies|articles|corpus|workspace)\b",
        r"\bwhat\s+are\s+(the|these|all|my)?\s*(papers|documents|studies|articles)\s+about\b",
        r"\bwhat\s+do\s+(these|the|all|my)?\s*(papers|documents|studies|articles)\s+(say|discuss|cover|explain)\b",
        r"\b(summarise|summarize|overview)\s+(all|workspace|everything)\b",
        r"\btell\s+me\s+about\s+(the|these|all)\s+(papers|documents|studies)\b",
    ]
    if available_docs and any(re.search(p, lowered) for p in multi_doc_summary_keywords):
        return {
            "intent": "NEW_QUERY",
            "scope": "full_corpus",
            "target_docs": available_docs,
            "retrieval_mode": "per_document_search",
            "generation_mode": "map_reduce" if len(available_docs) >= 8 else "single_pass",
            "is_meta_query": False,
            "query_depth": "broad_synthesis",
            "recommended_top_k": max(12, 4 * len(available_docs)),
        }

    # Fast-Path 2: Deterministic Target + Summary Cache Check (Bypasses LLM Router entirely)
    resolved_targets = resolve_target_documents(clean_query, available_docs)
    summary_keywords = [
        r"\b(summarise|summarize|summary|overview|breakdown|brief)\b",
        r"\b(tldr|tl;dr|tl dr)\b",
        r"\bwhat.{0,15}(paper|document|doc|article|study|research).{0,15}about\b",
        r"\b(explain|describe|tell me about)\s+(this|the)\s+(paper|document|doc|article|study)\b",
        r"\b(give me|what.{0,5}(the|a)).{0,10}(gist|essence|key points|main points|highlights)\b",
    ]
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
    model_name, active_key = resolve_model_and_key(model_name, keys)

    from backend.embeddings.vector_store import get_indexed_document_catalog
    full_catalog = get_indexed_document_catalog()
    catalog = [item for item in full_catalog if item["filename"] in available_docs] if available_docs else full_catalog
    formatted_history = _truncate_history(chat_history)

    prompt = f"""
You are an academic query execution planner for ScholarsMate, a multi-document RAG system.
Return ONLY a JSON object. No prose, no markdown, no chain-of-thought.

Intent labels:
- CONVERSATIONAL: pure greetings, thanks, acknowledgments ("hi", "hello", "thanks", "understood", "cool") where the user is NOT requesting paper research or asking a substantive question. No PDF retrieval.
- GENERAL_KNOWLEDGE: questions about general programming, math, or topics completely unrelated to any uploaded research papers (e.g. "Write a Python script for mergesort", "What is the capital of France?"). If the question asks about any concept, definition, or topic that could be addressed by the user's uploaded papers (e.g., muscle hypertrophy, attention mechanisms, machine learning, training methods), classify as NEW_QUERY!
- FOLLOW_UP: the user is ACTIVELY asking a follow-up question or requesting clarification/elaboration on previous points ("why is that?", "can you give an example?", "explain that simpler", "what did you mean by X?"). Requires PDF retrieval.
- NEW_QUERY: any substantive question about the research papers, concepts, or workspace overview ("what are these papers about", "summarise all papers", "explain hypertrophy"). Requires PDF retrieval.

Retrieval:
- vector_search: default focused question.
- per_document_search: compare / overview / "what are these papers about" / "summarise all papers" across multiple files.
- full_text: only when a SINGLE named document must be read end-to-end.
- metadata_only: strictly for listing or counting filenames (e.g. "how many files do I have?"), NEVER for content summaries.

Indexed Documents:
{json.dumps(catalog)}

Recent Chat History:
{formatted_history or "No previous conversation context."}

User Query: "{clean_query}"

JSON schema:
{{
  "intent": "CONVERSATIONAL" | "GENERAL_KNOWLEDGE" | "FOLLOW_UP" | "NEW_QUERY",
  "scope": "single" | "named_subset" | "full_corpus" | "none",
  "target_docs": ["filename1.pdf"],
  "retrieval_mode": "full_text" | "vector_search" | "per_document_search" | "metadata_only" | "none",
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
        is_bedrock = model_name.startswith("bedrock/")
        call_kwargs = {
            "model": model_name,
            "messages": sanitize_messages_for_llm(messages),
            "api_key": active_key if not is_bedrock else None,
            "max_tokens": 400,
            "drop_params": True,
        }
        if "deepseek" not in model_name.lower():
            call_kwargs["reasoning_effort"] = "none"
        if is_bedrock:
            call_kwargs["aws_region_name"] = os.getenv("AWS_REGION_NAME", "us-east-1")
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