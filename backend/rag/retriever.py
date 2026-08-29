import sys
import os
import re
from litellm import completion

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.embeddings.vector_store import (
    search_similar_chunks,
    get_all_chunks_for_doc,
    list_indexed_documents
)
from backend.rag.router import classify_query_intent
from backend.rag.runtime import (
    extract_reasoning_and_content,
    normalize_litellm_model_id,
    pack_chunks,
    REWRITE_MAX_TOKENS,
)


def _resolve_retriever_key(provider: str, custom_keys: dict | None = None) -> str | None:
    """Resolves provider key from custom_keys or environment variables."""
    prov = provider.lower()
    keys = custom_keys or {}
    if keys:
        if keys.get(prov):
            return keys[prov]
        for k, v in keys.items():
            if v and v.strip():
                return v.strip()

    env_map = {
        "groq": "GROQ_API_KEY",
        "gemini": "GEMINI_API_KEY",
        "google": "GEMINI_API_KEY",
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "deepseek": "DEEPSEEK_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
    }
    return os.getenv(env_map.get(prov, f"{prov.upper()}_API_KEY"))


def rewrite_query_with_history(
    query: str, 
    chat_history: list[dict] | None = None,
    model_name: str = "gemini/gemini-2.5-flash",
    custom_keys: dict | None = None
) -> str:
    """FR-05.2: Rewrites ambiguous follow-up queries into standalone search queries."""
    clean_query = query.strip()
    if not chat_history or len(chat_history) == 0:
        return clean_query

    # Skip conversational greetings
    lowered = clean_query.lower()
    if lowered in ["hi", "hello", "hey", "help", "who are you", "what can you do", "thanks", "thank you"]:
        return clean_query

    # Filter out casual bot pleasantries from context
    filtered_history = []
    for msg in chat_history[-6:]:
        sender = msg.get("sender") if isinstance(msg, dict) else getattr(msg, "sender", "user")
        text = msg.get("text") if isinstance(msg, dict) else getattr(msg, "text", "")
        
        if any(greet in text.lower() for greet in ["how may i assist", "hello! i'm scholarsmate", "good day"]):
            continue
        
        role = "User" if sender == "user" else "Assistant"
        filtered_history.append(f"{role}: {text}")

    if not filtered_history:
        return clean_query

    formatted_history = "\n".join(filtered_history)

    prompt = f"""
You are an academic search query optimizer for a research document RAG system.
Given the conversation context and a user query, determine if the query is a follow-up referring to previous topics/papers.

Rules:
1. If the user query is a standalone question or general summary request, DO NOT inject conversational greetings or random names.
2. If the user refers to pronouns or previous context (e.g., "explain its results", "why did they use it?"), resolve the pronoun using the conversation context.
3. If the user asks for clarification, simpler explanation, or expresses confusion (e.g., "i dont understand", "explain simpler", "give an example", "what does that mean", "why?", "tell me more"), rewrite it into an explicit search query targeting the specific concepts, mechanisms, or papers discussed in the immediate previous turn.
4. Return ONLY the search query string. Do NOT add explanations, quotes, or markdown formatting.

Recent Conversation:
{formatted_history.strip()}

User Query: {clean_query}

Standalone Search Query:
""".strip()

    try:
        provider = model_name.split("/")[0] if "/" in model_name else "gemini"
        active_key = _resolve_retriever_key(provider, custom_keys)

        res = completion(
            model=normalize_litellm_model_id(model_name),
            messages=[
                {
                    "role": "system",
                    "content": "Rewrite follow-up questions into standalone search queries. Return only the query string.",
                },
                {"role": "user", "content": prompt},
            ],
            api_key=active_key,
            temperature=0.0,
            max_tokens=REWRITE_MAX_TOKENS,
            drop_params=True,
            reasoning_effort="none",
        )
        rewritten = extract_reasoning_and_content(res).answer
        rewritten = re.sub(r'^["\']|["\']$', '', rewritten).strip()

        if not rewritten or len(rewritten) < 3:
            return clean_query

        print(f"\n[F-05 Query Rewriter] Raw: '{clean_query}' -> Standalone: '{rewritten}'")
        return rewritten
    except Exception as e:
        print(f"[F-05 Query Rewriter Notice] Using raw query: {str(e)}")
        return clean_query


def expand_query(
    original_query: str,
    model_name: str = "gemini/gemini-2.5-flash",
    custom_keys: dict | None = None
) -> list[str]:
    """Generates search variations to maximize vector database recall."""
    lowered = original_query.lower().strip()
    if lowered in ["hi", "hello", "hey", "help", "who are you"]:
        return [original_query]

    prompt = f"""
Generate 2 alternative, highly specific academic search queries for: "{original_query}".
Return ONLY the queries, one per line. No numbering, no comments.
""".strip()

    try:
        provider = model_name.split("/")[0] if "/" in model_name else "gemini"
        active_key = _resolve_retriever_key(provider, custom_keys)

        res = completion(
            model=normalize_litellm_model_id(model_name),
            messages=[
                {
                    "role": "system",
                    "content": "Return only alternative search queries, one per line, with no commentary.",
                },
                {"role": "user", "content": prompt},
            ],
            api_key=active_key,
            temperature=0.2,
            max_tokens=REWRITE_MAX_TOKENS,
            drop_params=True,
            reasoning_effort="none",
        )
        body = extract_reasoning_and_content(res).answer
        variations = [line.strip(" -•\t") for line in body.split("\n") if line.strip()]
        return [original_query] + variations[:2]
    except Exception:
        return [original_query]


