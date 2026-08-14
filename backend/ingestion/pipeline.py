import os
import hashlib
from pathlib import Path
import fitz  # PyMuPDF
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter


def calculate_sha256(file_path: str) -> str:
    """Computes the deterministic SHA-256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(65536), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def extract_pages_layout_aware(pdf_path: str, file_hash: str) -> tuple[list[Document], str]:
    """Reads a PDF, extracts layout-aware text, and extracts paper title."""
    doc = fitz.open(pdf_path)
    clean_doc_name = os.path.basename(pdf_path)
    raw_pages = []

    # Attempt to extract title from PyMuPDF metadata
    extracted_title = doc.metadata.get("title", "").strip()

    for page_num in range(len(doc)):
        page = doc[page_num]
        blocks = page.get_text("blocks", sort=True)

        # Filter out non-text blocks (b[6] != 0 are images/vectors)
        text_blocks = [b for b in blocks if b[6] == 0 and b[4].strip()]

        # Fallback: Use first text block of Page 1 as paper title if metadata is empty
        if page_num == 0 and not extracted_title and text_blocks:
            extracted_title = text_blocks[0][4].strip().replace("\n", " ")

        page_text = "\n\n".join(b[4].strip() for b in text_blocks)

        if page_text:
            raw_pages.append(
                Document(
                    page_content=page_text,
                    metadata={
                        "source": clean_doc_name,
                        "file_hash": file_hash,
                        "paper_title": extracted_title or clean_doc_name,
                        "page_number": page_num + 1,
                    },
                )
            )

    doc.close()
    return raw_pages, (extracted_title or clean_doc_name)


def process_path(
    input_path: str, 
    chunk_size: int = 1200, 
    chunk_overlap: int = 150,
    check_dedup: bool = True
) -> list[Document]:
    """Processes PDF files with built-in SHA-256 deduplication."""
    # Delayed import to avoid circular imports
    from backend.embeddings.vector_store import is_document_already_indexed

    path = Path(input_path)
    pdf_files = []

    if path.is_file() and path.suffix.lower() == ".pdf":
        pdf_files = [path]
    elif path.is_dir():
        pdf_files = sorted(list(set(path.glob("**/*.pdf"))))
    else:
        print(f"Error: Path '{input_path}' is neither a valid PDF nor a directory.")
        return []

    if not pdf_files:
        print(f"No PDF files found in '{input_path}'.")
        return []

    print(f"Found {len(pdf_files)} PDF file(s) to process.")

    all_chunks = []
    
    # Structure-preserving text splitter
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=[
            "\n```",         # Code block boundaries
            "\ndef ",        # Python functions
            "\nclass ",      # Python classes
            "\n\n",          # Paragraph breaks
            "\n",            # Line breaks
            " ",             # Words
            ""
        ],
    )

    seen_doc_names = set()

    for pdf_file in pdf_files:
        clean_doc_name = pdf_file.name

        if clean_doc_name in seen_doc_names:
            rel_path = str(pdf_file.relative_to(path if path.is_dir() else path.parent))
            clean_doc_name = rel_path.replace("\\", "_").replace("/", "_")
        
        seen_doc_names.add(clean_doc_name)

        # 1. Compute SHA-256 Hash
        file_hash = calculate_sha256(str(pdf_file))

        # 2. Deduplication check: skip if already indexed in vector database
        if check_dedup and is_document_already_indexed(file_hash):
            print(f"[Deduplication Notice] Skipping '{clean_doc_name}' (Hash: {file_hash[:10]}... already indexed).")
            continue

        print(f"Processing: {pdf_file.name} (SHA-256: {file_hash[:10]}...)...")
        
        raw_pages, paper_title = extract_pages_layout_aware(str(pdf_file), file_hash)

        doc_chunks = splitter.split_documents(raw_pages)

        # Inject citation IDs per document & page
        page_counters = {}
        for chunk in doc_chunks:
            p_num = chunk.metadata["page_number"]
            chunk.metadata["source"] = clean_doc_name
            chunk.metadata["file_hash"] = file_hash
            chunk.metadata["paper_title"] = paper_title
            
            key = (clean_doc_name, p_num)
            page_counters[key] = page_counters.get(key, 0) + 1
            chunk_idx = page_counters[key]

            chunk.metadata["chunk_id"] = f"{clean_doc_name}::p{p_num}::{chunk_idx}"

        all_chunks.extend(doc_chunks)

    return all_chunks