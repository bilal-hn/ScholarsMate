"""Provider-agnostic helpers: model IDs, reasoning split, JSON parse, context packing."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any


KNOWN_PROVIDERS = (
    "groq",
    "gemini",
    "google",
    "openai",
    "anthropic",
    "deepseek",
    "openrouter",
    "mistral",
    "together",
    "xai",
    "cohere",
)

THINK_BLOCK_RE = re.compile(
    r"<(think|thinking|thought|reasoning)>(.*?)</\1>",
    re.IGNORECASE | re.DOTALL,
)

MAX_CONTEXT_TOKENS = 6000
CONV_MAX_TOKENS = 2048
RAG_MAX_TOKENS = 4096
REWRITE_MAX_TOKENS = 256


@dataclass
class ExtractedCompletion:
    answer: str
    thinking: str


def estimate_tokens(text: str | None) -> int:
    if not text:
        return 0
    return max(1, len(text) // 4)


# Provider priority order: best capability / free-tier friendliness first.
_PROVIDER_PRIORITY = [
    ("gemini",     ["gemini", "google"],    "gemini/gemini-2.5-flash",                  "GEMINI_API_KEY"),
    ("openai",     ["openai"],              "openai/gpt-4o-mini",                        "OPENAI_API_KEY"),
    ("anthropic",  ["anthropic"],           "anthropic/claude-3-5-haiku-20241022",       "ANTHROPIC_API_KEY"),
    ("openrouter", ["openrouter"],          "openrouter/auto",                           "OPENROUTER_API_KEY"),
    ("groq",       ["groq"],               "groq/llama-3.3-70b-versatile",              "GROQ_API_KEY"),
    ("deepseek",   ["deepseek"],           "deepseek/deepseek-chat",                    "DEEPSEEK_API_KEY"),
]

# Background brain extraction priority: always prefer fast/cheap models.
# Memory extraction only produces simple JSON — heavy models waste credits and
# burn Groq's TPM quota immediately after the main RAG call.
_BRAIN_EXTRACTION_PRIORITY = [
    ("gemini",   ["gemini", "google"], "gemini/gemini-2.5-flash",   "GEMINI_API_KEY"),
    ("groq",     ["groq"],             "groq/llama-3.1-8b-instant", "GROQ_API_KEY"),
    ("openai",   ["openai"],           "openai/gpt-4o-mini",        "OPENAI_API_KEY"),
    ("deepseek", ["deepseek"],         "deepseek/deepseek-chat",    "DEEPSEEK_API_KEY"),
]


def pick_best_model_from_keys(custom_keys: dict | None = None) -> tuple[str, str | None]:
    """
    Returns (model_id, api_key) for the best available provider given the
    user's BYOK custom_keys.  Falls back to env-var keys if custom_keys has
    nothing, then to the Gemini env key as the final default.

    Priority order: Gemini > OpenAI > Anthropic > OpenRouter > Groq > DeepSeek

    Usage:
        model_id, api_key = pick_best_model_from_keys(custom_keys)
        completion(model=model_id, api_key=api_key, ...)
    """
    import os
    keys = custom_keys or {}

    # 1. Check BYOK custom_keys first
    for _name, aliases, default_model, env_var in _PROVIDER_PRIORITY:
        for alias in aliases:
            if alias in keys and keys[alias]:
                return default_model, keys[alias]

    # 2. Fall back to .env keys in the same priority order
    for _name, _aliases, default_model, env_var in _PROVIDER_PRIORITY:
        env_key = os.getenv(env_var)
        if env_key:
            return default_model, env_key

    # 3. Absolute fallback — return Gemini model with no key; LiteLLM will raise
    #    a clear AuthenticationError rather than silently doing nothing.
    return "gemini/gemini-2.5-flash", None


def pick_brain_extraction_model(custom_keys: dict | None = None) -> tuple[str, str | None]:
    """
    Returns the cheapest/fastest (model_id, api_key) available for background
    brain memory extraction tasks. Ignores the user's selected main-query model —
    extraction only needs to produce simple JSON and should never burn heavy credits
    or push Groq's TPM over the limit immediately after the main RAG call.

    Priority order: Gemini Flash > Groq 8B-instant > GPT-4o-mini > DeepSeek
    """
    import os
    keys = custom_keys or {}

    # 1. Check BYOK custom_keys against brain-priority list
    for _name, aliases, default_model, env_var in _BRAIN_EXTRACTION_PRIORITY:
        for alias in aliases:
            if alias in keys and keys[alias]:
                return default_model, keys[alias]

    # 2. Fall back to .env keys
    for _name, _aliases, default_model, env_var in _BRAIN_EXTRACTION_PRIORITY:
        env_key = os.getenv(env_var)
        if env_key:
            return default_model, env_key

    return "gemini/gemini-2.5-flash", None


def provider_from_model(model_name: str | None) -> str:
    if not model_name or "/" not in model_name:
        return "gemini"
    return model_name.split("/", 1)[0].lower()


def resolve_api_key(provider: str, custom_keys: dict | None = None) -> str | None:
    """
    Universal API key resolver: finds the key for a specific provider.
    Checks custom_keys (exact match or alias), then falls back to server environment variables.
    Guarantees that a key from Provider A is NEVER returned to call Provider B.
    """
    if not provider:
        return None
    import os
    prov = provider.lower().strip()
    keys = custom_keys or {}

    # Check custom_keys (with alias support for google/gemini)
    if prov in ("gemini", "google"):
        for alias in ("gemini", "google"):
            if keys.get(alias) and str(keys[alias]).strip():
                return str(keys[alias]).strip()
    elif keys.get(prov) and str(keys[prov]).strip():
        return str(keys[prov]).strip()

    # Fall back to server environment variables
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


def resolve_model_and_key(
    requested_model: str | None = None,
    custom_keys: dict | None = None
) -> tuple[str, str | None]:
    """
    Universal model & key resolution across ScholarsMate.

    1. If the user explicitly provided a model (e.g. 'groq/llama-3.3-70b-versatile'),
       we normalize it and find its matching API key. If that provider has a valid key,
       we return (model, key).
    2. If no model was requested, or if the requested model has no key available,
       we pick the best supported model from the user's available BYOK keys
       in priority order: Gemini > OpenAI > Anthropic > OpenRouter > Groq > DeepSeek.
    """
    keys = custom_keys or {}
    norm_model = normalize_litellm_model_id(requested_model) if requested_model else None

    if norm_model:
        provider = provider_from_model(norm_model)
        key = resolve_api_key(provider, keys)
        if key:
            return norm_model, key

    # Either no model requested, or requested model has no key -> pick best available from keys
    return pick_best_model_from_keys(keys)


def normalize_litellm_model_id(raw_id: str | None, provider: str | None = None) -> str:
    """Build a LiteLLM id without doubling provider prefixes (groq/groq/...)."""
    value = (raw_id or "").strip()
    if not value:
        return value

    prov = (provider or "").strip().lower()
    parts = value.split("/")

    while len(parts) >= 2 and parts[0].lower() == parts[1].lower() and parts[0].lower() in KNOWN_PROVIDERS:
        parts = parts[1:]
    value = "/".join(parts)

    first = value.split("/", 1)[0].lower()
    if first in KNOWN_PROVIDERS:
        return value

    if prov:
        if value.lower().startswith(f"{prov}/"):
            return value
        return f"{prov}/{value}"
    return value


def build_fallback_chain(
    primary: str,
    available_models: list[str] | None = None,
    custom_keys: dict | None = None,
) -> list[str]:
    """Prefer the active model, then other BYOK-discovered IDs the user already has keys for."""
    keys = {k.lower(): v for k, v in (custom_keys or {}).items() if v and str(v).strip()}
    primary_norm = normalize_litellm_model_id(primary)
    chain = [primary_norm] if primary_norm else []

    seen = {primary_norm}
    primary_provider = provider_from_model(primary_norm)

    discovered = [normalize_litellm_model_id(m) for m in (available_models or []) if m]
    same_provider = [m for m in discovered if provider_from_model(m) == primary_provider]
    other = [m for m in discovered if provider_from_model(m) != primary_provider]

    def _key_ok(model_id: str) -> bool:
        prov = provider_from_model(model_id)
        if prov in ("gemini", "google"):
            return bool(keys.get("gemini") or keys.get("google"))
        if not keys:
            return True
        return bool(keys.get(prov))

    for candidate in same_provider + other:
        if candidate in seen:
            continue
        if keys and not _key_ok(candidate):
            continue
        chain.append(candidate)
        seen.add(candidate)
        if len(chain) >= 6:
            break

    return chain or [primary_norm]


def _split_inline_think(text: str) -> tuple[str, str]:
    if not text:
        return "", ""
    blocks = THINK_BLOCK_RE.findall(text)
    thinking = "\n\n".join(body.strip() for _, body in blocks if body.strip())
    answer = THINK_BLOCK_RE.sub("", text).strip()
    return thinking, answer


def extract_reasoning_and_content(payload: Any) -> ExtractedCompletion:
    """Split visible answer from reasoning across LiteLLM fields and inline think tags."""
    if payload is None:
        return ExtractedCompletion(answer="", thinking="")

    if isinstance(payload, str):
        thinking, answer = _split_inline_think(payload)
        return ExtractedCompletion(answer=answer, thinking=thinking)

    message = None
    if hasattr(payload, "choices") and payload.choices:
        message = payload.choices[0].message
    else:
        message = payload

    content = ""
    reasoning_parts: list[str] = []

    if message is not None:
        raw_content = getattr(message, "content", None)
        if isinstance(raw_content, str):
            content = raw_content
        elif raw_content is not None:
            content = str(raw_content)

        for attr in ("reasoning_content", "reasoning", "thinking"):
            val = getattr(message, attr, None)
            if val:
                reasoning_parts.append(str(val))

        extra = getattr(message, "provider_specific_fields", None)
        if isinstance(extra, dict):
            for key in ("reasoning_content", "reasoning", "thought", "thinking"):
                if extra.get(key):
                    reasoning_parts.append(str(extra[key]))

    inline_think, inline_answer = _split_inline_think(content)
    if inline_think:
        reasoning_parts.append(inline_think)
        content = inline_answer

    thinking = "\n\n".join(part.strip() for part in reasoning_parts if part and str(part).strip())
    return ExtractedCompletion(answer=(content or "").strip(), thinking=thinking.strip())


def parse_json_object(text: str) -> dict:
    """Parse a JSON object from model output after dropping fences and surrounding prose."""
    cleaned = (text or "").strip()
    cleaned = THINK_BLOCK_RE.sub("", cleaned).strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise json.JSONDecodeError("No JSON object found", cleaned, 0)
    return json.loads(cleaned[start : end + 1])


def heuristic_intent(query: str, chat_history: list | None = None) -> str:
    """Parse-failure fallback: distinguishes conversational, general knowledge, follow-up clarification, and document queries."""
    q = (query or "").strip()
    if not q:
        return "CONVERSATIONAL"

    words = q.split()
    has_question = "?" in q or any(q.lower().startswith(w) for w in ["why", "how", "what", "which", "who", "when", "where", "can you", "could you"])
    lowered = q.lower()

    # 1. Conversational greetings, thinking pauses, acknowledgments, and state markers
    conversational_patterns = [
        r"^(hi|hello|hey|greetings|howdy|sup)\b",
        r"^(thanks|thank you|thx|cheers|appreciated)\b",
        r"^(bye|goodbye|cya|see you)\b",
        r"^(let me think|give me a (sec|second|moment|minute)|wait|wait a sec|hold on|hmm+)\b",
        r"^(okay|ok|got it|okay got it|makes sense|i see|understood|cool|nice|alright|right|yep|yes|no|great|awesome)\b",
        r"^(who are you|what can you do|what is your name)\b",
    ]
    if any(re.search(p, lowered) for p in conversational_patterns) and not has_question:
        return "CONVERSATIONAL"

    # 2. Active follow-up and clarification requests
    follow_up_cues = re.search(
        r"\b(i don'?t understand|explain simpler|make it simpler|elaborate|clarify|what do you mean|what does that mean|"
        r"can you give an example|give an example|tell me more|why is that|huh|how so|what about that|go on|continue|"
        r"summarise that|summarize that|more details|explain further|repeat that|expand on)\b",
        lowered,
        re.IGNORECASE,
    )
    if follow_up_cues:
        return "FOLLOW_UP"

    # 3. Explicit research and document cues
    research_cues = re.search(
        r"\b(paper|papers|document|documents|pdf|method|methodology|findings|compare|"
        r"summar(?:y|ise|ize)|dataset|result|results|author|citation|workspace|literature)\b",
        lowered,
        re.IGNORECASE,
    )
    if research_cues:
        return "NEW_QUERY"

    # 4. Contextual follow-up if history exists AND user is actively asking a question
    if chat_history and len(chat_history) > 0 and has_question and len(words) <= 12:
        return "FOLLOW_UP"

    # 5. Non-question short statements without research keywords are conversational
    if not has_question and len(words) <= 5 and not research_cues:
        return "CONVERSATIONAL"

    # 6. General coding / math / broad questions without research cues
    general_cues = re.search(
        r"\b(write a (python|javascript|code|script|function)|how to code|solve (this|the equation)|what is (the capital|photosynthesis))\b",
        lowered,
        re.IGNORECASE,
    )
    if general_cues:
        return "GENERAL_KNOWLEDGE"

    return "NEW_QUERY"


def pack_chunks(chunks: list[dict], max_tokens: int = MAX_CONTEXT_TOKENS) -> list[dict]:
    """Keep a token budget and round-robin by document so later papers are not dropped."""
    if not chunks:
        return []

    by_doc: dict[str, list[dict]] = {}
    order: list[str] = []
    for chunk in chunks:
        name = chunk.get("doc_name") or chunk.get("source") or "Unknown"
        if name not in by_doc:
            by_doc[name] = []
            order.append(name)
        by_doc[name].append(chunk)

    packed: list[dict] = []
    used = 0
    index = {name: 0 for name in order}

    while True:
        added = False
        for name in order:
            i = index[name]
            docs = by_doc[name]
            if i >= len(docs):
                continue
            chunk = docs[i]
            cost = estimate_tokens(chunk.get("content") or chunk.get("text") or "")
            if packed and used + cost > max_tokens:
                return packed
            packed.append(chunk)
            used += cost
            index[name] = i + 1
            added = True
        if not added:
            break
    return packed
