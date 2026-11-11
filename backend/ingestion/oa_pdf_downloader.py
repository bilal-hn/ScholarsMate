"""
ScholarsMate — Open-Access Full-Text PDF Auto-Downloader (FR-17.4)
Automatically resolves and downloads open-access PDFs from arXiv, Unpaywall,
Semantic Scholar, and publisher repositories, attaching them directly to references.
"""

import re
import hashlib
import logging
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from backend.ingestion.identifier_resolver import clean_doi, clean_arxiv_id
from backend.ingestion.pipeline import process_path
from backend.embeddings.vector_store import store_chunks
from backend.db import crud

logger = logging.getLogger(__name__)

# Standard academic research user agent for arXiv and Unpaywall compliance
DOWNLOAD_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ScholarsMate/1.0 (Academic Research Assistant; mailto:scholarsmate@internal.local)"
UNPAYWALL_EMAIL = "scholarsmate@internal.local"
HTTP_TIMEOUT = 25.0


def sanitize_filename(base_name: str, max_length: int = 90) -> str:
    """
    Sanitizes string into a safe, clean filesystem filename without illegal characters.
    """
    if not base_name:
        return "paper"
    # Replace slashes, colons, quotes, etc. with underscores
    cleaned = re.sub(r'[\\/*?:"<>|#&%{}~`$!@+=;,\'()]', '_', base_name)
    cleaned = re.sub(r'[\s_]+', '_', cleaned).strip('._')
    return cleaned[:max_length] or "paper"


def generate_pdf_filename(
    title: Optional[str] = None,
    authors: Optional[str] = None,
    year: Optional[str] = None,
    arxiv_id: Optional[str] = None,
    doi: Optional[str] = None,
) -> str:
    """
    Generates a recognizable academic PDF filename like Zotero:
    e.g. 'Vaswani_et_al_2017_Attention_Is_All_You_Need.pdf' or '2305.18290.pdf'.
    """
    first_author = ""
    if authors:
        # Get first author surname
        first_entry = authors.split(";")[0].split(" and ")[0].strip()
        parts = first_entry.replace(",", " ").split()
        if parts:
            first_author = parts[0] if "," in first_entry else parts[-1]
        first_author = sanitize_filename(first_author, 20)

    clean_title = sanitize_filename(title or "", 45) if title else ""
    year_str = str(year).strip() if year else ""

    parts = []
    if first_author:
        parts.append(first_author)
    if year_str:
        parts.append(year_str)
    if clean_title:
        parts.append(clean_title)

    if parts:
        candidate = "_".join(parts) + ".pdf"
    elif arxiv_id:
        candidate = f"arxiv_{clean_arxiv_id(arxiv_id)}.pdf"
    elif doi:
        candidate = f"doi_{sanitize_filename(clean_doi(doi), 35)}.pdf"
    else:
        candidate = "academic_paper.pdf"

    return candidate


