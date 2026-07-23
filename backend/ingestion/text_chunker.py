import os
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter


def chunk_documents(
    documents: list[Document],
    chunk_size: int = 1000,
    chunk_overlap: int = 100,
) -> list[Document]:
    """Splits a list of LangChain Document objects into overlapping chunks

    using RecursiveCharacterTextSplitter and injects explicit citation metadata.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        is_separator_regex=False,
    )

    # Split documents into chunks while maintaining original document metadata
    raw_chunks = splitter.split_documents(documents)

    # Enrich each chunk with explicit citation metadata
    page_counters = {}

    for chunk in raw_chunks:
        source_path = chunk.metadata.get("source", "unknown_doc.pdf")
        clean_doc_name = os.path.basename(source_path)

        # PyPDFLoader indexes pages starting from 0; adjust to 1-based indexing for standard citations
        raw_page = chunk.metadata.get("page", 0)
        page_num = raw_page + 1 if isinstance(raw_page, int) else raw_page

        key = (clean_doc_name, page_num)
        page_counters[key] = page_counters.get(key, 0) + 1
        chunk_idx = page_counters[key]

        # Standardized citation ID tag (e.g., "paper.pdf::p5::1")
        chunk_id = f"{clean_doc_name}::p{page_num}::{chunk_idx}"

        # Inject normalized metadata required for vector store & citations
        chunk.metadata.update(
            {
                "chunk_id": chunk_id,
                "doc_name": clean_doc_name,
                "page_number": page_num,
            }
        )

    return raw_chunks