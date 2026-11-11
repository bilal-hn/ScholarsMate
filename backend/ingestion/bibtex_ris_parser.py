"""
Bibliographic Parser for BibTeX (.bib) and RIS (.ris) Files (FR-17.1).
Supports robust bulk import of research citations from Google Scholar, Zotero,
DBLP, Mendeley, CrossRef, and IEEE Xplore without external binary dependencies.
"""

import re
from typing import List, Dict, Any, Optional
import html


# LaTeX accent replacements to clean unicode text
ACCENT_MAP = {
    r'\"a': 'ä', r'\"A': 'Ä', r'\"e': 'ë', r'\"E': 'Ë', r'\"i': 'ï', r'\"I': 'Ï',
    r'\"o': 'ö', r'\"O': 'Ö', r'\"u': 'ü', r'\"U': 'Ü',
    r"\'a": 'á', r"\'A": 'Á', r"\'e": 'é', r"\'E": 'É', r"\'i": 'í', r"\'I": 'Í',
    r"\'o": 'ó', r"\'O": 'Ó', r"\'u": 'ú', r"\'U": 'Ú',
    r"\`a": 'à', r"\`A": 'À', r"\`e": 'è', r"\`E": 'È', r"\`i": 'ì', r"\`I": 'Ì',
    r"\`o": 'ò', r"\`O": 'Ò', r"\`u": 'ù', r"\`U": 'Ù',
    r"\^a": 'â', r"\^A": 'Â', r"\^e": 'ê', r"\^E": 'Ê', r"\^i": 'î', r"\^I": 'Î',
    r"\^o": 'ô', r"\^O": 'Ô', r"\^u": 'û', r"\^U": 'Û',
    r"\~n": 'ñ', r"\~N": 'Ñ', r"\~a": 'ã', r"\~A": 'Ã', r"\~o": 'õ', r"\~O": 'Õ',
    r"\c{c}": 'ç', r"\c{C}": 'Ç', r"\aa": 'å', r"\AA": 'Å',
    r"\ae": 'æ', r"\AE": 'Æ', r"\oe": 'œ', r"\OE": 'Œ',
    r"\ss": 'ß',
}

LATEX_ACCENTS = [
    (re.compile(r'\{([^{}]+)\}'), r'\1'),
    (re.compile(r'\\&'), '&'),
    (re.compile(r'\\%'), '%'),
    (re.compile(r'\\_'), '_'),
    (re.compile(r'\\#'), '#'),
    (re.compile(r'---'), '—'),
    (re.compile(r'--'), '–'),
]

BIBTEX_TYPE_MAP = {
    'article': 'journal_article',
    'inproceedings': 'conference_paper',
    'conference': 'conference_paper',
    'proceedings': 'conference_paper',
    'book': 'book_chapter',
    'incollection': 'book_chapter',
    'inbook': 'book_chapter',
    'phdthesis': 'thesis',
    'mastersthesis': 'thesis',
    'thesis': 'thesis',
    'techreport': 'report',
    'manual': 'report',
    'misc': 'preprint',
    'unpublished': 'preprint',
    'preprint': 'preprint',
}

RIS_TYPE_MAP = {
    'JOUR': 'journal_article',
    'MGZN': 'journal_article',
    'NEWS': 'journal_article',
    'CONF': 'conference_paper',
    'CPAPER': 'conference_paper',
    'BOOK': 'book_chapter',
    'CHAP': 'book_chapter',
    'THES': 'thesis',
    'RPRT': 'report',
    'GEN': 'preprint',
    'PREP': 'preprint',
}


def clean_latex_string(text: str) -> str:
    """Removes LaTeX braces and transforms accents into clean unicode text."""
    if not text:
        return ''
    cleaned = text.strip()

    # 1. Replace explicit accent commands e.g. {\"o} or \"{o} or \"o
    for tex_acc, uni_char in ACCENT_MAP.items():
        cmd = tex_acc[1:]  # e.g. "o
        symbol = cmd[0]    # e.g. "
        char = cmd[1:]     # e.g. o
        pattern = re.compile(rf'\\{re.escape(symbol)}\{{?{re.escape(char)}\}}?', re.IGNORECASE)
        cleaned = pattern.sub(uni_char, cleaned)

    # 2. General LaTeX cleanups
    for pattern, repl in LATEX_ACCENTS:
        cleaned = pattern.sub(repl, cleaned)

    # Remove any lingering lone curly braces
    cleaned = re.sub(r'[{}]', '', cleaned)
    # Normalize whitespaces
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return html.unescape(cleaned)


def extract_year(text: Optional[str]) -> Optional[str]:
    """Finds a valid 4-digit academic year (1800-2099) in string."""
    if not text:
        return None
    match = re.search(r'\b(18|19|20)\d{2}\b', str(text))
    return match.group(0) if match else None


