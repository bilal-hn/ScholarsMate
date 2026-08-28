import os
import re
import unicodedata
from pathlib import Path
from typing import Optional, Dict, Any
import fitz  # PyMuPDF

# In-memory LRU-like cache for bibliographic metadata per file path
_METADATA_CACHE: Dict[str, Dict[str, Any]] = {}


def clean_text(text: str) -> str:
    """Normalizes Unicode ligatures (e.g. \ufb01 -> fi), strips whitespace and control characters."""
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text)
    cleaned = "".join(c for c in normalized if unicodedata.category(c) != "Cc" or c in "\n\t")
    return " ".join(cleaned.split())


def clean_title_from_filename(filename: str) -> str:
    """Fallback: converts filename like 'lecture_04_transformers.pdf' to 'Lecture 04 Transformers'."""
    name_without_ext = re.sub(r"\.[^.]+$", "", filename)
    name_spaced = re.sub(r"[-_]+", " ", name_without_ext)
    return " ".join(word.capitalize() for word in name_spaced.split())


def extract_year_from_text(text: str) -> Optional[str]:
    """Finds a plausible 4-digit publication year (1970 - 2030)."""
    matches = re.findall(r"\b(19[7-9]\d|20[0-3]\d)\b", text)
    if matches:
        return matches[0]
    return None


def extract_bibliographic_metadata(pdf_path: str) -> Dict[str, Any]:
    """
    Extracts bibliographic metadata (Title, Authors, Year, Formatted Citation) from a PDF
    using a 3-Tier graceful degradation strategy:
    
    Tier 1: True Academic Paper (Extracted Authors, Title, Year)
    Tier 2: General Document / Report (Title / Heading, Year, Filename)
    Tier 3: Raw File Fallback (Cleaned Filename)
    """
    path_str = str(Path(pdf_path).resolve())
    if path_str in _METADATA_CACHE:
        return _METADATA_CACHE[path_str]

    filename = os.path.basename(pdf_path)
    fallback_title = clean_title_from_filename(filename)

    if not os.path.exists(pdf_path):
        result = {
            "doc_name": filename,
            "title": fallback_title,
            "authors": None,
            "year": None,
            "formatted_citation": f'Document: "{fallback_title}" ({filename})',
            "tier": 3
        }
        _METADATA_CACHE[path_str] = result
        return result

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        print(f"[BibliographicExtractor] Failed to open PDF {pdf_path}: {e}")
        result = {
            "doc_name": filename,
            "title": fallback_title,
            "authors": None,
            "year": None,
            "formatted_citation": f'Document: "{fallback_title}" ({filename})',
            "tier": 3
        }
        _METADATA_CACHE[path_str] = result
        return result

    meta = doc.metadata or {}
    
    # 1. Extract Year
    year = None
    c_date = meta.get("creationDate", "") or meta.get("modDate", "")
    m_year = re.search(r"(?:19|20)\d{2}", c_date)
    if m_year:
        year = m_year.group(0)

    # 2. Extract Title from PDF Metadata
    raw_title = clean_text(meta.get("title", ""))
    title = None
    if (
        raw_title
        and len(raw_title) > 3
        and not raw_title.lower().endswith(".pdf")
        and "untitled" not in raw_title.lower()
        and not raw_title.startswith(("Microsoft", "LaTeX", "TeX", "Adobe", "Word"))
    ):
        title = raw_title

    # 3. Extract Author from PDF Metadata
    raw_author = clean_text(meta.get("author", ""))
    authors = None
    if (
        raw_author
        and len(raw_author) > 2
        and "tex" not in raw_author.lower()
        and "latex" not in raw_author.lower()
        and not raw_author.startswith(("Microsoft", "Adobe", "User", "Admin"))
    ):
        authors = raw_author

    # 4. Layout-Aware Page 1 Inspection (Font Size & Visual Hierarchy)
    if len(doc) > 0:
        try:
            page_dict = doc[0].get_text("dict")
            spans = []
            for b in page_dict.get("blocks", []):
                if b.get("type") == 0:
                    for l in b.get("lines", []):
                        for s in l.get("spans", []):
                            t = clean_text(s.get("text", ""))
                            if t and len(t) > 1:
                                spans.append((s.get("size", 0), t, s.get("flags", 0)))

            if spans:
                max_size = max(s[0] for s in spans)
                if not title and max_size > 11:
                    title_spans = [
                        s[1] for s in spans 
                        if s[0] >= max_size - 1.5 
                        and not s[1].lower().startswith(("arxiv", "proceedings", "volume", "issue", "journal of", "http"))
                    ]
                    candidate = " ".join(title_spans).strip()
                    if len(candidate) > 4:
                        title = candidate

                if not authors:
                    for s in spans:
                        txt = s[1]
                        if (
                            re.search(r"^[A-Z][a-z]+(\s+[A-Z][a-z]+)+", txt)
                            and len(txt.split()) <= 6
                            and not any(
                                bad in txt.lower() 
                                for bad in [
                                    "abstract", "introduction", "university", "department", 
                                    "institute", "springer", "elsevier", "proceedings", 
                                    "figure", "table", "available", "copyright", "received", 
                                    "accepted", "published", "school", "college", "faculty"
                                ]
                            )
                        ):
                            authors = txt
                            break

                if not year:
                    full_p1 = " ".join(s[1] for s in spans)
                    year = extract_year_from_text(full_p1)

        except Exception as e:
            print(f"[BibliographicExtractor] Page 1 inspection error: {e}")

    doc.close()

    if not title:
        title = fallback_title

    tier = 3
    if authors and year:
        tier = 1
        formatted_citation = f'{authors} ({year}). "{title}"'
    elif year:
        tier = 2
        formatted_citation = f'"{title}" ({year})'
    elif title != fallback_title:
        tier = 2
        formatted_citation = f'"{title}" ({filename})'
    else:
        tier = 3
        formatted_citation = f'Document: {filename}'

    result = {
        "doc_name": filename,
        "title": title,
        "authors": authors,
        "year": year,
        "formatted_citation": formatted_citation,
        "tier": tier
    }

    _METADATA_CACHE[path_str] = result
    return result
