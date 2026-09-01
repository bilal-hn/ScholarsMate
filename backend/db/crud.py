import json
import uuid
from datetime import datetime
from typing import List, Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.db.models import ChatSession, ChatMessage, User, WorkspaceDraft, BrainMemory


def _normalize_json_list(val: Any) -> list:
    """Safely coerces strings, None, or JSON objects into a native Python list."""
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    return []


def _normalize_json_dict(val: Any) -> Optional[dict]:
    """Safely coerces strings, None, or JSON objects into a native Python dict."""
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None
    return None


# =============================================================================
# USER MANAGEMENT HELPERS
# =============================================================================

async def get_or_create_guest_user(db: AsyncSession, guest_id: str) -> User:
    """Retrieves or registers an anonymous guest profile."""
    resolved_id = guest_id.strip() if (guest_id and guest_id.strip()) else f"guest_{uuid.uuid4()}"
    
    stmt = select(User).where(User.id == resolved_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            id=resolved_id,
            name="Guest Researcher",
            email=None,
            avatar_url=None,
            is_guest=True,
            created_at=datetime.utcnow()
        )
        db.add(user)
        try:
            await db.commit()
            await db.refresh(user)
        except Exception:
            await db.rollback()
            res = await db.execute(select(User).where(User.id == resolved_id))
            user = res.scalar_one_or_none()

    return user


async def get_or_create_google_user(
    db: AsyncSession, 
    google_id: str, 
    name: str, 
    email: str, 
    avatar_url: Optional[str] = None
) -> User:
    """Retrieves or registers an authenticated Google account."""
    stmt = select(User).where(User.google_id == google_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            id=str(uuid.uuid4()),
            google_id=google_id,
            name=name,
            email=email,
            avatar_url=avatar_url,
            is_guest=False,
            created_at=datetime.utcnow()
        )
        db.add(user)
        try:
            await db.commit()
            await db.refresh(user)
        except Exception:
            await db.rollback()
            res = await db.execute(select(User).where(User.google_id == google_id))
            user = res.scalar_one_or_none()
    else:
        user.name = name
        user.email = email
        user.avatar_url = avatar_url
        await db.commit()
        await db.refresh(user)

    return user


# =============================================================================
# CHAT SESSION CRUD
# =============================================================================

async def create_chat_session(
    db: AsyncSession, 
    title: str = "New Research Chat", 
    doc_names: Optional[List[str]] = None,
    user_id: Optional[str] = None,
    active_mode: str = "assistant"
) -> ChatSession:
    """Creates a new persistent chat session thread linked to a specific user/tenant."""
    target_docs = doc_names if isinstance(doc_names, list) else []
    
    session = ChatSession(
        id=str(uuid.uuid4()),
        title=title,
        doc_names=target_docs,
        user_id=user_id,
        active_mode=active_mode or "assistant",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    
    session.doc_names = _normalize_json_list(session.doc_names)
    return session


async def update_session_mode(
    db: AsyncSession,
    session_id: str,
    mode: str,
    user_id: Optional[str] = None
) -> Optional[ChatSession]:
    """Updates the active reasoning mode for a chat session."""
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    if user_id:
        stmt = stmt.where(ChatSession.user_id == user_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        return None

    session.active_mode = mode.strip().lower() if mode else "assistant"
    session.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(session)
    session.doc_names = _normalize_json_list(session.doc_names)
    return session


async def get_all_sessions(
    db: AsyncSession, 
    user_id: Optional[str] = None
) -> List[ChatSession]:
    """Retrieves all chat sessions for a specific user ordered by latest update timestamp."""
    stmt = select(ChatSession).order_by(ChatSession.updated_at.desc())
    if user_id:
        stmt = stmt.where(ChatSession.user_id == user_id)
        
    result = await db.execute(stmt)
    sessions = list(result.scalars().all())

    for s in sessions:
        s.doc_names = _normalize_json_list(s.doc_names)

    return sessions


async def get_session_messages(
    db: AsyncSession, 
    session_id: str
) -> List[ChatMessage]:
    """Retrieves all messages for a specific session ordered chronologically."""
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.timestamp.asc())
    )
    messages = list(result.scalars().all())

    for m in messages:
        m.sources_used = _normalize_json_list(m.sources_used)
        m.meta = _normalize_json_dict(m.meta)

    return messages


async def add_message(
    db: AsyncSession, 
    session_id: str, 
    sender: str, 
    text: str, 
    thinking_process: Optional[str] = None,
    sources: Optional[list] = None,
    model_name: Optional[str] = None,
    mode_applied: Optional[str] = "research",
    meta: Optional[dict] = None
) -> ChatMessage:
    """Adds a new message to a chat session, stores reasoning trace & telemetry, and touches session timestamp."""
    message = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=session_id,
        sender=sender,
        text=text,
        thinking_process=thinking_process,
        sources_used=sources or [],
        model_name=model_name,
        mode_applied=mode_applied or "research",
        meta=meta,
        timestamp=datetime.utcnow()
    )
    db.add(message)

    # Touch session updated_at timestamp
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    session_res = await db.execute(stmt)
    session = session_res.scalar_one_or_none()
    if session:
        session.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(message)
    
    message.sources_used = _normalize_json_list(message.sources_used)
    message.meta = _normalize_json_dict(message.meta)
    return message


