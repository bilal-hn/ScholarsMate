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
    """Tracks document ownership, workspace attachment, and pre-computed summary caches."""
    __tablename__ = "user_documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), index=True)
    doc_name: Mapped[str] = mapped_column(String)
    file_hash: Mapped[str] = mapped_column(String, index=True)  # Links to global SHA-256
    summary_cache: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # FR-11 Pre-computed summary cache
    summary_generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
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
    draft: Mapped[Optional["WorkspaceDraft"]] = relationship(
        "WorkspaceDraft",
        back_populates="session",
        cascade="all, delete-orphan",
        uselist=False
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("chat_sessions.id"), index=True)
    sender: Mapped[str] = mapped_column(String)  # "user" or "bot"
    text: Mapped[str] = mapped_column(Text)
    thinking_process: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Collapsible reasoning trace
    sources_used: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    model_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    meta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # Telemetry (responseTime, tokens, etc.)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["ChatSession"] = relationship("ChatSession", back_populates="messages")


class WorkspaceDraft(Base):
    """FR-13: Academic Document Writer draft persistence per workspace session."""
    __tablename__ = "workspace_drafts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("chat_sessions.id"), unique=True, index=True)
    title: Mapped[str] = mapped_column(String, default="Untitled Academic Draft")
    content_html: Mapped[str] = mapped_column(Text, default="")
    content_markdown: Mapped[str] = mapped_column(Text, default="")
    citations_data: Mapped[Optional[list]] = mapped_column(JSON, default=list)  # List of inserted citation objects
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    session: Mapped["ChatSession"] = relationship("ChatSession", back_populates="draft")