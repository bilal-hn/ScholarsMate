"""
ScholarsMate — Automated Academic Identifier & Metadata Resolver (FR-17.3)
Supports CrossRef API for DOIs and arXiv API for preprint identifiers.
"""

import re
import html
import xml.etree.ElementTree as ET
from typing import Optional, Dict, Any, Tuple
from pathlib import Path
import httpx
import pymupdf

# Regex patterns for Academic Identifiers
DOI_PATTERN = re.compile(r'\b10\.\d{4,9}/[-._;()/:A-Za-z0-9]+\b')
ARXIV_PATTERN = re.compile(r'\b(?:arxiv:\s*)?(\d{4}\.\d{4,5}(?:v\d+)?)\b', re.IGNORECASE)
ARXIV_OLD_PATTERN = re.compile(r'\b([a-z\-]+(?:\.[A-Z]{2})?/\d{7})\b', re.IGNORECASE)

HTTP_TIMEOUT = 6.0
CROSSREF_USER_AGENT = "ScholarsMate/1.0 (Academic Research Assistant; mailto:scholarsmate@internal.local)"


def clean_doi(raw_doi: str) -> str:
    """Strips url prefixes, 'doi:', and trailing punctuation from DOIs."""
    if not raw_doi:
        return ""
    cleaned = raw_doi.strip()
    cleaned = re.sub(r'^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)', '', cleaned, flags=re.IGNORECASE)
    # Remove trailing punctuation often captured from text
    cleaned = cleaned.rstrip('.,;()[]{}')
    return cleaned.strip()


def clean_arxiv_id(raw_arxiv: str) -> str:
    """Extracts and cleans raw arXiv identifier (e.g. 'arXiv:2305.18290v2' -> '2305.18290')."""
    if not raw_arxiv:
        return ""
    cleaned = raw_arxiv.strip()
    match = re.search(r'(\d{4}\.\d{4,5})(?:v\d+)?', cleaned, re.IGNORECASE)
    if match:
        return match.group(1)
    # Check older arXiv format (e.g. math.GT/0309136)
    match_old = re.search(r'([a-z\-]+(?:\.[A-Z]{2})?/\d{7})', cleaned, re.IGNORECASE)
    if match_old:
        return match_old.group(1)
    return cleaned


