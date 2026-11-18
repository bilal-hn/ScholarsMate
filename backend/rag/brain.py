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
BRAIN_BATCH_EXTRACTION_PROMPT = """You are the Workspace Research Blueprint Consolidation Engine for ScholarsMate.
Analyze the following multi-turn research conversation window and extract 0 to 3 DURABLE project decisions, empirical parameters, or paper takeaways.

Focus strictly on:
1. Methodological & Architectural Decisions: Baseline architectures, model selections, algorithm choices (e.g. "Selected ResNet-50 as baseline architecture").
2. Datasets & Experimental Parameters: Specific datasets, benchmarks, evaluation splits, hyperparameters (e.g. "Using ImageNet-1k validation split with batch size 32").
3. Explicit Constraints & Exclusions: Approaches, models, or techniques discarded or ruled out and why (e.g. "Excluded Vision Transformers due to 4GB VRAM latency constraints").
4. Verified Document Findings: Concrete empirical takeaways, comparative metrics, or conclusions from papers agreed upon.

Do NOT extract:
- Personal profile trivia (university name, degree level, personal background, student year).
- Generic conversational greetings or one-off document quotes.

Recent Dialogue:
{formatted_dialogue}

Existing Verified Memories (do NOT repeat or lightly rephrase these):
{existing_thoughts}

Instructions:
- Only extract lasting, durable project facts. Discard one-off document questions or chit-chat.
- If a new memory clearly UPDATES an existing one (e.g. hyperparameter or model choice changed), include the updated version — the system will supersede the old one automatically.
- If no durable facts appear in this window, return {{"memories": []}}.
- Output MUST be valid JSON:
{{
  "memories": [
    {{
      "thought": "Clear declarative statement of project decision, parameter, or finding",
      "scope": "workspace",
      "category": "decision"
    }}
  ]
}}
Valid scopes: "workspace".
Valid categories: "decision", "finding", "constraint", "milestone".
"""

# Categories recognized for workspace blueprint injection
_VALID_BLUEPRINT_CATEGORIES = {
    "decision", "finding", "constraint", "milestone", "insight", "directive", "preference", "profile"
}


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
    Retrieves active workspace blueprint memories specifically assigned to or imported into
    this chat session (or active workspace), formatting them into a clean <workspace_blueprint> block.

    If no memories have been imported or active in this workspace, returns empty string to keep
    the RAG prompt 100% clean and free of unnecessary tokens.
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
        logger.warning(f"Failed to fetch workspace blueprint for user {user_id}: {e}")
        return ""

    if not memories:
        return ""

    # Priority 1: Memories explicitly seeded/imported into this active session
    session_specific = [m for m in memories if m.session_id == session_id and m.is_active]

    # Priority 2: Fall back to workspace-level active decisions if no session-specific seed exists
    target_memories = session_specific if session_specific else [
        m for m in memories
        if m.is_active and (m.category in _VALID_BLUEPRINT_CATEGORIES or m.scope in ("workspace", "global"))
    ]

    if not target_memories:
        return ""

    # Compact bullet format (~40–80 tokens) with backward-compatible tags
    lines = [f"- [{m.category.capitalize() if m.category else 'Note'}] {m.thought}" for m in target_memories[:5]]
    return "<workspace_blueprint>\n" + "\n".join(lines) + "\n</workspace_blueprint>"


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
                db, user_id=user_id, workspace_id=workspace_id, session_id=session_id
            )
            existing_list = [
                f"- {m.thought} (category: {m.category})"
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

                scope = "workspace"
                category = mem.get("category", "decision").lower()
                if category not in ("decision", "finding", "constraint", "milestone", "preference", "insight", "directive"):
                    category = "decision"

                # Check for exact duplicate first (fast path)
                existing_thoughts_lower = {m.thought.lower().strip() for m in current_existing}
                if thought.lower() in existing_thoughts_lower:
                    continue

                # Category-scoped superseding: look for a similar memory in the same category
                same_category = [
                    m for m in current_existing
                    if m.category == category
                ]
                superseded = False
                for existing_mem in same_category:
                    if _is_similar(thought, existing_mem.thought):
                        # Overwrite — newer decision/parameter wins
                        await crud.update_brain_memory(
                            db=db,
                            memory_id=existing_mem.id,
                            user_id=user_id,
                            thought=thought,
                            is_active=True,
                        )
                        logger.info(
                            f"[Brain] Updated workspace memory for {user_id}: [{category}] "
                            f"'{existing_mem.thought}' → '{thought}'"
                        )
                        superseded = True
                        break

                if not superseded:
                    await crud.add_brain_memory(
                        db=db,
                        user_id=user_id,
                        thought=thought,
                        scope="workspace",
                        category=category,
                        workspace_id=workspace_id,
                        session_id=session_id,
                        is_active=True,
                    )
                    logger.info(
                        f"[Brain] Learned new workspace decision for {user_id}: [{category}] {thought}"
                    )

    except Exception as e:
        logger.warning(f"Brain batch consolidation error: {e}")
