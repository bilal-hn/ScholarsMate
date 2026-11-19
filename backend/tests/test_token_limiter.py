import uuid
import pytest
from backend.db.session import SessionLocal, init_db
from backend.rag.token_limiter import (
    check_token_quota,
    record_token_usage,
    is_byok_request,
    DAILY_TOKEN_LIMIT,
)


@pytest.mark.anyio
async def test_token_limiter_byok_and_quota():
    await init_db()
    async with SessionLocal() as db:
        test_user = f"test_user_quota_{uuid.uuid4().hex[:8]}"

        # 1. BYOK detection
        assert is_byok_request("openai/gpt-4o", {"openai": "sk-12345"}) is True
        assert is_byok_request("groq/llama-3.3-70b", {"groq": "gsk_test"}) is True
        assert is_byok_request("bedrock/us.amazon.nova-lite-v1:0", {}) is False
        assert is_byok_request("bedrock/us.meta.llama3-3-70b-instruct-v1:0", None) is False

        # 2. Initial state: user has full quota
        allowed, used, remaining = await check_token_quota(db, test_user, is_byok=False)
        assert allowed is True
        assert used == 0
        assert remaining == DAILY_TOKEN_LIMIT

        # 3. Record small query: 2,500 tokens
        await record_token_usage(db, test_user, 2500, is_byok=False)
        allowed, used, remaining = await check_token_quota(db, test_user, is_byok=False)
        assert allowed is True
        assert used == 2500
        assert remaining == DAILY_TOKEN_LIMIT - 2500

        # 4. Record consumption past daily limit
        await record_token_usage(db, test_user, DAILY_TOKEN_LIMIT, is_byok=False)
        allowed, used, remaining = await check_token_quota(db, test_user, is_byok=False)
        assert allowed is False
        assert remaining == 0

        # 5. BYOK user bypasses limit even when quota is exhausted
        allowed_byok, _, _ = await check_token_quota(db, test_user, is_byok=True)
        assert allowed_byok is True
