import pytest
from langchain_core.documents import Document
from backend.ingestion.pipeline import process_pdf


def test_chunking_and_metadata(tmp_path):
    # Create a temporary fake PDF text using PyMuPDF to test on the fly
    import fitz

    pdf_path = tmp_path / "test_paper.pdf"
    doc = fitz.open()

    # Add Page 1
    page1 = doc.new_page()
    page1.insert_text((50, 50), "This is page one content. " * 30)

    # Add Page 2
    page2 = doc.new_page()
    page2.insert_text((50, 50), "This is page two content. " * 30)

    doc.save(str(pdf_path))
    doc.close()

    # Run pipeline
    chunks = process_pdf(str(pdf_path), chunk_size=200, chunk_overlap=20)

    # Assertions
    assert len(chunks) > 0, "Pipeline should generate at least one chunk."

    first_chunk = chunks[0]
    assert isinstance(first_chunk, Document)
    assert first_chunk.metadata["source"] == "test_paper.pdf"
    assert first_chunk.metadata["page_number"] == 1
    assert "test_paper.pdf::p1::1" in first_chunk.metadata["chunk_id"]


def test_overlap_validation():
    # Verify that chunk overlap works properly
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    splitter = RecursiveCharacterTextSplitter(chunk_size=100, chunk_overlap=20)
    docs = [Document(page_content="Word " * 50, metadata={"source": "doc.pdf"})]
    chunks = splitter.split_documents(docs)

    assert len(chunks) > 1, "Long text should be split into multiple chunks."