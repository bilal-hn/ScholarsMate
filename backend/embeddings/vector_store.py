import sys
import os

# Automatically append the project root directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import numpy as np
import chromadb
from chromadb.utils import embedding_functions
from langchain_core.documents import Document

# Path where local ChromaDB database files will live on disk
DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../chroma_db"))

# Local, lightweight embedding model (runs completely offline on CPU)
EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name=EMBEDDING_MODEL_NAME
)

# Persistent local client
chroma_client = chromadb.PersistentClient(path=DB_DIR)


def get_or_create_collection(collection_name: str = "scholarsmate_docs"):
    """Fetches or creates a ChromaDB collection using local embeddings."""
    return chroma_client.get_or_create_collection(
        name=collection_name,
        embedding_function=embedding_fn,
        metadata={"hnsw:space": "cosine"}
    )


def store_chunks(chunks: list[Document], collection_name: str = "scholarsmate_docs"):
    """Ingests LangChain Document chunks into ChromaDB and computes paper centroids."""
    if not chunks:
        print("No chunks provided for storage.")
        return

    collection = get_or_create_collection(collection_name)

    ids = [chunk.metadata["chunk_id"] for chunk in chunks]
    documents = [chunk.page_content for chunk in chunks]
    metadatas = [chunk.metadata for chunk in chunks]

    print(f"Storing {len(chunks)} chunks in ChromaDB at '{DB_DIR}'...")
    
    # Store text chunks and metadata into ChromaDB
    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas
    )

    # Compute per-paper centroid vector for graph features
    compute_paper_centroids(chunks, collection)
    print("Ingestion into ChromaDB complete.")


def compute_paper_centroids(chunks: list[Document], collection):
    """Calculates the average embedding vector per paper and logs it."""
    paper_chunks_map = {}
    for chunk in chunks:
        doc_name = chunk.metadata["source"]
        chunk_id = chunk.metadata["chunk_id"]
        paper_chunks_map.setdefault(doc_name, []).append(chunk_id)

    for doc_name, chunk_ids in paper_chunks_map.items():
        # Fetch embeddings calculated by ChromaDB
        results = collection.get(ids=chunk_ids, include=["embeddings"])
        embeddings = results.get("embeddings")

        if embeddings is not None and len(embeddings) > 0:
            centroid = np.mean(embeddings, axis=0).tolist()
            print(f"Calculated centroid vector for '{doc_name}' ({len(embeddings)} chunks).")


def search_similar_chunks(query: str, top_k: int = 5, collection_name: str = "scholarsmate_docs"):
    """Searches vector store for top-k most relevant chunks matching a query."""
    collection = get_or_create_collection(collection_name)
    results = collection.query(
        query_texts=[query],
        n_results=top_k
    )
    return results


if __name__ == "__main__":
    from backend.ingestion.pipeline import process_path

    if len(sys.argv) > 1:
        target = sys.argv[1]
        print(f"Running ingestion pipeline on: {target}")
        doc_chunks = process_path(target)
        
        # Store in ChromaDB
        store_chunks(doc_chunks)
        
        # Isolated test query
        test_query = "What is the primary contribution or topic discussed?"
        print(f"\n--- Testing Retrieval for Query: '{test_query}' ---")
        retrieved = search_similar_chunks(test_query, top_k=3)
        
        for i, (doc, meta) in enumerate(zip(retrieved['documents'][0], retrieved['metadatas'][0])):
            print(f"\nResult {i+1} [{meta['chunk_id']}]:")
            print(f"Text Preview:\n{doc[:250]}...")