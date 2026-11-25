import uuid

import pytest
from httpx import AsyncClient, ASGITransport

from backend.api.main import app
from backend.db import crud
from backend.db.models import Workspace
from backend.db.session import AsyncSessionLocal, Base, engine

pytestmark = pytest.mark.anyio


@pytest.fixture
async def client():
    # Tests skip the app lifespan, so make sure the W2 tables exist.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


def _user():
    return {"X-Guest-ID": f"test-folders-{uuid.uuid4().hex[:8]}"}


async def _folder(ac, h, name="F", parent_id=None, expect=201):
    body = {"name": name}
    if parent_id is not None:
        body["parent_id"] = parent_id
    r = await ac.post("/api/folders", headers=h, json=body)
    assert r.status_code == expect, r.text
    return r.json()


async def _paper(ac, h, title="Paper"):
    r = await ac.post("/api/library/manual", headers=h, json={"title": title})
    assert r.status_code == 200, r.text
    return r.json()


async def _items(ac, h, method, folder_id, ids):
    return await ac.request(method, f"/api/folders/{folder_id}/items", headers=h, json={"document_ids": ids})


async def _chain(ac, h, n, parent_id=None):
    ids = []
    for i in range(n):
        f = await _folder(ac, h, f"c{i}", parent_id)
        ids.append(f["id"])
        parent_id = f["id"]
    return ids


async def test_folder_crud_round_trip(client):
    h = _user()
    assert (await client.get("/api/folders", headers=h)).json() == []

    root = await _folder(client, h, "  Root  ")
    assert root["name"] == "Root" and root["parent_id"] is None and root["item_ids"] == []
    child = await _folder(client, h, "Child", root["id"])

    paper = await _paper(client, h)
    r = await _items(client, h, "POST", child["id"], [paper["id"]])
    assert r.status_code == 200 and r.json()["item_ids"] == [paper["id"]]
    # idempotent add, duplicates in the body included
    r = await _items(client, h, "POST", child["id"], [paper["id"], paper["id"]])
    assert r.status_code == 200 and r.json()["item_ids"] == [paper["id"]]

    listed = {f["id"]: f for f in (await client.get("/api/folders", headers=h)).json()}
    assert set(listed) == {root["id"], child["id"]}
    assert listed[child["id"]]["parent_id"] == root["id"]
    assert listed[child["id"]]["item_ids"] == [paper["id"]]
    assert listed[root["id"]]["item_ids"] == []

    r = await client.patch(f"/api/folders/{child['id']}", headers=h, json={"name": "Renamed"})
    assert r.status_code == 200 and r.json()["name"] == "Renamed" and r.json()["parent_id"] == root["id"]
    # explicit null moves to the root
    r = await client.patch(f"/api/folders/{child['id']}", headers=h, json={"parent_id": None})
    assert r.status_code == 200 and r.json()["parent_id"] is None and r.json()["item_ids"] == [paper["id"]]

    r = await _items(client, h, "DELETE", child["id"], [paper["id"]])
    assert r.status_code == 200 and r.json()["item_ids"] == []

    assert (await client.delete(f"/api/folders/{root['id']}", headers=h)).status_code == 200
    assert [f["id"] for f in (await client.get("/api/folders", headers=h)).json()] == [child["id"]]


async def test_input_validation(client):
    h = _user()
    for bad in ({"name": "   "}, {"name": ""}, {"name": "x" * 121}, {}):
        assert (await client.post("/api/folders", headers=h, json=bad)).status_code == 422
    assert (await client.post("/api/folders", headers=h, json={"name": "x" * 120})).status_code == 201
    f = await _folder(client, h)
    assert (await client.patch(f"/api/folders/{f['id']}", headers=h, json={"name": " "})).status_code == 422
    assert (await _items(client, h, "POST", f["id"], [])).status_code == 422


async def test_tenant_isolation(client):
    a, b = _user(), _user()
    a_folder = await _folder(client, a, "A")
    a_child = await _folder(client, a, "A child", a_folder["id"])
    a_paper = await _paper(client, a)
    await _items(client, a, "POST", a_folder["id"], [a_paper["id"]])
    b_folder = await _folder(client, b, "B")
    b_paper = await _paper(client, b)

    # B cannot see A's data
    assert (await client.get("/api/folders", headers=b)).json() == [
        {"id": b_folder["id"], "name": "B", "parent_id": None, "item_ids": []}
    ]
    # B cannot touch A's folders
    assert (await client.patch(f"/api/folders/{a_folder['id']}", headers=b, json={"name": "x"})).status_code == 404
    assert (await client.patch(f"/api/folders/{a_folder['id']}", headers=b, json={"parent_id": None})).status_code == 404
    assert (await client.delete(f"/api/folders/{a_folder['id']}", headers=b)).status_code == 404
    # B cannot list, add to or delete from A's folder items
    assert (await _items(client, b, "POST", a_folder["id"], [b_paper["id"]])).status_code == 404
    assert (await _items(client, b, "DELETE", a_folder["id"], [a_paper["id"]])).status_code == 404
    assert (await _items(client, b, "DELETE", a_folder["id"], [b_paper["id"]])).status_code == 404
    # B cannot add A's document to B's folder (nothing changes, even alongside a valid id)
    assert (await _items(client, b, "POST", b_folder["id"], [a_paper["id"]])).status_code == 404
    assert (await _items(client, b, "POST", b_folder["id"], [b_paper["id"], a_paper["id"]])).status_code == 404
    assert (await _items(client, b, "DELETE", b_folder["id"], [a_paper["id"]])).status_code == 404
    listed = (await client.get("/api/folders", headers=b)).json()
    assert listed[0]["item_ids"] == []
    # B cannot use A's folder as a parent, on create or on move
    assert (await client.post("/api/folders", headers=b, json={"name": "x", "parent_id": a_folder["id"]})).status_code == 404
    assert (await client.patch(f"/api/folders/{b_folder['id']}", headers=b, json={"parent_id": a_child["id"]})).status_code == 404

    # A's data is untouched
    a_listed = {f["id"]: f for f in (await client.get("/api/folders", headers=a)).json()}
    assert set(a_listed) == {a_folder["id"], a_child["id"]}
    assert a_listed[a_folder["id"]]["item_ids"] == [a_paper["id"]]
    assert a_listed[a_folder["id"]]["name"] == "A"


