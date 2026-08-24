import os
import uuid
from typing import Optional
from fastapi import Header, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from pydantic import BaseModel

from backend.db.session import get_db
from backend.db.models import User

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")


class AuthResponse(BaseModel):
    user_id: str
    name: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    is_guest: bool


class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID Token from Google Identity Services


async def get_or_create_guest_user(guest_id: Optional[str], db: AsyncSession) -> User:
    """Retrieves an existing guest user or provisions a new one using the persistent guest ID."""
    resolved_id = guest_id.strip() if (guest_id and guest_id.strip()) else f"guest_{uuid.uuid4()}"

    result = await db.execute(select(User).where(User.id == resolved_id))
    user = result.scalar_one_or_none()
    if user:
        return user

    # Create new guest user preserving the client's persistent guest ID
    new_guest = User(
        id=resolved_id,
        name="Guest Researcher",
        email=None,
        avatar_url=None,
        is_guest=True
    )
    db.add(new_guest)
    try:
        await db.commit()
        await db.refresh(new_guest)
    except Exception:
        await db.rollback()
        # Handle race condition if created concurrently
        res = await db.execute(select(User).where(User.id == resolved_id))
        new_guest = res.scalar_one_or_none()

    return new_guest


async def get_current_user(
    authorization: Optional[str] = Header(None),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-ID"),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    FastAPI dependency that extracts and validates the tenant identity.
    Checks Authorization: Bearer <Google_ID_Token> first, then falls back to X-Guest-ID.
    """
    # 1. Check for Bearer Token (Google OAuth)
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        try:
            id_info = id_token.verify_oauth2_token(
                token, 
                google_requests.Request(), 
                GOOGLE_CLIENT_ID if GOOGLE_CLIENT_ID else None
            )

            google_id = id_info.get("sub")
            email = id_info.get("email")
            name = id_info.get("name")
            avatar_url = id_info.get("picture")

            # Look up or create authenticated user
            result = await db.execute(select(User).where(User.google_id == google_id))
            user = result.scalar_one_or_none()

            if not user:
                user = User(
                    id=str(uuid.uuid4()),
                    google_id=google_id,
                    email=email,
                    name=name,
                    avatar_url=avatar_url,
                    is_guest=False
                )
                db.add(user)
                await db.commit()
                await db.refresh(user)
            else:
                user.name = name
                user.email = email
                user.avatar_url = avatar_url
                await db.commit()
                await db.refresh(user)

            return user

        except Exception as e:
            print(f"[Auth Notice] Google token validation failed ({e}). Falling back to guest identity.")
            # If expired/invalid, seamlessly fall through to guest resolution rather than breaking the workspace request

    # 2. Fall back to Anonymous Guest Identity
    return await get_or_create_guest_user(x_guest_id, db)