# Assisted Document Writer & Live Citation Drawer (FR-17.8)

## Overview & Workflow
ScholarsMate closes the loop from literature discovery to publication with the **Assisted Document Writer** (`DocumentWriter.jsx` & `LibraryCitationDrawer.jsx`).

Rather than switching windows between an AI chat and Microsoft Word or Google Docs, researchers draft their thesis chapters directly inside ScholarsMate with continuous AI assistance and instant citation insertion.

---

## The Unified Split-Screen Workspace

```mermaid
flowchart LR
    subgraph Left Pane: Thesis Editor
        RichText[Rich-Text Thesis Editor:\nMarkdown & Formatting Toolbar]
        LiveDraft[Active Chapter Draft]
        AutoBib[Auto-Generated Bibliography Section]
    end
    
    subgraph Slide-Out Drawer: Library Citations
        Filter[Search by Title / Author / Tag]
        PapersList[Workspace Library Papers]
        InsertBtn[Insert Citation Button:\nIEEE [1] | APA (Vaswani, 2017)]
    end
    
    subgraph Right Pane: RAG Assistant
        ChatPrompt[Ask RAG Assistant for\nCritique, Rephrasing, Synthesis]
        DocExcerpts[View Source Quotes]
    end
    
    InsertBtn -->|Inserts Marker| LiveDraft
    LiveDraft -->|Updates Indices| AutoBib
    ChatPrompt -->|Injects Text| LiveDraft
```

---

## 1. Multi-Style In-Text Citation Insertion
When the user clicks "Insert Citation" or uses `Ctrl+Shift+C`:
- **IEEE Style:** Inserts clean numeric superscripts (e.g. `[1]`, `[1, p. 4]`), automatically re-using existing indices for already-cited papers.
- **APA 7th Style:** Inserts formal author-date citations (e.g. `(Vaswani et al., 2017)` or `(Smith & Jones, 2024, p. 12)`).
- **Harvard Style:** Inserts standard author-date without comma (e.g. `(Vaswani et al. 2017)`).

---

## 2. Real-Time Dynamic Bibliography Generation
As citations are inserted into the prose:
1. The system scans all in-text markers.
2. Formats a full, publication-ready **References** section at the bottom of the draft in sorted order.
3. Supports 1-click export to **Microsoft Word (`.docx`)**, **Compiled PDF**, or **Overleaf `.tex`**.

---

## Linked Notes
- [[40_Academic_Reference_Manager_Overview]] — Central paper library
- [[43_Citation_Formatting_and_BibTeX_Export]] — Citation formatting engine
- [[51_Literature_Review_Monograph_Studio]] — Literature review generation
