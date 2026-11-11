import uuid
import pytest
from httpx import AsyncClient, ASGITransport

from backend.api.main import app
from backend.db.models import UserDocument
from backend.ingestion.duplicate_detector import detect_duplicates, normalize_title

pytestmark = pytest.mark.anyio


def test_normalize_title():
    assert normalize_title("The Making of a Star") == "makingofastar"
    assert normalize_title("Attention Is All You Need!") == "attentionisallyouneed"
    assert normalize_title("   A Deep Residual Learning   ") == "deepresiduallearning"


def test_detect_duplicates_algorithm():
    d1 = UserDocument(
        id="1",
        doc_name="paper1.pdf",
        title="Attention Is All You Need",
        doi="10.5555/3295222.3295349",
        authors="Vaswani et al.",
        year="2017",
    )
    d2 = UserDocument(
        id="2",
        doc_name="ref_attention.ref",
        title="Attention is All You Need!",
        doi="10.5555/3295222.3295349",
        authors="Vaswani et al.",
        year="2017",
    )
    d3 = UserDocument(
        id="3",
        doc_name="unrelated.pdf",
        title="Deep Residual Learning",
        doi="10.1109/CVPR.2016.90",
        authors="He et al.",
        year="2016",
    )

    clusters = detect_duplicates([d1, d2, d3])
    assert len(clusters) == 1
    assert clusters[0]["total_items"] == 2
    item_ids = [item.id for item in clusters[0]["items"]]
    assert "1" in item_ids
    assert "2" in item_ids
    assert "3" not in item_ids


async def test_duplicate_detection_and_merger_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        user_guest = f"test-dup-{uuid.uuid4().hex[:8]}"
        headers = {"X-Guest-ID": user_guest}

        # 1. Create manual item A (Title & Notes)
        resp1 = await ac.post(
            "/api/library/manual",
            json={
                "item_type": "journal_article",
                "title": "BERT: Pre-training of Deep Bidirectional Transformers",
                "authors": "Jacob Devlin; Ming-Wei Chang",
                "year": "2019",
                "doi": "10.18653/v1/N19-1423",
                "tags": ["#NLP"],
                "notes": "Note from version 1",
            },
            headers=headers,
        )
        assert resp1.status_code == 200
        item1 = resp1.json()

        # 2. Create duplicate item B (same DOI, slightly different title and tag)
        resp2 = await ac.post(
            "/api/library/manual",
            json={
                "item_type": "preprint",
                "title": "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
                "authors": "J. Devlin; M. Chang",
                "doi": "10.18653/v1/N19-1423",
                "tags": ["#Transformers"],
                "notes": "Note from version 2",
            },
            headers=headers,
        )
        assert resp2.status_code == 200
        item2 = resp2.json()

        # 3. Query duplicate detection endpoint
        dup_resp = await ac.get("/api/library/duplicates", headers=headers)
        assert dup_resp.status_code == 200
        dup_data = dup_resp.json()
        assert dup_data["total_groups"] == 1
        assert dup_data["total_duplicate_items"] == 2

        # 4. Merge item2 into item1
        merge_resp = await ac.post(
            "/api/library/merge-duplicates",
            json={
                "canonical_item_id": item1["id"],
                "duplicate_item_ids": [item2["id"]],
            },
            headers=headers,
        )
        assert merge_resp.status_code == 200, merge_resp.text
        merge_data = merge_resp.json()
        assert merge_data["success"] is True
        merged_item = merge_data["merged_item"]

        # Verify combined tags and notes
        assert "#NLP" in merged_item["tags"]
        assert "#Transformers" in merged_item["tags"]
        assert "Note from version 1" in merged_item["notes"]
        assert "Note from version 2" in merged_item["notes"]

        # 5. Verify duplicate list is now clean (0 duplicates)
        clean_dup_resp = await ac.get("/api/library/duplicates", headers=headers)
        assert clean_dup_resp.status_code == 200
        assert clean_dup_resp.json()["total_groups"] == 0

        # 6. Verify library count is now 1
        lib_resp = await ac.get("/api/library", headers=headers)
        assert lib_resp.json()["total_count"] == 1
