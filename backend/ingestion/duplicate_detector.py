"""
ScholarsMate — Duplicate Detection & Merger Engine (FR-17.6)
Identifies duplicate academic references across a user's library using DOI, arXiv ID,
normalized titles, file hashes, and fuzzy similarity. Safely merges duplicate records
into a single canonical record while preserving PDF attachments, notes, tags, and workspaces.
"""

import re
import difflib
from typing import List, Dict, Any, Optional, Set
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import UserDocument, Workspace, ChatSession
from backend.db import crud
from backend.ingestion.identifier_resolver import clean_doi, clean_arxiv_id


def normalize_title(title: Optional[str]) -> str:
    """
    Normalizes paper title by lowercasing, stripping leading articles,
    and removing all punctuation and whitespace.
    """
    if not title:
        return ""
    t = title.lower().strip()
    # Strip leading articles
    t = re.sub(r'^(the|a|an)\s+', '', t)
    # Remove all non-alphanumeric characters
    return re.sub(r'[^a-z0-9]', '', t)


def extract_primary_author_surname(authors: Optional[str]) -> str:
    """
    Extracts normalized surname of first author.
    """
    if not authors:
        return ""
    first_entry = authors.split(";")[0].split(" and ")[0].strip()
    parts = first_entry.replace(",", " ").split()
    if not parts:
        return ""
    surname = parts[0] if "," in first_entry else parts[-1]
    return re.sub(r'[^a-zA-Z]', '', surname).lower()


class UnionFind:
    def __init__(self, elements: List[str]):
        self.parent = {el: el for el in elements}
        self.reason = {el: "Detected duplicate" for el in elements}

    def find(self, i: str) -> str:
        if self.parent[i] == i:
            return i
        self.parent[i] = self.find(self.parent[i])
        return self.parent[i]

    def union(self, i: str, j: str, reason: str = ""):
        root_i = self.find(i)
        root_j = self.find(j)
        if root_i != root_j:
            self.parent[root_i] = root_j
            if reason:
                self.reason[root_j] = reason


def detect_duplicates(docs: List[UserDocument]) -> List[Dict[str, Any]]:
    """
    Groups a list of UserDocument records into duplicate clusters.
    Returns list of duplicate groups, each with group_id, match_reason, and items.
    """
    if len(docs) < 2:
        return []

    doc_ids = [d.id for d in docs]
    doc_map = {d.id: d for d in docs}
    uf = UnionFind(doc_ids)

    # 1. Match by DOI
    doi_map: Dict[str, str] = {}
    for d in docs:
        cleaned_doi = clean_doi(d.doi) if d.doi else None
        if cleaned_doi:
            if cleaned_doi in doi_map:
                uf.union(d.id, doi_map[cleaned_doi], reason=f"Identical DOI ({cleaned_doi})")
            else:
                doi_map[cleaned_doi] = d.id

    # 2. Match by arXiv ID
    arxiv_map: Dict[str, str] = {}
    for d in docs:
        cleaned_arxiv = clean_arxiv_id(d.arxiv_id) if d.arxiv_id else None
        if cleaned_arxiv:
            if cleaned_arxiv in arxiv_map:
                uf.union(d.id, arxiv_map[cleaned_arxiv], reason=f"Matching arXiv ID ({cleaned_arxiv})")
            else:
                arxiv_map[cleaned_arxiv] = d.id

    # 3. Match by Normalized Title
    title_map: Dict[str, str] = {}
    for d in docs:
        norm_t = normalize_title(d.title)
        if len(norm_t) >= 10:
            if norm_t in title_map:
                uf.union(d.id, title_map[norm_t], reason=f"Identical Title")
            else:
                title_map[norm_t] = d.id

    # 4. Match by File Hash (if non-empty physical file)
    hash_map: Dict[str, str] = {}
    for d in docs:
        fhash = d.file_hash
        # Ignore empty file hash or dummy hashes
        if fhash and len(fhash) == 64 and (d.file_size_bytes or 0) > 0:
            if fhash in hash_map:
                uf.union(d.id, hash_map[fhash], reason="Identical File Content (SHA-256 Match)")
            else:
                hash_map[fhash] = d.id

    # 5. Fuzzy Title Similarity (for items with similar titles and same year/author)
    for i in range(len(docs)):
        for j in range(i + 1, len(docs)):
            d1, d2 = docs[i], docs[j]
            # Skip if already in same cluster
            if uf.find(d1.id) == uf.find(d2.id):
                continue

            norm1 = normalize_title(d1.title)
            norm2 = normalize_title(d2.title)
            if len(norm1) >= 12 and len(norm2) >= 12:
                # Quick length pre-filter
                if abs(len(norm1) - len(norm2)) <= 15:
                    ratio = difflib.SequenceMatcher(None, norm1, norm2).ratio()
                    if ratio >= 0.90:
                        # Check year or author alignment
                        author1 = extract_primary_author_surname(d1.authors)
                        author2 = extract_primary_author_surname(d2.authors)
                        year1 = str(d1.year).strip() if d1.year else ""
                        year2 = str(d2.year).strip() if d2.year else ""

                        is_same_author = (author1 and author2 and author1 == author2)
                        is_same_year = (year1 and year2 and year1 == year2)

                        if is_same_author or is_same_year or ratio >= 0.95:
                            uf.union(
                                d1.id,
                                d2.id,
                                reason=f"Similar Title ({int(ratio * 100)}% Match)"
                            )

    # Collect grouped clusters
    clusters: Dict[str, List[UserDocument]] = {}
    for doc_id in doc_ids:
        root = uf.find(doc_id)
        clusters.setdefault(root, []).append(doc_map[doc_id])

    # Filter to only groups that actually have duplicates (>= 2 items)
    duplicate_groups = []
    group_idx = 1
    for root, members in clusters.items():
        if len(members) >= 2:
            duplicate_groups.append({
                "group_id": f"dup_group_{group_idx}",
                "match_reason": uf.reason.get(root, "Duplicate items"),
                "total_items": len(members),
                "items": members,
            })
            group_idx += 1

    return duplicate_groups


