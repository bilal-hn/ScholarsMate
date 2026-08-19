import json
import uuid
from datetime import datetime
from typing import List, Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.db.models import ChatSession, ChatMessage, User


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


# =============================================================================
# USER MANAGEMENT HELPERS
# =============================================================================

async def get_or_create_guest_user(db: AsyncSession, guest_id: str) -> User:
    """Retrieves or registers an anonymous guest profile."""
    stmt = select(User).where(User.id == guest_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            id=guest_id,
            name="Guest Researcher",
            email=None,
            avatar_url=None,
            is_guest=True,
            created_at=datetime.utcnow()
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user


async def get_or_create_google_user(
    db: AsyncSession, 
    google_id: str, 
    name: str, 
    email: str, 
    avatar_url: Optional[str] = None
) -> User:
    """Retrieves or registers an authenticated Google account."""
    stmt = select(User).where(User.id == google_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            id=google_id,
            name=name,
            email=email,
            avatar_url=avatar_url,
            is_guest=False,
            created_at=datetime.utcnow()
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        # Update user metadata if changed
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
    user_id: Optional[str] = None
) -> ChatSession:
    """Creates a new persistent chat session thread linked to a specific user/tenant."""
    target_docs = doc_names if isinstance(doc_names, list) else []
    
    session = ChatSession(
        title=title,
        doc_names=target_docs,
        user_id=user_id
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    
    # Ensure doc_names is exposed as a list for immediate Pydantic serialization
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

    # Guarantee doc_names on each record is deserialized as a Python list
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

    return messages


async def add_message(
    db: AsyncSession, 
    session_id: str, 
    sender: str, 
    text: str, 
    sources: Optional[list] = None
) -> ChatMessage:
    """Adds a new message to a chat session and updates the session timestamp."""
    message = ChatMessage(
        session_id=session_id,
        sender=sender,
        text=text,
        sources_used=sources or []
    )
    db.add(message)

    # Touch session timestamp
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    session_res = await db.execute(stmt)
    session = session_res.scalar_one_or_none()
    if session:
        session.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(message)
    
    message.sources_used = _normalize_json_list(message.sources_used)
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