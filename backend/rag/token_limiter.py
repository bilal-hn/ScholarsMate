import os
from datetime import datetime
from typing import Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.db.models import DailyTokenUsage
from backend.rag.runtime import provider_from_model, resolve_api_key

# Default daily allowance: 100,000 tokens per user/guest (resets daily at UTC midnight)
DAILY_TOKEN_LIMIT = int(os.getenv("DAILY_TOKEN_LIMIT", "100000"))


def is_byok_request(model_name: Optional[str], custom_keys: Optional[dict]) -> bool:
    """
    Returns True if the user provided their own API key for the requested model/provider.
    BYOK requests are completely free of rate-limiting.
    """
    if not custom_keys or not isinstance(custom_keys, dict):
        return False

    if not model_name:
        return False

    provider = provider_from_model(model_name)
    # Bedrock models are server-funded unless AWS credentials are provided in custom_keys
    if provider == "bedrock":
        has_aws_keys = bool(custom_keys.get("aws_access_key_id") or custom_keys.get("aws"))
        return has_aws_keys

    key = resolve_api_key(provider, custom_keys)
    return bool(key and str(key).strip())


async def check_token_quota(
    db: AsyncSession,
    user_identifier: str,
    is_byok: bool = False
) -> Tuple[bool, int, int]:
    """
    Checks if the user has remaining tokens for the current day.
    Returns:
        (is_allowed: bool, tokens_used_today: int, tokens_remaining: int)
    """
    if is_byok:
        # BYOK bypasses all server quota checks
        return True, 0, 999999

    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    result = await db.execute(
        select(DailyTokenUsage).where(
            DailyTokenUsage.user_identifier == user_identifier,
            DailyTokenUsage.usage_date == today_str
        )
    )
    record = result.scalar_one_or_none()
    used = record.tokens_used if record else 0
    remaining = max(0, DAILY_TOKEN_LIMIT - used)
    is_allowed = used < DAILY_TOKEN_LIMIT

    return is_allowed, used, remaining


async def record_token_usage(
    db: AsyncSession,
    user_identifier: str,
    tokens: int,
    is_byok: bool = False
) -> int:
    """
    Atomically updates the user's daily token consumption in SQLite.
    Returns updated total tokens used today.
    """
    if is_byok or tokens <= 0:
        return 0

    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    result = await db.execute(
        select(DailyTokenUsage).where(
            DailyTokenUsage.user_identifier == user_identifier,
            DailyTokenUsage.usage_date == today_str
        )
    )
    record = result.scalar_one_or_none()

    if not record:
        record = DailyTokenUsage(
            user_identifier=user_identifier,
            usage_date=today_str,
            tokens_used=tokens
        )
        db.add(record)
    else:
        record.tokens_used += tokens

    try:
        await db.commit()
        await db.refresh(record)
        return record.tokens_used
    except Exception as e:
        await db.rollback()
        print(f"[TokenLimiter Warning] Failed to commit token usage: {e}")
        return 0
