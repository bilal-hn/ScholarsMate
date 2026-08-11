import os
import json
from google import genai
from google.genai import types
from backend.embeddings.vector_store import get_or_create_collection

gemini_api_key = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=gemini_api_key) if gemini_api_key else None

# Standard production model identifier for Google AI Studio
GEMINI_MODEL = "gemini-flash-latest"


def _extract_paper_summary_gemini(doc_name: str, snippets: list[str]) -> dict:
    """Map Step: Uses Gemini 1.5 Flash to extract structured JSON metrics per paper."""
    corpus = "\n".join(snippets)
    
    prompt = f"""
You are a rigorous computer science researcher analyzing a single research paper.
Extract precise technical details from the text below for document: "{doc_name}".

TEXT CONTENT:
{corpus}

Return ONLY a valid JSON object with the following fields:
- doc_name: string
- core_methodology: string (Exact model architecture, algorithm, or framework proposed)
- dataset_or_benchmarks: string (Specific datasets, metrics, or evaluation environments)
- key_strengths: string (1-2 concrete, specific technical achievements)
- limitations: string (1-2 concrete technical trade-offs or overhead costs)
"""

    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,
                response_mime_type="application/json"
            )
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"[Gemini Extraction Error] {doc_name}: {str(e)}")
        return {
            "doc_name": doc_name,
            "core_methodology": "Extraction failed.",
            "dataset_or_benchmarks": "Not specified.",
            "key_strengths": "Analyzed without structured schema.",
            "limitations": "Detailed metrics unavailable."
        }


def generate_literature_review(doc_names: list[str] = None) -> dict:
    """Reduce Step: Synthesizes structured extractions into a publication-grade Literature Review."""
    if not gemini_client:
        return {"error": "GEMINI_API_KEY environment variable is missing or invalid in .env."}

    try:
        collection = get_or_create_collection()
        get_kwargs = {"include": ["documents", "metadatas"], "limit": 1000}
        
        if doc_names and isinstance(doc_names, list) and len(doc_names) > 0:
            clean_docs = [os.path.basename(d) for d in doc_names]
            if len(clean_docs) == 1:
                get_kwargs["where"] = {"source": clean_docs[0]}
            else:
                get_kwargs["where"] = {"source": {"$in": clean_docs}}

        raw_data = collection.get(**get_kwargs)
        documents = raw_data.get("documents", [])
        metadatas = raw_data.get("metadatas", [])

        if not documents:
            return {"error": "No indexed chunks found in ChromaDB for the selected documents."}

        # Group text chunks by source document
        doc_snippets = {}
        for text, meta in zip(documents, metadatas):
            if not meta or "source" not in meta:
                continue
            source = meta["source"]
            if source not in doc_snippets:
                doc_snippets[source] = []
            if len(doc_snippets[source]) < 8:
                doc_snippets[source].append(f"(p. {meta.get('page_number', 1)}): {text}")

        # Map Phase: Structured extraction using Gemini
        structured_summaries = []
        for doc_name, snippets in doc_snippets.items():
            summary = _extract_paper_summary_gemini(doc_name, snippets)
            structured_summaries.append(summary)

        # Reduce Phase: Synthesis
        summaries_json_str = json.dumps(structured_summaries, indent=2)

        synthesis_prompt = f"""
You are a senior computer science academic writing a publication-grade Literature Review for a top-tier peer-reviewed conference.
Synthesize the structured paper extractions below into a rigorous, cohesive literature review.

STRUCTURED PAPER EXTRACTIONS:
{summaries_json_str}

STRICT PROSE RULES:
1. BAN GENERIC FILLER: Do NOT use phrases like "lacks in-depth analysis", "Our review reveals", or "Future research should focus on".
2. TECHNICAL DEPTH: Compare papers using exact model names, algorithms, parameter counts, or dataset names provided in the extractions.
3. CONTRASTIVE SYNTHESIS: Directly compare methodologies across papers (e.g., "While [Paper A] optimizes for X using Y, [Paper B] addresses Z by...").

REQUIRED STRUCTURE:
1. **Title**: Formal academic review title.
2. **Abstract**: 150-word technical summary of the domain landscape.
3. **Methodological Comparison Matrix**: A full Markdown table with columns: `Document | Core Methodology | Datasets/Benchmarks | Key Strengths | Limitations`.
4. **Thematic Synthesis**: Deeply compare and contrast the technical approaches.
5. **Critical Research Gaps**: Highlight specific algorithmic or architectural trade-offs that remain unresolved.
6. **Citations**: Cite documents inline as `[filename]`.

Write in authoritative, dense academic prose using clean Markdown syntax.
""".strip()

        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=synthesis_prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=3000
            )
        )

        return {
            "title": "Workspace Literature Review",
            "content": response.text,
            "documents_analyzed": list(doc_snippets.keys())
        }

    except Exception as e:
        print(f"[Literature Review Gemini Trace]: {str(e)}")
        return {"error": f"Synthesis failure: {str(e)}"}