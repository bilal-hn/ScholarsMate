## backend/rag/literature_review.py

import json
import os
from groq import Groq
from backend.embeddings.vector_store import get_or_create_collection

api_key = os.getenv("GROQ_API_KEY")
groq_client = Groq(api_key=api_key) if api_key else None

def _extract_paper_summary(doc_name: str, snippets: list[str]) -> dict:
    """Map Step: Deeply analyzes a single document and extracts structured JSON metrics."""
    corpus = "\n".join(snippets)
    
    prompt = f"""
You are a rigorous computer science researcher analyzing a single research paper.
Extract precise technical details from the text below for document: "{doc_name}".

TEXT CONTENT:
{corpus}

Return ONLY a valid JSON object matching this exact schema (no prose, no markdown wrappers):
{{
  "doc_name": "{doc_name}",
  "core_methodology": "Exact model architecture, algorithm, or framework proposed (e.g., Low-Rank Adaptation, BART fine-tuning, RAG pipeline)",
  "dataset_or_benchmarks": "Specific datasets, metrics, or evaluation environments mentioned",
  "key_strengths": "1-2 concrete, specific technical achievements or innovations",
  "limitations": "1-2 concrete technical trade-offs, missing evaluations, or overhead costs"
}}
""".strip()

    try:
        response = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.1-8b-instant",
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"Map phase extraction failed for {doc_name}: {str(e)}")
        return {
            "doc_name": doc_name,
            "core_methodology": "Methodology extraction unavailable.",
            "dataset_or_benchmarks": "Not specified.",
            "key_strengths": "Document analyzed without structured extraction.",
            "limitations": "Detailed metrics not extracted."
        }


def generate_literature_review(doc_names: list[str] = None) -> dict:
    """Reduce Step: Combines structured paper extractions into a high-density, publication-grade Literature Review."""
    if not groq_client:
        return {"error": "GROQ_API_KEY environment variable is missing or invalid."}

    try:
        collection = get_or_create_collection()
        get_kwargs = {"include": ["documents", "metadatas"], "limit": 500}
        
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

        # 1. Group text chunks by source document
        doc_snippets = {}
        for text, meta in zip(documents, metadatas):
            if not meta or "source" not in meta:
                continue
            source = meta["source"]
            if source not in doc_snippets:
                doc_snippets[source] = []
            if len(doc_snippets[source]) < 4:
                doc_snippets[source].append(f"(p. {meta.get('page_number', 1)}): {text[:500]}")

        # 2. MAP PHASE: Deeply extract JSON summaries per paper
        structured_summaries = []
        for doc_name, snippets in doc_snippets.items():
            summary = _extract_paper_summary(doc_name, snippets)
            structured_summaries.append(summary)

        # 3. REDUCE PHASE: Generate publication-grade synthesis from clean JSON extractions
        summaries_json_str = json.dumps(structured_summaries, indent=2)

        synthesis_prompt = f"""
You are a senior computer science academic writing a publication-grade Literature Review for a peer-reviewed conference.
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
3. **Methodological Comparison Matrix**: A full Markdown table with columns: `Document | Core Methodology | Datasets/Benchmarks | Key Strengths | Limitations`. Populate this table directly from the extractions!
4. **Thematic Synthesis**: Deeply compare and contrast the technical approaches.
5. **Critical Research Gaps**: Highlight specific algorithmic or architectural trade-offs that remain unresolved.
6. **Citations**: Cite documents inline as `[filename]`.

Write in authoritative, dense academic prose. Use clean Markdown syntax.
""".strip()

        response = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": synthesis_prompt}],
            model="llama-3.1-8b-instant",
            temperature=0.2,
            max_tokens=2500
        )

        review_text = response.choices[0].message.content
        return {
            "title": "Workspace Literature Review",
            "content": review_text,
            "documents_analyzed": list(doc_snippets.keys())
        }

    except Exception as e:
        print(f"[Literature Review Error Trace]: {str(e)}")
        return {"error": f"Synthesis failure: {str(e)}"}