def retrieve_context(
    query: str, 
    top_k: int = 10, 
    collection_name: str = "scholarsmate_docs",
    explicit_docs: list[str] | None = None,
    chat_history: list[dict] | None = None,
    model_name: str = "gemini/gemini-2.5-flash",
    custom_keys: dict | None = None,
    plan: dict | None = None,
) -> tuple[list[dict], dict]:
    """Retrieves context using a precomputed execution plan (classify once per turn)."""
    available_docs = list_indexed_documents(collection_name)

    # Strictly respect explicit_docs if supplied by active workspace
    if explicit_docs is not None:
        target_docs = [d for d in explicit_docs if d]
    else:
        target_docs = available_docs

    if not target_docs:
        print("\n[Execution Plan] Workspace is empty. Returning empty context.")
        return [], plan or {"intent": "NEW_QUERY", "target_docs": []}

    # Classify only when the caller did not already produce a plan
    if plan is None:
        plan = classify_query_intent(
            query=query,
            available_docs=target_docs,
            chat_history=chat_history,
            model_name=model_name,
            custom_keys=custom_keys,
        )

    intent = plan.get("intent", "NEW_QUERY")

    # Rewrite pronouns only for follow-ups; standalone queries search as written
    search_query = query
    if intent == "FOLLOW_UP":
        search_query = rewrite_query_with_history(
            query=query,
            chat_history=chat_history,
            model_name=model_name,
            custom_keys=custom_keys,
        )

    retrieval_mode = plan.get("retrieval_mode", "vector_search")
    target_docs = [d for d in (plan.get("target_docs") or target_docs) if d] or target_docs
    if retrieval_mode == "full_text" and len(target_docs) > 1:
        retrieval_mode = "per_document_search"
    effective_top_k = plan.get("recommended_top_k", top_k)

    print(
        f"\n[Execution Plan] Intent: {intent} | Rewrite: {intent == 'FOLLOW_UP'} | "
        f"Search query: '{search_query}' | Retrieval Mode: {retrieval_mode} | "
        f"Generation Mode: {plan.get('generation_mode')} | Targets: {target_docs} | "
        f"Effective top_k: {effective_top_k}"
    )

    # Safety net if conversational/meta accidentally reach retrieval
    if intent == "CONVERSATIONAL" or plan.get("is_meta_query"):
        return [], plan

    all_chunks = {}

    # Strategy A: Full Text / Overview Extraction (Summaries)
    if retrieval_mode == "full_text" and target_docs:
        for doc in target_docs:
            doc_chunks = get_all_chunks_for_doc(doc_name=doc, collection_name=collection_name)
            for c in doc_chunks:
                all_chunks[c["chunk_id"]] = c
                
        return pack_chunks(list(all_chunks.values())), plan

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
        return pack_chunks(list(all_chunks.values())), plan

    # Strategy C: Standard Vector Search with Query Expansion
    search_queries = expand_query(search_query, model_name=model_name, custom_keys=custom_keys)
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

    return pack_chunks(list(all_chunks.values())[: max(effective_top_k * 3, effective_top_k)]), plan


def build_context_block(chunks: list[dict], max_context_tokens: int = 4200) -> str:
    """Formats retrieved chunks into a standard source-locked prompt context block with token budgeting."""
    if not chunks:
        return "No relevant document context found."

    lines = []
    current_tokens = 0

    for c in chunks:
        content = c.get("content", "").strip()
        doc_name = c.get("doc_name", "Unknown Document")
        page_num = c.get("page_number", 1)
        chunk_id = c.get("chunk_id", f"chunk_{page_num}")

        # Rough token estimation (~1.33 tokens per word)
        chunk_words = content.split()
        chunk_tokens = max(1, int(len(chunk_words) * 1.33))

        # If adding full chunk exceeds budget, truncate the last chunk to fit
        if current_tokens + chunk_tokens > max_context_tokens:
            remaining_tokens = max(0, max_context_tokens - current_tokens)
            if remaining_tokens > 150:
                allowed_words = int(remaining_tokens / 1.33)
                truncated_content = " ".join(chunk_words[:allowed_words]) + " ... [excerpt trimmed for token budget]"
                lines.append(f"--- [Document: {doc_name} | Page: {page_num} | Chunk Tag: {chunk_id}] ---\n{truncated_content}\n")
            break

        lines.append(f"--- [Document: {doc_name} | Page: {page_num} | Chunk Tag: {chunk_id}] ---\n{content}\n")
        current_tokens += chunk_tokens

    return "\n".join(lines)