def clean_doi_str(doi: Optional[str]) -> Optional[str]:
    """Extracts raw DOI from string or URL."""
    if not doi:
        return None
    match = re.search(r'10\.\d{4,9}/[-._;()/:A-Za-z0-9]+', doi)
    if match:
        clean = match.group(0).rstrip('.,;()')
        return clean
    return None


def clean_arxiv_str(arxiv: Optional[str]) -> Optional[str]:
    """Extracts clean arXiv identifier."""
    if not arxiv:
        return None
    match = re.search(r'(?:arxiv:\s*)?(\d{4}\.\d{4,5}(?:v\d+)?)', arxiv, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


# ==============================================================================
# BIBTEX PARSER
# ==============================================================================

def parse_bibtex_text(content: str) -> List[Dict[str, Any]]:
    """
    Parses a BibTeX string containing one or multiple @entry{...} items.
    Robust against newlines within fields and nested braces.
    """
    entries: List[Dict[str, Any]] = []
    if not content:
        return entries

    # Normalize newlines
    normalized = content.replace('\r\n', '\n').replace('\r', '\n')

    # Regex to find entry beginnings: @entry_type{citekey,
    entry_start_regex = re.compile(r'@([a-zA-Z]+)\s*\{\s*([^,]+)\s*,', re.MULTILINE)

    matches = list(entry_start_regex.finditer(normalized))
    for i, match in enumerate(matches):
        entry_type_raw = match.group(1).lower().strip()
        citekey = match.group(2).strip()

        start_pos = match.end()
        end_pos = matches[i + 1].start() if i + 1 < len(matches) else len(normalized)
        body = normalized[start_pos:end_pos]

        # Scan characters balancing braces to find the end of this entry
        brace_depth = 1
        entry_body_chars = []
        for char in body:
            if char == '{':
                brace_depth += 1
            elif char == '}':
                brace_depth -= 1
                if brace_depth == 0:
                    break
            entry_body_chars.append(char)

        entry_body = "".join(entry_body_chars)

        fields = _parse_bibtex_fields(entry_body)
        parsed_item = _normalize_bibtex_entry(entry_type_raw, citekey, fields)
        if parsed_item:
            entries.append(parsed_item)

    return entries


def _parse_bibtex_fields(body: str) -> Dict[str, str]:
    """Extracts field=value pairs from a BibTeX entry body."""
    fields: Dict[str, str] = {}
    
    # State-machine / Regex to find key = value pairs
    field_regex = re.compile(
        r'([a-zA-Z_-]+)\s*=\s*(?:\{((?:[^{}]|\{[^{}]*\})*)\}|"([^"]*)"|([0-9a-zA-Z_:-]+))',
        re.DOTALL
    )

    for m in field_regex.finditer(body):
        k = m.group(1).lower().strip()
        v = m.group(2) if m.group(2) is not None else (m.group(3) if m.group(3) is not None else m.group(4))
        if v:
            fields[k] = clean_latex_string(v)

    return fields


def _normalize_bibtex_entry(entry_type: str, citekey: str, fields: Dict[str, str]) -> Optional[Dict[str, Any]]:
    """Transforms raw BibTeX fields into standardized ScholarsMate bibliographic item."""
    title = fields.get('title')
    if not title:
        # Check if there is a booktitle or journal as fallback
        title = fields.get('booktitle') or citekey

    # Authors
    raw_authors = fields.get('author') or fields.get('authors')
    authors = None
    if raw_authors:
        # Standardize "and" vs commas
        author_list = [a.strip() for a in re.split(r'\s+and\s+', raw_authors, flags=re.IGNORECASE) if a.strip()]
        authors = "; ".join(author_list) if len(author_list) > 1 else raw_authors

    # Year
    year = extract_year(fields.get('year') or fields.get('date'))

    # Venue / Journal
    venue = fields.get('journal') or fields.get('booktitle') or fields.get('school') or fields.get('institution') or fields.get('publisher')

    # Identifiers
    doi = clean_doi_str(fields.get('doi'))
    arxiv_id = clean_arxiv_str(fields.get('eprint') or fields.get('arxivid') or fields.get('arxiv_id'))
    url = fields.get('url')
    if not url and doi:
        url = f"https://doi.org/{doi}"
    elif not url and arxiv_id:
        url = f"https://arxiv.org/abs/{arxiv_id}"

    # Abstract
    abstract = fields.get('abstract')

    # Tags / Keywords
    raw_keywords = fields.get('keywords') or fields.get('keyword') or ''
    tags = []
    if raw_keywords:
        for kw in re.split(r'[,;]\s*', raw_keywords):
            cleaned_kw = kw.strip()
            if cleaned_kw:
                tags.append(cleaned_kw if cleaned_kw.startswith('#') else f"#{cleaned_kw}")
    if arxiv_id and '#arXiv' not in tags:
        tags.append('#arXiv')

    item_type = BIBTEX_TYPE_MAP.get(entry_type, 'journal_article')

    return {
        "citekey": citekey,
        "item_type": item_type,
        "title": title,
        "authors": authors,
        "year": year,
        "venue": venue,
        "doi": doi,
        "arxiv_id": arxiv_id,
        "url": url,
        "abstract": abstract,
        "tags": tags,
    }


# ==============================================================================
# RIS PARSER
# ==============================================================================

def parse_ris_text(content: str) -> List[Dict[str, Any]]:
    """
    Parses a standard RIS string (Google Scholar, ScienceDirect, Zotero export).
    Recognizes multi-record streams ending with ER  - .
    """
    entries: List[Dict[str, Any]] = []
    if not content:
        return entries

    normalized = content.replace('\r\n', '\n').replace('\r', '\n')
    lines = normalized.split('\n')

    current_record: Dict[str, List[str]] = {}
    tag_regex = re.compile(r'^([A-Z0-9]{2})\s{2}-\s*(.*)$')
    last_tag = None

    for line in lines:
        match = tag_regex.match(line)
        if match:
            tag = match.group(1).upper()
            val = match.group(2).strip()
            last_tag = tag

            if tag == 'ER':
                # End of record
                parsed = _normalize_ris_record(current_record)
                if parsed:
                    entries.append(parsed)
                current_record = {}
                last_tag = None
            else:
                current_record.setdefault(tag, []).append(val)
        elif last_tag and line.startswith('   '):
            # Continuation line
            continuation = line.strip()
            if current_record.get(last_tag):
                current_record[last_tag][-1] += " " + continuation

    # If stream ended without trailing ER tag
    if current_record:
        parsed = _normalize_ris_record(current_record)
        if parsed:
            entries.append(parsed)

    return entries


def _normalize_ris_record(record: Dict[str, List[str]]) -> Optional[Dict[str, Any]]:
    """Converts a raw RIS key-value dictionary into ScholarsMate format."""
    ty = record.get('TY', ['JOUR'])[0].upper()
    item_type = RIS_TYPE_MAP.get(ty, 'journal_article')

    # Title: TI or T1
    titles = record.get('TI') or record.get('T1') or record.get('CT')
    title = titles[0].strip() if titles else 'Untitled RIS Entry'

    # Authors: AU or A1
    authors_list = record.get('AU') or record.get('A1') or []
    authors = "; ".join(a.strip() for a in authors_list if a.strip()) if authors_list else None

    # Year: PY or Y1
    years = record.get('PY') or record.get('Y1') or []
    year = extract_year(years[0]) if years else None

    # Venue: JO, JF, T2
    venues = record.get('JO') or record.get('JF') or record.get('T2') or record.get('JA')
    venue = venues[0].strip() if venues else None

    # DOI: DO
    dois = record.get('DO') or []
    doi = clean_doi_str(dois[0]) if dois else None

    # URL: UR
    urls = record.get('UR') or []
    url = urls[0].strip() if urls else (f"https://doi.org/{doi}" if doi else None)

    # Abstract: AB or N2
    abstracts = record.get('AB') or record.get('N2')
    abstract = " ".join(abstracts).strip() if abstracts else None

    # Keywords: KW
    keywords = record.get('KW') or []
    tags = []
    for kw in keywords:
        cleaned_kw = kw.strip()
        if cleaned_kw:
            tags.append(cleaned_kw if cleaned_kw.startswith('#') else f"#{cleaned_kw}")

    # Generate citekey
    first_author_last = authors_list[0].split(',')[0].strip().lower() if authors_list else 'item'
    first_author_last = re.sub(r'[^a-zA-Z0-9]', '', first_author_last)
    clean_year = year or '2024'
    title_word = re.sub(r'[^a-zA-Z0-9]', '', (title.split()[0] if title.split() else 'ref')).lower()
    citekey = f"{first_author_last}{clean_year}{title_word}"

    return {
        "citekey": citekey,
        "item_type": item_type,
        "title": title,
        "authors": authors,
        "year": year,
        "venue": venue,
        "doi": doi,
        "arxiv_id": None,
        "url": url,
        "abstract": abstract,
        "tags": tags,
    }


# ==============================================================================
# UNIFIED ENTRYPOINT
# ==============================================================================

def parse_bibliographic_content(content: str, filename: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Intelligently inspects content and file extension to route to BibTeX or RIS parser.
    """
    if not content or not content.strip():
        return []

    fname = (filename or '').lower()
    if fname.endswith('.bib') or fname.endswith('.bibtex'):
        return parse_bibtex_text(content)
    if fname.endswith('.ris'):
        return parse_ris_text(content)

    # Heuristic detection based on content
    trimmed = content.lstrip()
    if trimmed.startswith('TY  -') or '\nTY  -' in trimmed:
        return parse_ris_text(content)
    if '@' in trimmed and ('{' in trimmed or '(' in trimmed):
        return parse_bibtex_text(content)

    # Default try BibTeX first, fallback to RIS
    bib_entries = parse_bibtex_text(content)
    if bib_entries:
        return bib_entries
    return parse_ris_text(content)
