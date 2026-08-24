import sys
import os
import json
import re
from litellm import completion

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.embeddings.vector_store import get_indexed_document_catalog, list_indexed_documents


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
        r"\b(code|algorithm|pseudocode|equation)s?\b"
    ]
    
    if any(re.search(pattern, query_lower) for pattern in global_synthesis_patterns):
        return 18
    return 6


def classify_query_intent(
    query: str, 
    available_docs: list[str], 
    chat_history: list[dict] | None = None,
    model_name: str = "gemini/gemini-2.5-flash",
    custom_keys: dict | None = None
) -> dict:
    """
    Dynamically routes query execution plans using the user's active BYOK model & key.
    Strictly scopes document catalog to available_docs (the active workspace).
    """
    clean_query = query.strip()
    fallback_k = evaluate_query_scope_fallback(clean_query)
    
    default_plan = {
        "intent": "NEW_QUERY",
        "scope": "full_corpus",
        "target_docs": available_docs,
        "retrieval_mode": "vector_search",
        "generation_mode": "single_pass",
        "is_meta_query": False,
        "query_depth": "broad_synthesis" if fallback_k >= 18 else "focused",
        "recommended_top_k": fallback_k
    }

    # 1. Fast-Path for Conversational Greetings & Metadata Questions
    lowered = clean_query.lower()
    if lowered in ["hi", "hello", "hey", "help", "who are you", "what can you do", "thanks", "thank you"]:
        return {
            "intent": "CONVERSATIONAL",
            "scope": "none",
            "target_docs": [],
            "retrieval_mode": "none",
            "generation_mode": "single_pass",
            "is_meta_query": False,
            "query_depth": "focused",
            "recommended_top_k": 0
        }

    meta_patterns = [
        r"\b(how many|list|what)\s+(papers|documents|files)\b",
        r"\bshow\s+(my\s+)?(papers|documents|files|workspace)\b",
        r"\bwhat\s+(is\s+in\s+this|are\s+the)\s+(workspace|documents)\b"
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
            "recommended_top_k": 0
        }

    # 2. Resolve Active Provider & Key
    keys = custom_keys or {}
    provider = model_name.split("/")[0] if "/" in model_name else "gemini"
    active_key = _resolve_router_api_key(provider, keys)

    # 3. Scope catalog strictly to active workspace documents
    full_catalog = get_indexed_document_catalog()
    catalog = [item for item in full_catalog if item["filename"] in available_docs] if available_docs else full_catalog

    formatted_history = ""
    if chat_history:
        for msg in chat_history[-6:]:
            sender = msg.get("sender") if isinstance(msg, dict) else getattr(msg, "sender", "user")
            text = msg.get("text") if isinstance(msg, dict) else getattr(msg, "text", "")
            role = "User" if sender == "user" else "Assistant"
            formatted_history += f"{role}: {text}\n"

    prompt = f"""
You are an academic query execution planner for a multi-document RAG system named ScholarsMate.
Analyze the user query, available document catalog, and recent chat history to output a structured JSON execution plan.

Indexed Documents in Active Workspace (Filenames & Paper Titles):
{json.dumps(catalog)}

Recent Chat History:
{formatted_history.strip() or "No previous conversation context."}

User Query: "{clean_query}"

JSON Schema:
{{
  "intent": "CONVERSATIONAL" | "FOLLOW_UP" | "NEW_QUERY",
  "scope": "single" | "named_subset" | "full_corpus",
  "target_docs": ["filename1.pdf", ...],
  "retrieval_mode": "full_text" | "vector_search" | "per_document_search" | "metadata_only",
  "generation_mode": "single_pass" | "map_reduce" | "structured_comparison" | "no_llm",
  "is_meta_query": boolean,
  "query_depth": "broad_synthesis" | "focused",
  "recommended_top_k": integer
}}

Return ONLY valid JSON matching this schema.
""".strip()

    try:
        response = completion(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            api_key=active_key,
            temperature=0.0,
        )
        raw_content = response.choices[0].message.content.strip()
        
        # Clean potential markdown wrapping
        if raw_content.startswith("```"):
            raw_content = re.sub(r"^```(?:json)?\n?", "", raw_content)
            raw_content = re.sub(r"\n?```$", "", raw_content)
            
        plan = json.loads(raw_content.strip())
        
        if not plan.get("intent"):
            plan["intent"] = "NEW_QUERY"

        if not plan.get("target_docs"):
            plan["target_docs"] = available_docs
            
        if "recommended_top_k" not in plan:
            plan["recommended_top_k"] = 18 if plan.get("query_depth") == "broad_synthesis" else 6
            
        return plan
    except Exception as e:
        print(f"[Router Notice] Intent routing defaulted: {e}")
        return default_plan