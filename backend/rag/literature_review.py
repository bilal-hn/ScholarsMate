import sys
import os
import json
import re
from typing import List, Dict, Any, Tuple
from litellm import completion

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.embeddings.vector_store import (
    search_similar_chunks,
    get_all_chunks_for_doc,
    list_indexed_documents
)
from backend.rag.retriever import build_context_block
from backend.rag.runtime import (
    extract_reasoning_and_content,
    normalize_litellm_model_id,
    provider_from_model,
    build_fallback_chain,
    pack_chunks,
    parse_json_object,
    RAG_MAX_TOKENS,
)
from backend.rag.prompt_templates import SOURCE_LOCKED_SYSTEM_PROMPT


def _resolve_key(provider: str, custom_keys: dict | None = None) -> str | None:
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


def _clean_markdown_section_output(text: str) -> str:
    """Strips leading duplicated H1 (#) or H2 (##) headings produced by the LLM."""
    if not text:
        return ""
    lines = text.strip().split("\n")
    while lines and (lines[0].strip().startswith("# ") or lines[0].strip().startswith("## ")):
        lines.pop(0)
    return "\n".join(lines).strip()


def _execute_review_call(
    prompt: str,
    model_name: str,
    custom_keys: dict | None = None,
    system_prompt: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.2
) -> str:
    """Executes a single step in the review pipeline with fallback support."""
    normalized_model = normalize_litellm_model_id(model_name)
    provider = provider_from_model(normalized_model)
    active_key = _resolve_key(provider, custom_keys)

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    call_kwargs = {
        "model": normalized_model,
        "messages": messages,
        "api_key": active_key,
        "max_tokens": max_tokens,
        "drop_params": True,
    }
    if "o1" not in normalized_model and "o3" not in normalized_model:
        call_kwargs["temperature"] = temperature

    try:
        res = completion(**call_kwargs)
        return extract_reasoning_and_content(res).answer
    except Exception as e:
        print(f"[Review Stage Warning] Call failed on '{normalized_model}': {e}")
        fallback_candidates = [
            "gemini/gemini-3.7-flash",
            "gemini/gemini-3.6-flash",
            "groq/compound-mini",
            "openai/gpt-4o-mini"
        ]
        chain = build_fallback_chain(normalized_model, fallback_candidates, custom_keys)
        for fb_model in chain[1:]:
            fb_prov = provider_from_model(fb_model)
            fb_key = _resolve_key(fb_prov, custom_keys)
            try:
                call_kwargs["model"] = fb_model
                call_kwargs["api_key"] = fb_key
                res = completion(**call_kwargs)
                return extract_reasoning_and_content(res).answer
            except Exception:
                continue
        raise e


# =============================================================================
# STAGE 1: THEMATIC OUTLINE & TAXONOMY PLANNER
# =============================================================================

