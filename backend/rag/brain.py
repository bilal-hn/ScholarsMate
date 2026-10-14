"""Autonomous Brain memory engine: extracts durable facts and builds research memory context."""
from __future__ import annotations

import logging
from difflib import SequenceMatcher
from typing import Optional, Dict, List
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.session import SessionLocal
from backend.db import crud
from backend.rag.runtime import (
    parse_json_object,
    normalize_litellm_model_id,
    extract_reasoning_and_content,
    pick_brain_extraction_model,
)

logger = logging.getLogger("scholarsmate.brain")

# ---------------------------------------------------------------------------
# Prompt: used for periodic batch consolidation (multi-turn window)
# ---------------------------------------------------------------------------
BRAIN_BATCH_EXTRACTION_PROMPT = """You are the Memory Consolidation Engine for ScholarsMate.
Analyze the following multi-turn research conversation window and extract 0 to 3 DURABLE facts.

Focus on:
1. User Profile: Degree level, thesis/FYP project, field of study, university.
2. User Preferences: Citation styles, notation, preferred frameworks/languages.
3. Project Milestones / Decisions: Specific architectural choices, dataset selections, or research conclusions the user committed to.

Recent Dialogue:
{formatted_dialogue}

Existing Verified Memories (do NOT repeat or lightly rephrase these):
{existing_thoughts}

Instructions:
- Only extract lasting, durable facts. Discard one-off document questions or chit-chat.
- If a new memory clearly UPDATES an existing one (e.g. citation style changed), include the updated version — the system will supersede the old one automatically.
- If no durable facts appear in this window, return {{"memories": []}}.
- Output MUST be valid JSON:
{{
  "memories": [
    {{
      "thought": "Clear declarative statement",
      "scope": "global",
      "category": "profile"
    }}
  ]
}}
Valid scopes: "global" (user profile/preferences), "workspace" (project-specific findings).
Valid categories: "profile", "preference", "insight", "milestone", "directive".
"""

# Categories always injected regardless of query topic (identity + output style)
_ALWAYS_INJECT_CATEGORIES = {"profile", "preference", "directive"}
# Categories only injected when a workspace is active
_WORKSPACE_INJECT_CATEGORIES = {"insight", "milestone"}