async def merge_duplicate_records(
    db: AsyncSession,
    canonical_id: str,
    duplicate_ids: List[str],
    user_id: str,
) -> Optional[UserDocument]:
    """
    Safely merges multiple duplicate records into the canonical record.
    Transfers PDF attachments, merges metadata fields, consolidates tags & notes,
    updates workspaces/chat sessions, and deletes the redundant entries.
    """
    canonical = await crud.get_library_document(db, doc_id=canonical_id, user_id=user_id)
    if not canonical:
        return None

    # Fetch all duplicate records
    dup_records: List[UserDocument] = []
    for dup_id in duplicate_ids:
        if dup_id == canonical_id:
            continue
        rec = await crud.get_library_document(db, doc_id=dup_id, user_id=user_id)
        if rec:
            dup_records.append(rec)

    if not dup_records:
        return canonical

    canonical_has_pdf = (
        bool(canonical.doc_name and canonical.doc_name.lower().endswith(".pdf"))
        and (canonical.file_size_bytes or 0) > 0
    )

    combined_tags: Set[str] = set(canonical.tags or [])
    notes_list: List[str] = [canonical.notes.strip()] if canonical.notes and canonical.notes.strip() else []

    all_old_doc_names: List[str] = []

    for dup in dup_records:
        all_old_doc_names.append(dup.doc_name)
        dup_has_pdf = (
            bool(dup.doc_name and dup.doc_name.lower().endswith(".pdf"))
            and (dup.file_size_bytes or 0) > 0
        )

        # 1. Transfer PDF attachment if canonical lacks one and duplicate has one
        if not canonical_has_pdf and dup_has_pdf:
            canonical.doc_name = dup.doc_name
            canonical.file_hash = dup.file_hash
            canonical.file_size_bytes = dup.file_size_bytes
            canonical_has_pdf = True

        # 2. Field backfilling: if canonical is missing a field, take from duplicate
        if not canonical.doi and dup.doi:
            canonical.doi = dup.doi
        if not canonical.arxiv_id and dup.arxiv_id:
            canonical.arxiv_id = dup.arxiv_id
        if not canonical.authors and dup.authors:
            canonical.authors = dup.authors
        if not canonical.year and dup.year:
            canonical.year = dup.year
        if not canonical.venue and dup.venue:
            canonical.venue = dup.venue
        if not canonical.url and dup.url:
            canonical.url = dup.url
        if not canonical.abstract and dup.abstract:
            canonical.abstract = dup.abstract
        if (not canonical.title or canonical.title.lower() == "untitled item") and dup.title:
            canonical.title = dup.title

        # 3. Consolidate tags
        for t in (dup.tags or []):
            combined_tags.add(t)

        # 4. Consolidate notes
        if dup.notes and dup.notes.strip():
            dup_note = dup.notes.strip()
            if dup_note not in notes_list:
                notes_list.append(dup_note)

    canonical.tags = list(combined_tags)
    if notes_list:
        canonical.notes = "\n\n".join(notes_list)

    # 5. Transfer workspace memberships: any workspace referencing dup.doc_name now references canonical.doc_name
    ws_stmt = select(Workspace).where(Workspace.user_id == user_id)
    ws_res = await db.execute(ws_stmt)
    workspaces = ws_res.scalars().all()

    for ws in workspaces:
        ws_docs = list(ws.doc_names or [])
        modified = False
        for old_name in all_old_doc_names:
            if old_name in ws_docs:
                ws_docs = [canonical.doc_name if d == old_name else d for d in ws_docs]
                modified = True

        if modified:
            # Deduplicate workspace docs
            ws.doc_names = list(dict.fromkeys(ws_docs))
            for s in (ws.sessions or []):
                s_docs = list(s.doc_names or [])
                for old_name in all_old_doc_names:
                    if old_name in s_docs:
                        s_docs = [canonical.doc_name if d == old_name else d for d in s_docs]
                s.doc_names = list(dict.fromkeys(s_docs))

    # 6. Delete redundant duplicate records from database
    for dup in dup_records:
        await db.delete(dup)

    await db.commit()
    await db.refresh(canonical)
    return canonical
