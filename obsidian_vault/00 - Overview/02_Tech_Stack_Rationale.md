# Tech Stack Rationale: Why We Chose Our Tools

Every component in ScholarsMate was chosen after rigorous benchmarking of academic workflows, latency requirements, local developer ergonomics, and API economics.

---

## 1. Vector Database: ChromaDB vs Cloud Alternatives

| Requirement | ChromaDB (Local SQLite/DuckDB backend) | Pinecone / Weaviate Cloud | Why We Chose ChromaDB |
|---|---|---|---|
| **Privacy & Security** | 100% on-premises / local persistence. Zero document egress. | Transmits embeddings and metadata to third-party servers. | Crucial for unpublished research, proprietary thesis drafts, and IRB privacy compliance. |
| **Operational Overhead** | Embedded Python library; zero Docker or cluster management needed. | Cloud account provisioning, API keys, index warming. | Low friction for university students running on laptops or lab servers. |
| **Cost** | **$0.00 / Free forever.** | Pay-per-pod or usage-based tiering. | Ideal for academic environments with zero budget. |
| **Batched Upsert & Metadata** | Built-in metadata dictionary filtering (`doc_name`, `page_number`, `user_id`). | Complex metadata indexes. | Directly matches our page-level citation mapping requirements. |

---

## 2. PDF Processing: PyMuPDF (`fitz`) vs LangChain PyPDF / pypdf

| Metric | PyMuPDF (`fitz`) | PyPDF / pypdf (Default LangChain) | Why We Chose PyMuPDF |
|---|---|---|---|
| **Parsing Speed** | **~10x - 20x faster** (C-based MuPDF engine). | Pure Python; noticeably slow on 50+ page PDFs. | Ingesting 10 conference papers completes in 2.1s instead of 35s. |
| **Layout & Font Detection** | Extracts exact font sizes, font families, and bounding boxes. | Dumps flat unstructured text; loses heading hierarchy. | Required for Tier 1 Bibliographic Extraction (identifying paper title by largest font). |
| **Image Extraction** | Native image stream extraction with page offsets. | Difficult / prone to corrupting image streams. | Enables extracting figures/tables directly from papers. |

---

## 3. Backend Framework: FastAPI vs Flask / Django

- **Asynchronous Native (`async`/`await`):** Essential for streaming LLM tokens (Server-Sent Events) and non-blocking background tasks (`summary_worker`, `brain_extraction`).
- **Pydantic Validation:** Strict schema enforcement on API requests (`QueryRequest`, `DocumentUpdate`, `GuardrailResult`) preventing malformed payloads.
- **Auto OpenAPI / Swagger:** Interactive documentation out-of-the-box at `/docs`.

---

## 4. Frontend Framework: Next.js & Tailwind CSS

- **Component Ergonomics:** Modular React components for complex layouts (3-Pane Zotero library, Split-view PDF reader, Document Writer).
- **Responsive Theme Engine:** Academic light/dark modes with instant switching.
- **Optimized Rendering:** Fast client-side state handling for interactive chat history and real-time citation drawer insertion.

---

## 5. Inference & LLM Agnostic Engine: LiteLLM

- **Bring-Your-Own-Key (BYOK):** Allows researchers to toggle between **Gemini 2.5/3.6 Flash**, **Groq (Llama-3.3-70B)**, OpenAI, and Anthropic.
- **Unified Interface:** Standard OpenAI-compatible client wrapper; model switching requires changing a single string parameter.
- **Provider Fallback Chain:** If Groq hits TPM rate limits, the system gracefully falls back to Gemini Flash with zero crash.

---

## Linked Notes
- [[60_ChromaDB_vs_Cloud_Vector_Databases]] — Detailed architectural tradeoff
- [[61_PyMuPDF_vs_Standard_PDF_Extractors]] — Benchmark and speed analysis
- [[10_Layout_Aware_PDF_Parsing]] — How PyMuPDF powers ingestion
