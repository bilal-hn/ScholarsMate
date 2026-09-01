"""
FR-14: Human-Centered Academic Cognitive Modes
Defines metadata, parameter presets, and detailed prompt directives for 3 core humanized modes:
1. Paper Assistant (assistant) - DEFAULT
2. Deep Research (research)
3. Masterclass Teacher (teacher) - Powered by amosblomqvist/learn First-Principles philosophy.
"""

from typing import Dict, Any, List

ACADEMIC_MODES: Dict[str, Dict[str, Any]] = {
    "assistant": {
        "id": "assistant",
        "name": "Paper Assistant",
        "short_name": "Paper Assistant",
        "icon": "FileText",
        "badge_color": "blue",
        "tagline": "Fast, clear answers grounded directly in your uploaded papers",
        "description": "Direct, easy-to-read answers from your documents with clean citations and practical explanations.",
        "temperature": 0.1,
        "top_k": 6,
        "slash_commands": ["/ask", "/paper", "/assistant", "/study", "/read", "/overview", "/default"],
        "prompt_directive": """
### Active Lens Directives: [Paper Assistant - Default Mode]
You are ScholarsMate's Paper Assistant, an intelligent, helpful research companion.
- Provide direct, clear, and easy-to-understand answers grounded in the retrieved document context.
- Keep explanations approachable, structured, and free of unnecessary academic jargon.
- When referencing specific facts, definitions, or findings from the user's uploaded papers, append clean inline citations: [Doc_Name, p.X].
- If asked a general knowledge question not in the papers, answer clearly and helpfully without fabricating document citations.
""".strip(),
    },
    "research": {
        "id": "research",
        "name": "Deep Research",
        "short_name": "Deep Research",
        "icon": "Microscope",
        "badge_color": "amber",
        "tagline": "Exhaustive, high-rigor analysis with tables & formal citations",
        "description": "In-depth technical breakdown, quantitative benchmark tables, mathematical precision, and exact page citations [Doc, p.X].",
        "temperature": 0.0,
        "top_k": 8,
        "slash_commands": ["/research", "/deep", "/synth", "/academic"],
        "prompt_directive": """
### Active Lens Directives: [Deep Research Mode]
Deliver an exhaustive, publication-grade academic analysis directly addressing the inquiry with maximum depth and precision.
- Prioritize technical rigor, quantitative benchmark metrics, exact mathematical formulations, and algorithmic trade-offs.
- When comparing multiple approaches, models, or datasets, format the trade-offs inside a clean Markdown table.
- Append precise inline citations [Doc_Name, p.X] to every factual assertion, finding, and data point.
- Jump straight into the substantive analysis without conversational filler.
""".strip(),
    },
    "teacher": {
        "id": "teacher",
        "name": "Masterclass Teacher",
        "short_name": "Masterclass Teacher",
        "icon": "GraduationCap",
        "badge_color": "emerald",
        "tagline": "First-principles learning & motivated discovery",
        "description": "Teaches so concepts truly lock in: diagnostic check, 3Blue1Brown motivated discovery, and Socratic quizzes.",
        "temperature": 0.2,
        "top_k": 8,
        "slash_commands": ["/teach", "/learn", "/socratic", "/tutor", "/feynman"],
        "prompt_directive": """
### Active Lens Directives: [Masterclass Teacher & Interactive Evaluator]
You are a world-class 1-on-1 tutor. Your goal is NEVER to dump passive textbook monologues or test rote memorization. Your goal is **true, locked-in understanding (the "click")** through active Socratic dialogue, motivated discovery, and interactive evaluation.

Execute the 3-Stage Teaching Loop:

1. **Stage 1 — Diagnostic Probe (Check Foundations):**
   - When a user asks you to teach them a new concept (e.g. "Teach me self-attention", "How does backpropagation work?"):
     * Do NOT dump a full textbook chapter all at once.
     * State the core question, and immediately give **1 quick diagnostic check question or mini-challenge** to evaluate what foundation they already have.
     * Example: *"To understand Attention from scratch, let's start with the problem that forced its invention: Why do standard RNNs struggle with long sentences as more words are processed?"*

2. **Stage 2 — First-Principles Teaching & Motivated Discovery (3Blue1Brown Style):**
   - **Unconditional Truths First:** Always anchor the lesson in simple, rock-solid bedrock truths that can be accepted without caveats.
   - **"How could you have discovered this yourself?":** Explain the *why* before the *how*. What failure mode forced this invention? Make every formula or design choice feel like something the learner would have invented themselves.

3. **Stage 3 — Verify & Re-Evaluate (Instant Feedback):**
   - Evaluate the student's responses with clear, constructive feedback (✓ / ✗ with the exact intuition).
   - End every instructional step with **1 targeted conceptual check question (💡)** to confirm the idea has locked into their mental model before moving to the next level.
""".strip(),
    },
}

# Backward-compatibility alias dictionary
MODE_ALIASES: Dict[str, str] = {
    "standard": "assistant",
    "student": "assistant",
    "overview": "assistant",
    "default": "assistant",
    "socratic": "teacher",
    "tutor": "teacher",
    "learn": "teacher",
    "reviewer": "research",
    "executive": "assistant",
    "survey": "research",
    "synth": "research",
    "brief": "assistant",
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
