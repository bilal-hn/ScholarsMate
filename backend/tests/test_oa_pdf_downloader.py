import uuid
import pytest
from pathlib import Path
from httpx import AsyncClient, ASGITransport

from backend.api.main import app, UPLOADS_DIR
from backend.ingestion.oa_pdf_downloader import (
    sanitize_filename,
    generate_pdf_filename,
    resolve_open_access_pdf_url,
)

pytestmark = pytest.mark.anyio


def test_sanitize_and_generate_filename():
    clean = sanitize_filename('A Review of "Deep Learning": Principles / Applications!')
    assert "/" not in clean
    assert '"' not in clean
    assert ":" not in clean
    assert "Review" in clean

    name = generate_pdf_filename(
        title="Attention Is All You Need",
        authors="Ashish Vaswani; Noam Shazeer",
        year="2017",
    )
    assert name.endswith(".pdf")
    assert "Vaswani" in name
    assert "2017" in name
    assert "Attention" in name


async def test_resolve_arxiv_oa_url():
    result = await resolve_open_access_pdf_url(arxiv_id="1706.03762")
    assert result is not None
    assert result["source"] == "arxiv"
    assert "arxiv.org/pdf/1706.03762" in result["pdf_url"]


async def test_resolve_unpaywall_oa_url():
    # PLOS ONE DOI (open-access paper from user's Zotero reference library)
    result = await resolve_open_access_pdf_url(doi="10.1371/journal.pone.0261376")
    assert result is not None
    assert result["source"] == "unpaywall"
    assert "pdf" in result["pdf_url"].lower() or "printable" in result["pdf_url"].lower()


async def test_add_reference_with_oa_auto_download():
    """
    Tests adding an arXiv paper by identifier and auto-downloading full-text PDF.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        user_guest = f"test-oa-user-{uuid.uuid4().hex[:8]}"
        headers = {"X-Guest-ID": user_guest}

        resp = await ac.post(
            "/api/library/add-reference",
            json={
                "identifier": "1706.03762", # Attention Is All You Need
                "auto_download_pdf": True,
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["title"] is not None
        assert "Attention" in data["title"]
        assert data["has_pdf"] is True
        assert data["doc_name"].endswith(".pdf")
        assert data["file_size_bytes"] > 0

        # Verify physical file existence in UPLOADS_DIR
        downloaded_file = UPLOADS_DIR / data["doc_name"]
        assert downloaded_file.exists()
        assert downloaded_file.stat().st_size > 1000

        # Verify PDF header magic bytes
        with open(downloaded_file, "rb") as f:
            magic = f.read(4)
            assert magic == b"%PDF"


async def test_manual_download_oa_pdf_endpoint():
    """
    Tests creating a reference without PDF and then calling the download-pdf endpoint.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        user_guest = f"test-oa-manual-{uuid.uuid4().hex[:8]}"
        headers = {"X-Guest-ID": user_guest}

        # Step 1: Add reference with auto_download_pdf=False
        resp = await ac.post(
            "/api/library/add-reference",
            json={
                "identifier": "1706.03762",
                "auto_download_pdf": False,
            },
            headers=headers,
        )
        assert resp.status_code == 200
        ref_data = resp.json()
        doc_id = ref_data["id"]

        # Step 2: Trigger manual download
        dl_resp = await ac.post(
            f"/api/library/{doc_id}/download-pdf",
            headers=headers,
        )
        assert dl_resp.status_code == 200, dl_resp.text
        dl_data = dl_resp.json()
        assert dl_data["success"] is True
        assert dl_data["doc_name"].endswith(".pdf")
        assert dl_data["item"]["has_pdf"] is True