async def delete_session(
    db: AsyncSession, 
    session_id: str, 
    user_id: Optional[str] = None
) -> bool:
    """Deletes a chat session belonging to the user and cascades deletion to all associated messages."""
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    if user_id:
        stmt = stmt.where(ChatSession.user_id == user_id)
        
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if session:
        await db.delete(session)
        await db.commit()
        return True
    return False


# =============================================================================
# WORKSPACE DRAFT CRUD (FR-13)
# =============================================================================

async def get_workspace_draft(db: AsyncSession, session_id: str) -> Optional[WorkspaceDraft]:
    """Retrieves the persisted academic draft for a given workspace session."""
    stmt = select(WorkspaceDraft).where(WorkspaceDraft.session_id == session_id)
    res = await db.execute(stmt)
    draft = res.scalar_one_or_none()
    if draft:
        draft.citations_data = _normalize_json_list(draft.citations_data)
    return draft


async def save_workspace_draft(
    db: AsyncSession,
    session_id: str,
    title: str = "Untitled Academic Draft",
    content_html: str = "",
    content_markdown: str = "",
    citations_data: Optional[list] = None
) -> WorkspaceDraft:
    """Creates or updates the academic draft and bibliography metadata for a session."""
    stmt = select(WorkspaceDraft).where(WorkspaceDraft.session_id == session_id)
    res = await db.execute(stmt)
    draft = res.scalar_one_or_none()

    clean_citations = citations_data if isinstance(citations_data, list) else []

    if not draft:
        draft = WorkspaceDraft(
            id=str(uuid.uuid4()),
            session_id=session_id,
            title=title,
            content_html=content_html,
            content_markdown=content_markdown,
            citations_data=clean_citations,
            updated_at=datetime.utcnow()
        )
        db.add(draft)
    else:
        draft.title = title
        draft.content_html = content_html
        draft.content_markdown = content_markdown
        draft.citations_data = clean_citations
        draft.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(draft)
    draft.citations_data = _normalize_json_list(draft.citations_data)
    return draft


# =============================================================================
# BRAIN MEMORY CRUD OPERATIONS
# =============================================================================

async def get_brain_memories(
    db: AsyncSession,
    user_id: str,
    workspace_id: Optional[str] = None,
    scope: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = False
) -> List[BrainMemory]:
    """Retrieves brain memories for a user with optional workspace and scope filters."""
    stmt = select(BrainMemory).where(BrainMemory.user_id == user_id)

    if scope:
        stmt = stmt.where(BrainMemory.scope == scope)
    elif workspace_id:
        # If workspace provided without strict scope, get both global memories and workspace-specific memories
        stmt = stmt.where(
            (BrainMemory.scope == "global") | (BrainMemory.workspace_id == workspace_id)
        )

    if category:
        stmt = stmt.where(BrainMemory.category == category)

    if active_only:
        stmt = stmt.where(BrainMemory.is_active.is_(True))

    stmt = stmt.order_by(BrainMemory.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def add_brain_memory(
    db: AsyncSession,
    user_id: str,
    thought: str,
    scope: str = "global",
    category: str = "preference",
    workspace_id: Optional[str] = None,
    is_active: bool = True
) -> BrainMemory:
    """Inserts a new learned thought or instruction into Brain memory."""
    clean_thought = thought.strip()
    memory = BrainMemory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        workspace_id=workspace_id if scope == "workspace" else None,
        scope=scope,
        category=category,
        thought=clean_thought,
        is_active=is_active,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(memory)
    await db.commit()
    await db.refresh(memory)
    return memory


async def update_brain_memory(
    db: AsyncSession,
    memory_id: str,
    user_id: str,
    thought: Optional[str] = None,
    category: Optional[str] = None,
    scope: Optional[str] = None,
    workspace_id: Optional[str] = None,
    is_active: Optional[bool] = None
) -> Optional[BrainMemory]:
    """Updates an existing brain memory record."""
    stmt = select(BrainMemory).where(
        BrainMemory.id == memory_id,
        BrainMemory.user_id == user_id
    )
    result = await db.execute(stmt)
    memory = result.scalar_one_or_none()

    if not memory:
        return None

    if thought is not None:
        memory.thought = thought.strip()
    if category is not None:
        memory.category = category
    if scope is not None:
        memory.scope = scope
        if scope == "global":
            memory.workspace_id = None
        elif workspace_id is not None:
            memory.workspace_id = workspace_id
    if is_active is not None:
        memory.is_active = is_active

    memory.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(memory)
    return memory


async def delete_brain_memory(
    db: AsyncSession,
    memory_id: str,
    user_id: str
) -> bool:
    """Deletes a single brain memory record."""
    stmt = select(BrainMemory).where(
        BrainMemory.id == memory_id,
        BrainMemory.user_id == user_id
    )
    result = await db.execute(stmt)
    memory = result.scalar_one_or_none()

    if not memory:
        return False

    await db.delete(memory)
    await db.commit()
    return True


async def clear_brain_memories(
    db: AsyncSession,
    user_id: str,
    scope: Optional[str] = None,
    workspace_id: Optional[str] = None
) -> int:
    """Batch clears brain memories for a user."""
    stmt = select(BrainMemory).where(BrainMemory.user_id == user_id)
    if scope:
        stmt = stmt.where(BrainMemory.scope == scope)
    if workspace_id:
        stmt = stmt.where(BrainMemory.workspace_id == workspace_id)

    result = await db.execute(stmt)
    memories = list(result.scalars().all())
    count = len(memories)

    for m in memories:
        await db.delete(m)

    await db.commit()
    return count