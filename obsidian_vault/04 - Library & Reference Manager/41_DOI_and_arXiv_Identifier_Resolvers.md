# Automated Academic Identifier & Metadata Resolvers

## Purpose
Academic papers carry persistent global identifiers:
- **DOI (Digital Object Identifier):** e.g. `10.1145/3318464.3389700`
- **arXiv Identifier:** e.g. `arXiv:2305.18290` or `1706.03762`

Extracting metadata purely with OCR or font heuristics is error-prone. ScholarsMate features an **Automated Identifier Resolver** (`backend/ingestion/identifier_resolver.py`) that queries official registries.

---

## Architecture & Integration

```mermaid
flowchart TD
    RawDoc[Raw PDF Text or User Input] --> RegEx[Regex Identifier Scanner]
    RegEx -->|DOI Found| CrossRef[CrossRef REST API:\nhttps://api.crossref.org/works/{doi}]
    RegEx -->|arXiv ID Found| ArXiv[arXiv Atom XML API:\nhttp://export.arxiv.org/api/query]
    
    CrossRef --> Parser1[JSON Metadata Normalizer]
    ArXiv --> Parser2[XML ElementTree Normalizer]
    
    Parser1 --> VerifiedMeta[Verified Scholarly Metadata:\n- Title\n- Authors (Formatted List)\n- Publication Year\n- Journal / Conference Venue\n- Abstract\n- Official URL]
    Parser2 --> VerifiedMeta
```

---

## 1. DOI Resolution via CrossRef REST API
- Strips URL prefixes (`https://doi.org/`) and punctuation artifacts.
- Queries `https://api.crossref.org/works/{doi}` with a customized polite User-Agent string.
- Maps CrossRef type ontology (`journal-article`, `proceedings-article`, `book-chapter`) to ScholarsMate schemas.

## 2. arXiv Resolution via arXiv Atom API
- Cleans versions (`v1`, `v2`) to query the base publication ID.
- Parses the XML response using `xml.etree.ElementTree`.
- Extracts author names, submission dates, category tags (`cs.CL`, `cs.AI`), and formal abstracts.

## 3. "Add by DOI / arXiv" Modal
Researchers do not even need to have the PDF on disk! They can enter `10.1038/s41586-020-2649-2` or `2305.18290`, and ScholarsMate:
1. Resolves all verified metadata.
2. Automatically triggers the **Open Access PDF Downloader** (`backend/ingestion/oa_pdf_downloader.py`) via Unpaywall / Semantic Scholar to fetch the open-access PDF automatically!

---

## Linked Notes
- [[40_Academic_Reference_Manager_Overview]] — Library UI integration
- [[42_Duplicate_Detection_and_Union_Find]] — Preventing duplicate entries
- [[11_Bibliographic_Metadata_Extraction]] — Ingestion-time fallback
