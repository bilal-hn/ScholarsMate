# FR-10: LRU Workspace Lifecycle & Storage Tiering

## 1. Feature Purpose
As users build dozens of research workspaces over time, retaining millions of vector embeddings and hundreds of heavy PDF binaries in warm memory and active storage creates significant infrastructure costs.

This feature implements a **Least Recently Used (LRU) Workspace Caching & Lifecycle Strategy**. It permanently preserves complete chat conversations, metadata, and citation histories in lightweight relational storage, while automatically evicting expensive vector embeddings and raw file caches from inactive workspaces.

---

## 2. Key Objectives
* **Cost & Memory Optimization:** Keep the active vector database lean and fast by pruning embeddings for stale, unused workspaces.
* **Infinite Chat Retention:** Ensure users never lose historical chat threads, questions, summaries, or citations, regardless of how old a workspace is.
* **Tier-Based Resource Allocation:** Provide clear workspace boundaries based on user subscription levels (Guest, Free, BYOK, Pro).
* **On-Demand Re-activation:** Enable a seamless one-click background re-indexing workflow when a user returns to an archived research workspace.

---

## 3. Workspace Lifecycle & State Machine
### 3.1 State Definitions
* **Active (Warm State):**
  * Full chat transcript and document metadata accessible.
  * Vector embeddings actively resident in ChromaDB for low-latency RAG retrieval.
  * PDF source files available for immediate split-screen viewing and citation jumping.
* **Archived (Cold State):**
  * Complete chat history, synthesis reports, and citations remain 100% readable and searchable.
  * Vector embeddings are evicted from the vector store to free disk/RAM.
  * Raw PDF files are marked cold or moved to low-cost archive storage.
  * The workspace UI indicates an **"Archived (Read-Only Chat)"** status.

---

## 4. Resource Allocation & Tier Matrix

| Resource / Rule | Guest / Anonymous | Free Tier (Platform Key) | BYOK (User Keys) | Pro Tier |
| :--- | :--- | :--- | :--- | :--- |
| **Max Active Workspaces (Warm)** | 1 | 3 | 10 | Unlimited |
| **Total Workspaces (Archived)** | 1 | 10 | Unlimited | Unlimited |
| **Max Papers per Workspace** | 3 papers | 10 papers | 50 papers | 100+ papers |
| **Max File Size** | 10 MB / PDF | 25 MB / PDF | 50 MB / PDF | 100 MB / PDF |
| **Data Retention Model** | Ephemeral (Auto-cleared after 24h) | Permanent transcripts, LRU on vectors | Permanent transcripts, LRU on vectors | Permanent warm vectors & storage |

---

## 5. Automated Lifecycle Workflows

### 5.1 Automated LRU Eviction Flow
1. **Trigger Condition:** Occurs when a user creates/opens a new workspace that exceeds their tier's active workspace cap, or via a scheduled daily maintenance task for workspaces inactive for more than 30 days.
2. **LRU Identification:** The system queries the user's workspaces and selects the least recently accessed workspace based on access timestamps.
3. **State Transition:** The selected workspace is flagged as archived.
4. **Vector Eviction:** The system identifies documents tied to the archived workspace. If a document is not referenced by any other active workspace, its vector embeddings are purged from the vector store.

### 5.2 Seamless Re-Activation Flow
1. **User Interaction:** The user opens an archived workspace and either submits a new question or clicks the **"Re-index Workspace"** button.
2. **Re-activation Notice:** A modal/toast notifies the user: *"Re-activating workspace: Processing document embeddings..."*
3. **Background Ingestion:** The background task fetches the raw PDFs, re-extracts chunks, generates embeddings, and re-inserts vectors into the vector database.
4. **State Transition:** The workspace status updates to active, the access timestamp updates to the current time, and the oldest active workspace is transitioned to cold storage if the active limit is reached.

---

## 6. Acceptance & Validation Checklist
- [ ] Users can navigate into archived workspaces and review complete historical conversations and citations without errors.
- [ ] When a user exceeds their active workspace tier limit, the least recently used workspace automatically transitions to archived status without data loss.
- [ ] Purging an archived workspace's vectors successfully reduces vector database disk/memory footprint.
- [ ] Interacting with an archived workspace prompts the user to re-index and restores active RAG querying and PDF split-screen viewing upon completion.
- [ ] Documents shared between an active workspace and an archived workspace remain searchable in the active workspace without interruption.