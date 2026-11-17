# Layout-Aware PDF Ingestion & Parsing

## Overview
The ingestion pipeline is the critical entry point in ScholarsMate. Most RAG systems suffer from "Garbage In, Garbage Out" because standard PDF extractors merge multi-column text haphazardly, concatenate headers/footers into sentences, and lose page numbers.

ScholarsMate uses **PyMuPDF (`fitz`)** to perform layout-aware parsing, ensuring clean text extraction, page-level metadata stamping, and structural fidelity.

![[assets/act_ingestion.png]]

---

## Technical Pipeline (`backend/ingestion/pipeline.py`)

### 1. Document Dedup via SHA-256
Before parsing, a cryptographic hash is computed:
```python
def get_file_hash(file_path: str) -> str:
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(8192):
            hasher.update(chunk)
    return hasher.hexdigest()
```
If a file with the same hash already exists for the user, re-indexing is skipped, saving CPU cycles and vector storage.

### 2. Multi-Tier Layout Extraction
```python
import fitz  # PyMuPDF

doc = fitz.open(pdf_path)
for page_num, page in enumerate(doc, start=1):
    # Extracts text blocks with coordinate metadata
    blocks = page.get_text("blocks")
    # Filters out headers, running footers, and page numbers
    cleaned_blocks = [b[4] for b in blocks if not is_running_footer(b)]
```

### 3. Font Hierarchy Analysis
Academic papers typically follow a strict visual hierarchy:
- **Title:** Largest font size on Page 1 ($\ge 16\text{pt}$).
- **Authors & Affiliations:** Medium font size directly below Title ($10-12\text{pt}$).
- **Headings (Abstract, Introduction):** Bold font ($12-14\text{pt}$).
- **Body Text:** Standard font size ($9-10\text{pt}$).

By inspecting font spans via `page.get_text("dict")`, ScholarsMate reliably isolates the true publication title and authors, even when PDF metadata fields are blank or corrupted.

---

## Why We Chose This Over Standard Solutions
1. **Speed:** PyMuPDF parses a 20-page NeurIPS paper in under 200ms.
2. **Precision:** Captures exact 1-indexed page numbers crucial for our citation format: `[Attention_Is_All_You_Need.pdf, p. 4]`.
3. **Resilience:** Gracefully handles non-standard PDF encodings and ligature artifacts (e.g. converting `\ufb01` to `fi`).

---

## Linked Notes
- [[11_Bibliographic_Metadata_Extraction]] — 3-Tier fallback for paper metadata
- [[12_Semantic_Chunking_Strategy]] — Text splitting & overlap rules
- [[61_PyMuPDF_vs_Standard_PDF_Extractors]] — Benchmark comparison
