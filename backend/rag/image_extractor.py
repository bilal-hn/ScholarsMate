"""
Multimodal Image Data & Query Extractor using Google GenAI & LiteLLM Vision Models.
Extracts textual content, questions, mathematical formulas, and supporting material
from user-uploaded images (.png, .jpg, .jpeg, .jfif).
"""
from __future__ import annotations

import base64
import mimetypes
import os
import re
from typing import Any

from litellm import completion
from backend.rag.runtime import normalize_litellm_model_id, provider_from_model


VISION_CANDIDATES = [
    # OpenAI Vision
    "openai/gpt-4o-mini",
    "openai/gpt-4o",
    # OpenRouter
    "openrouter/google/gemini-2.0-flash-exp:free",
    "openrouter/meta-llama/llama-3.2-11b-vision-instruct:free",
    # Groq (experimental / subject to rate limits & capacity)
    "groq/qwen/qwen3.8-27b",
]

PROMPT_TEXT = (
    "You are an expert academic visual analysis and OCR engine.\n"
    "Analyze the provided image thoroughly:\n"
    "1. If the image contains a query, question, or problem prompt (such as homework, exam problem, or user question), "
    "clearly transcribe the exact question text under '### Question / Query:'.\n"
    "2. Extract all mathematical equations, formulas, and symbols formatted strictly in clean LaTeX notation.\n"
    "3. If the image contains academic supporting material (charts, data tables, scientific figures, paper excerpts, diagrams), "
    "transcribe and detail all values, labels, relationships, and data points under '### Supporting Material & Data:'.\n"
    "4. Ensure 100% accuracy and preserve all technical notations."
)


def _resolve_vision_key(provider: str, custom_keys: dict | None) -> str | None:
    prov = provider.lower()
    if prov == "google":
        prov = "gemini"

    if custom_keys:
        if custom_keys.get(prov):
            return str(custom_keys[prov]).strip()
        if prov == "gemini" and custom_keys.get("google"):
            return str(custom_keys["google"]).strip()

    env_map = {
        "gemini": "GEMINI_API_KEY",
        "google": "GEMINI_API_KEY",
        "openai": "OPENAI_API_KEY",
        "groq": "GROQ_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
    }
    env_var = env_map.get(prov, f"{prov.upper()}_API_KEY")
    val = os.getenv(env_var)
    return val.strip() if val else None


def _extract_with_google_genai(
    image_bytes: bytes,
    mime_type: str,
    prompt: str,
    api_key: str,
) -> tuple[str, str]:
    """
    Directly extracts content using the official Google GenAI SDK.
    Tries active flash models: gemini-3.6-flash, gemini-3.5-flash-lite, gemini-flash-latest.
    """
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key.strip())
        models_to_try = [
            "gemini-3.6-flash",
            "gemini-3.5-flash-lite",
            "gemini-flash-latest",
            "gemini-2.5-flash",
        ]

        for m in models_to_try:
            try:
                resp = client.models.generate_content(
                    model=m,
                    contents=[
                        prompt,
                        types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    ],
                )
                if resp and resp.text:
                    return resp.text, f"gemini/{m}"
            except Exception as model_err:
                print(f"[Google GenAI Warning] Model {m} failed: {model_err}")
                continue
    except Exception as sdk_err:
        print(f"[Google GenAI Warning] SDK call failed: {sdk_err}")

    return "", ""


def _get_vision_models_chain(
    active_model: str | None,
    custom_keys: dict | None
) -> list[str]:
    chain: list[str] = []
    keys = custom_keys or {}

    has_openai = bool(keys.get("openai") or os.getenv("OPENAI_API_KEY"))
    has_openrouter = bool(keys.get("openrouter") or os.getenv("OPENROUTER_API_KEY"))
    has_groq = bool(keys.get("groq") or os.getenv("GROQ_API_KEY"))

    # Check if active model is vision capable and has an appropriate key
    if active_model:
        active_norm = normalize_litellm_model_id(active_model)
        active_lower = active_norm.lower()
        if any(v in active_lower for v in ["4o", "vision", "claude-3", "qwen3.8"]):
            prov = provider_from_model(active_norm)
            if _resolve_vision_key(prov, custom_keys):
                chain.append(active_norm)

    if has_openai:
        for m in ["openai/gpt-4o-mini", "openai/gpt-4o"]:
            if m not in chain:
                chain.append(m)

    if has_openrouter:
        for m in [
            "openrouter/google/gemini-2.0-flash-exp:free",
            "openrouter/meta-llama/llama-3.2-11b-vision-instruct:free",
        ]:
            if m not in chain:
                chain.append(m)

    if has_groq:
        if "groq/qwen/qwen3.8-27b" not in chain:
            chain.append("groq/qwen/qwen3.8-27b")

    return chain


