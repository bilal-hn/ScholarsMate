import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from backend.ingestion.identifier_resolver import (
    clean_doi,
    clean_arxiv_id,
    detect_identifiers_in_text,
    fetch_crossref_metadata,
    fetch_arxiv_metadata,
    resolve_identifier,
)


def test_clean_doi():
    assert clean_doi("https://doi.org/10.1145/3292500.3330964") == "10.1145/3292500.3330964"
    assert clean_doi("doi: 10.1007/s12599-025-00945-3.") == "10.1007/s12599-025-00945-3"
    assert clean_doi("10.1016/j.artint.2023.103980") == "10.1016/j.artint.2023.103980"
    assert clean_doi("") == ""


def test_clean_arxiv_id():
    assert clean_arxiv_id("arXiv:2305.18290v2") == "2305.18290"
    assert clean_arxiv_id("2305.18290") == "2305.18290"
    assert clean_arxiv_id("arXiv:1706.03762v1") == "1706.03762"
    assert clean_arxiv_id("") == ""


def test_detect_identifiers_in_text():
    sample_text = (
        "In this work, we extend the Transformer (Vaswani et al., arXiv:1706.03762). "
        "Further details can be found at https://doi.org/10.1145/3292500.3330964."
    )
    doi, arxiv_id = detect_identifiers_in_text(sample_text)
    assert doi == "10.1145/3292500.3330964"
    assert arxiv_id == "1706.03762"


@pytest.mark.anyio
async def test_fetch_crossref_mocked():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "message": {
            "title": ["Test Deep Learning Paper"],
            "author": [{"given": "Jane", "family": "Doe"}, {"given": "John", "family": "Smith"}],
            "issued": {"date-parts": [[2024, 5]]},
            "container-title": ["Journal of AI Research"],
            "type": "journal-article",
            "URL": "https://doi.org/10.1234/test.5678",
            "abstract": "<jats:p>This is a groundbreaking study.</jats:p>",
            "subject": ["Computer Science", "Artificial Intelligence"]
        }
    }

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_response
        result = await fetch_crossref_metadata("10.1234/test.5678")

        assert result is not None
        assert result["source"] == "crossref"
        assert result["title"] == "Test Deep Learning Paper"
        assert result["authors"] == "Jane Doe; John Smith"
        assert result["year"] == "2024"
        assert result["venue"] == "Journal of AI Research"
        assert result["abstract"] == "This is a groundbreaking study."
        assert "#ComputerScience" in result["tags"]


@pytest.mark.anyio
async def test_fetch_arxiv_mocked():
    sample_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
      <entry>
        <title>Attention Is All You Need</title>
        <author><name>Ashish Vaswani</name></author>
        <author><name>Noam Shazeer</name></author>
        <published>2017-06-12T17:57:34Z</published>
        <summary>The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.</summary>
        <arxiv:primary_category term="cs.CL"/>
      </entry>
    </feed>
    """
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = sample_xml

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_response
        result = await fetch_arxiv_metadata("1706.03762")

        assert result is not None
        assert result["source"] == "arxiv"
        assert result["title"] == "Attention Is All You Need"
        assert result["authors"] == "Ashish Vaswani; Noam Shazeer"
        assert result["year"] == "2017"
        assert "cs.CL" in result["tags"][1]


@pytest.mark.anyio
async def test_resolve_identifier_routing():
    with patch("backend.ingestion.identifier_resolver.fetch_crossref_metadata", new_callable=AsyncMock) as mock_cr, \
         patch("backend.ingestion.identifier_resolver.fetch_arxiv_metadata", new_callable=AsyncMock) as mock_ar:
        
        mock_cr.return_value = {"source": "crossref", "title": "Paper 1"}
        mock_ar.return_value = {"source": "arxiv", "title": "Paper 2"}

        res_doi = await resolve_identifier("10.1145/3292500.3330964")
        assert res_doi["source"] == "crossref"

        res_arxiv = await resolve_identifier("arXiv:2305.18290")
        assert res_arxiv["source"] == "arxiv"