def detect_identifiers_in_text(text: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Scans a string of text for DOIs and arXiv IDs.
    Returns (doi, arxiv_id).
    """
    if not text:
        return None, None

    doi = None
    doi_match = DOI_PATTERN.search(text)
    if doi_match:
        doi = clean_doi(doi_match.group(0))

    arxiv_id = None
    arxiv_match = ARXIV_PATTERN.search(text)
    if arxiv_match:
        arxiv_id = clean_arxiv_id(arxiv_match.group(0))
    else:
        old_match = ARXIV_OLD_PATTERN.search(text)
        if old_match:
            arxiv_id = clean_arxiv_id(old_match.group(0))

    return doi, arxiv_id


def detect_identifiers_from_pdf(pdf_path: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Reads the first 2 pages of a PDF to extract embedded DOIs or arXiv identifiers.
    Also inspects the filename itself.
    """
    filename = Path(pdf_path).name
    # 1. Check filename first
    doi_fn, arxiv_fn = detect_identifiers_in_text(filename)

    if not Path(pdf_path).exists():
        return doi_fn, arxiv_fn

    try:
        doc = pymupdf.open(pdf_path)
        extracted_text = ""
        # Check first 2 pages (most publication info is on page 1 or 2)
        pages_to_check = min(2, len(doc))
        for i in range(pages_to_check):
            extracted_text += doc[i].get_text() + "\n"
        doc.close()

        doi_text, arxiv_text = detect_identifiers_in_text(extracted_text)
        return doi_text or doi_fn, arxiv_text or arxiv_fn
    except Exception as e:
        print(f"[IdentifierResolver] PDF scan error for {pdf_path}: {e}")
        return doi_fn, arxiv_fn


def _clean_abstract(raw_abstract: Optional[str]) -> Optional[str]:
    """Strips XML/HTML tags and normalizes whitespace in abstracts."""
    if not raw_abstract:
        return None
    # Strip JATS XML tags like <jats:p>, <jats:italic>
    clean = re.sub(r'<[^>]+>', '', raw_abstract)
    clean = html.unescape(clean)
    clean = " ".join(clean.split())
    return clean if len(clean) > 10 else None


async def fetch_crossref_metadata(doi: str) -> Optional[Dict[str, Any]]:
    """
    Queries CrossRef REST API for verified scholarly metadata.
    """
    cleaned_doi = clean_doi(doi)
    if not cleaned_doi:
        return None

    url = f"https://api.crossref.org/works/{cleaned_doi}"
    headers = {"User-Agent": CROSSREF_USER_AGENT}

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                return None

            data = resp.json().get("message", {})

            # Title
            title_list = data.get("title", [])
            title = html.unescape(title_list[0].strip()) if title_list else None

            # Authors: "Family, Given" formatted
            authors_data = data.get("author", [])
            authors_formatted = []
            for a in authors_data:
                family = a.get("family", "").strip()
                given = a.get("given", "").strip()
                if family and given:
                    authors_formatted.append(f"{given} {family}")
                elif family:
                    authors_formatted.append(family)
                elif a.get("name"):
                    authors_formatted.append(a.get("name").strip())
            authors = html.unescape("; ".join(authors_formatted)) if authors_formatted else None

            # Publication Year
            year = None
            date_parts = data.get("issued", {}).get("date-parts", [])
            if date_parts and date_parts[0] and date_parts[0][0]:
                year = str(date_parts[0][0])
            elif "published-print" in data:
                pp = data["published-print"].get("date-parts", [])
                if pp and pp[0] and pp[0][0]:
                    year = str(pp[0][0])

            # Venue / Container Title (Journal or Conference proceedings)
            venue = None
            containers = data.get("container-title", [])
            if containers and containers[0]:
                venue = html.unescape(containers[0].strip())
            elif data.get("event", {}).get("name"):
                venue = html.unescape(data["event"]["name"].strip())

            # Item Type Mapping
            raw_type = data.get("type", "")
            type_map = {
                "journal-article": "journal_article",
                "proceedings-article": "conference_paper",
                "book-chapter": "book_chapter",
                "posted-content": "preprint",
                "dissertation": "thesis",
                "report": "report",
            }
            item_type = type_map.get(raw_type, "journal_article")

            # Abstract & URL
            abstract = _clean_abstract(data.get("abstract"))
            doi_url = data.get("URL") or f"https://doi.org/{cleaned_doi}"

            # Subject / Category tags
            tags = []
            for subj in data.get("subject", [])[:4]:
                clean_subj = re.sub(r'[^A-Za-z0-9]', '', subj)
                if clean_subj:
                    tags.append(f"#{clean_subj}")

            return {
                "source": "crossref",
                "title": title,
                "authors": authors,
                "year": year,
                "venue": venue,
                "doi": cleaned_doi,
                "arxiv_id": None,
                "url": doi_url,
                "abstract": abstract,
                "item_type": item_type,
                "tags": tags,
            }

    except Exception as e:
        print(f"[IdentifierResolver] CrossRef query failed for {cleaned_doi}: {e}")
        return None


async def fetch_arxiv_metadata(arxiv_id: str) -> Optional[Dict[str, Any]]:
    """
    Queries official arXiv REST API (Atom XML) for preprint metadata.
    """
    cleaned_id = clean_arxiv_id(arxiv_id)
    if not cleaned_id:
        return None

    url = f"https://export.arxiv.org/api/query?id_list={cleaned_id}"
    headers = {"User-Agent": CROSSREF_USER_AGENT}
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                return None

            root = ET.fromstring(resp.text)
            ns = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}

            entry = root.find("atom:entry", ns)
            if entry is None:
                return None

            title_elem = entry.find("atom:title", ns)
            title = " ".join(title_elem.text.split()) if (title_elem is not None and title_elem.text) else None

            # Authors
            authors_list = []
            for author_node in entry.findall("atom:author", ns):
                name_node = author_node.find("atom:name", ns)
                if name_node is not None and name_node.text:
                    authors_list.append(name_node.text.strip())
            authors = "; ".join(authors_list) if authors_list else None

            # Published Year
            published_elem = entry.find("atom:published", ns)
            year = None
            if published_elem is not None and published_elem.text:
                year_match = re.search(r'\d{4}', published_elem.text)
                if year_match:
                    year = year_match.group(0)

            # Summary / Abstract
            summary_elem = entry.find("atom:summary", ns)
            abstract = " ".join(summary_elem.text.split()) if (summary_elem is not None and summary_elem.text) else None

            # Journal Ref or default arXiv venue
            journal_elem = entry.find("arxiv:journal_ref", ns)
            venue = journal_elem.text.strip() if (journal_elem is not None and journal_elem.text) else f"arXiv preprint arXiv:{cleaned_id}"

            # DOI if linked on arXiv
            doi_elem = entry.find("arxiv:doi", ns)
            doi = doi_elem.text.strip() if (doi_elem is not None and doi_elem.text) else None

            # Categories / Tags
            tags = ["#arXiv"]
            primary_cat = entry.find("arxiv:primary_category", ns)
            if primary_cat is not None and primary_cat.get("term"):
                tags.append(f"#{primary_cat.get('term')}")

            return {
                "source": "arxiv",
                "title": title,
                "authors": authors,
                "year": year,
                "venue": venue,
                "doi": doi,
                "arxiv_id": cleaned_id,
                "url": f"https://arxiv.org/abs/{cleaned_id}",
                "abstract": abstract,
                "item_type": "preprint",
                "tags": tags,
            }

    except Exception as e:
        print(f"[IdentifierResolver] arXiv query failed for {cleaned_id}: {e}")
        return None


