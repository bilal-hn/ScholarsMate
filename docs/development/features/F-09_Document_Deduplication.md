# FR-08: Content-Addressable Storage & Vector Deduplication

## 1. Feature Purpose
When multiple users or workspaces upload the same research paper (e.g., standard benchmark papers like *Attention Is All You Need*), the system should not store redundant raw files or re-run expensive embedding models. 

This feature introduces a content-addressable storage mechanism using cryptographic file hashing (SHA-256) to ensure every unique document is stored and embedded exactly once, while allowing unlimited workspaces to reference it.

---

## 2. Key Objectives
* **Storage Optimization:** Save disk and object storage costs by preventing duplicate binary storage.
* **Compute Savings:** Completely eliminate repeated text parsing, chunking, and embedding generation for previously indexed papers.
* **Instant Ingestion:** Make document additions to new workspaces instantaneous if the paper already exists in the system catalog.
* **Multi-Tenant Isolation:** Ensure workspace-level document filtering remains strictly isolated even when sharing underlying vector representations.

---

## 3. High-Level Workflow

### 3.1 Document Ingestion Flow
1. **Hash Calculation:** The server intercepts the uploaded PDF stream and calculates its SHA-256 checksum.
2. **Catalog Lookup:** The database checks if a record with that specific hash already exists.
3. **Branch A (Document Already Exists):**
   * Link the existing master document record to the active workspace.
   * Skip parsing, layout analysis, and vector embedding passes entirely.
   * Instantly notify the frontend that the document is ready.
4. **Branch B (New Document):**
   * Upload the raw PDF to object storage (S3 / R2) keyed by its hash.
   * Parse pages, extract layout and text chunks.
   * Generate vector embeddings for all chunks.
   * Store embeddings in the vector database tagged with the master document ID.
   * Save the master document record and link it to the active workspace.

### 3.2 Document Deletion & Disassociation Flow
* **Workspace Removal:** When a user removes a document from a workspace, only the relational link between that workspace and the document is deleted.
* **Data Preservation:** The master document record, raw file, and vector embeddings remain intact so other workspaces referencing the same paper continue to function without interruption.
* **Garbage Collection (Optional):** If a master document is no longer referenced by any workspace across the entire platform, a background worker can flag it for pruning.

---

## 4. Logical Data Model

### 4.1 Master Documents Catalog
Tracks the global deduplicated repository of all papers known to the system:
* **Document ID:** Unique global identifier.
* **File Hash:** SHA-256 cryptographic hash (unique index).
* **Title & Metadata:** Extracted academic title, original filename, page count, and file size.
* **Storage Location:** URI/path to the raw PDF in object storage.
* **Processing Status:** State indicator (Pending, Processing, Ready, Failed).

### 4.2 Workspace Associations
Tracks which documents belong to which user workspaces:
* **Workspace ID:** Reference to the active user workspace.
* **Document ID:** Reference to the master document.
* **Attached Timestamp:** When the paper was linked to the workspace.

### 4.3 Vector Chunk Metadata
Every vector embedding chunk in the vector database carries metadata fields for runtime filtering:
* `document_id`: Links the vector chunk back to the master document record.
* `source`: Original filename for UI citation badges.
* `page_number`: Page number where the chunk appears.
* `chunk_id`: Deterministic chunk identifier.

---

## 5. Scoped Vector Retrieval Mechanism
* When a user queries a workspace, the system first retrieves the list of `document_id`s linked to that active workspace.
* The vector search query applies a strict metadata filter ensuring only chunks matching those specific document IDs are searched and returned.
* If a workspace contains zero documents, the search immediately returns an empty result set without executing a global vector scan.

---

## 6. Acceptance & Validation Checklist
- [ ] Uploading an identical PDF file across multiple workspaces generates zero new embedding calls.
- [ ] Uploading a duplicate PDF completes almost instantly compared to a first-time upload.
- [ ] Removing a paper from Workspace A does not affect citations, queries, or PDF viewing in Workspace B.
- [ ] Search queries in Workspace A never return or cite chunks from papers belonging exclusively to Workspace B.