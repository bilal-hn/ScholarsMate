import sys
import os
import re

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.embeddings.vector_store import (
    search_similar_chunks,
    get_all_chunks_for_doc,
    list_indexed_documents
)
from backend.rag.router import classify_query_intent, groq_client
from backend.rag.prompt_templates import QUERY_REWRITE_PROMPT


def rewrite_query_with_history(query: str, chat_history: list[dict] = None) -> str:
    """FR-05.2: Rewrites ambiguous follow-up queries into standalone search queries using sliding context.
    
    Filters out conversational greetings and sanitizes quotes to prevent hallucinated search queries.
    """
    clean_query = query.strip()
    if not chat_history or len(chat_history) == 0 or not groq_client:
        return clean_query

    # Filter out casual bot pleasantries from context to avoid rewriting greetings into research queries
    filtered_history = []
    for msg in chat_history[-6:]:
        sender = msg.get("sender") if isinstance(msg, dict) else getattr(msg, "sender", "user")
        text = msg.get("text") if isinstance(msg, dict) else getattr(msg, "text", "")
        
        # Skip pure conversational greetings
        if any(greet in text.lower() for greet in ["how may i assist", "hello! i'm scholarsmate", "good day"]):
            continue
        
        role = "User" if sender == "user" else "Assistant"
        filtered_history.append(f"{role}: {text}")

    if not filtered_history:
        return clean_query

    formatted_history = "\n".join(filtered_history)

    try:
        prompt = f"""
You are an academic search query optimizer for a research document RAG system.
Given the conversation context and a user query, determine if the query is a follow-up referring to previous topics/papers.

Rules:
1. If the user query is a standalone question or general summary request (e.g., "summarise the paper", "give summary of the full paper"), DO NOT inject conversational greetings, pleasantries, or random names from chat history.
2. If the user refers to pronouns or previous context (e.g., "explain its results", "why did they use it?"), resolve the pronoun using the conversation context.
3. Return ONLY the search query string. Do NOT add explanations, quotes, or markdown formatting.

Recent Conversation:
{formatted_history.strip()}

User Query: {clean_query}

Standalone Search Query:
""".strip()

        response = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.1-8b-instant",
            temperature=0.0,
            max_tokens=80
        )
        rewritten = response.choices[0].message.content.strip()

        # Clean outer single/double quotes, newlines, and trailing punctuation
        rewritten = re.sub(r'^["\']|["\']$', '', rewritten).strip()

        # Fallback to original query if rewriter produced empty or excessively short text
        if not rewritten or len(rewritten) < 3:
            return clean_query

        print(f"\n[F-05 Query Rewriter] Raw: '{clean_query}' -> Standalone: '{rewritten}'")
        return rewritten
    except Exception as e:
        print(f"[F-05 Query Rewriter Error]: {str(e)}")
        return clean_query


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
    explicit_docs: list[str] | None = None,
    chat_history: list[dict] | None = None
) -> tuple[list[dict], dict]:
    """Dynamically retrieves context based on execution plan or explicit UI document parameters."""
    
    # Step 0: Rewrite follow-up query to be standalone before routing & searching
    search_query = rewrite_query_with_history(query, chat_history)

    available_docs = list_indexed_documents(collection_name)
    
    # Strictly respect explicit_docs if supplied by the active frontend workspace filter
    if explicit_docs is not None:
        target_docs = [d for d in explicit_docs if d]
    else:
        target_docs = available_docs

    # Return empty list immediately if active workspace has no documents
    if not target_docs:
        print("\n[Execution Plan] Workspace is empty. Returning empty context.")
        return [], {"intent": "NEW_QUERY", "target_docs": []}

    # 1. Get Execution Plan from Router using standalone query AND chat_history
    plan = classify_query_intent(search_query, target_docs, chat_history)

    retrieval_mode = plan.get("retrieval_mode", "vector_search")
    effective_top_k = plan.get("recommended_top_k", top_k)

    print(f"\n[Execution Plan] Intent: {plan.get('intent')} | Retrieval Mode: {retrieval_mode} | Generation Mode: {plan.get('generation_mode')} | Targets: {target_docs} | Effective top_k: {effective_top_k}")

    all_chunks = {}

    # Strategy A: Full Text / Overview Extraction (Summaries)
    if retrieval_mode == "full_text" and target_docs:
        for doc in target_docs:
            doc_chunks = get_all_chunks_for_doc(doc_name=doc, collection_name=collection_name)
            
            # Prioritize early chunks (Abstract, Intro, Table of Contents) for full summaries
            for c in doc_chunks:
                all_chunks[c["chunk_id"]] = c
                
        chunks_list = list(all_chunks.values())
        # Cap to 30 chunks max to prevent blowing LLM context windows
        return chunks_list[:30], plan

    # Strategy B: Per-Document Balanced Search (Multi-Paper Comparison)
    if retrieval_mode == "per_document_search" and target_docs:
        per_doc_k = max(3, effective_top_k // len(target_docs))
        for doc in target_docs:
            results = search_similar_chunks(query=search_query, top_k=per_doc_k, collection_name=collection_name, doc_names=[doc])
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
    search_queries = expand_query(search_query)
    for q in search_queries:
        results = search_similar_chunks(query=q, top_k=effective_top_k, collection_name=collection_name, doc_names=target_docs)
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

    return list(all_chunks.values())[:effective_top_k], plan


def build_context_block(chunks: list[dict]) -> str:
    """Formats retrieved chunks into a standard source-locked prompt context block."""
    if not chunks:
        return "No relevant document context found."

    lines = []
    for c in chunks:
        lines.append(f"--- [Document: {c['doc_name']} | Page: {c['page_number']} | Chunk Tag: {c['chunk_id']}] ---\n{c['content']}\n")
    return "\n".join(lines)