async def test_cycles_rejected(client):
    h = _user()
    top, mid, leaf = await _chain(client, h, 3)
    for target in (top, mid, leaf):  # self, child, grandchild
        r = await client.patch(f"/api/folders/{top}", headers=h, json={"parent_id": target})
        assert r.status_code == 409, (target, r.text)
    r = await client.patch(f"/api/folders/{mid}", headers=h, json={"parent_id": leaf})
    assert r.status_code == 409
    # tree unchanged
    parents = {f["id"]: f["parent_id"] for f in (await client.get("/api/folders", headers=h)).json()}
    assert parents == {top: None, mid: top, leaf: mid}


async def test_depth_cap(client):
    h = _user()
    chain = await _chain(client, h, 8)  # depth 8 is allowed
    await _folder(client, h, "too deep", chain[-1], expect=409)

    # subtree height counts: a 3-level subtree cannot go under a depth-6 folder
    h2 = _user()
    deep = await _chain(client, h2, 6)
    sub = await _chain(client, h2, 3)
    r = await client.patch(f"/api/folders/{sub[0]}", headers=h2, json={"parent_id": deep[5]})
    assert r.status_code == 409
    r = await client.patch(f"/api/folders/{sub[0]}", headers=h2, json={"parent_id": deep[4]})  # 5 + 3 == 8
    assert r.status_code == 200
    # moving within the same subtree height never trips the cap
    r = await client.patch(f"/api/folders/{sub[0]}", headers=h2, json={"parent_id": None})
    assert r.status_code == 200


async def test_delete_folder_keeps_documents_and_workspace_refs(client):
    h = _user()
    uid = h["X-Guest-ID"]
    root = await _folder(client, h, "root")
    kid = await _folder(client, h, "kid", root["id"])
    other = await _folder(client, h, "other")
    paper = await _paper(client, h)
    for fid in (root["id"], kid["id"], other["id"]):
        await _items(client, h, "POST", fid, [paper["id"]])

    async with AsyncSessionLocal() as db:
        ws, _ = await crud.create_workspace(db, name="ws", user_id=uid)
        ws.doc_names = [paper["doc_name"]]
        await db.commit()
        ws_id = ws.id

    assert (await client.delete(f"/api/folders/{root['id']}", headers=h)).status_code == 200

    listed = (await client.get("/api/folders", headers=h)).json()
    assert [f["id"] for f in listed] == [other["id"]]
    assert listed[0]["item_ids"] == [paper["id"]]  # other folder's membership survives
    lib = (await client.get("/api/library", headers=h)).json()
    assert [i["id"] for i in lib["items"]] == [paper["id"]]
    async with AsyncSessionLocal() as db:
        assert (await db.get(Workspace, ws_id)).doc_names == [paper["doc_name"]]


async def test_library_delete_clears_memberships(client):
    h = _user()
    f = await _folder(client, h)
    keep, gone = await _paper(client, h, "keep"), await _paper(client, h, "gone")
    await _items(client, h, "POST", f["id"], [keep["id"], gone["id"]])
    assert (await client.delete(f"/api/library/{gone['id']}", headers=h)).status_code == 200
    listed = (await client.get("/api/folders", headers=h)).json()
    assert listed[0]["item_ids"] == [keep["id"]]


async def test_concurrent_moves_cannot_create_a_cycle(client):
    import asyncio
    h = _user()
    a, b = await _folder(client, h, "A"), await _folder(client, h, "B")
    r1, r2 = await asyncio.gather(
        client.patch(f"/api/folders/{a['id']}", headers=h, json={"parent_id": b["id"]}),
        client.patch(f"/api/folders/{b['id']}", headers=h, json={"parent_id": a["id"]}),
    )
    assert sorted([r1.status_code, r2.status_code]) == [200, 409]
    assert (await client.delete(f"/api/folders/{a['id']}", headers=h)).status_code == 200


async def test_concurrent_duplicate_add_is_idempotent(client):
    import asyncio
    h = _user()
    f, p = await _folder(client, h), await _paper(client, h)
    r1, r2 = await asyncio.gather(
        _items(client, h, "POST", f["id"], [p["id"]]), _items(client, h, "POST", f["id"], [p["id"]])
    )
    assert (r1.status_code, r2.status_code) == (200, 200)
    assert r1.json()["item_ids"] == r2.json()["item_ids"] == [p["id"]]


async def test_merge_duplicates_moves_memberships(client):
    h = _user()
    f1, f2 = await _folder(client, h, "f1"), await _folder(client, h, "f2")
    canon, dup = await _paper(client, h, "Same paper"), await _paper(client, h, "Same paper")
    await _items(client, h, "POST", f1["id"], [canon["id"], dup["id"]])
    await _items(client, h, "POST", f2["id"], [dup["id"]])
    r = await client.post("/api/library/merge-duplicates", headers=h,
                          json={"canonical_item_id": canon["id"], "duplicate_item_ids": [dup["id"]]})
    assert r.status_code == 200, r.text
    listed = {f["name"]: f["item_ids"] for f in (await client.get("/api/folders", headers=h)).json()}
    assert listed == {"f1": [canon["id"]], "f2": [canon["id"]]}