def _generate_editorial_outline(
    target_docs: List[str],
    research_focus: str,
    model_name: str,
    custom_keys: dict | None = None
) -> Dict[str, Any]:
    """Inspects overview chunks across papers and creates a structured 5-section roadmap."""
    doc_profiles = []
    for doc in target_docs:
        chunks = get_all_chunks_for_doc(doc_name=doc)
        overview_text = "\n\n".join([c.get("content", "") for c in chunks[:3]])
        doc_profiles.append(f"### Document: {doc}\n{overview_text[:1800]}")

    combined_overview = "\n\n".join(doc_profiles)

    planner_prompt = f"""
You are the Lead Academic Editor structuring a multi-paper Literature Review Monograph for ScholarsMate.
Analyze the provided document overviews and produce a structured JSON roadmap containing exactly 5 sections.

Included Papers in Workspace:
{', '.join(target_docs)}

User Specific Research Focus:
{research_focus or 'Comprehensive comparative synthesis of methodologies, architectures, benchmarks, and critical gaps.'}

Document Overviews:
{combined_overview}

Instructions:
1. Define 5 sequential sections:
   - Section 1: Executive Abstract & Theoretical Foundations
   - Section 2: Methodological Taxonomy & Architectural Frameworks
   - Section 3: Thematic Synthesis & Comparative Analysis
   - Section 4: Empirical Benchmarks, Datasets & Quantitative Evaluation
   - Section 5: Critical Limitations, Research Gaps & Open Trajectories
2. For each section, provide:
   - 'section_number': integer (1-5)
   - 'title': Academic title
   - 'focus_directive': Precise analytical instructions for what to compare
   - 'search_keywords': 3 specific semantic retrieval queries to execute against the vector database

Output ONLY a valid JSON object matching this schema:
{{
  "monograph_title": "string",
  "sections": [
    {{
      "section_number": 1,
      "title": "string",
      "focus_directive": "string",
      "search_keywords": ["query 1", "query 2", "query 3"]
    }}
  ]
}}
""".strip()

    raw_json = _execute_review_call(
        prompt=planner_prompt,
        model_name=model_name,
        custom_keys=custom_keys,
        system_prompt="You output strictly valid JSON editorial plans for research literature reviews.",
        max_tokens=2048,
        temperature=0.1
    )

    try:
        return parse_json_object(raw_json)
    except Exception:
        return {
            "monograph_title": f"Literature Review: Synthesis Across {len(target_docs)} Papers",
            "sections": [
                {
                    "section_number": 1,
                    "title": "Executive Abstract & Theoretical Foundations",
                    "focus_directive": "Synthesize underlying theories, conceptual origins, and problem definitions.",
                    "search_keywords": ["theoretical foundation introduction background problem formulation"]
                },
                {
                    "section_number": 2,
                    "title": "Methodological Taxonomy & Architectural Frameworks",
                    "focus_directive": "Compare system design, adaptation mechanisms, and algorithmic workflows.",
                    "search_keywords": ["methodology algorithm architecture pipeline topology"]
                },
                {
                    "section_number": 3,
                    "title": "Thematic Synthesis & Comparative Analysis",
                    "focus_directive": "Contrast architectural paradigms, qualitative tradeoffs, and core capabilities.",
                    "search_keywords": ["comparative analysis trade-offs techniques mechanisms"]
                },
                {
                    "section_number": 4,
                    "title": "Empirical Benchmarks, Datasets & Quantitative Evaluation",
                    "focus_directive": "Compare experimental suites, performance metrics, and quantitative evaluation.",
                    "search_keywords": ["datasets benchmark results evaluation metrics performance"]
                },
                {
                    "section_number": 5,
                    "title": "Critical Limitations, Research Gaps & Open Trajectories",
                    "focus_directive": "Identify unaddressed vulnerabilities, scaling bottlenecks, and future research paths.",
                    "search_keywords": ["limitations error failures open problems future research"]
                }
            ]
        }


# =============================================================================
# STAGE 2 & 3: STATEFUL SECTION DRAFTING & RETRIEVAL
# =============================================================================

def _draft_section(
    section_meta: Dict[str, Any],
    target_docs: List[str],
    rolling_memory: str,
    research_focus: str,
    model_name: str,
    custom_keys: dict | None = None
) -> Tuple[str, List[Dict[str, Any]]]:
    """Performs targeted vector search and drafts a complete section using rolling context."""
    search_queries = section_meta.get("search_keywords", [section_meta.get("title", "")])
    retrieved_chunks_map = {}

    for q in search_queries:
        for doc in target_docs:
            results = search_similar_chunks(query=q, top_k=3, doc_names=[doc])
            if results and results.get("documents") and results["documents"][0]:
                for text, meta in zip(results["documents"][0], results["metadatas"][0]):
                    cid = meta.get("chunk_id", "Unknown")
                    if cid not in retrieved_chunks_map:
                        retrieved_chunks_map[cid] = {
                            "chunk_id": cid,
                            "doc_name": meta.get("source", doc),
                            "page_number": meta.get("page_number", 1),
                            "content": text
                        }

    packed_chunks = pack_chunks(list(retrieved_chunks_map.values()), max_tokens=4500)
    context_block = build_context_block(packed_chunks)

    draft_prompt = f"""
{SOURCE_LOCKED_SYSTEM_PROMPT}

You are writing Section {section_meta.get('section_number', 1)}: "{section_meta.get('title', '')}" of a formal publication-grade Literature Review Monograph.

CORE RESEARCH FOCUS:
{research_focus or 'Comparative analysis of methodologies, architectures, benchmarks, and critical gaps.'}

PREVIOUS SECTIONS SUMMARY (MEMORY BUFFER):
{rolling_memory or 'This is Section 1. No prior sections drafted.'}

RETRIEVED SOURCE EVIDENCE FROM PAPERS:
{context_block}

SECTION DIRECTIVE:
{section_meta.get('focus_directive', 'Synthesize and contrast the evidence across papers.')}

CRITICAL FORMATTING & COMPLETION RULES:
1. Write a dense, rigorous academic section (~600-800 words).
2. Ensure every paragraph is fully completed. DO NOT stop mid-sentence.
3. Explicitly cite documents and pages using standard inline tags: `[DocumentName, p.X]`.
4. Highlight agreements, divergences, and technical trade-offs across the papers.
5. Do NOT include the main section header (e.g., do NOT start with '# Section X' or '## Section X').
6. Use Level-3 Markdown headers (###) to organize internal sub-topics.
""".strip()

    section_text = _execute_review_call(
        prompt=draft_prompt,
        model_name=model_name,
        custom_keys=custom_keys,
        max_tokens=3500,
        temperature=0.2
    )

    return section_text, packed_chunks


