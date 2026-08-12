import sys
import os
import json
import re
from groq import Groq

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.embeddings.vector_store import get_indexed_document_catalog, list_indexed_documents
from backend.rag.prompt_templates import ROUTER_CLASSIFICATION_PROMPT

api_key = os.getenv("GROQ_API_KEY")
groq_client = Groq(api_key=api_key) if api_key else None


def evaluate_query_scope_fallback(query: str) -> int:
    """Fallback regex check to determine top_k depth if LLM router fails."""
    query_lower = query.lower().strip()
    
    # Global/Synthesis scope triggers requiring higher retrieval density
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


def classify_query_intent(query: str, available_docs: list[str], chat_history: list[dict] | None = None) -> dict:
    """
    Uses Groq (Llama 3.1 8B) to output a structured JSON execution plan including:
    - Intent classification (CONVERSATIONAL, FOLLOW_UP, NEW_QUERY)
    - Sliding chat history context evaluation
    - Retrieval and generation modes
    - Dynamic top_k scope
    """
    fallback_k = evaluate_query_scope_fallback(query)
    
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

    if not groq_client:
        return default_plan

    catalog = get_indexed_document_catalog()

    # Format sliding window (last 6 messages) for context awareness
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

Indexed Documents in Workspace (Filenames & Paper Titles):
{json.dumps(catalog)}

Recent Chat History:
{formatted_history.strip() or "No previous conversation context."}

User Query: "{query}"

JSON Requirements:
1. "intent": 
   - "CONVERSATIONAL": Casual greetings, pleasantries, thank yous, or meta-questions about the AI (e.g., "hi", "thanks", "who are you").
   - "FOLLOW_UP": Query relies on previous chat context or pronouns (e.g., "summarise it", "go on", "why?", "explain that table").
   - "NEW_QUERY": Standalone academic question targeting research documents.
2. "scope": "single" | "named_subset" | "full_corpus"
3. "target_docs": List of matching filenames from the Indexed Documents above that are referenced by title, topic, or filename. If broad or unclear, set to null.
4. "retrieval_mode": 
   - "full_text": User wants a summary/overview/TL;DR of specific document(s).
   - "vector_search": Targeted Q&A or specific factual lookup across documents.
   - "per_document_search": Comparison across multiple papers requiring balanced retrieval.
   - "metadata_only": Questions about workspace stats (e.g., "how many papers", "list my files").
5. "generation_mode":
   - "single_pass": Standard synthesis pass.
   - "map_reduce": Literature review / multi-paper synthesis across 3+ papers.
   - "structured_comparison": Side-by-side comparative analysis of 2+ papers.
   - "no_llm": Direct data response (for metadata questions).
6. "is_meta_query": true if the question can be answered purely by document count/names without reading text.
7. "query_depth": "broad_synthesis" if query asks for summaries, all code blocks, full tables, or paper comparisons. "focused" if query asks a specific targeted question.
8. "recommended_top_k": Integer (18-20 for broad_synthesis, 5-6 for focused).

Return ONLY valid JSON matching this schema.
""".strip()

    try:
        response = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.1-8b-instant",
            temperature=0.0,
            response_format={"type": "json_object"}
        )
        plan = json.loads(response.choices[0].message.content)
        
        # Ensure default intent fallback
        if not plan.get("intent"):
            plan["intent"] = "NEW_QUERY"

        # Fallback target docs if null or empty
        if not plan.get("target_docs"):
            plan["target_docs"] = available_docs
            
        # Ensure top_k fallback if omitted by LLM
        if "recommended_top_k" not in plan:
            plan["recommended_top_k"] = 18 if plan.get("query_depth") == "broad_synthesis" else 6
            
        return plan
    except Exception as e:
        print(f"[Router Warning] Fallback triggered due to classification error: {e}")
        return default_plan