from pathlib import Path
from langchain_community.document_loaders import PyPDFLoader
from langchain_core.documents import Document


def parse_pdf(pdf_path: str) -> list[Document]:
    """Scans a file or directory for PDFs and loads them into a list of LangChain Document objects,

    preserving document metadata and page numbers.
    """
    path = Path(pdf_path)
    all_documents = []

    if path.is_file() and path.suffix.lower() == ".pdf":
        pdf_files = [path]
    elif path.is_dir():
        pdf_files = list(path.glob("**/*.pdf"))
    else:
        print(f"No valid PDF found at: {pdf_path}")
        return []

    print(f"Found {len(pdf_files)} PDF file(s) in {pdf_path}")

    for pdf_file in pdf_files:
        print(f"Processing {pdf_file}...")
        try:
            loader = PyPDFLoader(str(pdf_file))
            documents = loader.load()
            all_documents.extend(documents)
        except Exception as e:
            print(f"Error processing {pdf_file}: {e}")

    print(f"Total document pages loaded: {len(all_documents)}")
    return all_documents


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        sample_path = sys.argv[1]
        docs = parse_pdf(sample_path)
        if docs:
            print(f"\n--- Page 1 Metadata ---\n{docs[0].metadata}")
            print(
                f"\n--- Page 1 Preview ---\n{docs[0].page_content[:300]}..."
            )