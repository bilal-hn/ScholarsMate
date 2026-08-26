# In backend/ingestion/indexer.py (where documents are parsed & indexed)

from backend.ingestion.summary_worker import trigger_async_summary_generation

async def index_pdf_file(file_path: str, doc_name: str):
    # 1. Parse PDF pages
    # 2. Split into micro-chunks (~250 tokens)
    # 3. Generate vector embeddings and insert into ChromaDB
    
    # Once vector storage is confirmed:
    print(f"[Indexer] Document '{doc_name}' indexed successfully. Triggering summary worker...")
    await trigger_async_summary_generation(doc_name=doc_name)
    
    return {"status": "indexed", "doc_name": doc_name}