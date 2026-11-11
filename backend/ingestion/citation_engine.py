import re
from typing import Dict, Any, List, Optional


def _clean_str(val: Optional[str]) -> str:
    return (val or "").strip()


def generate_citekey(authors: Optional[str], year: Optional[str], title: Optional[str]) -> str:
    """Generates standard BibTeX citation key e.g. 'vaswani2017attention'."""
    first_author = "unknown"
    if authors:
        # Split on commas or 'and'
        parts = re.split(r"[,;]|\band\b", authors, flags=re.IGNORECASE)
        if parts and parts[0].strip():
            raw_author = parts[0].strip().split()[-1]  # Get surname
            first_author = re.sub(r"[^a-zA-Z]", "", raw_author).lower()

    yr = re.sub(r"[^0-9]", "", year or "")
    if len(yr) > 4:
        yr = yr[:4]
    if not yr:
        yr = "nd"  # no date

    first_word = "doc"
    if title:
        words = [w for w in re.split(r"\s+", title) if w.lower() not in {"a", "an", "the", "on", "in", "of", "for"}]
        if words:
            first_word = re.sub(r"[^a-zA-Z0-9]", "", words[0]).lower()

    return f"{first_author}{yr}{first_word}"


def _format_authors_apa(authors: Optional[str]) -> str:
    if not authors:
        return "Unknown Author"
    parts = [p.strip() for p in re.split(r"[,;]|\band\b", authors, flags=re.IGNORECASE) if p.strip()]
    if not parts:
        return authors
    if len(parts) == 1:
        return parts[0]
    if len(parts) == 2:
        return f"{parts[0]} & {parts[1]}"
    return f"{parts[0]} et al."


def _format_authors_ieee(authors: Optional[str]) -> str:
    if not authors:
        return "Unknown"
    parts = [p.strip() for p in re.split(r"[,;]|\band\b", authors, flags=re.IGNORECASE) if p.strip()]
    if not parts:
        return authors
    if len(parts) == 1:
        return parts[0]
    if len(parts) <= 3:
        return ", ".join(parts[:-1]) + ", and " + parts[-1]
    return f"{parts[0]} et al."


def format_apa(item: Dict[str, Any]) -> str:
    """Formats document into APA 7th edition citation string."""
    authors = _format_authors_apa(item.get("authors"))
    year = item.get("year") or "n.d."
    title = item.get("title") or item.get("doc_name") or "Untitled Document"
    venue = item.get("venue")
    doi = item.get("doi")

    citation = f"{authors} ({year}). {title}."
    if venue:
        citation += f" {venue}."
    if doi:
        citation += f" https://doi.org/{doi}"
    return citation


def format_ieee(item: Dict[str, Any]) -> str:
    """Formats document into IEEE style citation string."""
    authors = _format_authors_ieee(item.get("authors"))
    title = item.get("title") or item.get("doc_name") or "Untitled Document"
    year = item.get("year") or "n.d."
    venue = item.get("venue")
    doi = item.get("doi")

    citation = f'{authors}, "{title},"'
    if venue:
        citation += f" in {venue},"
    citation += f" {year}."
    if doi:
        citation += f" doi: {doi}."
    return citation


def format_harvard(item: Dict[str, Any]) -> str:
    """Formats document into Harvard citation style."""
    authors = _format_authors_apa(item.get("authors"))
    year = item.get("year") or "n.d."
    title = item.get("title") or item.get("doc_name") or "Untitled Document"
    venue = item.get("venue")

    citation = f"{authors} ({year}) '{title}'"
    if venue:
        citation += f", {venue}"
    return citation + "."


def format_mla(item: Dict[str, Any]) -> str:
    """Formats document into MLA 9th edition citation style."""
    authors = item.get("authors") or "Unknown Author"
    title = item.get("title") or item.get("doc_name") or "Untitled Document"
    venue = item.get("venue")
    year = item.get("year") or "n.d."

    citation = f'{authors}. "{title}."'
    if venue:
        citation += f" {venue},"
    citation += f" {year}."
    return citation


def format_bibtex(item: Dict[str, Any]) -> str:
    """Generates standard BibTeX entry string."""
    citekey = generate_citekey(item.get("authors"), item.get("year"), item.get("title"))
    item_type = item.get("item_type") or "article"
    
    # Map item_type to standard BibTeX entry types
    type_map = {
        "journal_article": "article",
        "conference_paper": "inproceedings",
        "preprint": "misc",
        "book": "book",
        "book_chapter": "incollection",
        "thesis": "phdthesis",
    }
    bib_type = type_map.get(item_type, "article")

    lines = [f"@{bib_type}{{{citekey},"]
    if item.get("title"):
        lines.append(f'  title = {{{item["title"]}}},')
    if item.get("authors"):
        lines.append(f'  author = {{{item["authors"]}}},')
    if item.get("year"):
        lines.append(f'  year = {{{item["year"]}}},')
    if item.get("venue"):
        field = "booktitle" if bib_type == "inproceedings" else "journal"
        lines.append(f'  {field} = {{{item["venue"]}}},')
    if item.get("doi"):
        lines.append(f'  doi = {{{item["doi"]}}},')
    if item.get("arxiv_id"):
        lines.append(f'  eprint = {{{item["arxiv_id"]}}},')
        lines.append('  archivePrefix = {arXiv},')
    if item.get("url"):
        lines.append(f'  url = {{{item["url"]}}},')

    lines.append("}")
    return "\n".join(lines)


def format_citations_all(item: Dict[str, Any]) -> Dict[str, str]:
    """Returns a dictionary containing all standard citation styles and BibTeX."""
    return {
        "citekey": generate_citekey(item.get("authors"), item.get("year"), item.get("title")),
        "apa": format_apa(item),
        "ieee": format_ieee(item),
        "harvard": format_harvard(item),
        "mla": format_mla(item),
        "bibtex": format_bibtex(item),
    }


def export_bibtex_file(items: List[Dict[str, Any]]) -> str:
    """Concatenates BibTeX entries into a single ready-to-download file string."""
    header = "% ScholarsMate Academic Reference Export (BibTeX)\n% Generated for LaTeX / Overleaf\n\n"
    entries = [format_bibtex(item) for item in items]
    return header + "\n\n".join(entries) + "\n"
