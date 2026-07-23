import os
from pathlib import Path
import fitz  # PyMuPDF
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter


def extract_pages_layout_aware(pdf_path: str) -> list[Document]:
    """Reads a single PDF file, sorting text blocks by position (y0, x0)

    to preserve standard multi-column academic reading order.
    """
    doc = fitz.open(pdf_path)
    clean_doc_name = os.path.basename(pdf_path)
    raw_pages = []

    for page_num in range(len(doc)):
        page = doc[page_num]

        # Extract blocks: (x0, y0, x1, y1, text, block_no, block_type)
        blocks = [b for b in page.get_text("blocks") if b[6] == 0]

        # Sort top-to-bottom (y0), then left-to-right (x0)
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
                        "page_number": page_num + 1,
                    },
                )
            )

    doc.close()
    return raw_pages


def process_path(
    input_path: str, chunk_size: int = 1000, chunk_overlap: int = 100
) -> list[Document]:
    """Accepts either a single PDF file OR a folder directory.

    Recursively scans for all .pdf files, extracts layout-aware text,
    and returns overlapping chunks tagged with page citation IDs.
    """
    path = Path(input_path)
    pdf_files = []

    if path.is_file() and path.suffix.lower() == ".pdf":
        pdf_files = [path]
    elif path.is_dir():
        pdf_files = list(path.glob("**/*.pdf"))
    else:
        print(f"Error: Path '{input_path}' is neither a valid PDF nor a directory.")
        return []

    if not pdf_files:
        print(f"No PDF files found in '{input_path}'.")
        return []

    print(f"Found {len(pdf_files)} PDF file(s) to process.")

    all_chunks = []
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", " ", ""],
    )

    for pdf_file in pdf_files:
        print(f"Processing: {pdf_file.name}...")
        raw_pages = extract_pages_layout_aware(str(pdf_file))
        clean_doc_name = pdf_file.name

        doc_chunks = splitter.split_documents(raw_pages)

        # Inject citation IDs per document & page
        page_counters = {}
        for chunk in doc_chunks:
            p_num = chunk.metadata["page_number"]
            key = (clean_doc_name, p_num)

            page_counters[key] = page_counters.get(key, 0) + 1
            chunk_idx = page_counters[key]

            # Citation ID (e.g. "paper.pdf::p2::1")
            chunk.metadata["chunk_id"] = f"{clean_doc_name}::p{p_num}::{chunk_idx}"

        all_chunks.extend(doc_chunks)

    return all_chunks


# Alias for single-file backwards compatibility
process_pdf = process_path


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        target_path = sys.argv[1]
        processed_chunks = process_path(target_path)
        print(f"\n--- Ingestion Pipeline Output ---")
        print(f"Total Chunks Generated: {len(processed_chunks)}")
        if processed_chunks:
            first_chunk = processed_chunks[3]
            print(f"\nSample Chunk ID: {first_chunk.metadata['chunk_id']}")
            print(f"Metadata: {first_chunk.metadata}")
            print(f"Content Preview:\n{first_chunk.page_content[:250]}...")