async def resolve_open_access_pdf_url(
    doi: Optional[str] = None,
    arxiv_id: Optional[str] = None,
    url: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Resolves the direct open-access PDF download URL for an article.
    Checks arXiv, Unpaywall, Semantic Scholar, and direct links in sequence.
    """
    # 1. Check arXiv first (always open-access full-text)
    cleaned_arxiv = clean_arxiv_id(arxiv_id or "")
    if not cleaned_arxiv and doi and "arxiv" in doi.lower():
        cleaned_arxiv = clean_arxiv_id(doi)

    if cleaned_arxiv:
        arxiv_pdf_url = f"https://arxiv.org/pdf/{cleaned_arxiv}.pdf"
        return {
            "source": "arxiv",
            "pdf_url": arxiv_pdf_url,
            "landing_page": f"https://arxiv.org/abs/{cleaned_arxiv}",
        }

    # 2. Check Unpaywall API for DOIs
    cleaned_doi = clean_doi(doi or "")
    if cleaned_doi:
        try:
            unpaywall_url = f"https://api.unpaywall.org/v2/{cleaned_doi}?email={UNPAYWALL_EMAIL}"
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                resp = await client.get(unpaywall_url)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("is_oa"):
                        best_loc = data.get("best_oa_location") or {}
                        pdf_candidate = best_loc.get("url_for_pdf")
                        landing_page = best_loc.get("url") or f"https://doi.org/{cleaned_doi}"

                        # If best location doesn't have direct pdf, scan other oa_locations
                        if not pdf_candidate:
                            for loc in data.get("oa_locations", []):
                                if loc.get("url_for_pdf"):
                                    pdf_candidate = loc["url_for_pdf"]
                                    landing_page = loc.get("url") or landing_page
                                    break

                        # If still no pdf_candidate, check if landing url ends in .pdf
                        if not pdf_candidate and landing_page and landing_page.lower().endswith(".pdf"):
                            pdf_candidate = landing_page

                        if pdf_candidate:
                            return {
                                "source": "unpaywall",
                                "pdf_url": pdf_candidate,
                                "landing_page": landing_page,
                                "version": best_loc.get("version"),
                                "license": best_loc.get("license"),
                            }
        except Exception as e:
            logger.warning(f"[OA Downloader] Unpaywall query failed for DOI {cleaned_doi}: {e}")

    # 3. Check Semantic Scholar OpenAccess API as fallback
    query_id = None
    if cleaned_doi:
        query_id = f"DOI:{cleaned_doi}"
    elif cleaned_arxiv:
        query_id = f"ARXIV:{cleaned_arxiv}"

    if query_id:
        try:
            s2_url = f"https://api.semanticscholar.org/graph/v1/paper/{query_id}?fields=openAccessPdf"
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                s2_resp = await client.get(s2_url)
                if s2_resp.status_code == 200:
                    s2_data = s2_resp.json()
                    oa_info = s2_data.get("openAccessPdf")
                    if oa_info and oa_info.get("url"):
                        return {
                            "source": "semanticscholar",
                            "pdf_url": oa_info["url"],
                            "landing_page": None,
                        }
        except Exception as e:
            logger.warning(f"[OA Downloader] Semantic Scholar fallback failed for {query_id}: {e}")

    # 4. Check if direct URL is a PDF link
    if url and (url.lower().endswith(".pdf") or "/pdf/" in url.lower()):
        return {
            "source": "direct",
            "pdf_url": url,
            "landing_page": url,
        }

    return None


async def download_and_verify_pdf(
    pdf_url: str,
    output_path: Path,
    max_size_bytes: int = 150 * 1024 * 1024,
) -> Tuple[bool, Optional[str]]:
    """
    Streams and downloads PDF from url, validating '%PDF' magic header.
    Returns (success: bool, error_message: Optional[str]).
    """
    headers = {
        "User-Agent": DOWNLOAD_USER_AGENT,
        "Accept": "application/pdf,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(pdf_url, headers=headers)
            if resp.status_code != 200:
                return False, f"Remote server returned HTTP status {resp.status_code}."

            content = resp.content
            if len(content) < 500:
                return False, "Downloaded file is too small to be a valid document."

            # Verify PDF magic bytes
            if not content.startswith(b"%PDF"):
                # Check within first 1024 bytes in case of leading whitespace or comment
                if b"%PDF" not in content[:1024]:
                    return False, "Downloaded response is not a valid PDF document (magic bytes missing)."

            if len(content) > max_size_bytes:
                return False, f"PDF file size exceeds maximum permitted limit ({len(content)} bytes)."

            # Ensure parent directories exist
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(content)
            return True, None

    except httpx.TimeoutException:
        return False, "Download timed out while retrieving PDF from repository."
    except Exception as e:
        logger.error(f"[OA Downloader] Failed to download PDF from {pdf_url}: {e}")
        return False, str(e)


def get_unique_pdf_path(uploads_dir: Path, desired_filename: str) -> Path:
    """
    Ensures filename is unique in uploads directory to prevent overwriting existing papers.
    """
    target = uploads_dir / desired_filename
    if not target.exists():
        return target

    stem = target.stem
    ext = target.suffix or ".pdf"
    counter = 1
    while target.exists():
        target = uploads_dir / f"{stem}_{counter}{ext}"
        counter += 1
    return target


async def auto_download_and_attach_oa_pdf(
    db: AsyncSession,
    doc_id: str,
    user_id: str,
    uploads_dir: Path,
) -> Dict[str, Any]:
    """
    Main orchestrator: looks up OA PDF for library document, downloads, stores,
    indexes into vector store, and updates the UserDocument database record.
    """
    doc = await crud.get_library_document(db, doc_id=doc_id, user_id=user_id)
    if not doc:
        return {"success": False, "message": "Document not found in library."}

    # If document already has a valid physical PDF file attached
    existing_file = uploads_dir / doc.doc_name if doc.doc_name else None
    if existing_file and existing_file.exists() and doc.doc_name.lower().endswith(".pdf") and (doc.file_size_bytes or 0) > 0:
        return {
            "success": True,
            "message": "Full-text PDF is already attached and indexed.",
            "doc_name": doc.doc_name,
            "already_attached": True,
        }

    # Step 1: Resolve OA PDF URL
    oa_result = await resolve_open_access_pdf_url(
        doi=doc.doi,
        arxiv_id=doc.arxiv_id,
        url=doc.url,
    )
    if not oa_result or not oa_result.get("pdf_url"):
        return {
            "success": False,
            "message": "No open-access full-text PDF could be found (item may be paywalled or unavailable).",
        }

    pdf_url = oa_result["pdf_url"]
    source = oa_result.get("source", "open-access")

    # Step 2: Determine unique destination path
    clean_name = generate_pdf_filename(
        title=doc.title,
        authors=doc.authors,
        year=doc.year,
        arxiv_id=doc.arxiv_id,
        doi=doc.doi,
    )
    target_path = get_unique_pdf_path(uploads_dir, clean_name)

    # Step 3: Download & verify PDF
    success, err_msg = await download_and_verify_pdf(pdf_url, target_path)
    if not success or not target_path.exists():
        return {
            "success": False,
            "message": f"Failed to download PDF from {source}: {err_msg or 'Unknown error'}",
        }

    # Step 4: Index chunks for RAG vector search
    try:
        chunks = process_path(str(target_path))
        if chunks:
            store_chunks(chunks)
    except Exception as e:
        logger.warning(f"[OA Downloader] Warning: RAG indexing encountered issue: {e}")

    # Step 5: Update database record
    file_size = target_path.stat().st_size
    file_hash = hashlib.sha256(target_path.read_bytes()).hexdigest()

    updated_doc = await crud.update_library_doc_attachment(
        db=db,
        doc_id=doc.id,
        user_id=user_id,
        new_doc_name=target_path.name,
        new_file_hash=file_hash,
        new_file_size=file_size,
    )

    return {
        "success": True,
        "message": f"Successfully downloaded and attached full-text PDF from {source.upper()}.",
        "doc_name": target_path.name,
        "source": source,
        "file_size_bytes": file_size,
        "document": updated_doc,
    }
