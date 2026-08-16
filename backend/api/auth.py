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
    """Retrieves an existing guest user or provisions a new one."""
    if guest_id:
        result = await db.execute(select(User).where(User.id == guest_id, User.is_guest == True))
        user = result.scalar_one_or_none()
        if user:
            return user

    # Create new guest user
    new_guest = User(
        id=str(uuid.uuid4()),
        name="Guest Researcher",
        is_guest=True
    )
    db.add(new_guest)
    await db.commit()
    await db.refresh(new_guest)
    return new_guest


async def get_current_user(
    authorization: Optional[str] = Header(None),
    x_guest_id: Optional[str] = Header(None),
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
            # Verify with Google (allows any client ID if env is not explicitly set for local dev)
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

            return user

        except Exception as e:
            print(f"[Auth Error] Google token verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Google Authentication token."
            )

    # 2. Fall back to Anonymous Guest Identity
    return await get_or_create_guest_user(x_guest_id, db)