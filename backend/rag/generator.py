import sys
import os
import re
from dotenv import load_dotenv
from litellm import completion

load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.env")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.rag.retriever import retrieve_context, build_context_block
from backend.rag.prompt_templates import (
    construct_prompt, 
    construct_system_prompt,
    build_conversation_messages,
    SOURCE_LOCKED_SYSTEM_PROMPT
)
from backend.embeddings.vector_store import list_indexed_documents
from backend.rag.router import classify_query_intent
from backend.rag.runtime import (
    extract_reasoning_and_content,
    normalize_litellm_model_id,
    provider_from_model,
    build_fallback_chain,
    CONV_MAX_TOKENS,
    RAG_MAX_TOKENS,
)


def _resolve_api_key(provider: str, custom_keys: dict) -> str | None:
    """Finds the provider's custom key, falls back to first available, or reads environment."""
    prov = provider.lower()
    if custom_keys:
        if custom_keys.get(prov):
            return custom_keys[prov]
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


def _execute_completion_with_fallback(
    model_name: str, 
    messages: list, 
    custom_keys: dict,
    temperature: float = 0.0,
    max_tokens: int = RAG_MAX_TOKENS,
):
    """
    Attempts execution with primary model and falls back through compatible, active IDs.
    """
    model_name = normalize_litellm_model_id(model_name)
    primary_provider = provider_from_model(model_name)

    # Active provider fallback chains
    provider_fallbacks = {
        "gemini": [
            model_name,
            "gemini/gemini-3.6-flash",
            "gemini/gemini-2.5-flash",
            "gemini/gemini-3.7-flash",
        ],
        "groq": [
            model_name,
            "groq/llama-3.3-70b-versatile",
            "groq/llama-3.1-8b-instant",
            "groq/qwen/qwen-2.5-32b",
            "groq/deepseek-r1-distill-llama-70b",
        ],
        "openai": [
            model_name,
            "openai/gpt-4o-mini",
            "openai/gpt-4o",
        ],
    }

    candidates = provider_fallbacks.get(primary_provider, [model_name])
    fallback_chain = build_fallback_chain(
        primary=model_name,
        available_models=candidates,
        custom_keys=custom_keys,
    )

    current_messages = list(messages) if messages else []
    last_error = None
    for model in fallback_chain:
        normalized_target = normalize_litellm_model_id(model)
        current_provider = provider_from_model(normalized_target)
        active_key = _resolve_api_key(current_provider, custom_keys)

        call_kwargs = {
            "model": normalized_target,
            "messages": current_messages,
            "api_key": active_key,
            "max_tokens": max_tokens,
            "drop_params": True,
        }

        # Avoid setting sampling parameters on models that deprecate them (like Gemini 3+)
        if "gemini-3" not in normalized_target and "o1" not in normalized_target and "o3" not in normalized_target:
            call_kwargs["temperature"] = temperature

        try:
            return completion(**call_kwargs)
        except Exception as e:
            err_str = str(e)
            print(f"[LLM Warning] Model '{normalized_target}' execution failed: {err_str}")
            last_error = e

            is_recoverable = any(
                code in err_str for code in [
                    "404", "429", "503", 
                    "RESOURCE_EXHAUSTED", "RateLimitError", 
                    "ServiceUnavailableError", "NotFoundError", "quota", "no longer available",
                    "tokens per minute", "TPM", "Request too large"
                ]
            )
            if is_recoverable:
                # If rate limited due to prompt token size, proactively trim prompt for fallback attempt
                if ("tokens per minute" in err_str or "TPM" in err_str or "Request too large" in err_str) and current_messages:
                    trimmed_messages = []
                    for m in current_messages:
                        content = m.get("content", "")
                        if len(content) > 5000:
                            content = content[:4500] + "\n... [Context truncated to comply with provider rate limits]\n### ACADEMIC SYNTHESIS:"
                        trimmed_messages.append({**m, "content": content})
                    current_messages = trimmed_messages

                print(f"[LLM Fallback] Attempting next model in chain...")
                continue
            
            raise e

    raise RuntimeError(f"All model fallbacks failed. Last encountered error: {str(last_error)}")


