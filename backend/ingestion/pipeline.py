import os
import fitz  # PyMuPDF
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter


def extract_pages(pdf_path: str) -> list[Document]:
    """1. Reads multi-column PDFs correctly using PyMuPDF block-sorting.

    2. Returns a list of page-level LangChain Document objects.
    """
    doc = fitz.open(pdf_path)
    clean_doc_name = os.path.basename(pdf_path)
    raw_pages = []

    for page_num in range(len(doc)):
        page = doc[page_num]

        # Extract blocks: (x0, y0, x1, y1, text, block_no, block_type)
        blocks = [b for b in page.get_text("blocks") if b[6] == 0]  # Text blocks

        # Sort blocks top-to-bottom (y0), then left-to-right (x0)
        blocks.sort(key=lambda b: (round(b[1], 1), round(b[0], 1)))

        page_text = "\n\n".join(
            b[4].strip() for b in blocks if b[4].strip()
        )

        if page_text:
            raw_pages.append(
                Document(
                    page_content=page_text,
                    metadata={
                        "source": clean_doc_name,
                        "page_number": page_num + 1,  # 1-indexed page
                    },
                )
            )

    doc.close()
    return raw_pages


def process_pdf(
    pdf_path: str, chunk_size: int = 1000, chunk_overlap: int = 100
) -> list[Document]:
    """1. Extracts multi-column pages.

    2. Splits them recursively into smooth sentence-boundary chunks.
    3. Tags each chunk with citation metadata (e.g. paper.pdf::p2::1).
    """
    # Step 1: Layout-aware page extraction
    raw_pages = extract_pages(pdf_path)
    clean_doc_name = os.path.basename(pdf_path)

    # Step 2: Smart splitting at natural text boundaries
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", " ", ""],
    )

    chunks = splitter.split_documents(raw_pages)

    # Step 3: Add explicit citation IDs
    page_counters = {}
    for chunk in chunks:
        p_num = chunk.metadata["page_number"]
        key = (clean_doc_name, p_num)

        page_counters[key] = page_counters.get(key, 0) + 1
        chunk_idx = page_counters[key]

        # Standardized citation tag format
        chunk.metadata["chunk_id"] = f"{clean_doc_name}::p{p_num}::{chunk_idx}"

    return chunks


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        sample_pdf = sys.argv[1]
        processed_chunks = process_pdf(sample_pdf)
        print(f"\n--- Ingestion Pipeline Output ---")
        print(f"Total Chunks Generated: {len(processed_chunks)}")
        if processed_chunks:
            first_chunk = processed_chunks[0]
            print(f"\nSample Chunk ID: {first_chunk.metadata['chunk_id']}")
            print(f"Metadata: {first_chunk.metadata}")
            print(f"Content Preview:\n{first_chunk.page_content[:300]}...")