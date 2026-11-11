import re
from typing import List
from .schemas import GuardrailResult, RailAction, Violation

# OWASP LLM01: Prompt Injection & Jailbreak Signatures
INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|directions|prompts)",
    r"you\s+are\s+now\s+(an?\s+)?(unfiltered|dan|jailbroken|unrestricted|evil|chaos)",
    r"(output|print|reveal|show|dump)\s+(your\s+)?(system\s+prompt|developer\s+instructions|internal\s+prompt)",
    r"bypass\s+(safety|filters?|guardrails?|content\s+policies)",
    r"roleplay\s+as\s+(an?\s+)?unrestricted",
    r"disregard\s+(all\s+)?prior\s+instructions",
    r"forget\s+(all\s+)?previous\s+(rules|prompts)",
]

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
            sanitized_text="",
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
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, clean_text, re.IGNORECASE):
            violations.append(Violation(
                rail_name="prompt_injection_guard",
                severity="critical",
                message="Adversarial prompt injection or jailbreak pattern detected."
            ))
            return GuardrailResult(
                action=RailAction.BLOCK,
                sanitized_text="Your query was flagged by ScholarsMate's academic safety guardrail. Prompt injection and jailbreak attempts are prohibited.",
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