def execute_map_reduce_synthesis(
    query: str, 
    chunks: list[dict], 
    model_name: str,
    custom_keys: dict | None = None
) -> tuple[str, str]:
    """Executes a 2-stage map-reduce pass over large contexts using LiteLLM."""
    if not chunks:
        return "No relevant document chunks retrieved to perform literature review synthesis.", ""

    keys = custom_keys or {}

    docs_map = {}
    for c in chunks:
        doc_name = c.get("doc_name") or c.get("source") or "Unknown Document"
        text_content = c.get("content") or c.get("text") or ""
        if text_content.strip():
            docs_map.setdefault(doc_name, []).append(text_content)

    if not docs_map:
        return "Failed to extract valid text content from retrieved paper chunks.", ""

    paper_summaries = []
    for doc_name, text_list in docs_map.items():
        doc_context = "\n\n".join(text_list[:12])
        map_prompt = f"""
You are a research analyst. Provide a detailed, structured technical summary of key findings, methodology, and limitations for the paper '{doc_name}' based on these excerpts:

{doc_context}
""".strip()

        try:
            res = _execute_completion_with_fallback(
                model_name=model_name,
                messages=[{"role": "user", "content": map_prompt}],
                custom_keys=keys,
                temperature=0.2,
                max_tokens=2048,
            )
            extracted = extract_reasoning_and_content(res)
            paper_summaries.append(f"### Paper Analysis: {doc_name}\n{extracted.answer}")
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
        final_res = _execute_completion_with_fallback(
            model_name=model_name,
            messages=[{"role": "user", "content": reduce_prompt}],
            custom_keys=keys,
            temperature=0.1,
            max_tokens=RAG_MAX_TOKENS,
        )
        extracted = extract_reasoning_and_content(final_res)
        return extracted.answer, extracted.thinking
    except Exception as e:
        print(f"[Reduce Stage Error]: {str(e)}")
        raise RuntimeError(f"Literature Review Synthesis failed: {str(e)}")


def extract_sources_from_text(text: str, fallback_doc: str | None = None) -> list[dict]:
    """Extracts all document and page references from the answer text to populate sources_used accurately."""
    sources = []
    seen = set()

    # 1. Matches square bracket citations: [doc.pdf, p.X], [doc (3).pdf, p.2, p.22], [doc.pdf, page 40]
    square_pattern = re.compile(
        r"\[\s*([^\]]+?\.(?:pdf|docx|txt|epub|md|PDF|DOCX))\s*(?:,\s*|\s+)(?:p\.?|page|pp\.)?\s*([\d\s,p\.]+?)\s*\]",
        re.IGNORECASE
    )
    for match in square_pattern.finditer(text):
        doc = match.group(1).strip()
        pages_raw = match.group(2)
        page_nums = re.findall(r"\d+", pages_raw)
        for p in page_nums:
            p_int = int(p)
            key = (doc, p_int)
            if key not in seen:
                seen.add(key)
                sources.append({
                    "chunk_id": f"ref_{doc}_{p_int}",
                    "doc_name": doc,
                    "page_number": p_int
                })

    # 2. Matches parenthesis citations: (doc.pdf, p.X)
    paren_pattern = re.compile(
        r"\(\s*([^)]+?\.(?:pdf|docx|txt|epub|md|PDF|DOCX))\s*(?:,\s*|\s+)(?:p\.?|page|pp\.)?\s*([\d\s,p\.]+?)\s*\)",
        re.IGNORECASE
    )
    for match in paren_pattern.finditer(text):
        doc = match.group(1).strip()
        pages_raw = match.group(2)
        page_nums = re.findall(r"\d+", pages_raw)
        for p in page_nums:
            p_int = int(p)
            key = (doc, p_int)
            if key not in seen:
                seen.add(key)
                sources.append({
                    "chunk_id": f"ref_{doc}_{p_int}",
                    "doc_name": doc,
                    "page_number": p_int
                })

    # 3. Matches markdown link anchors: #cite:doc:page
    cite_anchor_pattern = re.compile(r"#cite:([^:]+):(\d+)", re.IGNORECASE)
    for match in cite_anchor_pattern.finditer(text):
        import urllib.parse
        doc = urllib.parse.unquote(match.group(1)).strip()
        p_int = int(match.group(2))
        key = (doc, p_int)
        if key not in seen:
            seen.add(key)
            sources.append({
                "chunk_id": f"ref_{doc}_{p_int}",
                "doc_name": doc,
                "page_number": p_int
            })

    if not sources and fallback_doc:
        sources.append({
            "chunk_id": f"ref_{fallback_doc}_1",
            "doc_name": fallback_doc,
            "page_number": 1
        })

    return sources


