# Academic Reference Manager & Central Paper Library (F-17)

## Purpose & Overview
* **Status:** Complete
* **Module:** Module 4 — Academic Knowledge Base & Reference Management
* **Inspiration:** Zotero / Mendeley integrated natively with RAG AI

Previously, RAG tools locked documents into ephemeral chat sessions. If a user closed the window or switched workspaces, their papers were isolated.

ScholarsMate introduces a **Central Academic Paper Library**:
- Displays every paper uploaded across all workspaces in a structured, sortable data table.
- Stores verified bibliographic metadata (`title`, `authors`, `year`, `venue`, `doi`, `arxiv_id`, `abstract`, `tags`).
- Connects directly into the **RAG Chat**, **Literature Review Studio**, and **Assisted Document Writer**.

---

## The 3-Pane Zotero-Style Layout

```mermaid
flowchart LR
    subgraph Pane 1: Collections
        All[All Papers]
        Recent[Recently Added]
        Workspaces[By Workspace]
        Tags[By Tag: #Transformer #FYP]
    end
    
    subgraph Pane 2: Paper Data Table
        Search[Real-time Search Bar]
        Table[Sortable Columns:\nTitle | Authors | Year | Venue | Size | Date]
        BulkActions[Bulk Export BibTeX | Move Workspace | Delete]
    end
    
    subgraph Pane 3: Inspector Drawer
        MetaTab[Tab 1: Metadata - Editable fields & Auto-Enrich]
        SummaryTab[Tab 2: AI Summary - Sub-50ms TL;DR]
        CiteTab[Tab 3: Citations - APA, IEEE, BibTeX copy]
        NotesTab[Tab 4: Research Notes]
    end
    
    Pane 1 --> Pane 2 --> Pane 3
```

---

## Action Bridges
From any paper or multi-selection in the library, users have 3 direct action shortcuts:
1. **"Chat with Paper":** Opens a split-screen session scoped strictly to that document.
2. **"Synthesize Literature Review":** Selecting 2 to 6 papers opens the Literature Review Studio with those documents pre-selected.
3. **"Insert Citation" in Writer:** Slide-out drawer in the thesis editor inserts numbered IEEE/APA citations into active drafts.

---

## Linked Notes
- [[41_DOI_and_arXiv_Identifier_Resolvers]] — CrossRef and arXiv APIs
- [[42_Duplicate_Detection_and_Union_Find]] — Algorithmic deduplication
- [[43_Citation_Formatting_and_BibTeX_Export]] — Multi-style citation generator
- [[52_Assisted_Document_Writer_and_Citation_Drawer]] — Thesis drafting integration
