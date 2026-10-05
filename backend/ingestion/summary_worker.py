# backend/ingestion/summary_worker.py

import os
import asyncio
from typing import List, Dict, Any, Optional
from backend.embeddings.vector_store import get_all_chunks_for_doc, search_similar_chunks
from backend.db.document_service import save_cached_document_summary
from backend.rag.runtime import extract_reasoning_and_content, pick_best_model_from_keys
from backend.rag.retriever import build_context_block
from backend.rag.prompt_templates import MAIN_RAG_PROMPT
from litellm import completion


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


def generate_and_cache_summary_sync(doc_name: str, custom_keys: Optional[dict] = None):
    """
    Synchronous background generation of structured document summary.
    Uses pick_best_model_from_keys() to select the best available provider
    from the user's BYOK keys, falling back to .env keys, then Gemini default.
    Works for any provider: Gemini, OpenAI, Anthropic, Groq, OpenRouter, DeepSeek.
    """
    model_name, api_key = pick_best_model_from_keys(custom_keys)
    print(f"[Summary Worker] Generating background summary for '{doc_name}' using {model_name}...")

    sampled_chunks = _extract_landmark_chunks(doc_name)
    if not sampled_chunks:
        print(f"[Summary Worker] No chunks found for '{doc_name}'. Aborting.")
        return

    context_block = build_context_block(sampled_chunks)

    prompt = f"""
{MAIN_RAG_PROMPT}

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
        res = completion(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            api_key=api_key,
            max_tokens=2500,
            drop_params=True,
            reasoning_effort="none",  # Disables thinking token overhead for fast ~2s caching
        )
        summary_content = extract_reasoning_and_content(res).answer
        save_cached_document_summary(doc_name, summary_content)
        print(f"[Summary Worker] Successfully cached summary for '{doc_name}' via {model_name}.")
    except Exception as e:
        print(f"[Summary Worker Error] Failed to generate summary for '{doc_name}' via {model_name}: {e}")


async def trigger_async_summary_generation(doc_name: str, custom_keys: Optional[dict] = None):
    """Dispatches background summary task to the thread executor without blocking the upload response."""
    loop = asyncio.get_running_loop()
    loop.run_in_executor(None, generate_and_cache_summary_sync, doc_name, custom_keys)
