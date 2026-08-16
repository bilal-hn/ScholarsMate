import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, DateTime, ForeignKey, Text, JSON, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.db.session import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    email: Mapped[Optional[str]] = mapped_column(String, unique=True, nullable=True, index=True)
    google_id: Mapped[Optional[str]] = mapped_column(String, unique=True, nullable=True, index=True)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    sessions: Mapped[List["ChatSession"]] = relationship(
        "ChatSession",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    documents: Mapped[List["UserDocument"]] = relationship(
        "UserDocument",
        back_populates="user",
        cascade="all, delete-orphan"
    )


class UserDocument(Base):
    """Tracks document ownership and workspace attachment per user."""
    __tablename__ = "user_documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), index=True)
    doc_name: Mapped[str] = mapped_column(String)
    file_hash: Mapped[str] = mapped_column(String, index=True)  # Links to global SHA-256
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="documents")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    user_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("users.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String, default="New Research Chat")
    doc_names: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user: Mapped[Optional["User"]] = relationship("User", back_populates="sessions")
    messages: Mapped[List["ChatMessage"]] = relationship(
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
    sources_used: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["ChatSession"] = relationship("ChatSession", back_populates="messages")