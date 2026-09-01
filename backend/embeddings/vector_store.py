import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import numpy as np
import chromadb
from chromadb.utils import embedding_functions
from langchain_core.documents import Document

DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../chroma_db"))
EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

_embedding_fn = None
_chroma_client = None

def get_embedding_fn():
    global _embedding_fn
    if _embedding_fn is None:
        _embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=EMBEDDING_MODEL_NAME
        )
    return _embedding_fn

def get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=DB_DIR)
    return _chroma_client

def get_or_create_collection(collection_name: str = "scholarsmate_docs"):
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=collection_name,
        embedding_function=get_embedding_fn(),
        metadata={"hnsw:space": "cosine"}
    )


def is_document_already_indexed(file_hash: str, collection_name: str = "scholarsmate_docs") -> bool:
    """FR-08: Checks if chunks matching this SHA-256 hash already exist in ChromaDB."""
    try:
        collection = get_or_create_collection(collection_name)
        existing = collection.get(
            where={"file_hash": file_hash},
            limit=1
        )
        return len(existing["ids"]) > 0
    except Exception as e:
        print(f"Error during deduplication check: {e}")
        return False


def store_chunks(chunks: list[Document], collection_name: str = "scholarsmate_docs", batch_size: int = 500):
    """Inserts or updates document chunks in ChromaDB with safe batching for large books."""
    if not chunks:
        print("No new chunks to store.")
        return

    collection = get_or_create_collection(collection_name)

    documents = [c.page_content for c in chunks]
    metadatas = [c.metadata for c in chunks]
    ids = [c.metadata["chunk_id"] for c in chunks]

    # Safe batched upsert to prevent SQLite variable limits on massive books
    total = len(chunks)
    for i in range(0, total, batch_size):
        end_idx = min(i + batch_size, total)
        collection.upsert(
            ids=ids[i:end_idx],
            documents=documents[i:end_idx],
            metadatas=metadatas[i:end_idx]
        )
        if total > batch_size:
            print(f"ChromaDB batch indexed: {end_idx}/{total} chunks...")

    print(f"Stored/Updated all {len(chunks)} chunks in ChromaDB collection '{collection_name}'.")


def search_similar_chunks(
    query: str, 
    top_k: int = 5, 
    collection_name: str = "scholarsmate_docs", 
    doc_names: list[str] | None = None
):
    """Searches vector store for top-k matching chunks, strictly enforcing document isolation."""
    collection = get_or_create_collection(collection_name)
    
    where_clause = None

    if doc_names is not None:
        clean_docs = [d for d in doc_names if d and isinstance(d, str)]
        
        # Edge case: empty workspace
        if len(clean_docs) == 0:
            return {"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}
        
        if len(clean_docs) == 1:
            where_clause = {"source": clean_docs[0]}
        else:
            where_clause = {"source": {"$in": clean_docs}}

    results = collection.query(
        query_texts=[query],
        n_results=top_k,
        where=where_clause
    )
    return results


def get_all_chunks_for_doc(
    doc_name: str, 
    collection_name: str = "scholarsmate_docs", 
    max_chunks: int = 250
) -> list[dict]:
    """Retrieves all chunks belonging to a specific document ordered by page number."""
    collection = get_or_create_collection(collection_name)
    results = collection.get(
        where={"source": doc_name},
        include=["documents", "metadatas"],
        limit=max_chunks
    )
    
    chunks = []
    if results and results.get("documents"):
        for text, meta in zip(results["documents"], results["metadatas"]):
            chunks.append({
                "chunk_id": meta.get("chunk_id", "Unknown"),
                "doc_name": meta.get("source", doc_name),
                "page_number": meta.get("page_number", 1),
                "content": text
            })
    
    chunks.sort(key=lambda x: x["page_number"])
    return chunks


def list_indexed_documents(collection_name: str = "scholarsmate_docs") -> list[str]:
    """Returns a sorted list of unique source filenames stored in ChromaDB."""
    try:
        collection = get_or_create_collection(collection_name)
        data = collection.get(include=["metadatas"], limit=10000)
        if not data or not data.get("metadatas"):
            return []

        unique_docs = set()
        for meta in data["metadatas"]:
            if meta and "source" in meta:
                unique_docs.add(meta["source"])
        return sorted(list(unique_docs))
    except Exception as e:
        print(f"Error listing documents: {e}")
        return []


def get_indexed_document_catalog(collection_name: str = "scholarsmate_docs") -> list[dict]:
    """Returns a list of dicts with source filenames and their actual paper titles."""
    try:
        collection = get_or_create_collection(collection_name)
        data = collection.get(include=["metadatas"], limit=10000)
        if not data or not data.get("metadatas"):
            return []
        
        catalog = {}
        for meta in data["metadatas"]:
            if meta and "source" in meta:
                source = meta["source"]
                title = meta.get("paper_title", source)
                catalog[source] = title
                
        return [{"filename": src, "title": ttl} for src, ttl in catalog.items()]
    except Exception as e:
        print(f"Error reading catalog: {e}")
        return []


if __name__ == "__main__":
    from backend.ingestion.pipeline import process_path

    if len(sys.argv) > 1:
        target = sys.argv[1]
        print(f"Processing path: '{target}'...")
        doc_chunks = process_path(target)
        if doc_chunks:
            store_chunks(doc_chunks)
            print(f"Done! {len(doc_chunks)} chunks stored.")
        else:
            print("No new PDF chunks needed indexing.")
    else:
        print("Usage: python -m backend.embeddings.vector_store <path_to_pdf_or_folder>")