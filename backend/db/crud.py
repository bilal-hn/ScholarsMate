import asyncio
import json
import uuid
from datetime import datetime
from typing import List, Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sql_delete
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import selectinload
from backend.db.models import ChatSession, ChatMessage, User, Workspace, WorkspaceDraft, BrainMemory, UserDocument, WriterDocument, Folder, FolderItem


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
            name="Guest",
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
# WORKSPACE CRUD (HOLDS PAPERS & UP TO 3 CHATS)
# =============================================================================

async def create_workspace(
    db: AsyncSession,
    name: str = "New Workspace",
    doc_names: Optional[List[str]] = None,
    user_id: Optional[str] = None
) -> tuple[Workspace, ChatSession]:
    """Creates a new Workspace container and automatically initializes its first chat session (Chat 1)."""
    target_docs = doc_names if isinstance(doc_names, list) else []
    clean_name = name.strip() if name and name.strip() else "New Workspace"

    workspace = Workspace(
        id=str(uuid.uuid4()),
        name=clean_name,
        doc_names=target_docs,
        user_id=user_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(workspace)
    await db.flush()

    # Automatically initialize Chat 1 for this workspace
    first_chat = ChatSession(
        id=str(uuid.uuid4()),
        workspace_id=workspace.id,
        title="Chat 1",
        doc_names=target_docs,
        user_id=user_id,
        active_mode="research",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(first_chat)
    await db.commit()
    await db.refresh(workspace)
    await db.refresh(first_chat)

    workspace.doc_names = _normalize_json_list(workspace.doc_names)
    first_chat.doc_names = _normalize_json_list(first_chat.doc_names)
    return workspace, first_chat


async def get_user_workspaces(
    db: AsyncSession,
    user_id: Optional[str] = None
) -> List[Workspace]:
    """Retrieves all workspaces for a user along with their child chat sessions (ordered, max 3)."""
    stmt = (
        select(Workspace)
        .options(selectinload(Workspace.sessions))
        .order_by(Workspace.updated_at.desc())
    )
    if user_id:
        stmt = stmt.where(Workspace.user_id == user_id)

    result = await db.execute(stmt)
    workspaces = list(result.scalars().all())

    for ws in workspaces:
        ws.doc_names = _normalize_json_list(ws.doc_names)
        for s in ws.sessions:
            s.doc_names = _normalize_json_list(s.doc_names)

    return workspaces


async def get_workspace_by_id(
    db: AsyncSession,
    workspace_id: str,
    user_id: Optional[str] = None
) -> Optional[Workspace]:
    """Retrieves a single workspace by ID with its chat sessions."""
    stmt = (
        select(Workspace)
        .options(selectinload(Workspace.sessions))
        .where(Workspace.id == workspace_id)
    )
    if user_id:
        stmt = stmt.where(Workspace.user_id == user_id)

    result = await db.execute(stmt)
    ws = result.scalar_one_or_none()
    if ws:
        ws.doc_names = _normalize_json_list(ws.doc_names)
        for s in ws.sessions:
            s.doc_names = _normalize_json_list(s.doc_names)
    return ws


async def add_chat_to_workspace(
    db: AsyncSession,
    workspace_id: str,
    user_id: Optional[str] = None,
    title: Optional[str] = None
) -> ChatSession:
    """
    Creates a new chat session inside an existing workspace.
    Enforces the strict limit of maximum 3 chats per workspace.
    """
    ws = await get_workspace_by_id(db, workspace_id, user_id=user_id)
    if not ws:
        raise ValueError(f"Workspace '{workspace_id}' not found.")

    if len(ws.sessions) >= 3:
        raise ValueError("Maximum limit of 3 chats reached for this workspace. Delete or reuse an existing chat.")

    chat_num = len(ws.sessions) + 1
    chat_title = title.strip() if title and title.strip() else f"Chat {chat_num}"

    new_chat = ChatSession(
        id=str(uuid.uuid4()),
        workspace_id=ws.id,
        title=chat_title,
        doc_names=list(ws.doc_names or []),
        user_id=user_id,
        active_mode="research",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(new_chat)
    ws.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(new_chat)
    new_chat.doc_names = _normalize_json_list(new_chat.doc_names)
    return new_chat


async def rename_workspace(
    db: AsyncSession,
    workspace_id: str,
    new_name: str,
    user_id: Optional[str] = None
) -> Optional[Workspace]:
    """Renames an existing workspace."""
    ws = await get_workspace_by_id(db, workspace_id, user_id=user_id)
    if not ws:
        return None

    ws.name = new_name.strip()
    ws.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(ws)
    return ws


async def add_documents_to_workspace(
    db: AsyncSession,
    workspace_id: str,
    doc_names: List[str],
    user_id: Optional[str] = None
) -> Optional[Workspace]:
    """Adds and deduplicates document filenames to a workspace and all its child chat sessions."""
    ws = await get_workspace_by_id(db, workspace_id, user_id=user_id)
    if not ws:
        return None

    existing = list(ws.doc_names or [])
    updated = list(dict.fromkeys(existing + doc_names))
    ws.doc_names = updated
    ws.updated_at = datetime.utcnow()

    # Also update doc_names on all child sessions
    for s in ws.sessions:
        s.doc_names = updated
        s.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(ws)
    ws.doc_names = _normalize_json_list(ws.doc_names)
    return ws


async def remove_document_from_workspace(
    db: AsyncSession,
    workspace_id: str,
    doc_name: str,
    user_id: Optional[str] = None
) -> Optional[Workspace]:
    """Removes a document from a workspace and its child chat sessions."""
    ws = await get_workspace_by_id(db, workspace_id, user_id=user_id)
    if not ws:
        return None

    existing = list(ws.doc_names or [])
    updated = [d for d in existing if d != doc_name]
    ws.doc_names = updated
    ws.updated_at = datetime.utcnow()

    for s in ws.sessions:
        s.doc_names = updated
        s.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(ws)
    ws.doc_names = _normalize_json_list(ws.doc_names)
    return ws


async def delete_workspace(
    db: AsyncSession,
    workspace_id: str,
    user_id: Optional[str] = None
) -> bool:
    """Deletes a workspace and cascades deletion to all child chat sessions and drafts."""
    stmt = select(Workspace).where(Workspace.id == workspace_id)
    if user_id:
        stmt = stmt.where(Workspace.user_id == user_id)
    result = await db.execute(stmt)
    ws = result.scalar_one_or_none()
    if not ws:
        return False

    await db.delete(ws)
    await db.commit()
    return True


# =============================================================================
# CHAT SESSION CRUD
# =============================================================================

async def create_chat_session(
    db: AsyncSession, 
    title: str = "New Research Chat", 
    doc_names: Optional[List[str]] = None,
    user_id: Optional[str] = None,
    active_mode: str = "assistant",
    workspace_id: Optional[str] = None
) -> ChatSession:
    """Creates a new persistent chat session thread linked to a specific user/tenant and optional workspace."""
    target_docs = doc_names if isinstance(doc_names, list) else []
    
    session = ChatSession(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
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


async def get_session_by_id(
    db: AsyncSession, 
    session_id: str, 
    user_id: Optional[str] = None
) -> Optional[ChatSession]:
    """Retrieves a single chat session by ID."""
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    if user_id:
        stmt = stmt.where(ChatSession.user_id == user_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if session:
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
    user_id: Optional[str] = None,
    standalone_only: bool = False
) -> List[ChatSession]:
    """Retrieves chat sessions for a specific user ordered by latest update timestamp."""
    stmt = select(ChatSession).order_by(ChatSession.updated_at.desc())
    if user_id:
        stmt = stmt.where(ChatSession.user_id == user_id)
    if standalone_only:
        stmt = stmt.where(ChatSession.workspace_id.is_(None))
        
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


async def update_message(db: AsyncSession, msg: ChatMessage, **fields) -> ChatMessage:
    """Updates fields on an existing message and commits.

    JSON columns are not change-tracked in place, so callers must pass a new dict/list
    for `meta` or `sources_used` (never mutate the existing one).
    """
    for key, value in fields.items():
        setattr(msg, key, value)
    await db.commit()
    await db.refresh(msg)
    msg.sources_used = _normalize_json_list(msg.sources_used)
    msg.meta = _normalize_json_dict(msg.meta)
    return msg


async def get_user_message(
    db: AsyncSession,
    message_id: str,
    user_id: str
) -> Optional[ChatMessage]:
    """Fetches a message only if its session belongs to user_id."""
    result = await db.execute(
        select(ChatMessage)
        .join(ChatSession, ChatSession.id == ChatMessage.session_id)
        .where(ChatMessage.id == message_id, ChatSession.user_id == user_id)
    )
    msg = result.scalar_one_or_none()
    if msg:
        msg.sources_used = _normalize_json_list(msg.sources_used)
        msg.meta = _normalize_json_dict(msg.meta)
    return msg


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


async def add_documents_to_session(
    db: AsyncSession,
    session_id: str,
    doc_names: List[str],
    user_id: Optional[str] = None
) -> Optional[ChatSession]:
    """Appends and deduplicates document filenames to a chat session/workspace."""
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    if user_id:
        stmt = stmt.where(ChatSession.user_id == user_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        return None

    existing = list(session.doc_names or [])
    updated = list(dict.fromkeys(existing + doc_names))
    session.doc_names = updated
    session.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(session)
    session.doc_names = _normalize_json_list(session.doc_names)
    return session


async def remove_document_from_session(
    db: AsyncSession,
    session_id: str,
    doc_name: str,
    user_id: Optional[str] = None
) -> Optional[ChatSession]:
    """Removes a single document from a chat session/workspace."""
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    if user_id:
        stmt = stmt.where(ChatSession.user_id == user_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        return None

    existing = list(session.doc_names or [])
    updated = [d for d in existing if d != doc_name]
    session.doc_names = updated
    session.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(session)
    session.doc_names = _normalize_json_list(session.doc_names)
    return session


async def rename_session(
    db: AsyncSession,
    session_id: str,
    new_title: str,
    user_id: Optional[str] = None
) -> Optional[ChatSession]:
    """Renames the title of a chat session/workspace."""
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    if user_id:
        stmt = stmt.where(ChatSession.user_id == user_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        return None

    session.title = new_title.strip()
    session.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(session)
    session.doc_names = _normalize_json_list(session.doc_names)
    return session



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
    session_id: Optional[str] = None,
    scope: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = False
) -> List[BrainMemory]:
    """Retrieves brain memories for a user with optional workspace, session, and scope filters."""
    stmt = select(BrainMemory).where(BrainMemory.user_id == user_id)

    if scope:
        stmt = stmt.where(BrainMemory.scope == scope)
    elif session_id:
        # Match global core OR this specific chat's memories OR this workspace's unassigned memories
        stmt = stmt.where(
            (BrainMemory.scope == "global") |
            (BrainMemory.session_id == session_id) |
            ((BrainMemory.workspace_id == workspace_id) & (BrainMemory.session_id.is_(None)))
        )
    elif workspace_id:
        # Match global memories or workspace memories
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
    session_id: Optional[str] = None,
    is_active: bool = True
) -> BrainMemory:
    """Inserts a new learned thought or instruction into Brain memory."""
    clean_thought = thought.strip()
    memory = BrainMemory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        workspace_id=workspace_id if scope == "workspace" else None,
        session_id=session_id if scope == "workspace" else None,
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


# =============================================================================
# WORKSPACE CONTEXT POINTS & CROSS-CHAT BRAIN SHARING
# =============================================================================

async def get_workspace_context_points(
    db: AsyncSession,
    workspace_id: str,
    exclude_session_id: Optional[str] = None,
    user_id: Optional[str] = None
) -> List[dict]:
    """
    Retrieves atomic context points / memories recorded in other chats of the same workspace.
    Allows a new chat to optionally pull verified insights without expensive LLM re-extraction.
    """
    # 1. Find all sessions in this workspace
    session_stmt = select(ChatSession).where(ChatSession.workspace_id == workspace_id)
    if user_id:
        session_stmt = session_stmt.where(ChatSession.user_id == user_id)
    if exclude_session_id:
        session_stmt = session_stmt.where(ChatSession.id != exclude_session_id)

    sessions_res = await db.execute(session_stmt)
    sessions = list(sessions_res.scalars().all())
    if not sessions:
        return []

    session_map = {s.id: s.title for s in sessions}
    session_ids = list(session_map.keys())

    # 2. Find active brain memories recorded under these sister sessions
    mem_stmt = select(BrainMemory).where(
        BrainMemory.is_active.is_(True),
        (
            BrainMemory.session_id.in_(session_ids) |
            ((BrainMemory.workspace_id == workspace_id) & (BrainMemory.session_id.is_(None)))
        )
    )
    if user_id:
        mem_stmt = mem_stmt.where(BrainMemory.user_id == user_id)

    mem_stmt = mem_stmt.order_by(BrainMemory.created_at.desc())
    mem_res = await db.execute(mem_stmt)
    memories = list(mem_res.scalars().all())

    # De-duplicate by thought text to keep context clean
    seen_thoughts = set()
    result = []
    for m in memories:
        t_clean = m.thought.strip().lower()
        if t_clean in seen_thoughts:
            continue
        seen_thoughts.add(t_clean)
        result.append({
            "id": m.id,
            "thought": m.thought,
            "category": m.category,
            "scope": m.scope,
            "session_id": m.session_id,
            "session_title": session_map.get(m.session_id, "Previous Chat"),
            "created_at": m.created_at.isoformat() if m.created_at else None
        })

    return result


async def import_context_points(
    db: AsyncSession,
    target_session_id: str,
    memory_ids: List[str],
    user_id: str
) -> List[BrainMemory]:
    """
    Pulls chosen context points into the target session as active memories.
    Does NOT invoke any LLM calls — 100% cheap local database cloning.
    """
    if not memory_ids:
        return []

    # Get target session to verify existence and get workspace_id
    target_session = await get_session_by_id(db, target_session_id, user_id=user_id)
    if not target_session:
        raise ValueError(f"Target session '{target_session_id}' not found.")

    # Get memories already in target session to avoid duplicates
    existing_stmt = select(BrainMemory).where(
        BrainMemory.user_id == user_id,
        BrainMemory.session_id == target_session_id,
        BrainMemory.is_active.is_(True)
    )
    existing_res = await db.execute(existing_stmt)
    existing_thoughts = {m.thought.strip().lower() for m in existing_res.scalars().all()}

    # Fetch candidate memories
    candidate_stmt = select(BrainMemory).where(
        BrainMemory.id.in_(memory_ids),
        BrainMemory.user_id == user_id
    )
    candidate_res = await db.execute(candidate_stmt)
    candidates = list(candidate_res.scalars().all())

    imported = []
    for c in candidates:
        if c.thought.strip().lower() in existing_thoughts:
            continue
        new_mem = BrainMemory(
            id=str(uuid.uuid4()),
            user_id=user_id,
            workspace_id=target_session.workspace_id,
            session_id=target_session_id,
            scope="workspace",
            category=c.category,
            thought=c.thought.strip(),
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(new_mem)
        existing_thoughts.add(c.thought.strip().lower())
        imported.append(new_mem)

    if imported:
        await db.commit()
        for m in imported:
            await db.refresh(m)

    return imported


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
    """Atomically clears brain memories for a user via a single bulk SQL DELETE."""
    stmt = sql_delete(BrainMemory).where(BrainMemory.user_id == user_id)
    if scope:
        stmt = stmt.where(BrainMemory.scope == scope)
    if workspace_id:
        stmt = stmt.where(BrainMemory.workspace_id == workspace_id)

    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount


# =============================================================================
# FR-17: ACADEMIC REFERENCE MANAGER & LIBRARY CRUD
# =============================================================================

async def get_user_library(
    db: AsyncSession,
    user_id: str,
    tag: Optional[str] = None,
    workspace_id: Optional[str] = None,
    search: Optional[str] = None,
) -> List[UserDocument]:
    """Fetches user library documents with optional tag, workspace, and search filtering."""
    stmt = select(UserDocument).where(UserDocument.user_id == user_id)

    # If workspace_id is provided, find docs attached to that workspace
    if workspace_id:
        ws_stmt = select(Workspace).where(Workspace.id == workspace_id, Workspace.user_id == user_id)
        ws_res = await db.execute(ws_stmt)
        ws = ws_res.scalar_one_or_none()
        if ws and ws.doc_names:
            stmt = stmt.where(UserDocument.doc_name.in_(ws.doc_names))
        else:
            return []

    stmt = stmt.order_by(UserDocument.created_at.desc())
    result = await db.execute(stmt)
    docs = list(result.scalars().all())

    # Tag filtering (JSON array in SQLite)
    if tag:
        docs = [d for d in docs if tag in (d.tags or [])]

    # Search filtering (Title, Authors, doc_name)
    if search and search.strip():
        q = search.strip().lower()
        docs = [
            d for d in docs
            if q in (d.doc_name or "").lower()
            or q in (d.title or "").lower()
            or q in (d.authors or "").lower()
            or q in (d.venue or "").lower()
            or q in (d.year or "").lower()
        ]

    return docs


async def get_library_document(
    db: AsyncSession,
    doc_id: str,
    user_id: str
) -> Optional[UserDocument]:
    """Retrieves a single library document by ID with user isolation."""
    stmt = select(UserDocument).where(UserDocument.id == doc_id, UserDocument.user_id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_owned_doc_names(db: AsyncSession, user_id: str) -> set[str]:
    """Every library doc name this user owns: the only names a vector search may be scoped to."""
    result = await db.execute(select(UserDocument.doc_name).where(UserDocument.user_id == user_id))
    return {name for name in result.scalars().all() if name}


async def get_library_document_by_name(
    db: AsyncSession,
    doc_name: str,
    user_id: str
) -> Optional[UserDocument]:
    """Retrieves a library document by filename with user isolation."""
    stmt = select(UserDocument).where(UserDocument.doc_name == doc_name, UserDocument.user_id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_library_document(
    db: AsyncSession,
    doc_id: str,
    user_id: str,
    updates: dict
) -> Optional[UserDocument]:
    """Updates bibliographic metadata for a document."""
    doc = await get_library_document(db, doc_id=doc_id, user_id=user_id)
    if not doc:
        return None

    allowed_fields = {
        "item_type", "title", "authors", "year", "venue", 
        "doi", "arxiv_id", "url", "abstract", "tags", "notes"
    }
    for field, val in updates.items():
        if field in allowed_fields:
            setattr(doc, field, val)

    doc.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(doc)
    return doc


async def delete_library_document(
    db: AsyncSession,
    doc_id: str,
    user_id: str
) -> bool:
    """Deletes a document from the user's library and disassociates it from workspaces."""
    doc = await get_library_document(db, doc_id=doc_id, user_id=user_id)
    if not doc:
        return False

    doc_name = doc.doc_name

    # Remove from all workspaces of this user
    ws_stmt = select(Workspace).where(Workspace.user_id == user_id)
    ws_result = await db.execute(ws_stmt)
    workspaces = ws_result.scalars().all()
    for ws in workspaces:
        if ws.doc_names and doc_name in ws.doc_names:
            ws.doc_names = [d for d in ws.doc_names if d != doc_name]

    await db.execute(sql_delete(FolderItem).where(FolderItem.document_id == doc.id))
    await db.delete(doc)
    await db.commit()
    return True


async def update_library_doc_attachment(
    db: AsyncSession,
    doc_id: str,
    user_id: str,
    new_doc_name: str,
    new_file_hash: str,
    new_file_size: int,
) -> Optional[UserDocument]:
    """Updates a library document's doc_name, file_hash, and file_size, and updates workspace references."""
    doc = await get_library_document(db, doc_id=doc_id, user_id=user_id)
    if not doc:
        return None

    old_doc_name = doc.doc_name
    doc.doc_name = new_doc_name
    doc.file_hash = new_file_hash
    doc.file_size_bytes = new_file_size
    doc.updated_at = datetime.utcnow()

    # Update workspace doc_names if old_doc_name changed
    if old_doc_name and old_doc_name != new_doc_name:
        ws_stmt = select(Workspace).where(Workspace.user_id == user_id)
        ws_result = await db.execute(ws_stmt)
        workspaces = ws_result.scalars().all()
        for ws in workspaces:
            if ws.doc_names and old_doc_name in ws.doc_names:
                ws.doc_names = [new_doc_name if d == old_doc_name else d for d in ws.doc_names]
                # Also update sessions
                for s in (ws.sessions or []):
                    if s.doc_names and old_doc_name in s.doc_names:
                        s.doc_names = [new_doc_name if d == old_doc_name else d for d in s.doc_names]

    await db.commit()
    await db.refresh(doc)
    return doc





# =============================================================================
# STANDALONE WRITER DOCUMENTS
# =============================================================================

async def list_writer_docs(db: AsyncSession, user_id: str) -> List[WriterDocument]:
    res = await db.execute(
        select(WriterDocument)
        .where(WriterDocument.user_id == user_id)
        .order_by(WriterDocument.updated_at.desc())
    )
    return list(res.scalars().all())


async def get_writer_doc(db: AsyncSession, doc_id: str, user_id: str) -> Optional[WriterDocument]:
    res = await db.execute(
        select(WriterDocument).where(WriterDocument.id == doc_id, WriterDocument.user_id == user_id)
    )
    return res.scalar_one_or_none()


async def create_writer_doc(db: AsyncSession, user_id: str, title: str, content_html: str, citations_data: list) -> WriterDocument:
    doc = WriterDocument(user_id=user_id, title=title, content_html=content_html, citations_data=citations_data)
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def update_writer_doc(db: AsyncSession, doc_id: str, user_id: str, fields: dict) -> Optional[WriterDocument]:
    """Applies only the keys present in `fields`; updated_at is bumped on every write."""
    doc = await get_writer_doc(db, doc_id, user_id)
    if not doc:
        return None
    for key, value in fields.items():
        setattr(doc, key, value)
    doc.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(doc)
    return doc


async def delete_writer_doc(db: AsyncSession, doc_id: str, user_id: str) -> bool:
    doc = await get_writer_doc(db, doc_id, user_id)
    if not doc:
        return False
    await db.delete(doc)
    await db.commit()
    return True


# =============================================================================
# LIBRARY FOLDERS
# =============================================================================

MAX_FOLDER_DEPTH = 8


class FolderConflict(Exception):
    """Cycle or depth violation; the route maps it to 409."""


# Serialises every folder-tree check-then-write, so two concurrent moves can't both pass the cycle check.
# ponytail: process-wide lock, correct only while the app runs one uvicorn worker (Dockerfile does);
# with several workers, take SQLite's write lock first (flush the UPDATE, re-read with populate_existing, re-check).
_FOLDER_TREE_LOCK = asyncio.Lock()


async def _folder_map(db: AsyncSession, user_id: str) -> dict:
    res = await db.execute(select(Folder).where(Folder.user_id == user_id))
    return {f.id: f for f in res.scalars().all()}


def _depth(folders: dict, folder_id: Optional[str]) -> int:
    """Levels from the root down to folder_id inclusive (None -> 0)."""
    depth, seen = 0, set()
    while folder_id and folder_id not in seen:
        seen.add(folder_id)
        folder = folders.get(folder_id)
        if folder is None:
            break
        depth += 1
        folder_id = folder.parent_id
    return depth


def _subtree(folders: dict, root_id: str):
    """Breadth-first: (ids in the subtree incl. root, height in levels incl. root)."""
    kids: dict = {}
    for f in folders.values():
        kids.setdefault(f.parent_id, []).append(f.id)
    ids, level, height, seen = [], [root_id], 0, {root_id}
    while level:
        height += 1
        ids.extend(level)
        nxt = []
        for fid in level:
            for c in kids.get(fid, []):
                if c not in seen:  # keeps a corrupted (cyclic) tree from looping forever
                    seen.add(c)
                    nxt.append(c)
        level = nxt
    return ids, height


async def list_folders(db: AsyncSession, user_id: str) -> List[dict]:
    folders = await _folder_map(db, user_id)
    if not folders:
        return []
    # Join user_documents so a membership never points at a deleted paper.
    res = await db.execute(
        select(FolderItem.folder_id, FolderItem.document_id)
        .join(UserDocument, UserDocument.id == FolderItem.document_id)
        .where(UserDocument.user_id == user_id, FolderItem.folder_id.in_(list(folders)))
    )
    items: dict = {}
    for folder_id, doc_id in res.all():
        items.setdefault(folder_id, []).append(doc_id)
    return [
        {"id": f.id, "name": f.name, "parent_id": f.parent_id, "item_ids": sorted(items.get(f.id, []))}
        for f in sorted(folders.values(), key=lambda f: (f.created_at, f.id))
    ]


async def _folder_with_items(db: AsyncSession, folders: dict, folder_id: str) -> dict:
    f = folders[folder_id]
    # Same join as list_folders, so both views agree even if a membership outlived its paper.
    res = await db.execute(
        select(FolderItem.document_id)
        .join(UserDocument, UserDocument.id == FolderItem.document_id)
        .where(FolderItem.folder_id == folder_id, UserDocument.user_id == f.user_id)
    )
    return {"id": f.id, "name": f.name, "parent_id": f.parent_id, "item_ids": sorted(res.scalars().all())}


async def create_folder(db: AsyncSession, user_id: str, name: str, parent_id: Optional[str]) -> Optional[dict]:
    """None when parent_id is not the caller's folder (404); FolderConflict past max depth."""
    async with _FOLDER_TREE_LOCK:
        folders = await _folder_map(db, user_id)
        if parent_id is not None:
            if parent_id not in folders:
                return None
            if _depth(folders, parent_id) + 1 > MAX_FOLDER_DEPTH:
                raise FolderConflict(f"Folders can be nested at most {MAX_FOLDER_DEPTH} levels deep.")
        folder = Folder(user_id=user_id, name=name, parent_id=parent_id)
        db.add(folder)
        await db.commit()
    return {"id": folder.id, "name": folder.name, "parent_id": folder.parent_id, "item_ids": []}


async def update_folder(db: AsyncSession, user_id: str, folder_id: str, fields: dict) -> Optional[dict]:
    """fields may hold name and/or parent_id. None -> 404 (folder or new parent not the caller's)."""
    async with _FOLDER_TREE_LOCK:
        return await _update_folder_locked(db, user_id, folder_id, fields)


async def _update_folder_locked(db: AsyncSession, user_id: str, folder_id: str, fields: dict) -> Optional[dict]:
    folders = await _folder_map(db, user_id)
    folder = folders.get(folder_id)
    if folder is None:
        return None
    if "parent_id" in fields:
        new_parent = fields["parent_id"]
        if new_parent is not None:
            if new_parent not in folders:
                return None
            subtree_ids, height = _subtree(folders, folder_id)
            if new_parent in subtree_ids:  # self or a descendant
                raise FolderConflict("A folder cannot be moved into itself or its own subfolder.")
            if _depth(folders, new_parent) + height > MAX_FOLDER_DEPTH:
                raise FolderConflict(f"Folders can be nested at most {MAX_FOLDER_DEPTH} levels deep.")
        folder.parent_id = new_parent
    if "name" in fields:
        folder.name = fields["name"]
    await db.commit()
    return await _folder_with_items(db, folders, folder_id)


async def delete_folder(db: AsyncSession, user_id: str, folder_id: str) -> bool:
    """Deletes the folder, its descendants and their memberships; never library documents."""
    async with _FOLDER_TREE_LOCK:  # a concurrent move must not re-parent into a subtree being deleted
        folders = await _folder_map(db, user_id)
        if folder_id not in folders:
            return False
        ids, _ = _subtree(folders, folder_id)
        await db.execute(sql_delete(FolderItem).where(FolderItem.folder_id.in_(ids)))
        await db.execute(sql_delete(Folder).where(Folder.id.in_(ids), Folder.user_id == user_id))
        await db.commit()
    return True


async def _owned_doc_ids(db: AsyncSession, user_id: str, document_ids: List[str]) -> Optional[List[str]]:
    """Deduped ids if every one is the caller's user_documents row, else None."""
    wanted = list(dict.fromkeys(document_ids))
    res = await db.execute(
        select(UserDocument.id).where(UserDocument.user_id == user_id, UserDocument.id.in_(wanted))
    )
    return wanted if len(res.scalars().all()) == len(wanted) else None


async def add_folder_items(db: AsyncSession, user_id: str, folder_id: str, document_ids: List[str]) -> Optional[dict]:
    """None -> 404 (folder or any document not the caller's; nothing changes). Idempotent."""
    folders = await _folder_map(db, user_id)
    wanted = await _owned_doc_ids(db, user_id, document_ids)
    if folder_id not in folders or wanted is None:
        return None
    # ON CONFLICT DO NOTHING keeps a double-submitted add idempotent instead of a 500.
    await db.execute(
        sqlite_insert(FolderItem)
        .values([{"folder_id": folder_id, "document_id": d} for d in wanted])
        .on_conflict_do_nothing()
    )
    await db.commit()
    return await _folder_with_items(db, folders, folder_id)


async def remove_folder_items(db: AsyncSession, user_id: str, folder_id: str, document_ids: List[str]) -> Optional[dict]:
    """None -> 404. Removing a non-member is a no-op."""
    folders = await _folder_map(db, user_id)
    wanted = await _owned_doc_ids(db, user_id, document_ids)
    if folder_id not in folders or wanted is None:
        return None
    await db.execute(
        sql_delete(FolderItem).where(FolderItem.folder_id == folder_id, FolderItem.document_id.in_(wanted))
    )
    await db.commit()
    return await _folder_with_items(db, folders, folder_id)
