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


def provider_from_model(model_name: str | None) -> str:
    if not model_name or "/" not in model_name:
        return "gemini"
    return model_name.split("/", 1)[0].lower()


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
