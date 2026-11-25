"""
Academic Reasoning Modes & Presets
Defines metadata, parameter presets, and guidelines for 2 primary modes:
1. Paper Assistant (assistant) - Strict Document RAG (Default)
2. General Assistant (general) - Hybrid RAG (Document Context + General Knowledge)
"""

from typing import Dict, Any, List

ACADEMIC_MODES: Dict[str, Dict[str, Any]] = {
    "assistant": {
        "id": "assistant",
        "name": "Paper Assistant",
        "short_name": "Paper Assistant",
        "icon": "FileText",
        "badge_color": "blue",
        "tagline": "Strict document RAG: 100% grounded in your uploaded papers with exact citations",
        "description": "Direct, evidence-locked answers strictly sourced from your documents with page citations [Doc, p.X].",
        "temperature": 0.1,
        "top_k": 8,
        "slash_commands": ["/paper", "/assistant", "/strict", "/ask", "/doc", "/read"],
        "prompt_directive": """
### Mode Guidelines: [Paper Assistant - Strict Document RAG]
You are ScholarsMate's Paper Assistant, dedicated strictly to answering from the user's uploaded materials.
- Answer solely and strictly using evidence from the retrieved document excerpts.
- You must answer strictly from the user's uploaded documents. If a question is not covered in the retrieved excerpts or uploaded documents, state clearly that the uploaded documents do not contain this information, and do not answer using general pre-trained knowledge.
- Append precise inline citations [Doc_Name, p.X] to every factual assertion, finding, and equation.
- Zero Hallucination & Strict Refusal: If an answer cannot be determined from the uploaded documents, state clearly that the materials do not contain this information. Do not extrapolate using outside general knowledge.
- Scope: If the request is unrelated to research, study or academic writing, reply in one or two friendly sentences saying ScholarsMate focuses on research and study, and offer a related academic angle if there is one. Do not answer the off-topic request itself.
- Integrity: If the user asks you to produce work they will submit as their own (for example an exam essay), decline politely and offer to outline, critique or explain instead.
""".strip(),
    },
    "general": {
        "id": "general",
        "name": "General Assistant",
        "short_name": "General Assistant",
        "icon": "Sparkles",
        "badge_color": "purple",
        "tagline": "Hybrid RAG: Relates your documents to broader theory, background, & general knowledge",
        "description": "Answers questions using your documents as context while freely explaining background concepts, code, and out-of-scope topics.",
        "temperature": 0.3,
        "top_k": 6,
        "slash_commands": ["/general", "/chat", "/hybrid", "/askall", "/explore"],
        "prompt_directive": """
### Mode Guidelines: [General Assistant - Hybrid Document & World Knowledge]
You are ScholarsMate's General Assistant, a versatile, intellectually rich research and study partner.
- Hybrid Grounding: Use the retrieved document excerpts as your primary anchor, but freely draw upon your broader pre-trained technical, scientific, mathematical, and coding knowledge.
- Contextual Bridging: When the user asks about concepts, prerequisites, or topics not explicitly defined in their papers (e.g. background theory, intuitive explanations, implementation code, comparisons with other methods), provide a comprehensive, helpful answer and relate it back to their uploaded documents wherever relevant.
- Citations: When citing or quoting specific findings, data points, or claims from the uploaded papers, append [Doc_Name, p.X]. For general knowledge, explain clearly without artificial citations.
- Never refuse simply because a topic is not in the uploaded documents, as long as it relates to research, study or academic work.
- Scope: If the request is unrelated to research, study or academic writing, reply in one or two friendly sentences saying ScholarsMate focuses on research and study, and offer a related academic angle if there is one. Do not answer the off-topic request itself.
- Integrity: If the user asks you to produce work they will submit as their own (for example an exam essay), decline politely and offer to outline, critique or explain instead.
""".strip(),
    },
}

# Backward-compatibility alias dictionary
MODE_ALIASES: Dict[str, str] = {
    # Paper Assistant aliases (strict)
    "paper": "assistant",
    "paper_assistant": "assistant",
    "strict": "assistant",
    "research": "assistant",
    "deep": "assistant",
    "academic": "assistant",
    "standard": "assistant",
    "student": "assistant",
    "overview": "assistant",
    "default": "assistant",
    "doc": "assistant",
    "document": "assistant",
    "reviewer": "assistant",
    "executive": "assistant",
    "survey": "assistant",
    "synth": "assistant",
    "brief": "assistant",

    # General Assistant aliases (hybrid)
    "general": "general",
    "general_assistant": "general",
    "chat": "general",
    "hybrid": "general",
    "teacher": "general",
    "teach": "general",
    "socratic": "general",
    "tutor": "general",
    "learn": "general",
    "feynman": "general",
    "explore": "general",
}


def get_mode_config(mode_id: str | None) -> Dict[str, Any]:
    """Retrieves mode configuration with alias resolution and safe fallback to 'assistant'."""
    if not mode_id:
        return ACADEMIC_MODES["assistant"]
    clean_id = mode_id.strip().lower()
    resolved_id = MODE_ALIASES.get(clean_id, clean_id)
    return ACADEMIC_MODES.get(resolved_id, ACADEMIC_MODES["assistant"])


def match_slash_command(query: str) -> tuple[str | None, str]:
    """
    Checks if the user query starts with a registered slash command (e.g. '/teach ...' or '/research ...').
    Returns (matched_mode_id, cleaned_query_without_command).
    """
    if not query or not query.strip().startswith("/"):
        return None, query

    parts = query.strip().split(maxsplit=1)
    first_word = parts[0].lower()
    remainder = parts[1].strip() if len(parts) > 1 else ""

    for mode_id, mode_cfg in ACADEMIC_MODES.items():
        if first_word in [cmd.lower() for cmd in mode_cfg.get("slash_commands", [])]:
            return mode_id, remainder

    # Check aliases
    clean_cmd = first_word.lstrip("/")
    if clean_cmd in MODE_ALIASES:
        return MODE_ALIASES[clean_cmd], remainder

    return None, query


def list_available_modes() -> List[Dict[str, Any]]:
    """Returns serialized mode list for frontend selector UI."""
    return [
        {
            "id": m["id"],
            "name": m["name"],
            "short_name": m["short_name"],
            "icon": m["icon"],
            "badge_color": m["badge_color"],
            "tagline": m["tagline"],
            "description": m["description"],
            "slash_commands": m["slash_commands"],
        }
        for m in ACADEMIC_MODES.values()
    ]
