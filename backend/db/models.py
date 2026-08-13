import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.db.session import Base


def generate_uuid():
    return str(uuid.uuid4())


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String, default="New Research Chat")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship to messages
    messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage", 
        back_populates="session", 
        cascade="all, delete-orphan",
        order_by="ChatMessage.timestamp"
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("chat_sessions.id"), index=True)
    sender: Mapped[str] = mapped_column(String)  # "user" or "bot"
    text: Mapped[str] = mapped_column(Text)
    sources_used: Mapped[list | None] = mapped_column(JSON, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["ChatSession"] = relationship("ChatSession", back_populates="messages")