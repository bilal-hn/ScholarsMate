import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from backend.api.main import app

pytestmark = pytest.mark.anyio

BIBTEX_PAYLOAD = """
@article{attention2017,
  title = {Attention Is All You Need},
  author = {Ashish Vaswani and Noam Shazeer},
  journal = {NeurIPS},
  year = {2017},
  doi = {10.5555/3295222.3295349},
  eprint = {1706.03762}
}

@inproceedings{bert2019,
  title = {BERT: Pre-training of Deep Bidirectional Transformers},
  author = {Jacob Devlin and Ming-Wei Chang},
  booktitle = {NAACL-HLT},
  year = {2019},
  doi = {10.18653/v1/N19-1423}
}
"""

RIS_PAYLOAD = """
TY  - JOUR
TI  - Deep Residual Learning for Image Recognition
AU  - He, Kaiming
AU  - Zhang, Xiangyu
JO  - CVPR
PY  - 2016
DO  - 10.1109/CVPR.2016.90
ER  - 
"""


async def test_bulk_import_bibtex_text():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        headers = {"X-Guest-ID": f"test-bib-{uuid.uuid4().hex[:8]}"}
        resp = await ac.post(
            "/api/library/import/text",
            json={
                "content": BIBTEX_PAYLOAD,
                "filename": "references.bib",
                "workspace_id": None,
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["success"] is True
        assert data["imported_count"] == 2
        assert data["skipped_duplicates"] == 0
        assert data["total_parsed"] == 2
        assert len(data["items"]) == 2

        titles = [i["title"] for i in data["items"]]
        assert "Attention Is All You Need" in titles
        assert "BERT: Pre-training of Deep Bidirectional Transformers" in titles

        # Test duplicate avoidance on second import
        resp_dup = await ac.post(
            "/api/library/import/text",
            json={
                "content": BIBTEX_PAYLOAD,
                "filename": "references.bib",
                "workspace_id": None,
            },
            headers=headers,
        )
        assert resp_dup.status_code == 200
        data_dup = resp_dup.json()
        assert data_dup["imported_count"] == 0
        assert data_dup["skipped_duplicates"] == 2


async def test_bulk_import_ris_file():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        headers = {"X-Guest-ID": f"test-ris-{uuid.uuid4().hex[:8]}"}
        files = {
            "file": ("scholar.ris", RIS_PAYLOAD.encode("utf-8"), "application/x-research-info-systems")
        }
        resp = await ac.post(
            "/api/library/import/file",
            files=files,
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["success"] is True
        assert data["imported_count"] == 1
        assert data["items"][0]["title"] == "Deep Residual Learning for Image Recognition"
        assert data["items"][0]["doi"] == "10.1109/CVPR.2016.90"
