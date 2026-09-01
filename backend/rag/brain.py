"""Autonomous Brain memory engine: extracts durable facts and builds research memory context."""
from __future__ import annotations

import json
import logging
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.session import SessionLocal
from backend.db import crud
from backend.rag.runtime import (
    parse_json_object,
    normalize_litellm_model_id,
    extract_reasoning_and_content,
    provider_from_model,
)

logger = logging.getLogger("scholarsmate.brain")


BRAIN_EXTRACTION_PROMPT = """You are the Memory Extraction Engine for ScholarsMate (an academic AI research workspace).
Your job is to analyze the following user-assistant research dialogue turn and extract any DURABLE, LONG-TERM facts, preferences, academic goals, or workspace discoveries that should be remembered.

Focus on:
1. User Profile & Background: Degree level (e.g. Bachelor's, Master's, PhD), thesis or FYP project, field of study (e.g. Computer Science, AI), university/institution, or long-term research focus.
2. User Preferences: Citation styles (e.g. IEEE, APA 7th), notation preferences, preferred programming languages or frameworks.
3. Project Insights / Milestones: Specific decisions, benchmarks, or conclusions reached in this research workspace.

Dialogue Turn:
[User]: {user_message}
[Assistant]: {bot_answer}

Existing Brain Thoughts for this user:
{existing_thoughts}

Instructions:
- Extract 0 to 3 atomic, highly specific declarative thoughts.
- If the user states their academic level, project, or degree (e.g. "I'm working on my bachelor's FYP"), ALWAYS extract it with category="profile" and scope="global".
- If the dialogue is just a generic question without durable user facts, return an empty array.
- Output MUST be valid JSON conforming to this schema:
{{
  "memories": [
    {{
      "thought": "Clear, concise declarative statement (e.g. 'User is working on their Bachelor\'s Final Year Project (FYP)')",
      "scope": "global", // "global" for user profile/preferences, "workspace" for project-specific findings
      "category": "profile" // "preference", "profile", "insight", "milestone", or "directive"
    }}
  ]
}}
"""


async def build_brain_context(
    db: AsyncSession,
    user_id: str,
    workspace_id: Optional[str] = None
) -> str:
    """
    Retrieves active brain memories for the user and formats them into an
    injected context block for the RAG system prompt.
    """
    if not user_id:
        return ""

    try:
        memories = await crud.get_brain_memories(
            db,
            user_id=user_id,
            workspace_id=workspace_id,
            active_only=True
        )
    except Exception as e:
        logger.warning(f"Failed to fetch brain memories for user {user_id}: {e}")
        return ""

    if not memories:
        return ""

    global_memories = [m for m in memories if m.scope == "global"]
    workspace_memories = [m for m in memories if m.scope == "workspace" and m.workspace_id == workspace_id]

    sections = []

    if global_memories:
        lines = []
        for m in global_memories:
            prefix = f"[{m.category.capitalize()}]" if m.category else "[Memory]"
            lines.append(f"- {prefix} {m.thought}")
        sections.append("### User Research Profile & Global Preferences:\n" + "\n".join(lines))

    if workspace_memories:
        lines = []
        for m in workspace_memories:
            prefix = f"[{m.category.capitalize()}]" if m.category else "[Insight]"
            lines.append(f"- {prefix} {m.thought}")
        sections.append("### Workspace Milestones & Prior Findings:\n" + "\n".join(lines))

    if not sections:
        return ""

    combined_text = "\n\n".join(sections)
    return (
        "<scholarsmate_brain>\n"
        "The following are verified memories and context learned from prior conversations with this researcher:\n\n"
        f"{combined_text}\n\n"
        "Seamlessly align your research answers, tone, and citation styles with these preferences and prior conclusions.\n"
        "</scholarsmate_brain>"
    )


async def extract_and_persist_memories_async(
    user_id: str,
    session_id: Optional[str],
    user_message: str,
    bot_answer: str,
    model_name: Optional[str] = None,
    custom_keys: Optional[Dict[str, str]] = None
):
    """
    Background worker that runs asynchronously after a query turn to extract
    new facts/preferences and save them to the Brain database.
    """
    if not user_id or not user_message or not bot_answer:
        return

    # Skip short trivial inputs (e.g. "hi", "thanks", "ok")
    if len(user_message.strip()) < 8 and not any(w in user_message.lower() for w in ["prefer", "always", "my thesis", "format", "remember"]):
        return

    from backend.rag.generator import _execute_completion_with_fallback

    try:
        # 1. Fetch existing memories to avoid duplicates
        existing_list = []
        async with SessionLocal() as db:
            existing = await crud.get_brain_memories(db, user_id=user_id, workspace_id=session_id)
            existing_list = [f"- {m.thought} (scope: {m.scope})" for m in existing[:20]]

        existing_str = "\n".join(existing_list) if existing_list else "None yet."

        # 2. Build extraction prompt
        formatted_prompt = BRAIN_EXTRACTION_PROMPT.format(
            user_message=user_message.strip()[:1500],
            bot_answer=bot_answer.strip()[:1500],
            existing_thoughts=existing_str
        )

        messages = [
            {"role": "system", "content": "You are a precise JSON memory extraction sub-routine."},
            {"role": "user", "content": formatted_prompt}
        ]

        target_model = model_name or "gemini/gemini-3.6-flash"
        raw_response = _execute_completion_with_fallback(
            model_name=target_model,
            messages=messages,
            custom_keys=custom_keys or {},
            temperature=0.0,
            max_tokens=512
        )

        extracted_obj = extract_reasoning_and_content(raw_response)
        raw_text = extracted_obj.answer
        try:
            parsed = parse_json_object(raw_text)
        except Exception:
            parsed = None

        if not parsed or not isinstance(parsed.get("memories"), list):
            return

        new_memories = parsed.get("memories", [])
        if not new_memories:
            return

        # 3. Persist new memories in database with deduplication
        async with SessionLocal() as db:
            current_existing = await crud.get_brain_memories(db, user_id=user_id, workspace_id=session_id)
            existing_thoughts_lower = {m.thought.lower().strip() for m in current_existing}

            for mem in new_memories:
                thought = mem.get("thought", "").strip()
                if not thought or len(thought) < 6:
                    continue

                # Deduplicate exact or very close thoughts
                if thought.lower() in existing_thoughts_lower:
                    continue

                scope = mem.get("scope", "global").lower()
                if scope not in ("global", "workspace"):
                    scope = "global"

                category = mem.get("category", "preference").lower()
                if category not in ("preference", "profile", "insight", "milestone", "directive"):
                    category = "preference"

                await crud.add_brain_memory(
                    db=db,
                    user_id=user_id,
                    thought=thought,
                    scope=scope,
                    category=category,
                    workspace_id=session_id if scope == "workspace" else None,
                    is_active=True
                )
                existing_thoughts_lower.add(thought.lower())
                logger.info(f"Learned new Brain memory for user {user_id}: [{category}|{scope}] {thought}")

    except Exception as e:
        logger.warning(f"Brain background memory extraction error: {e}")