from backend.rag.modes import get_mode_config, match_slash_command


def generate_answer(
    query: str, 
    top_k: int = 10, 
    explicit_docs: list[str] | None = None,
    chat_history: list[dict] | None = None,
    model_name: str | None = None,
    custom_keys: dict | None = None,
    mode: str = "research",
    custom_prompt_directive: str | None = None,
    brain_context: str | None = None
) -> dict:
    """Universal RAG inference across any model provider with dynamic key resolution, mode directives & fallback."""
    # Detect inline slash commands (e.g. '/socratic Explain attention')
    detected_mode, stripped_query = match_slash_command(query)
    if detected_mode:
        mode = detected_mode
        clean_query = stripped_query.strip()
    else:
        clean_query = query.strip()

    mode_cfg = get_mode_config(mode)
    mode_temp = mode_cfg.get("temperature", 0.0)
    effective_top_k = mode_cfg.get("top_k", top_k) if top_k == 10 else top_k
    keys = custom_keys or {}

    # 1. Resolve Target Model
    target_model = normalize_litellm_model_id(model_name)
    if not target_model or "llama" in target_model:
        if "gemini" in keys or "google" in keys:
            target_model = "gemini/gemini-3.6-flash"
        elif "openai" in keys:
            target_model = "openai/gpt-4o-mini"
        elif "anthropic" in keys:
            target_model = "anthropic/claude-3-5-haiku-20241022"
        elif "openrouter" in keys:
            target_model = "openrouter/auto"
        elif "groq" in keys:
            target_model = "groq/llama-3.3-70b-versatile"
        else:
            target_model = "gemini/gemini-3.6-flash"

    # 2. Scope to Active Workspace
    active_workspace_docs = explicit_docs if (explicit_docs is not None and len(explicit_docs) > 0) else list_indexed_documents()

    # 3. Classify Intent (Single Pass)
    plan = classify_query_intent(
        query=clean_query, 
        available_docs=active_workspace_docs, 
        chat_history=chat_history,
        model_name=target_model,
        custom_keys=keys
    )

    intent = plan.get("intent", "NEW_QUERY")
    retrieval_mode = plan.get("retrieval_mode")
    print(f"\n[LLM Router] Intent: {intent} | Retrieval Mode: {retrieval_mode} | Targets: {plan.get('target_docs')} | Model: {target_model}")

    # Branch A: Instant Cached Summary Return (FR-11)
    if retrieval_mode == "cached_summary" and plan.get("cached_content"):
        target_doc = (plan.get("target_docs") or ["Document"])[0]
        cached_text = plan.get("cached_content")
        print(f"[Generator] Serving pre-computed summary cache for '{target_doc}' (< 50ms).")
        parsed_sources = extract_sources_from_text(cached_text, fallback_doc=target_doc)
        
        # If in Masterclass Teacher mode, append a Socratic diagnostic check
        final_summary = cached_text
        if mode == "teacher":
            final_summary = f"{cached_text}\n\n---\n### 💡 Socratic Learning Check\nTo begin exploring this work from first principles: **Which core concept or chapter above would you like us to break down and master first?**"

        return {
            "query": query,
            "answer": final_summary,
            "thinking_process": None,
            "sources_used": parsed_sources,
            "mode_applied": mode
        }

    # Branch B: CONVERSATIONAL & GENERAL KNOWLEDGE Intents
    if intent in {"CONVERSATIONAL", "GENERAL_KNOWLEDGE"}:
        if intent == "CONVERSATIONAL":
            conv_sys = "You are ScholarsMate, a collegiate, intelligent AI research assistant. The user is chatting casually, thinking out loud, or sharing project context/goals (e.g. 'I am working on my bachelor's FYP'). Reply naturally, warmly, and concisely like a brilliant human research colleague. If they share an open-ended goal or context, acknowledge it enthusiastically and ask a natural, relevant clarifying question (e.g. what specific topic, domain, or model they are building) to help them plan. Do not dump unprompted dissertations, tables, or robotic headers."
        else:
            conv_sys = "You are ScholarsMate, an elite, helpful academic research AI. Provide a clear, authoritative, and direct answer to the user's question from general scientific and programming knowledge. Avoid repetitive robotic prefixes like 'Academic Synthesis:' and speak naturally. Do not fabricate paper citations."

        if brain_context and brain_context.strip():
            conv_sys = f"{conv_sys}\n\n{brain_context.strip()}"

        conv_messages = [
            {"role": "system", "content": conv_sys}
        ]
        if chat_history:
            for msg in chat_history[-4:]:
                sender = msg.get("sender") if isinstance(msg, dict) else getattr(msg, "sender", "user")
                text = (msg.get("text") if isinstance(msg, dict) else getattr(msg, "text", "")) or ""
                if text.strip():
                    role = "assistant" if sender in ["bot", "assistant"] else "user"
                    conv_messages.append({"role": role, "content": text.strip()})
        if not conv_messages or conv_messages[-1]["role"] != "user":
            conv_messages.append({"role": "user", "content": clean_query})

        res = _execute_completion_with_fallback(
            model_name=target_model,
            messages=conv_messages,
            custom_keys=keys,
            temperature=0.4 if intent == "GENERAL_KNOWLEDGE" else 0.5,
            max_tokens=CONV_MAX_TOKENS,
        )
        extracted = extract_reasoning_and_content(res)
        return {
            "query": query,
            "answer": extracted.answer,
            "thinking_process": extracted.thinking or None,
            "sources_used": [],
            "mode_applied": mode
        }

    # Branch C: Workspace Meta-Query
    if plan.get("is_meta_query"):
        if not active_workspace_docs:
            answer_text = "Your active workspace currently has no documents indexed."
        else:
            answer_text = f"Your active workspace currently contains **{len(active_workspace_docs)} document(s)**:\n" + "\n".join([f"- `{d}`" for d in active_workspace_docs])
        return {
            "query": query,
            "answer": answer_text,
            "thinking_process": None,
            "sources_used": [],
            "mode_applied": mode
        }

    # Early exit safeguard if workspace has no documents
    if explicit_docs is not None and len(explicit_docs) == 0:
        return {
            "query": query,
            "answer": "There are no documents uploaded in this workspace. Please upload research papers to begin.",
            "thinking_process": None,
            "sources_used": [],
            "mode_applied": mode
        }

    # -------------------------------------------------------------------------
    # 4. Retrieve Context
    # -------------------------------------------------------------------------
    retrieved_chunks, plan = retrieve_context(
        query=clean_query,
        top_k=effective_top_k,
        explicit_docs=explicit_docs,
        chat_history=chat_history,
        model_name=target_model,
        custom_keys=keys,
        plan=plan,
    )

    # Branch D: Map-Reduce Synthesis
    if plan.get("generation_mode") == "map_reduce" and len(retrieved_chunks) >= 8:
        answer_text, thinking_text = execute_map_reduce_synthesis(
            clean_query, 
            retrieved_chunks,
            model_name=target_model,
            custom_keys=keys
        )
    else:
        # Branch E: Standard Multi-Turn Synthesis
        context_block = build_context_block(retrieved_chunks)
        messages_payload = build_conversation_messages(
            query=clean_query,
            context_block=context_block,
            chat_history=chat_history,
            mode=mode,
            custom_prompt_directive=custom_prompt_directive,
            brain_context=brain_context
        )

        chat_completion = _execute_completion_with_fallback(
            model_name=target_model,
            messages=messages_payload,
            custom_keys=keys,
            temperature=mode_temp,
            max_tokens=RAG_MAX_TOKENS,
        )
        extracted = extract_reasoning_and_content(chat_completion)
        answer_text = extracted.answer
        thinking_text = extracted.thinking

    # -------------------------------------------------------------------------
    # 5. Source Deduplication
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

    # Merge any explicit citations found directly in the answer text
    text_sources = extract_sources_from_text(answer_text)
    for t_src in text_sources:
        key = (t_src["doc_name"], t_src["page_number"])
        if key not in seen:
            seen.add(key)
            unique_sources.append(t_src)

    # Sort sources cleanly by document name and page number
    unique_sources.sort(key=lambda s: (s.get("doc_name", ""), s.get("page_number", 1)))

    return {
        "query": query,
        "answer": answer_text,
        "thinking_process": thinking_text or None,
        "sources_used": unique_sources,
        "mode_applied": mode
    }