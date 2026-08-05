import os
from pathlib import Path
import fitz  # PyMuPDF
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter


def extract_pages_layout_aware(pdf_path: str) -> tuple[list[Document], str]:
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
                        "paper_title": extracted_title or clean_doc_name,
                        "page_number": page_num + 1,
                    },
                )
            )

    doc.close()
    return raw_pages, (extracted_title or clean_doc_name)


def process_path(
    input_path: str, chunk_size: int = 1200, chunk_overlap: int = 150
) -> list[Document]:
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
    
    # Code-aware & structure-preserving text splitter
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=[
            "\n```",        # Code block boundaries
            "\ndef ",       # Python functions
            "\nclass ",     # Python classes
            "\n\n",         # Paragraph breaks
            "\n",           # Line breaks
            " ",            # Words
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

        print(f"Processing: {pdf_file.name} (as '{clean_doc_name}')...")
        
        raw_pages, paper_title = extract_pages_layout_aware(str(pdf_file))

        doc_chunks = splitter.split_documents(raw_pages)

        # Inject citation IDs per document & page
        page_counters = {}
        for chunk in doc_chunks:
            p_num = chunk.metadata["page_number"]
            chunk.metadata["source"] = clean_doc_name
            chunk.metadata["paper_title"] = paper_title
            
            key = (clean_doc_name, p_num)
            page_counters[key] = page_counters.get(key, 0) + 1
            chunk_idx = page_counters[key]

            chunk.metadata["chunk_id"] = f"{clean_doc_name}::p{p_num}::{chunk_idx}"

        all_chunks.extend(doc_chunks)

    return all_chunks