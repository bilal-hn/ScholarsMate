import sys
import os
from dotenv import load_dotenv
from litellm import completion

load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.env")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.rag.retriever import retrieve_context, build_context_block
from backend.rag.prompt_templates import construct_prompt, SOURCE_LOCKED_SYSTEM_PROMPT
from backend.embeddings.vector_store import list_indexed_documents
from backend.rag.router import classify_query_intent


def _resolve_api_key(provider: str, custom_keys: dict) -> str | None:
    """
    Finds the provider's custom key, falls back to any available custom key,
    or checks server environment variables.
    """
    prov = provider.lower()
    if custom_keys:
        if custom_keys.get(prov):
            return custom_keys[prov]
        # Fallback to the first available custom key if specific provider key isn't mapped
        for k, v in custom_keys.items():
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
    env_var = env_map.get(prov, f"{prov.upper()}_API_KEY")
    return os.getenv(env_var)


def execute_map_reduce_synthesis(
    query: str, 
    chunks: list[dict], 
    model_name: str,
    custom_keys: dict | None = None
) -> str:
    """Executes a 2-stage map-reduce pass over large contexts using LiteLLM."""
    if not chunks:
        return "No relevant document chunks retrieved to perform literature review synthesis."

    keys = custom_keys or {}
    provider = model_name.split("/")[0] if "/" in model_name else "gemini"
    api_key = _resolve_api_key(provider, keys)

    docs_map = {}
    for c in chunks:
        doc_name = c.get("doc_name") or c.get("source") or "Unknown Document"
        text_content = c.get("content") or c.get("text") or ""
        if text_content.strip():
            docs_map.setdefault(doc_name, []).append(text_content)

    if not docs_map:
        return "Failed to extract valid text content from retrieved paper chunks."

    paper_summaries = []
    for doc_name, text_list in docs_map.items():
        doc_context = "\n\n".join(text_list[:12])
        map_prompt = f"""
You are a research analyst. Provide a detailed, structured technical summary of key findings, methodology, and limitations for the paper '{doc_name}' based on these excerpts:

{doc_context}
""".strip()

        try:
            res = completion(
                model=model_name,
                messages=[{"role": "user", "content": map_prompt}],
                api_key=api_key,
                temperature=0.2
            )
            paper_summaries.append(f"### Paper Analysis: {doc_name}\n{res.choices[0].message.content}")
        except Exception as e:
            print(f"[Map Stage Error] {doc_name}: {str(e)}")
            paper_summaries.append(f"### Paper Analysis: {doc_name}\nExtraction unavailable due to model error.")

    combined_summaries = "\n\n".join(paper_summaries)
    reduce_prompt = f"""
{SOURCE_LOCKED_SYSTEM_PROMPT}

### INDIVIDUAL PAPER EXTRACTIONS:
{combined_summaries}

---
### USER LITERATURE REVIEW REQUEST:
{query}

### SYNTHESIZED LITERATURE REVIEW:
Provide a publication-grade Literature Review featuring:
1. Abstract & Executive Summary
2. Methodological Comparison Matrix (Markdown Table: Document | Methodology | Strengths | Limitations)
3. Thematic Synthesis & Contrastive Analysis
4. Identified Research Gaps
""".strip()

    try:
        final_res = completion(
            model=model_name,
            messages=[{"role": "user", "content": reduce_prompt}],
            api_key=api_key,
            temperature=0.1
        )
        return final_res.choices[0].message.content
    except Exception as e:
        print(f"[Reduce Stage Error]: {str(e)}")
        raise RuntimeError(f"Literature Review Synthesis failed: {str(e)}")