# =============================================================================
# STAGE 4: METHODOLOGICAL COMPARISON MATRIX EXTRACTOR
# =============================================================================

def _generate_comparison_matrix(
    target_docs: List[str],
    model_name: str,
    custom_keys: dict | None = None
) -> str:
    """Extracts a structured markdown table comparing all included workspace documents."""
    doc_contexts = []
    for doc in target_docs:
        results = search_similar_chunks(query="methodology dataset baseline results limitations architecture", top_k=5, doc_names=[doc])
        texts = results["documents"][0] if results and results.get("documents") else []
        doc_contexts.append(f"### Paper: {doc}\n" + "\n".join(texts[:4]))

    combined = "\n\n".join(doc_contexts)

    table_prompt = f"""
Analyze the retrieved excerpts from the following papers and output a complete Markdown Comparative Matrix Table covering EVERY paper listed below.

PAPERS TO INCLUDE ({len(target_docs)} Total):
{', '.join(target_docs)}

PAPER EXCERPTS:
{combined}

REQUIRED FORMAT:
| Paper / Citation | Core Methodology & Architecture | Primary Datasets / Benchmarks | Key Strengths | Critical Limitations |
| :--- | :--- | :--- | :--- | :--- |

CRITICAL RULES:
1. You MUST include exactly one complete row for EACH of the {len(target_docs)} papers.
2. Ensure all rows and table cells are fully closed. Do NOT cut off mid-row.
3. Be concise, technical, and precise.
4. Include exact inline citations (e.g., `[DocumentName, p.X]`).
5. Output ONLY the markdown table.
""".strip()

    return _execute_review_call(
        prompt=table_prompt,
        model_name=model_name,
        custom_keys=custom_keys,
        max_tokens=3500,
        temperature=0.1
    )


# =============================================================================
# STAGE 5: MAIN ORCHESTRATION PIPELINE
# =============================================================================