def _is_similar(a: str, b: str, threshold: float = 0.72) -> bool:
    """Returns True if two memory strings are semantically close (≥ threshold)."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio() >= threshold


async def build_brain_context(
    db: AsyncSession,
    user_id: str,
    workspace_id: Optional[str] = None,
    session_id: Optional[str] = None
) -> str:
    """
    Retrieves active brain memories and formats them into a compact context block
    for the RAG system prompt.

    Injection tiers:
    - Profile / Preference / Directive → always injected (identity + output style, max 5)
    - Insight / Milestone              → only injected for active chat/workspace context (max 5)
    """
    if not user_id:
        return ""

    try:
        memories = await crud.get_brain_memories(
            db,
            user_id=user_id,
            workspace_id=workspace_id,
            session_id=session_id,
            active_only=True
        )
    except Exception as e:
        logger.warning(f"Failed to fetch brain memories for user {user_id}: {e}")
        return ""

    if not memories:
        return ""

    # --- Tiered selection ---
    global_core = [
        m for m in memories
        if m.scope == "global" and m.category in _ALWAYS_INJECT_CATEGORIES
    ][:5]

    chat_conditional = []
    if session_id or workspace_id:
        chat_conditional = [
            m for m in memories
            if m.scope == "workspace"
            and (m.session_id == session_id or (session_id is None and m.workspace_id == workspace_id))
            and m.category in _WORKSPACE_INJECT_CATEGORIES
        ][:5]

    all_injected = global_core + chat_conditional
    if not all_injected:
        return ""

    # --- Compact bullet format (~50–80 tokens vs the old ~400-token XML block) ---
    lines = [f"- {m.thought}" for m in all_injected]
    return "<ctx>\n" + "\n".join(lines) + "\n</ctx>"


async def consolidate_batch_memories_async(
    user_id: str,
    session_id: Optional[str],
    dialogue_window: List[Dict],
    model_name: Optional[str] = None,
    custom_keys: Optional[Dict[str, str]] = None,
    workspace_id: Optional[str] = None
):
    """
    Periodic background worker: extracts durable memories from a multi-turn
    conversation window and persists them with category-scoped superseding.

    Called from main.py at turn 3, then every 5 turns — NOT after every query.
    Always routes to the cheapest available model (pick_brain_extraction_model).
    """
    if not user_id or not dialogue_window:
        return

    from backend.rag.generator import _execute_completion_with_fallback

    try:
        # 1. Format the dialogue window into a readable block
        formatted_lines = []
        for msg in dialogue_window:
            sender = msg.get("sender", "user")
            text = (msg.get("text") or "").strip()
            if not text:
                continue
            role_label = "User" if sender == "user" else "Assistant"
            # Truncate individual turns to keep prompt compact
            formatted_lines.append(f"[{role_label}]: {text[:600]}")
        formatted_dialogue = "\n".join(formatted_lines)

        if not formatted_dialogue.strip():
            return

        # 2. Fetch existing memories (single DB session, reused for both dedup and persist)
        async with SessionLocal() as db:
            current_existing = await crud.get_brain_memories(
                db, user_id=user_id, workspace_id=session_id
            )
            existing_list = [
                f"- {m.thought} (scope: {m.scope}, category: {m.category})"
                for m in current_existing[:20]
            ]
            existing_str = "\n".join(existing_list) if existing_list else "None yet."

            # 3. Build extraction prompt and call the light model
            formatted_prompt = BRAIN_BATCH_EXTRACTION_PROMPT.format(
                formatted_dialogue=formatted_dialogue,
                existing_thoughts=existing_str,
            )
            messages = [
                {"role": "system", "content": "You are a precise JSON memory extraction sub-routine."},
                {"role": "user", "content": formatted_prompt},
            ]

            # Always use cheapest model — never the user's main-query model
            target_model, _ = pick_brain_extraction_model(custom_keys)

            raw_response = _execute_completion_with_fallback(
                model_name=target_model,
                messages=messages,
                custom_keys=custom_keys or {},
                temperature=0.0,
                max_tokens=512,
            )

            extracted_obj = extract_reasoning_and_content(raw_response)
            try:
                parsed = parse_json_object(extracted_obj.answer)
            except Exception:
                return

            if not parsed or not isinstance(parsed.get("memories"), list):
                return

            new_memories = parsed.get("memories", [])
            if not new_memories:
                return

            # 4. Persist with category-scoped superseding dedup
            for mem in new_memories:
                thought = mem.get("thought", "").strip()
                if not thought or len(thought) < 6:
                    continue

                scope = mem.get("scope", "global").lower()
                if scope not in ("global", "workspace"):
                    scope = "global"

                category = mem.get("category", "preference").lower()
                if category not in ("preference", "profile", "insight", "milestone", "directive"):
                    category = "preference"

                # Check for exact duplicate first (fast path)
                existing_thoughts_lower = {m.thought.lower().strip() for m in current_existing}
                if thought.lower() in existing_thoughts_lower:
                    continue

                # Category-scoped superseding: look for a similar memory in the same category
                same_category = [
                    m for m in current_existing
                    if m.category == category and m.scope == scope
                ]
                superseded = False
                for existing_mem in same_category:
                    if _is_similar(thought, existing_mem.thought):
                        # Overwrite — newer information wins (e.g. APA replaces IEEE)
                        await crud.update_brain_memory(
                            db=db,
                            memory_id=existing_mem.id,
                            user_id=user_id,
                            thought=thought,
                            is_active=True,
                        )
                        logger.info(
                            f"[Brain] Updated memory for {user_id}: [{category}|{scope}] "
                            f"'{existing_mem.thought}' → '{thought}'"
                        )
                        superseded = True
                        break

                if not superseded:
                    await crud.add_brain_memory(
                        db=db,
                        user_id=user_id,
                        thought=thought,
                        scope=scope,
                        category=category,
                        workspace_id=workspace_id if scope == "workspace" else None,
                        session_id=session_id if scope == "workspace" else None,
                        is_active=True,
                    )
                    logger.info(
                        f"[Brain] Learned new memory for {user_id}: [{category}|{scope}] {thought}"
                    )

    except Exception as e:
        logger.warning(f"Brain batch consolidation error: {e}")
