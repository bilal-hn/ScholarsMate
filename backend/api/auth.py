import os
import uuid
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Header, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from jose import jwt, JWTError
from pydantic import BaseModel, EmailStr

from backend.db.session import get_db
from backend.db.models import User

from dotenv import load_dotenv

# Ensure environment variables are loaded
load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.env")))

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID") or os.getenv("VITE_GOOGLE_CLIENT_ID", "")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "scholarsmate-secret-auth-key-2026")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30


def hash_password(password: str) -> str:
    """Generates a secure PBKDF2-HMAC-SHA256 hash with an independent random salt."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return f"{salt}${key.hex()}"


def verify_password(password: str, stored_hash: Optional[str]) -> bool:
    """Verifies a plain-text password against a stored salt$hash string."""
    if not stored_hash or "$" not in stored_hash:
        return False
    try:
        salt, key_hex = stored_hash.split("$", 1)
        test_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
        return secrets.compare_digest(test_key.hex(), key_hex)
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Signs a JWT bearer access token for email/password authenticated users."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


class AuthResponse(BaseModel):
    user_id: str
    name: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    is_guest: bool
    created_at: Optional[datetime] = None


class GoogleAuthRequest(BaseModel):
    credential: Optional[str] = None  # Google ID Token from Google Identity Services
    access_token: Optional[str] = None  # Google OAuth Access Token


class UserRegisterRequest(BaseModel):
    name: Optional[str] = None
    email: str
    password: str


class UserLoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthResponse


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
    # 1. Check for Bearer Token
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1].strip()

        # 1A. Check if token is ScholarsMate local JWT token
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("sub")
            if user_id:
                result = await db.execute(select(User).where(User.id == user_id))
                user = result.scalar_one_or_none()
                if user:
                    return user
        except JWTError:
            pass  # Not a local JWT or expired, attempt Google validation next

        # 1B. Check if token is Google OAuth ID Token
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
            stmt = select(User).where(
                (User.google_id == google_id) | (User.email == email.lower())
            ) if email else select(User).where(User.google_id == google_id)
            result = await db.execute(stmt)
            user = result.scalar_one_or_none()

            if not user:
                user = User(
                    id=str(uuid.uuid4()),
                    google_id=google_id,
                    email=email.lower() if email else None,
                    name=name or (email.split("@")[0] if email else "User"),
                    avatar_url=avatar_url,
                    is_guest=False
                )
                db.add(user)
                await db.commit()
                await db.refresh(user)
            else:
                user.google_id = google_id
                if not user.name and name:
                    user.name = name
                if avatar_url:
                    user.avatar_url = avatar_url
                user.is_guest = False
                await db.commit()
                await db.refresh(user)

            return user

        except Exception as e:
            print(f"[Auth Notice] Google token validation failed ({e}). Falling back to guest identity.")
            # If expired/invalid, seamlessly fall through to guest resolution rather than breaking the workspace request

    # 2. Fall back to Anonymous Guest Identity
    return await get_or_create_guest_user(x_guest_id, db)