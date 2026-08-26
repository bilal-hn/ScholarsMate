# FR-12: Ingestion-Time Document Summarization & Hierarchical Cache

## 1. Feature Purpose

Generating comprehensive document summaries on demand currently defaults to full-text retrieval mode. This injects thousands of tokens across entire documents into the context window, causing 45–60 second generation delays, high compute costs, and frequent rate limit failures on constrained API tiers.

This feature implements an **Ingestion-Time Document Summarization & Hierarchical Caching Engine**. It pre-computes structured, citation-locked document overviews asynchronously during initial upload, caching them in relational storage for sub-second retrieval while preserving granular micro-chunks for standard question-answering.

---

## 2. Key Objectives

* **Sub-Second Summary Latency:** Reduce document summarization response times from over 45 seconds to under 200 milliseconds via persistent cache hits.
* **Zero Token Cost on Repetitive Queries:** Eliminate redundant LLM calls and token consumption for recurring document-level summary requests.
* **Guaranteed Citation Grounding:** Ensure pre-computed summaries strictly retain verified, page-level inline citations to source documents.
* **Rate-Limit Immunity:** Prevent full-text context blowups from exceeding provider Tokens Per Minute (TPM) ceilings.

---

## 3. Architecture & Ingestion Lifecycle

### 3.1 Dual-Path Ingestion Pipeline

* **Granular Chunking Path (Synchronous):**
* Parses raw PDF text into small, overlapping micro-chunks (~250 tokens).
* Embeds and inserts micro-chunks into ChromaDB with metadata (chunk ID, document name, page number).
* Immediately activates the document for standard semantic search and specific Q&A.


* **Hierarchical Summarization Path (Asynchronous Background Worker):**
* Triggers automatically upon successful document embedding.
* Samples representative landmark chunks (Abstract, Methodology, Empirical Tables, Limitations).
* Executes a targeted extraction prompt to synthesize a structured 7-point monograph summary.
* Persists the generated markdown summary and timestamp directly into relational storage.



---

## 4. Query Routing & Cache Evaluation Matrix

| Query Intent / Condition | Target Document Count | Cache State | Execution Path | Expected Latency |
| --- | --- | --- | --- | --- |
| **Document Summary** | Single Document (1) | Cache Hit | Direct retrieval from relational cache; zero LLM calls | < 200 ms |
| **Document Summary** | Single Document (1) | Cache Miss / In-Flight | Fallback to targeted section-sampling synthesis | 3–5 seconds |
| **Multi-Document Synthesis** | Multiple Documents (>1) | N/A | Parallel map-reduce across document cache summaries | 4–8 seconds |
| **Granular Fact / Method Query** | Single or Multiple | N/A | Standard Vector Semantic Search (top-$k$ micro-chunks) | 1–3 seconds |

---

## 5. Automated System Workflows

### 5.1 Asynchronous Summary Generation Flow

1. **Trigger Condition:** Document parsing and vector embedding complete successfully in the ingestion pipeline.
2. **Landmark Extraction:** The system samples key structural sections:
* Abstract & Problem Formulation (Pages 1–2)
* Methodology & Architectural Frameworks
* Empirical Benchmark Tables & Quantitative Findings
* Limitations & Open Research Gaps


3. **Structured Synthesis:** The model generates an academic monograph summary enforcing explicit page-level citation tags (`[doc_name, p.X]`).
4. **Cache Persistence:** The resulting markdown payload is saved to the document's metadata record with an updated timestamp.

### 5.2 Query Interception & Instant Cache Retrieval Flow

1. **User Interaction:** The user submits a query classified as a document-level summary request (e.g., *"Summarise sample.pdf"*).
2. **Intent Evaluation:** The query router detects single-document summary intent and checks relational storage for an existing summary cache.
3. **Cache Hit Dispatch:** If found, the system immediately returns the formatted, citation-grounded summary to the client interface without dispatching vector queries or LLM completion calls.
4. **Cache Miss Fallback:** If the cache is empty or still generating, the router routes to targeted landmark chunk retrieval to fulfill the request.

---

## 6. Acceptance & Validation Checklist

* [ ] Uploading a PDF successfully triggers the background summarization worker without blocking immediate workspace interactions.
* [ ] Asking for a single document summary returns the complete, cached response in under 500 milliseconds on a cache hit.
* [ ] Cached summaries include valid, source-locked inline page citations matching the source PDF.
* [ ] Cache hits consume zero LLM completion tokens and generate no outbound API calls.
* [ ] In the event of a cache miss, the system gracefully falls back to section-sampled retrieval without throwing 500 errors.
* [ ] Deleting or re-indexing a document clears and updates the corresponding summary cache.