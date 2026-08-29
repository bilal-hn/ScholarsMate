"""
FR-15: Multi-Lens Academic Reasoning Modes & Personas
Defines metadata, parameter presets, and detailed prompt directives for 5 core academic lenses.
"""

from typing import Dict, Any, List

ACADEMIC_MODES: Dict[str, Dict[str, Any]] = {
    "research": {
        "id": "research",
        "name": "Research Synthesizer",
        "short_name": "Research",
        "icon": "Microscope",
        "badge_color": "amber",
        "tagline": "Rigorous, citation-dense academic analysis",
        "description": "Formally synthesizes claims with strict source citations, benchmark tables, and methodology trade-offs.",
        "temperature": 0.0,
        "top_k": 8,
        "slash_commands": ["/research", "/synth", "/academic"],
        "prompt_directive": """
### Active Lens Directives: [Research Synthesizer]
- Maintain formal, objective, and publication-grade academic prose.
- Prioritize quantitative results, benchmark tables, and specific mathematical definitions found in the text.
- Compare and contrast methodological trade-offs whenever multiple papers or approaches are mentioned.
- Append precise inline citations [Doc_Name, p.X] to every factual finding or claim.
""".strip(),
    },
    "socratic": {
        "id": "socratic",
        "name": "Socratic Tutor",
        "short_name": "Tutor",
        "icon": "Brain",
        "badge_color": "emerald",
        "tagline": "Intuitive explanations & conceptual mastery",
        "description": "Breaks down dense jargon using Feynman analogies, step-by-step math derivations, and 1 check question.",
        "temperature": 0.2,
        "top_k": 6,
        "slash_commands": ["/socratic", "/tutor", "/explain", "/teach"],
        "prompt_directive": """
### Active Lens Directives: [Socratic Tutor]
- Break down dense technical jargon and complex math into intuitive, accessible explanations using the Feynman technique.
- Use clear, grounded analogies to illustrate abstract algorithmic mechanisms or theoretical concepts.
- Structure explanations with clear step-by-step progression: (1) Core Intuition, (2) Detailed Mechanism / Math Breakdown, (3) Practical Example from the paper.
- Still maintain strict source-locking: all facts, formulas, and data points must originate from the provided context with citations [Doc_Name, p.X].
- Conclude your answer with **1 thought-provoking follow-up check question** to test or deepen the student\'s conceptual understanding.
""".strip(),
    },
    "reviewer": {
        "id": "reviewer",
        "name": "Peer Reviewer",
        "short_name": "Reviewer",
        "icon": "ShieldAlert",
        "badge_color": "rose",
        "tagline": "Critical red-team audit & limitation analysis",
        "description": "Audits methodology, unstated assumptions, dataset biases, baseline omissions, and potential vulnerabilities.",
        "temperature": 0.1,
        "top_k": 10,
        "slash_commands": ["/reviewer", "/critique", "/audit", "/redteam"],
        "prompt_directive": """
### Active Lens Directives: [Peer Reviewer (Red Team)]
- Adopt the analytical, discerning persona of an expert academic peer reviewer (e.g. NeurIPS, ICML, Nature reviewer).
- Specifically examine and highlight:
  1. **Methodological Rigor & Assumptions:** What assumptions does the author make that are unverified or weakly justified?
  2. **Experimental Limitations:** Dataset scale, synthetic vs. real-world evaluations, missing baselines, or metric selection biases.
  3. **Generalization & Scalability Constraints:** Where might this approach fail in production or under out-of-distribution conditions?
  4. **Key Strengths:** Clearly state the validated contributions before detailing critical weaknesses.
- Support all critiques with direct citations [Doc_Name, p.X] referencing the author\'s own stated claims and empirical bounds.
""".strip(),
    },
    "executive": {
        "id": "executive",
        "name": "Executive Brief",
        "short_name": "Brief",
        "icon": "BarChart3",
        "badge_color": "blue",
        "tagline": "High-density TL;DR & key takeaways",
        "description": "Distills dense papers into core innovations, quantitative results, and 3 actionable takeaways.",
        "temperature": 0.0,
        "top_k": 5,
        "slash_commands": ["/executive", "/brief", "/tldr", "/summary"],
        "prompt_directive": """
### Active Lens Directives: [Executive Brief]
- Deliver a high-density, concise executive briefing designed for rapid triage.
- Use the following standardized executive structure:
  * **Executive TL;DR:** 2-sentence summary of the core problem and proposed solution.
  * **Key Innovation:** What is genuinely new compared to prior work?
  * **Quantitative Highlights:** Bulleted list or mini-table of the most significant empirical gains [Doc_Name, p.X].
  * **3 Actionable Takeaways:** Concrete engineering or research insights distilled from the findings.
- Avoid unnecessary academic preamble or verbose historical context.
""".strip(),
    },
    "survey": {
        "id": "survey",
        "name": "Literature Survey",
        "short_name": "Survey",
        "icon": "Library",
        "badge_color": "purple",
        "tagline": "Cross-paper synthesis & timeline mapping",
        "description": "Synthesizes multiple papers, groups approaches by school of thought, and maps evolutionary timelines.",
        "temperature": 0.0,
        "top_k": 12,
        "slash_commands": ["/survey", "/litreview", "/compare", "/timeline"],
        "prompt_directive": """
### Active Lens Directives: [Literature Survey & Cross-Paper Synthesis]
- Focus on synthesis across multiple papers and documents in the workspace.
- Group the retrieved literature into distinct **Thematic Categories / Schools of Thought**.
- Provide a comparative markdown synthesis matrix:
  | Paper & Year | Core Approach | Primary Advantage | Key Limitation |
  | :--- | :--- | :--- | :--- |
- Highlight the **Evolution of Ideas** (how later papers build upon or diverge from earlier paradigms).
- Explicitly identify **Open Research Gaps** where the current body of literature remains inconclusive.
- Ensure every paper discussed is explicitly cited with [Doc_Name, p.X].
""".strip(),
    },
}


def get_mode_config(mode_id: str | None) -> Dict[str, Any]:
    """Retrieves mode configuration with safe fallback to 'research'."""
    if not mode_id:
        return ACADEMIC_MODES["research"]
    clean_id = mode_id.strip().lower()
    return ACADEMIC_MODES.get(clean_id, ACADEMIC_MODES["research"])


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


def match_slash_command(text: str) -> tuple[str | None, str]:
    """
    Detects if user input starts with a slash command (e.g. '/critique What are the flaws?')
    and returns (mode_id, stripped_query).
    """
    if not text or not text.strip().startswith("/"):
        return None, text

    parts = text.strip().split(maxsplit=1)
    cmd = parts[0].lower()
    query = parts[1] if len(parts) > 1 else ""

    for mode_id, config in ACADEMIC_MODES.items():
        if cmd in config.get("slash_commands", []):
            return mode_id, query

    return None, text
