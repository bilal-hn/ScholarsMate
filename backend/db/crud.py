from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.db.models import ChatSession, ChatMessage


async def create_chat_session(
    db: AsyncSession, 
    title: str = "New Research Chat", 
    doc_names: Optional[List[str]] = None
) -> ChatSession:
    """Creates a new persistent chat session thread with attached document filenames."""
    session = ChatSession(
        title=title,
        doc_names=doc_names or []
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def get_all_sessions(db: AsyncSession) -> List[ChatSession]:
    """Retrieves all chat sessions ordered by latest update timestamp."""
    result = await db.execute(select(ChatSession).order_by(ChatSession.updated_at.desc()))
    return list(result.scalars().all())


async def get_session_messages(db: AsyncSession, session_id: str) -> List[ChatMessage]:
    """Retrieves all messages for a specific session ordered chronologically."""
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.timestamp.asc())
    )
    return list(result.scalars().all())


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
    await db.commit()
    await db.refresh(message)
    return message


async def delete_session(db: AsyncSession, session_id: str) -> bool:
    """Deletes a chat session and cascades deletion to all associated messages."""
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id))
    session = result.scalar_one_or_none()
    if session:
        await db.delete(session)
        await db.commit()
        return True
    return False