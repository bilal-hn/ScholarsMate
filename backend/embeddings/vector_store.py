import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import numpy as np
import chromadb
from chromadb.utils import embedding_functions
from langchain_core.documents import Document

DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../chroma_db"))
EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name=EMBEDDING_MODEL_NAME
)

chroma_client = chromadb.PersistentClient(path=DB_DIR)


def get_or_create_collection(collection_name: str = "scholarsmate_docs"):
    return chroma_client.get_or_create_collection(
        name=collection_name,
        embedding_function=embedding_fn,
        metadata={"hnsw:space": "cosine"}
    )


def search_similar_chunks(
    query: str, 
    top_k: int = 5, 
    collection_name: str = "scholarsmate_docs",
    doc_names: list[str] | None = None
):
    """Searches vector store for top-k matching chunks, with optional document filtering."""
    collection = get_or_create_collection(collection_name)
    
    where_clause = None
    if doc_names:
        clean_docs = [d for d in doc_names if d]
        if len(clean_docs) == 1:
            where_clause = {"source": clean_docs[0]}
        elif len(clean_docs) > 1:
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
    max_chunks: int = 25
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
    
    # Sort by page number
    chunks.sort(key=lambda x: x["page_number"])
    return chunks


def list_indexed_documents(collection_name: str = "scholarsmate_docs") -> list[str]:
    """Returns a list of unique document filenames stored in ChromaDB."""
    try:
        collection = get_or_create_collection(collection_name)
        # Pass a higher limit or fetch all metadatas explicitly
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