def extract_image_data(
    image_bytes: bytes,
    filename: str,
    mime_type: str = "image/png",
    custom_keys: dict | None = None,
    active_model: str | None = None,
) -> dict[str, Any]:
    """
    Performs multimodal vision extraction on an image to retrieve queries,
    academic formulas (LaTeX), supporting diagrams, or tables.
    """
    if not image_bytes:
        raise ValueError("Empty image content received.")

    # Clean mime type
    if not mime_type or not mime_type.startswith("image/"):
        guessed, _ = mimetypes.guess_type(filename)
        mime_type = guessed or ("image/jpeg" if filename.lower().endswith((".jpg", ".jpeg", ".jfif")) else "image/png")

    if mime_type in {"image/jfif", "image/pjpeg"}:
        mime_type = "image/jpeg"

    extracted_text = ""
    model_used = ""
    last_error = None

    # 1. Primary: Native Google GenAI SDK with Gemini Vision
    gemini_key = _resolve_vision_key("gemini", custom_keys)
    if gemini_key:
        extracted_text, model_used = _extract_with_google_genai(
            image_bytes=image_bytes,
            mime_type=mime_type,
            prompt=PROMPT_TEXT,
            api_key=gemini_key,
        )

    # 2. Fallback: Secondary Vision Models via LiteLLM (OpenAI, OpenRouter, Groq)
    if not extracted_text:
        b64_str = base64.b64encode(image_bytes).decode("utf-8")
        data_url = f"data:{mime_type};base64,{b64_str}"

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT_TEXT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ]

        candidate_chain = _get_vision_models_chain(active_model, custom_keys)
        for model_target in candidate_chain:
            provider = provider_from_model(model_target)
            api_key = _resolve_vision_key(provider, custom_keys)

            if not api_key:
                continue

            max_toks = 500 if "groq" in model_target.lower() else 2048

            call_kwargs = {
                "model": model_target,
                "messages": messages,
                "api_key": api_key,
                "max_tokens": max_toks,
                "drop_params": True,
            }

            try:
                resp = completion(**call_kwargs)
                extracted_text = resp.choices[0].message.content or ""
                model_used = model_target
                break
            except Exception as e:
                last_error = e
                print(f"[Vision Warning] Model {model_target} failed: {e}")
                continue

    # 3. Graceful degradation if no vision model could extract content
    if not extracted_text:
        err_str = str(last_error) if last_error else "Provider unavailable"
        if "over capacity" in err_str.lower():
            reason = "The vision provider is currently over capacity."
        elif "decommissioned" in err_str.lower():
            reason = "The vision model was decommissioned by the provider."
        elif "rate_limit" in err_str.lower():
            reason = "Vision request exceeded provider token rate limits."
        else:
            reason = f"Image analysis was unavailable ({err_str})."

        warning_msg = (
            f"{reason} To extract text, equations, and diagrams reliably, "
            "please verify your Google Gemini API key in Settings (or .env)."
        )
        return {
            "filename": filename,
            "extracted_text": "",
            "suggested_query": "",
            "has_query": False,
            "model_used": "none",
            "warning": warning_msg,
        }

    # Detect if image contained an extracted query
    suggested_query = ""
    match = re.search(
        r"###\s*(?:Question\s*/\s*Query|Extracted\s*Question|Query)\s*:\s*(.*?)(?=\n###|\Z)",
        extracted_text,
        re.DOTALL | re.IGNORECASE,
    )
    if match:
        suggested_query = match.group(1).strip()
    elif len(extracted_text.splitlines()) <= 3 and len(extracted_text) < 300:
        suggested_query = extracted_text.strip()

    return {
        "filename": filename,
        "extracted_text": extracted_text.strip(),
        "suggested_query": suggested_query,
        "has_query": bool(suggested_query),
        "model_used": model_used,
        "warning": None,
    }
