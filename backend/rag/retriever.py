import sys
import os
from groq import Groq

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.embeddings.vector_store import search_similar_chunks, get_or_create_collection

api_key = os.getenv("GROQ_API_KEY")
groq_client = Groq(api_key=api_key) if api_key else None


def expand_query(original_query: str) -> list[str]:
    """Generates search variations to maximize vector database recall."""
    if not groq_client:
        return [original_query]

    prompt = f"""
    You are an academic retrieval optimizer. Given the user query, generate 2 alternative, 
    highly specific search queries targeting research paper terminology (looking for methodologies, contributions, results).
    Return ONLY the queries, one per line. No numbering, no introductory text.

    User Query: {original_query}
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


def get_first_page_chunks(collection_name: str = "scholarsmate_docs", limit: int = 3) -> list[dict]:
    """Directly fetches Page 1 & Page 2 chunks to ensure abstract/intro context is available for global questions."""
    try:
        collection = get_or_create_collection(collection_name)
        # Fetch chunks where page_number is 1 or 2
        results = collection.get(
            where={"page_number": {"$in": [1, 2]}},
            include=["documents", "metadatas"],
            limit=limit
        )
        
        first_page_chunks = []
        if results and results.get("documents"):
            for doc_text, meta in zip(results["documents"], results["metadatas"]):
                first_page_chunks.append({
                    "chunk_id": meta.get("chunk_id", "Unknown"),
                    "doc_name": meta.get("source", "Unknown"),
                    "page_number": meta.get("page_number", 1),
                    "content": doc_text,
                })
        return first_page_chunks
    except Exception:
        return []


def retrieve_context(query: str, top_k: int = 8, collection_name: str = "scholarsmate_docs") -> list[dict]:
    """Retrieves context across expanded queries and injects page 1 chunks for summary questions."""
    queries = expand_query(query)
    all_retrieved = {}

    # Check if query is asking for high-level paper overview
    summary_keywords = ["contribution", "summary", "overview", "abstract", "propose", "main goal", "objective"]
    is_summary_query = any(kw in query.lower() for kw in summary_keywords)

    # 1. If it's a summary query, inject Page 1 & 2 chunks first
    if is_summary_query:
        fp_chunks = get_first_page_chunks(collection_name=collection_name)
        for c in fp_chunks:
            all_retrieved[c["chunk_id"]] = c

    # 2. Vector search across expanded queries
    for q in queries:
        results = search_similar_chunks(query=q, top_k=top_k, collection_name=collection_name)
        if results and results.get("documents") and results["documents"][0]:
            docs = results["documents"][0]
            metadatas = results["metadatas"][0]

            for doc_text, meta in zip(docs, metadatas):
                chunk_id = meta.get("chunk_id", "Unknown")
                if chunk_id not in all_retrieved:
                    all_retrieved[chunk_id] = {
                        "chunk_id": chunk_id,
                        "doc_name": meta.get("source", "Unknown"),
                        "page_number": meta.get("page_number", 0),
                        "content": doc_text,
                    }

    return list(all_retrieved.values())[:top_k]


def build_context_block(chunks: list[dict]) -> str:
    """Formats retrieved chunks into a clean, structured block for prompt injection."""
    if not chunks:
        return "No relevant documents found."

    context_lines = []
    for c in chunks:
        header = f"--- [Document: {c['doc_name']} | Page: {c['page_number']} | Chunk Tag: {c['chunk_id']}] ---"
        context_lines.append(f"{header}\n{c['content']}\n")

    return "\n".join(context_lines)