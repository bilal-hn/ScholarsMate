import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.embeddings.vector_store import (
    search_similar_chunks,
    get_all_chunks_for_doc,
    list_indexed_documents
)
from backend.rag.router import classify_query_intent, groq_client


def expand_query(original_query: str) -> list[str]:
    """Generates search variations to maximize vector database recall."""
    if not groq_client:
        return [original_query]

    prompt = f"""
    Generate 2 alternative, highly specific academic search queries for: "{original_query}".
    Return ONLY the queries, one per line. No numbering, no comments.
    """.strip()

    try:
        response = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.1-8b-instant",
            temperature=0.2,
        )
        variations = [line.strip() for line in response.choices[0].message.content.split("\n") if line.strip()]
        return [original_query] + variations[:2]
    except Exception:
        return [original_query]


def retrieve_context(
    query: str, 
    top_k: int = 10, 
    collection_name: str = "scholarsmate_docs",
    explicit_docs: list[str] | None = None
) -> tuple[list[dict], dict]:
    """Dynamically retrieves context based on execution plan or explicit UI document parameters."""
    available_docs = list_indexed_documents(collection_name)
    
    # 1. Get Execution Plan from Router
    plan = classify_query_intent(query, available_docs)
    
    # Override target_docs if explicit UI selections were provided
    target_docs = explicit_docs if (explicit_docs and len(explicit_docs) > 0) else plan.get("target_docs", available_docs)
    retrieval_mode = plan.get("retrieval_mode", "vector_search")

    print(f"\n[Execution Plan] Retrieval Mode: {retrieval_mode} | Generation Mode: {plan.get('generation_mode')} | Targets: {target_docs}")

    all_chunks = {}

    # Strategy A: Full Text Extraction (Single/Multi Summary)
    if retrieval_mode == "full_text" and target_docs:
        for doc in target_docs:
            doc_chunks = get_all_chunks_for_doc(doc_name=doc, collection_name=collection_name)
            for c in doc_chunks:
                all_chunks[c["chunk_id"]] = c
        return list(all_chunks.values()), plan

    # Strategy B: Per-Document Balanced Search (Comparison)
    if retrieval_mode == "per_document_search" and target_docs:
        per_doc_k = max(3, top_k // len(target_docs))
        for doc in target_docs:
            results = search_similar_chunks(query=query, top_k=per_doc_k, collection_name=collection_name, doc_names=[doc])
            if results and results.get("documents") and results["documents"][0]:
                for text, meta in zip(results["documents"][0], results["metadatas"][0]):
                    cid = meta.get("chunk_id", "Unknown")
                    all_chunks[cid] = {
                        "chunk_id": cid,
                        "doc_name": meta.get("source", doc),
                        "page_number": meta.get("page_number", 1),
                        "content": text
                    }
        return list(all_chunks.values()), plan

    # Strategy C: Standard Vector Search with Query Expansion
    search_queries = expand_query(query)
    for q in search_queries:
        results = search_similar_chunks(query=q, top_k=top_k, collection_name=collection_name, doc_names=target_docs)
        if results and results.get("documents") and results["documents"][0]:
            for text, meta in zip(results["documents"][0], results["metadatas"][0]):
                cid = meta.get("chunk_id", "Unknown")
                if cid not in all_chunks:
                    all_chunks[cid] = {
                        "chunk_id": cid,
                        "doc_name": meta.get("source", "Unknown"),
                        "page_number": meta.get("page_number", 1),
                        "content": text
                    }

    return list(all_chunks.values())[:top_k], plan


def build_context_block(chunks: list[dict]) -> str:
    if not chunks:
        return "No relevant document context found."

    lines = []
    for c in chunks:
        lines.append(f"--- [Document: {c['doc_name']} | Page: {c['page_number']} | Chunk Tag: {c['chunk_id']}] ---\n{c['content']}\n")
    return "\n".join(lines)