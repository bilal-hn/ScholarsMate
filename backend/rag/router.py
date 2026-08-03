import sys
import os
import json
from groq import Groq

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.embeddings.vector_store import get_indexed_document_catalog, list_indexed_documents

api_key = os.getenv("GROQ_API_KEY")
groq_client = Groq(api_key=api_key) if api_key else None


def classify_query_intent(query: str, available_docs: list[str]) -> dict:
    """Uses Groq (Llama 3.1 8B) to output a structured JSON execution plan."""
    if not groq_client:
        return {
            "scope": "full_corpus",
            "target_docs": available_docs,
            "retrieval_mode": "vector_search",
            "generation_mode": "single_pass",
            "is_meta_query": False
        }

    catalog = get_indexed_document_catalog()

    prompt = f"""
You are an academic query execution planner for a multi-document RAG system.
Analyze the user query and output a JSON execution plan.

Indexed Documents in Workspace (Filenames & Paper Titles):
{json.dumps(catalog)}

User Query: "{query}"

JSON Requirements:
1. "scope": "single" | "named_subset" | "full_corpus"
2. "target_docs": List of matching filenames from the Indexed Documents above that are referenced by title, topic, or filename in the user query. If broad or unclear, set to null.
3. "retrieval_mode": 
   - "full_text": User wants a summary/overview/TL;DR of specific document(s).
   - "vector_search": Targeted Q&A or specific factual lookup across documents.
   - "per_document_search": Comparison across multiple papers requiring balanced retrieval.
   - "metadata_only": Questions about workspace stats (e.g., "how many papers", "list my files").
4. "generation_mode":
   - "single_pass": Standard synthesis pass.
   - "map_reduce": Literature review / multi-paper synthesis across 3+ papers.
   - "structured_comparison": Side-by-side comparative analysis of 2+ papers.
   - "no_llm": Direct data response (for metadata questions).
5. "is_meta_query": true if the question can be answered purely by document count/names without reading text.

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
        
        # Fallback target docs if null or empty
        if not plan.get("target_docs"):
            plan["target_docs"] = available_docs
            
        return plan
    except Exception as e:
        print(f"[Router Warning] Fallback triggered due to classification error: {e}")
        return {
            "scope": "full_corpus",
            "target_docs": available_docs,
            "retrieval_mode": "vector_search",
            "generation_mode": "single_pass",
            "is_meta_query": False
        }
    
    