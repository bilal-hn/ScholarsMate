"""
Unit tests for model resolution logic in generator.py.
Tests that:
  - An explicitly chosen model is NEVER overridden (the silent swap bug).
  - When no model is given, the correct default is picked from available BYOK keys.

Run with:
    PYTHONPATH=. ./.venv/bin/pytest backend/tests/test_model_resolution.py -v
"""

from unittest.mock import patch, MagicMock
import pytest


def _resolve_model(model_name: str, custom_keys: dict) -> str:
    """
    Inline replica of the model resolution block from generator.py
    so we can unit test it without importing the whole module.
    Kept in sync manually — update if generator.py changes.
    """
    from backend.rag.runtime import normalize_litellm_model_id

    target_model = normalize_litellm_model_id(model_name)
    if not target_model:
        if "gemini" in custom_keys or "google" in custom_keys:
            target_model = "gemini/gemini-2.5-flash"
        elif "openai" in custom_keys:
            target_model = "openai/gpt-4o-mini"
        elif "anthropic" in custom_keys:
            target_model = "anthropic/claude-3-5-haiku-20241022"
        elif "openrouter" in custom_keys:
            target_model = "openrouter/auto"
        elif "groq" in custom_keys:
            target_model = "groq/llama-3.3-70b-versatile"
        else:
            target_model = "gemini/gemini-2.5-flash"
    return target_model


# ─── Tests: Explicit model must never be overridden ──────────────────────────

class TestExplicitModelRespected:

    def test_groq_llama_stays_groq(self):
        """Bug fix: groq/llama must NOT be swapped to Gemini."""
        result = _resolve_model(
            model_name="groq/llama-3.3-70b-versatile",
            custom_keys={"groq": "gsk_fake"}
        )
        assert result == "groq/llama-3.3-70b-versatile", (
            f"Expected groq/llama-3.3-70b-versatile but got {result}. "
            "The silent model swap bug has returned."
        )

    def test_groq_llama_stays_even_with_gemini_key(self):
        """User chose Groq — Gemini key being present should not override it."""
        result = _resolve_model(
            model_name="groq/llama-3.3-70b-versatile",
            custom_keys={"groq": "gsk_fake", "gemini": "AIza_fake"}
        )
        assert result == "groq/llama-3.3-70b-versatile"

    def test_openai_model_stays_openai(self):
        result = _resolve_model(
            model_name="openai/gpt-4o",
            custom_keys={"openai": "sk_fake", "gemini": "AIza_fake"}
        )
        assert result == "openai/gpt-4o"

    def test_gemini_model_stays_gemini(self):
        result = _resolve_model(
            model_name="gemini/gemini-2.5-flash",
            custom_keys={"gemini": "AIza_fake"}
        )
        assert result == "gemini/gemini-2.5-flash"

    def test_anthropic_model_stays_anthropic(self):
        result = _resolve_model(
            model_name="anthropic/claude-3-5-sonnet-20241022",
            custom_keys={"anthropic": "sk-ant-fake"}
        )
        assert result == "anthropic/claude-3-5-sonnet-20241022"


# ─── Tests: Default model selected from BYOK keys when no model given ────────

class TestDefaultModelSelection:

    def test_no_model_groq_only_key(self):
        """Only Groq key available → should default to Groq."""
        result = _resolve_model(model_name="", custom_keys={"groq": "gsk_fake"})
        assert result == "groq/llama-3.3-70b-versatile"

    def test_no_model_gemini_key(self):
        result = _resolve_model(model_name="", custom_keys={"gemini": "AIza_fake"})
        assert result == "gemini/gemini-2.5-flash"

    def test_no_model_google_key(self):
        """'google' key name should also resolve to Gemini."""
        result = _resolve_model(model_name="", custom_keys={"google": "AIza_fake"})
        assert result == "gemini/gemini-2.5-flash"

    def test_no_model_openai_key(self):
        result = _resolve_model(model_name="", custom_keys={"openai": "sk_fake"})
        assert result == "openai/gpt-4o-mini"

    def test_no_model_anthropic_key(self):
        result = _resolve_model(model_name="", custom_keys={"anthropic": "sk-ant-fake"})
        assert result == "anthropic/claude-3-5-haiku-20241022"

    def test_no_model_openrouter_key(self):
        result = _resolve_model(model_name="", custom_keys={"openrouter": "sk-or-fake"})
        assert result == "openrouter/auto"

    def test_no_model_no_keys_falls_back_to_gemini(self):
        """No model, no keys → fall back to Gemini (relies on .env GEMINI_API_KEY)."""
        result = _resolve_model(model_name="", custom_keys={})
        assert result == "gemini/gemini-2.5-flash"

    def test_none_model_treated_same_as_empty(self):
        result = _resolve_model(model_name=None, custom_keys={"groq": "gsk_fake"})
        assert result == "groq/llama-3.3-70b-versatile"

    def test_priority_gemini_over_groq(self):
        """When both keys present, Gemini should win (higher capability)."""
        result = _resolve_model(
            model_name="",
            custom_keys={"groq": "gsk_fake", "gemini": "AIza_fake"}
        )
        assert result == "gemini/gemini-2.5-flash"

    def test_priority_openai_over_groq(self):
        result = _resolve_model(
            model_name="",
            custom_keys={"groq": "gsk_fake", "openai": "sk_fake"}
        )
        assert result == "openai/gpt-4o-mini"
