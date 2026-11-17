# Duplicate Detection & Disjoint-Set Union-Find Merger

## The Challenge
Researchers frequently upload the same paper multiple times under different names:
- `Attention is all you need.pdf`
- `1706.03762.pdf`
- `vaswani-transformer-neurips.pdf`

Naive string comparison fails to detect duplicates because the filenames, dates, and file hashes differ. If duplicates are indexed, search queries return redundant chunks and waste context space.

ScholarsMate implements an algorithmic **Duplicate Detection & Merger Engine** (`backend/ingestion/duplicate_detector.py`).

---

## 1. Multi-Signal Similarity Heuristics

Two papers are identified as duplicates if ANY of the following rules hold:
1. **Canonical Identifier Match:** Matching normalized `doi` or `arxiv_id`.
2. **Normalized Title Identity:** Titles match after lowercasing, stripping leading articles (`The`, `A`, `An`), and removing punctuation:
   ```python
   def normalize_title(title: Optional[str]) -> str:
       t = re.sub(r'^(the|a|an)\s+', '', title.lower().strip())
       return re.sub(r'[^a-z0-9]', '', t)
   ```
3. **Fuzzy Title Match + Author Alignment:** If title sequence similarity $\ge 0.88$ (via `difflib.SequenceMatcher`) AND primary author surnames match.

---

## 2. Union-Find (Disjoint-Set) Clustering
If Paper A matches Paper B, and Paper B matches Paper C, all three belong to the same canonical equivalence class.

ScholarsMate uses a classical computer science **Union-Find data structure with Path Compression**:
```python
class UnionFind:
    def __init__(self, elements: List[str]):
        self.parent = {el: el for el in elements}
        self.reason = {el: "Detected duplicate" for el in elements}

    def find(self, i: str) -> str:
        if self.parent[i] == i:
            return i
        self.parent[i] = self.find(self.parent[i])  # Path compression
        return self.parent[i]

    def union(self, i: str, j: str, reason: str = ""):
        root_i = self.find(i)
        root_j = self.find(j)
        if root_i != root_j:
            self.parent[root_i] = root_j
            self.reason[root_i] = reason
```

---

## 3. Safe Metadata Merger
When merging:
- The entry with the most complete metadata (or attached PDF) is elected as the canonical parent.
- Workspace associations, tags, and user notes from duplicate entries are preserved and merged into the canonical record.
- Redundant vector chunks in ChromaDB are safely purged.

---

## Linked Notes
- [[40_Academic_Reference_Manager_Overview]] — Library management
- [[41_DOI_and_arXiv_Identifier_Resolvers]] — DOI/arXiv matching signals
- [[10_Layout_Aware_PDF_Parsing]] — SHA-256 binary deduplication