async def resolve_identifier(identifier: str) -> Optional[Dict[str, Any]]:
    """
    Intelligently identifies whether input is a DOI or arXiv ID and resolves full metadata.
    """
    if not identifier:
        return None

    cleaned = identifier.strip()

    # Is it a DOI?
    if cleaned.startswith("10.") or "doi.org" in cleaned.lower():
        doi = clean_doi(cleaned)
        return await fetch_crossref_metadata(doi)

    # Is it an arXiv ID?
    if "arxiv" in cleaned.lower() or re.match(r'^\d{4}\.\d{4,5}', cleaned):
        arxiv_id = clean_arxiv_id(cleaned)
        return await fetch_arxiv_metadata(arxiv_id)

    # Try extracting both
    doi, arxiv_id = detect_identifiers_in_text(cleaned)
    if doi:
        meta = await fetch_crossref_metadata(doi)
        if meta:
            return meta
    if arxiv_id:
        return await fetch_arxiv_metadata(arxiv_id)

    return None


async def enrich_document_from_file(pdf_path: str, existing_doc: Optional[Any] = None) -> Optional[Dict[str, Any]]:
    """
    Inspects PDF file for DOI/arXiv identifiers and resolves official academic metadata.
    """
    doi, arxiv_id = detect_identifiers_from_pdf(pdf_path)
    
    # If existing document has DOI or arXiv ID explicitly saved, prioritize those
    if existing_doc:
        if getattr(existing_doc, "doi", None):
            doi = clean_doi(existing_doc.doi)
        if getattr(existing_doc, "arxiv_id", None):
            arxiv_id = clean_arxiv_id(existing_doc.arxiv_id)

    resolved = None
    if doi:
        resolved = await fetch_crossref_metadata(doi)
    if not resolved and arxiv_id:
        resolved = await fetch_arxiv_metadata(arxiv_id)

    return resolved
