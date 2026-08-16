from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.db.models import ChatSession, ChatMessage


async def create_chat_session(
    db: AsyncSession, 
    title: str = "New Research Chat", 
    doc_names: Optional[List[str]] = None,
    user_id: Optional[str] = None
) -> ChatSession:
    """Creates a new persistent chat session thread linked to a specific user/tenant."""
    session = ChatSession(
        title=title,
        doc_names=doc_names or [],
        user_id=user_id
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
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
    return list(result.scalars().all())


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