def generate_answer(
    query: str, 
    top_k: int = 10, 
    explicit_docs: list[str] | None = None,
    chat_history: list[dict] | None = None,
    model_name: str | None = None,
    custom_keys: dict | None = None
) -> dict:
    """Universal RAG inference across any model provider with dynamic key resolution."""
    clean_query = query.strip()
    keys = custom_keys or {}

    # 1. Resolve Target Model Dynamically
    target_model = model_name
    if not target_model or target_model == "groq/llama-3.3-70b-versatile":
        if "gemini" in keys:
            target_model = "gemini/gemini-1.5-flash"
        elif "openai" in keys:
            target_model = "openai/gpt-4o-mini"
        elif "anthropic" in keys:
            target_model = "anthropic/claude-3-5-haiku-20241022"
        elif "openrouter" in keys:
            target_model = "openrouter/auto"
        else:
            target_model = model_name or "gemini/gemini-1.5-flash"

    # Extract provider prefix
    provider = target_model.split("/")[0] if "/" in target_model else "gemini"
    active_key = _resolve_api_key(provider, keys)

    # -------------------------------------------------------------------------
    # 0. Single-Pass LLM Intent & Execution Router (Scoped to Active Workspace)
    # -------------------------------------------------------------------------
    active_workspace_docs = explicit_docs if (explicit_docs is not None and len(explicit_docs) > 0) else list_indexed_documents()

    # Pass dynamic model and keys into router to prevent router fallback crashes
    try:
        plan = classify_query_intent(
            query=clean_query, 
            available_docs=active_workspace_docs, 
            chat_history=chat_history,
            model_name=target_model,
            custom_keys=keys
        )
    except TypeError:
        # Fallback if classify_query_intent has legacy signature
        plan = classify_query_intent(
            query=clean_query, 
            available_docs=active_workspace_docs, 
            chat_history=chat_history
        )

    intent = plan.get("intent", "NEW_QUERY")
    print(f"\n[LLM Router] Intent: {intent} | Retrieval Mode: {plan.get('retrieval_mode')} | Targets: {plan.get('target_docs')} | Model: {target_model}")

    # Branch A: CONVERSATIONAL Intent
    if intent == "CONVERSATIONAL":
        conv_prompt = f"You are ScholarsMate, a helpful academic research AI. Reply politely and concisely to: '{clean_query}'"
        res = completion(
            model=target_model,
            messages=[{"role": "user", "content": conv_prompt}],
            api_key=active_key,
            temperature=0.5,
            max_tokens=150
        )
        return {
            "query": query,
            "answer": res.choices[0].message.content,
            "sources_used": []
        }

    # Branch B: Workspace Meta-Query
    if plan.get("is_meta_query"):
        if not active_workspace_docs:
            answer_text = "Your active workspace currently has no documents indexed."
        else:
            answer_text = f"Your active workspace currently contains **{len(active_workspace_docs)} document(s)**:\n" + "\n".join([f"- `{d}`" for d in active_workspace_docs])
        return {
            "query": query,
            "answer": answer_text,
            "sources_used": []
        }

    # Early exit safeguard if workspace has no documents
    if explicit_docs is not None and len(explicit_docs) == 0:
        return {
            "query": query,
            "answer": "There are no documents uploaded in this workspace. Please upload research papers to begin.",
            "sources_used": []
        }

    # -------------------------------------------------------------------------
    # 1. Retrieve Context
    # -------------------------------------------------------------------------
    retrieved_chunks, _ = retrieve_context(
        query=clean_query, 
        top_k=top_k, 
        explicit_docs=explicit_docs,
        chat_history=chat_history
    )

    # Branch C: Map-Reduce Synthesis
    if plan.get("generation_mode") == "map_reduce" and len(retrieved_chunks) >= 8:
        answer_text = execute_map_reduce_synthesis(
            clean_query, 
            retrieved_chunks,
            model_name=target_model,
            custom_keys=keys
        )
    else:
        # Branch D: Standard Synthesis using the dynamic Model
        context_block = build_context_block(retrieved_chunks)
        full_prompt = construct_prompt(query=clean_query, context_block=context_block)

        chat_completion = completion(
            model=target_model,
            messages=[{"role": "user", "content": full_prompt}],
            api_key=active_key,
            temperature=0.0
        )
        answer_text = chat_completion.choices[0].message.content

    # -------------------------------------------------------------------------
    # 2. Source Deduplication
    # -------------------------------------------------------------------------
    raw_sources = [
        {
            "chunk_id": c.get("chunk_id", ""),
            "doc_name": c.get("doc_name", "Unknown Document"),
            "page_number": c.get("page_number", 1)
        }
        for c in retrieved_chunks
    ]

    unique_sources = []
    seen = set()
    for src in raw_sources:
        key = (src["doc_name"], src["page_number"])
        if key not in seen:
            seen.add(key)
            unique_sources.append(src)

    return {
        "query": query,
        "answer": answer_text,
        "sources_used": unique_sources
    }