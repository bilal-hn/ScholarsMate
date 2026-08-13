from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.db.models import ChatSession, ChatMessage


async def create_chat_session(db: AsyncSession, title: str = "New Research Chat") -> ChatSession:
    session = ChatSession(title=title)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def get_all_sessions(db: AsyncSession):
    result = await db.execute(select(ChatSession).order_by(ChatSession.updated_at.desc()))
    return result.scalars().all()


async def get_session_messages(db: AsyncSession, session_id: str):
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.timestamp.asc())
    )
    return result.scalars().all()


async def add_message(db: AsyncSession, session_id: str, sender: str, text: str, sources: list = None) -> ChatMessage:
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


async def delete_session(db: AsyncSession, session_id: str):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id))
    session = result.scalar_one_or_none()
    if session:
        await db.delete(session)
        await db.commit()
        return True
    return False