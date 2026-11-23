import pytest
from unittest.mock import patch, MagicMock
from backend.rag.generator import generate_answer, extract_sources_from_text


def test_extract_sources_negative_reply_returns_empty():
    """Verify that when the answer states no overflowed text or info exists, sources_used is 0."""
    reply_text = (
        "The provided document excerpts do not contain any overflowed text. Each chunk of text fits "
        "within the designated page and chunk boundaries, and there are no instances of text spilling "
        "over into the next line or page beyond the intended formatting. If you have specific sections "
        "or pages you are concerned about, please provide more details, and I can check those areas more closely."
    )
    retrieved_chunks = [
        {"chunk_id": f"chunk_{i}", "doc_name": "Scholarsmate_Final_Report.pdf", "page_number": i}
        for i in range(1, 13)
    ]

    sources = extract_sources_from_text(reply_text, retrieved_chunks=retrieved_chunks)
    assert sources == [], f"Expected 0 sources, but got {sources}"


def test_extract_sources_selective_citations_only_includes_referenced_pages():
    """Verify that only the pages explicitly cited in the reply are included, not all 12 chunks."""
    reply_text = (
        "ScholarsMate architecture is detailed in [Scholarsmate_Final_Report.pdf, p. 1]. "
        "System evaluation results are demonstrated in [Scholarsmate_Final_Report.pdf, p. 4]."
    )
    retrieved_chunks = [
        {"chunk_id": f"chunk_{i}", "doc_name": "Scholarsmate_Final_Report.pdf", "page_number": i}
        for i in range(1, 13)
    ]

    sources = extract_sources_from_text(reply_text, retrieved_chunks=retrieved_chunks)
    assert len(sources) == 2, f"Expected 2 sources, but got {len(sources)}"
    pages = [s["page_number"] for s in sources]
    assert sorted(pages) == [1, 4]
    assert all(s["doc_name"] == "Scholarsmate_Final_Report.pdf" for s in sources)


def test_extract_sources_author_year_citation():
    """Verify academic author-year citations [Author et al., Year] map to matching paper in chunks."""
    reply_text = (
        "Skeletal muscle hypertrophy involves mechanical tension and titin kinase regulation "
        "[Schiaffino et al., 2020, p. 3]."
    )
    retrieved_chunks = [
        {
            "chunk_id": "c1",
            "doc_name": "schiaffino-et-al-2020-molecular-mechanisms-of-skeletal-muscle-hypertrophy.pdf",
            "page_number": 3,
        },
        {
            "chunk_id": "c2",
            "doc_name": "s40279-014-0152-3.pdf",
            "page_number": 7,
        },
    ]

    sources = extract_sources_from_text(reply_text, retrieved_chunks=retrieved_chunks)
    assert len(sources) == 1
    assert "schiaffino" in sources[0]["doc_name"].lower()
    assert sources[0]["page_number"] == 3


def test_extract_sources_refusal_returns_empty():
    """Verify refusal messages never return referenced sources."""
    reply_text = (
        "I can only answer questions grounded in your uploaded documents. "
        "I could not find any relevant information addressing 'hello what is quantum gravity?' in your attached materials."
    )
    retrieved_chunks = [
        {"chunk_id": "c1", "doc_name": "attention.pdf", "page_number": 1},
        {"chunk_id": "c2", "doc_name": "attention.pdf", "page_number": 2},
    ]

    sources = extract_sources_from_text(reply_text, retrieved_chunks=retrieved_chunks)
    assert sources == []
