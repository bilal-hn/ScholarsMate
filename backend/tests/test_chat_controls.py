import uuid

import pytest
from httpx import AsyncClient, ASGITransport

from backend.api import main as api_main
from backend.api.main import app

pytestmark = pytest.mark.anyio


@pytest.fixture
def fake_llm(monkeypatch):
    """Replaces generate_answer; records the chat_history each call received."""
    calls = []

    def fake(**kwargs):
        calls.append(kwargs)
        n = len(calls)
        return {
            "query": kwargs["query"],
            "answer": f"answer-{n} to {kwargs['query']}",
            "sources_used": [],
            "mode_applied": kwargs.get("mode"),
        }

    async def no_consolidation(**kwargs):
        return None

    monkeypatch.setattr(api_main, "generate_answer", fake)
    monkeypatch.setattr(api_main, "consolidate_batch_memories_async", no_consolidation)
    return calls


def _headers():
    return {"X-Guest-ID": f"test-chat-{uuid.uuid4().hex[:8]}"}


async def _ask(ac, headers, query, session_id=None, regenerate_message_id=None, chat_history=None):
    return await ac.post(
        "/api/query",
        headers=headers,
        json={
            "query": query,
            "session_id": session_id,
            "regenerate_message_id": regenerate_message_id,
            "chat_history": chat_history or [],
            "model_name": "gemini/test",
        },
    )


async def _messages(ac, headers, session_id):
    resp = await ac.get(f"/api/sessions/{session_id}", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["messages"]


async def test_regenerate_pushes_variant_without_duplicate_user_row(fake_llm):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        h = _headers()
        first = (await _ask(ac, h, "q1")).json()
        assert first["message_id"]

        resp = await _ask(ac, h, "q1 edited", first["session_id"], first["message_id"])
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["message_id"] == first["message_id"]
        assert [v["text"] for v in body["meta"]["variants"]] == ["answer-1 to q1"]

        msgs = await _messages(ac, h, first["session_id"])
        assert [m["sender"] for m in msgs] == ["user", "bot"]
        assert msgs[0]["text"] == "q1 edited"
        assert msgs[1]["text"] == "answer-2 to q1 edited"
        assert msgs[1]["id"] == first["message_id"]
        assert len(msgs[1]["meta"]["variants"]) == 1

        # variants keep only the last 5
        for i in range(6):
            await _ask(ac, h, "again", first["session_id"], first["message_id"])
        msgs = await _messages(ac, h, first["session_id"])
        assert len(msgs) == 2
        assert len(msgs[1]["meta"]["variants"]) == 5


async def test_regenerate_history_excludes_the_pair(fake_llm):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        h = _headers()
        t1 = (await _ask(ac, h, "first question")).json()
        t2 = (await _ask(ac, h, "second question", t1["session_id"])).json()
        # history for the 2nd turn contains the 1st pair
        assert [m["text"] for m in fake_llm[1]["chat_history"]] == ["first question", "answer-1 to first question"]

        await _ask(ac, h, "second question v2", t1["session_id"], t2["message_id"])
        history_texts = [m["text"] for m in fake_llm[2]["chat_history"]]
        assert history_texts == ["first question", "answer-1 to first question"]


async def test_single_turn_regenerate_ignores_client_chat_history(fake_llm):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        h = _headers()
        t1 = (await _ask(ac, h, "q1")).json()
        leaked = [{"sender": "user", "text": "q1"}, {"sender": "bot", "text": "answer-1 to q1"}]
        resp = await _ask(ac, h, "q1 v2", t1["session_id"], t1["message_id"], chat_history=leaked)
        assert resp.status_code == 200, resp.text
        assert fake_llm[1]["chat_history"] == []


async def test_regenerate_keeps_feedback_in_variant(fake_llm):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        h = _headers()
        t1 = (await _ask(ac, h, "q1")).json()
        await ac.patch(f"/api/messages/{t1['message_id']}/feedback", headers=h, json={"rating": "up"})
        body = (await _ask(ac, h, "q1", t1["session_id"], t1["message_id"])).json()
        assert body["meta"]["variants"][0]["feedback"]["rating"] == "up"
        assert "feedback" not in body["meta"]


async def test_regenerate_rejects_other_user_and_non_last(fake_llm):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        owner, intruder = _headers(), _headers()
        t1 = (await _ask(ac, owner, "q1")).json()

        # another user's message id, with another user's session id -> 404
        resp = await _ask(ac, intruder, "x", t1["session_id"], t1["message_id"])
        assert resp.status_code == 404
        # another user's message id on the intruder's own session -> 404
        mine = (await _ask(ac, intruder, "mine")).json()
        resp = await _ask(ac, intruder, "x", mine["session_id"], t1["message_id"])
        assert resp.status_code == 404

        # not the last message -> 409
        await _ask(ac, owner, "q2", t1["session_id"])
        resp = await _ask(ac, owner, "x", t1["session_id"], t1["message_id"])
        assert resp.status_code == 409

        msgs = await _messages(ac, owner, t1["session_id"])
        assert len(msgs) == 4


async def test_disconnect_skips_both_saves(fake_llm, monkeypatch):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        h = _headers()
        first = (await _ask(ac, h, "q1")).json()

        async def gone(self):
            return True

        monkeypatch.setattr("starlette.requests.Request.is_disconnected", gone)

        # regenerate path: rows untouched
        await _ask(ac, h, "q1 edited", first["session_id"], first["message_id"])
        msgs = await _messages(ac, h, first["session_id"])
        assert [m["text"] for m in msgs] == ["q1", "answer-1 to q1"]
        assert "variants" not in (msgs[1]["meta"] or {})

        # normal path on an existing session: nothing added
        await _ask(ac, h, "q2", first["session_id"])
        assert len(await _messages(ac, h, first["session_id"])) == 2

        # normal path on a brand-new session: no session is left behind
        before = len((await ac.get("/api/sessions", headers=h)).json())
        await _ask(ac, h, "q3")
        assert len((await ac.get("/api/sessions", headers=h)).json()) == before


async def test_feedback_ownership_and_validation(fake_llm):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        owner, intruder = _headers(), _headers()
        t1 = (await _ask(ac, owner, "q1")).json()
        url = f"/api/messages/{t1['message_id']}/feedback"

        assert (await ac.patch(url, headers=intruder, json={"rating": "up"})).status_code == 404
        assert (await ac.patch(url, headers=owner, json={"rating": "down", "reason": "bogus"})).status_code == 422
        assert (await ac.patch(url, headers=owner, json={"rating": "sideways"})).status_code == 422

        ok = await ac.patch(url, headers=owner, json={"rating": "down", "reason": "wrong_page"})
        assert ok.status_code == 200, ok.text
        msgs = await _messages(ac, owner, t1["session_id"])
        assert msgs[1]["meta"]["feedback"] == {"rating": "down", "reason": "wrong_page"}
        assert msgs[1]["meta"]["responseTime"]  # existing telemetry survives

        # user messages are not rateable
        assert (await ac.patch(f"/api/messages/{msgs[0]['id']}/feedback", headers=owner, json={"rating": "up"})).status_code == 404

        # null clears
        assert (await ac.patch(url, headers=owner, json={"rating": None})).status_code == 200
        msgs = await _messages(ac, owner, t1["session_id"])
        assert "feedback" not in msgs[1]["meta"]
