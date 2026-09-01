# backend/ingestion/summary_worker.py

import os
import asyncio
from typing import List, Dict, Any
from backend.embeddings.vector_store import get_all_chunks_for_doc, search_similar_chunks
from backend.db.document_service import save_cached_document_summary
from backend.rag.runtime import extract_reasoning_and_content, normalize_litellm_model_id
from backend.rag.retriever import build_context_block
from backend.rag.prompt_templates import SOURCE_LOCKED_SYSTEM_PROMPT
from litellm import completion


def _resolve_worker_api_key(model_name: str) -> str | None:
    """Resolves the proper API key for the background worker based on model provider."""
    model_lower = model_name.lower()
    if "gemini" in model_lower or "google" in model_lower:
        return os.getenv("GEMINI_API_KEY")
    if "groq" in model_lower:
        return os.getenv("GROQ_API_KEY")
    if "openai" in model_lower:
        return os.getenv("OPENAI_API_KEY")
    if "anthropic" in model_lower:
        return os.getenv("ANTHROPIC_API_KEY")
    if "deepseek" in model_lower:
        return os.getenv("DEEPSEEK_API_KEY")
    return os.getenv("OPENROUTER_API_KEY")


def _extract_landmark_chunks(doc_name: str) -> List[Dict[str, Any]]:
    """Samples key structural landmarks: Intro/Abstract, Methods, Results, Limitations."""
    all_chunks = get_all_chunks_for_doc(doc_name=doc_name)
    if not all_chunks:
        return []

    if len(all_chunks) <= 6:
        return all_chunks

    sampled_chunks = []
    # 1. Beginning chunks (Abstract, Intro, Problem Statement)
    sampled_chunks.extend(all_chunks[:2])

    # 2. Targeted semantic samples for Methodology & Results
    probes = [
        "methodology architecture dataset",
        "empirical results performance benchmark",
        "limitations open research"
    ]
    for query in probes:
        res = search_similar_chunks(query=query, top_k=2, doc_names=[doc_name])
        if res and res.get("documents") and res["documents"][0]:
            for text, meta in zip(res["documents"][0], res["metadatas"][0]):
                chunk_obj = {
                    "chunk_id": meta.get("chunk_id", "Unknown"),
                    "doc_name": meta.get("source", doc_name),
                    "page_number": meta.get("page_number", 1),
                    "content": text
                }
                if not any(c["chunk_id"] == chunk_obj["chunk_id"] for c in sampled_chunks):
                    sampled_chunks.append(chunk_obj)

    # 3. Final chunk (Conclusion)
    if all_chunks[-1] not in sampled_chunks:
        sampled_chunks.append(all_chunks[-1])

    return sampled_chunks


def generate_and_cache_summary_sync(doc_name: str, model_name: str = "gemini/gemini-3.6-flash"):
    """Synchronous background generation of structured document summary."""
    print(f"[Summary Worker] Generating background landmark summary for '{doc_name}' using {model_name}...")
    sampled_chunks = _extract_landmark_chunks(doc_name)
    if not sampled_chunks:
        print(f"[Summary Worker] No chunks found for '{doc_name}'. Aborting.")
        return

    context_block = build_context_block(sampled_chunks)

    prompt = f"""
{SOURCE_LOCKED_SYSTEM_PROMPT}

You are creating a comprehensive, clear, and well-structured summary for the document: "{doc_name}".

RETRIEVED SOURCE EXCERPTS:
{context_block}

INSTRUCTIONS FOR ADAPTIVE SUMMARY:
1. **Document-Type Awareness:**
   - Detect the nature of this document (e.g., Empirical Research Paper, Textbook/Monograph, Technical Report, Literature/Narrative, or General Document).
   - Tailor your summary structure naturally to match what the document actually is.
   - NEVER force non-empirical documents into machine learning / CS paper schemas.
   - NEVER fabricate mathematical formulas, LaTeX equations, or artificial benchmark tables if they are not explicitly present in the source text.

2. **Clean & Natural Structure:**
   Use clean, intuitive Markdown headings such as:
   - **Overview & Core Focus:** What this work is, its primary motivation or premise, and scope.
   - **Key Concepts & Structural Framework:** The main ideas, methodologies, architecture, or narrative systems discussed.
   - **Major Findings & Practical Takeaways:** The core insights, empirical results, or practical implications.
   - **Limitations & Considerations:** Any open challenges, constraints, or nuances noted in the text.

3. **Grounding & Citations:**
   - Support factual statements, quotes, and specific concepts with inline page citations: `[{doc_name}, p.X]`.
   - For empirical research papers that include real formulas or benchmark data in the text, present them cleanly with math notation or tables. For non-mathematical texts, explain the concepts purely in articulate, natural prose.
""".strip()
    try:
        norm_model = normalize_litellm_model_id(model_name)
        active_key = _resolve_worker_api_key(norm_model)

        call_kwargs = {
            "model": norm_model,
            "messages": [{"role": "user", "content": prompt}],
            "api_key": active_key,
            "max_tokens": 2500,
            "drop_params": True,
            "reasoning_effort": "none"  # Disables thinking token overhead for fast ~2s caching
        }

        res = completion(**call_kwargs)
        summary_content = extract_reasoning_and_content(res).answer
        save_cached_document_summary(doc_name, summary_content)
        print(f"[Summary Worker] Successfully generated and cached summary for '{doc_name}'.")
    except Exception as e:
        print(f"[Summary Worker Error] Failed to generate summary for '{doc_name}': {e}")


async def trigger_async_summary_generation(doc_name: str, model_name: str = "gemini/gemini-3.6-flash"):
    """Dispatches background task to event loop without blocking upload."""
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, generate_and_cache_summary_sync, doc_name, model_name)