def generate_literature_review(
    doc_names: List[str] | None = None,
    research_focus: str = "",
    depth: str = "detailed",
    model_name: str = "gemini/gemini-3.7-flash",
    custom_keys: dict | None = None
) -> Dict[str, Any]:
    """
    Main entry point for generating formal Literature Reviews.
    Supports 'executive' (fast single-pass) and 'detailed' (5-stage iterative monograph).
    """
    available_docs = list_indexed_documents()
    target_docs = [d for d in (doc_names or available_docs) if d in available_docs]

    if not target_docs:
        return {
            "error": "No indexed research papers found in workspace to synthesize.",
            "content": "Please upload PDF documents to your workspace before generating a literature review."
        }

    keys = custom_keys or {}
    target_model = normalize_litellm_model_id(model_name)

    print(f"\n[Literature Review Studio] Starting {depth.upper()} synthesis across {len(target_docs)} papers using {target_model}...")

    # --- FAST EXECUTIVE MODE ---
    if depth == "executive" or len(target_docs) == 1:
        matrix_table = _generate_comparison_matrix(target_docs, target_model, keys)
        
        chunks = []
        for doc in target_docs:
            doc_chunks = get_all_chunks_for_doc(doc_name=doc)
            chunks.extend(doc_chunks[:5])

        context_block = build_context_block(pack_chunks(chunks, max_tokens=4000))
        exec_prompt = f"""
{SOURCE_LOCKED_SYSTEM_PROMPT}

Provide an Executive Academic Literature Review across these papers:
{', '.join(target_docs)}

RESEARCH FOCUS:
{research_focus or 'High-level synthesis of findings and methodological contrasts.'}

DOCUMENT EVIDENCE:
{context_block}

OUTPUT STRUCTURE:
1. Executive Abstract & Summary of Contributions
2. Synthesis of Core Themes
3. Key Limitations

Do NOT include the table; it will be appended automatically.
""".strip()

        raw_content = _execute_review_call(exec_prompt, target_model, keys, max_tokens=3000)
        clean_content = _clean_markdown_section_output(raw_content)
        
        final_exec_text = f"# Executive Literature Review: {len(target_docs)} Paper(s)\n\n{clean_content}\n\n### Methodological Comparison Matrix\n\n{matrix_table}"

        return {
            "title": f"Executive Literature Review: {len(target_docs)} Paper(s)",
            "content": final_exec_text,
            "depth": "executive",
            "doc_names": target_docs,
            "sources_used": [{"doc_name": d, "page_number": 1} for d in target_docs]
        }

    # --- IN-DEPTH 5-STAGE MONOGRAPH MODE ---
    outline = _generate_editorial_outline(target_docs, research_focus, target_model, keys)
    monograph_title = outline.get("monograph_title", f"Literature Review: Synthesis Across {len(target_docs)} Papers")
    sections_plan = outline.get("sections", [])

    compiled_sections = []
    all_used_chunks = []
    rolling_memory = ""

    for idx, sec in enumerate(sections_plan):
        sec_title = sec.get("title", f"Section {idx + 1}")
        print(f"[Review Pipeline] Drafting Section {idx + 1}/5: '{sec_title}'...")
        
        raw_sec_text, used_chunks = _draft_section(
            section_meta=sec,
            target_docs=target_docs,
            rolling_memory=rolling_memory,
            research_focus=research_focus,
            model_name=target_model,
            custom_keys=keys
        )
        
        clean_sec_body = _clean_markdown_section_output(raw_sec_text)
        compiled_sections.append(f"## Section {idx + 1}: {sec_title}\n\n{clean_sec_body}")
        all_used_chunks.extend(used_chunks)

        # Update rolling memory buffer for subsequent section awareness
        summary_snippet = clean_sec_body[:350] + "..." if len(clean_sec_body) > 350 else clean_sec_body
        rolling_memory += f"\n- Section {idx + 1} ({sec_title}): {summary_snippet}"

        # Insert Methodological Matrix immediately after Section 2 (Taxonomy)
        if idx == 1:
            print("[Review Pipeline] Extracting Complete Methodological Matrix Table...")
            matrix_table = _generate_comparison_matrix(target_docs, target_model, keys)
            clean_matrix = _clean_markdown_section_output(matrix_table)
            compiled_sections.append(f"### Comprehensive Methodological Comparison Matrix\n\n{clean_matrix}")

    # Monograph Assembly
    full_monograph_text = f"# {monograph_title}\n\n"
    if research_focus:
        full_monograph_text += f"> **Primary Research Directive:** {research_focus}\n\n---\n\n"

    full_monograph_text += "\n\n---\n\n".join(compiled_sections)

    # Extract Unique Cited Sources
    unique_sources = []
    seen = set()
    for c in all_used_chunks:
        key = (c.get("doc_name", ""), c.get("page_number", 1))
        if key not in seen and key[0]:
            seen.add(key)
            unique_sources.append({"doc_name": key[0], "page_number": key[1]})

    return {
        "title": monograph_title,
        "content": full_monograph_text,
        "depth": "detailed",
        "doc_names": target_docs,
        "sources_used": unique_sources
    }