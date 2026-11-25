import re
import unicodedata
from difflib import get_close_matches
from functools import lru_cache
from typing import List
from .schemas import GuardrailResult, RailAction, Violation

REFUSAL_TEXT = (
    "I can't change how I work, but I'm glad to help with your research. "
    "Ask me about your papers, a literature review, or a draft you're writing."
)
EMPTY_INPUT_TEXT = "Ask me something about your papers or your research."

# Words a misspelling may be snapped to, for matching only (first letter must agree).
_FUZZY_WORDS = [
    "ignore", "disregard", "forget", "bypass", "override", "instructions", "prompts",
    "rules", "guidelines", "directions", "commands", "system", "developer",
    "unrestricted", "jailbreak",
]
_ZERO_WIDTH = dict.fromkeys(map(ord, "​‌‍‎‏⁠­﻿"))
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "@": "a", "$": "s", "’": "'"})


@lru_cache(maxsize=4096)
def _snap(token: str) -> str:
    m = get_close_matches(token, _FUZZY_WORDS, n=1, cutoff=0.8)
    return m[0] if m and m[0][0] == token[0] else token


def _normalise(text: str) -> str:
    """Lower-case, NFKC, strip zero-width chars, undo leetspeak, snap typos. Matching only."""
    t = unicodedata.normalize("NFKC", text).lower().translate(_ZERO_WIDTH).translate(_LEET)
    t = re.sub(r"\s+", " ", t).strip()
    return re.sub(r"[a-z]{5,}", lambda m: _snap(m.group(0)), t)


# OWASP LLM01: structural prompt-injection signatures (never a lone keyword).
_SEP = r"[\s,'\"-]+"
_OVERRIDE = re.compile(
    r"\b(?=(ignore|disregard|forget|bypass|override)\b"
    rf"((?:{_SEP}[a-z]+){{0,4}}){_SEP}"
    r"(?:instruction|prompt|rule|guideline|direction|command|filter|guardrail|restriction)s?\b"
    rf"(?:{_SEP}([a-z]+))?)"
)
_TRAILING_SCOPE = {"above", "earlier"}
_SCOPE_WORDS = {"all", "any", "every", "previous", "prior", "above", "earlier", "your", "system", "these"}
_ROLE_HIJACK = re.compile(
    r"\b(?:you are now|you're now|act as|pretend to be|pretend you are|roleplay as)"
    rf"(?:{_SEP}[a-z]+){{0,3}}?{_SEP}(?:unrestricted|unfiltered|uncensored|jailbr[a-z]*|dan|developer mode)\b"
)
_EXTRACTION = re.compile(
    r"\b(?:reveal|show|print|repeat|dump|output)\s+(?:me\s+)?(your|the)\s+"
    r"(?:(?:full|entire|original|exact)\s+)?(?:system|hidden|initial|internal|developer)\s+(?:prompt|instruction)s?\b"
)
# "show the system prompt used in Section 3" is a question about a paper, not an extraction attempt.
_PAPER_CONTEXT = re.compile(r"\s+(?:used|from|in|of|for)\b")


def _is_injection(raw: str) -> bool:
    text = _normalise(raw)
    if _ROLE_HIJACK.search(text):
        return True
    for m in _EXTRACTION.finditer(text):
        if m.group(1) == "your" or not _PAPER_CONTEXT.match(text, m.end()):
            return True
    for m in _OVERRIDE.finditer(text):
        between = set(re.findall(r"[a-z]+", m.group(2)))
        before = text[: m.start()].rstrip()
        if (between & _SCOPE_WORDS or m.group(3) in _TRAILING_SCOPE
                or not before or before[-1] in ".!?;:" or before == "please"):
            return True
    return False


# Sensitive credentials that should never be sent raw in user queries
CREDENTIAL_PATTERNS = [
    (r"AIza[0-9A-Za-z-_]{30,45}", "Google API Key"),
    (r"gsk_[a-zA-Z0-9]{30,}", "Groq API Key"),
    (r"sk-[a-zA-Z0-9]{30,}", "OpenAI API Key"),
    (r"sk-ant-[a-zA-Z0-9_-]{30,}", "Anthropic API Key"),
]


def check_input_rails(query: str, max_chars: int = 3000) -> GuardrailResult:
    """
    Evaluates raw user input against security policies:
    1. Null/Empty validation.
    2. Length flood prevention.
    3. Prompt injection and jailbreak detection.
    4. Credential / secret leakage redaction.
    """
    clean_text = (query or "").strip()
    violations: List[Violation] = []

    # 1. Null / Empty Check
    if not clean_text:
        return GuardrailResult(
            action=RailAction.BLOCK,
            sanitized_text=EMPTY_INPUT_TEXT,
            violations=[Violation(
                rail_name="empty_query_guard",
                severity="low",
                message="Query cannot be empty."
            )]
        )

    # 2. Length Flood Guard
    if len(clean_text) > max_chars:
        violations.append(Violation(
            rail_name="input_length_guard",
            severity="medium",
            message=f"Query exceeded length limit of {max_chars} characters and was trimmed."
        ))
        clean_text = clean_text[:max_chars]

    # 3. Prompt Injection & Jailbreak Detection
    if _is_injection(clean_text):
        violations.append(Violation(
            rail_name="prompt_injection_guard",
            severity="critical",
            message="Adversarial prompt injection or jailbreak pattern detected."
        ))
        return GuardrailResult(
            action=RailAction.BLOCK,
            sanitized_text=REFUSAL_TEXT,
            violations=violations,
            metadata={"blocked_by": "prompt_injection_guard"}
        )

    # 4. Secret & Credential Redaction
    for pattern, cred_name in CREDENTIAL_PATTERNS:
        if re.search(pattern, clean_text):
            violations.append(Violation(
                rail_name="credential_leak_guard",
                severity="high",
                message=f"Query contained raw credential ({cred_name}) which was redacted."
            ))
            clean_text = re.sub(pattern, f"[REDACTED_{cred_name.upper().replace(' ', '_')}]", clean_text)

    action = RailAction.MODIFY if violations else RailAction.ALLOW
    return GuardrailResult(
        action=action,
        sanitized_text=clean_text,
        violations=violations,
        metadata={"original_length": len(query or ""), "sanitized_length": len(clean_text)}
    )
