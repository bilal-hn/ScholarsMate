import sys
import os

# Ensure root directory is on sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.embeddings.vector_store import search_similar_chunks


def retrieve_context(query: str, top_k: int = 5, collection_name: str = "scholarsmate_docs") -> list[dict]:
    """Retrieves top-k matching chunks from ChromaDB and formats them with metadata."""
    results = search_similar_chunks(query=query, top_k=top_k, collection_name=collection_name)
    
    formatted_chunks = []
    
    if not results or not results.get("documents") or not results["documents"][0]:
        return formatted_chunks

    docs = results["documents"][0]
    metadatas = results["metadatas"][0]

    for doc_text, meta in zip(docs, metadatas):
        formatted_chunks.append({
            "chunk_id": meta.get("chunk_id", "Unknown"),
            "doc_name": meta.get("source", "Unknown"),
            "page_number": meta.get("page_number", 0),
            "content": doc_text
        })

    return formatted_chunks


def build_context_block(chunks: list[dict]) -> str:
    """Formats retrieved chunks into a structured string block for prompt injection."""
    if not chunks:
        return "No relevant documents found."

    context_lines = []
    for c in chunks:
        header = f"--- [Document: {c['doc_name']} | Page: {c['page_number']} | Tag: {c['chunk_id']}] ---"
        context_lines.append(f"{header}\n{c['content']}\n")

    return "\n".join(context_lines)


if __name__ == "__main__":
    test_query = "What is the primary contribution of this work?"
    print(f"Retrieving context for: '{test_query}'...")
    chunks = retrieve_context(test_query, top_k=3)
    block = build_context_block(chunks)
    print("\nFormatted Context Block:\n")
    print(block)