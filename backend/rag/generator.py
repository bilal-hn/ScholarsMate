import sys
import os
from dotenv import load_dotenv
from groq import Groq
from google import genai
from google.genai import types

load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.env")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.rag.retriever import retrieve_context, build_context_block
from backend.rag.prompt_templates import construct_prompt, SOURCE_LOCKED_SYSTEM_PROMPT
from backend.embeddings.vector_store import list_indexed_documents
from backend.rag.router import classify_query_intent

# Groq Client setup (for low-latency single-pass completions)
groq_api_key = os.getenv("GROQ_API_KEY")
groq_client = Groq(api_key=groq_api_key) if groq_api_key else None

# Gemini Client setup (for heavy Map-Reduce synthesis over large document contexts)
gemini_api_key = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=gemini_api_key) if gemini_api_key else None


def execute_map_reduce_synthesis(query: str, chunks: list[dict]) -> str:
    """Executes a 2-stage map-reduce pass over large contexts using Gemini 1.5 / Flash."""
    if not gemini_client:
        raise ValueError("GEMINI_API_KEY is not configured in your .env file.")

    if not chunks:
        return "No relevant document chunks retrieved to perform literature review synthesis."

    # Group chunks safely by document
    docs_map = {}
    for c in chunks:
        doc_name = c.get("doc_name") or c.get("source") or "Unknown Document"
        text_content = c.get("content") or c.get("text") or ""
        if text_content.strip():
            docs_map.setdefault(doc_name, []).append(text_content)

    if not docs_map:
        return "Failed to extract valid text content from retrieved paper chunks."

    # Stage 1 (Map): Summarize each paper independently using Gemini
    paper_summaries = []
    for doc_name, text_list in docs_map.items():
        doc_context = "\n\n".join(text_list[:12])  # Take up to 12 snippets per paper
        map_prompt = f"""
You are a research analyst. Provide a detailed, structured technical summary of key findings, methodology, and limitations for the paper '{doc_name}' based on these excerpts:

{doc_context}
""".strip()
        
        try:
            res = gemini_client.models.generate_content(
                model="gemini-flash-latest",
                contents=map_prompt,
                config=types.GenerateContentConfig(temperature=0.2)
            )
            paper_summaries.append(f"### Paper Analysis: {doc_name}\n{res.text}")
        except Exception as e:
            print(f"[Map Stage Error] {doc_name}: {str(e)}")
            paper_summaries.append(f"### Paper Analysis: {doc_name}\nExtraction unavailable due to model error.")

    # Stage 2 (Reduce): Synthesize all paper summaries into final literature review using Gemini
    combined_summaries = "\n\n".join(paper_summaries)
    reduce_prompt = f"""
{SOURCE_LOCKED_SYSTEM_PROMPT}

### INDIVIDUAL PAPER EXTRACTIONS:
{combined_summaries}

---
### USER LITERATURE REVIEW REQUEST:
{query}

### SYNTHESIZED LITERATURE REVIEW:
Provide a publication-grade Literature Review featuring:
1. Abstract & Executive Summary
2. Methodological Comparison Matrix (Markdown Table: Document | Methodology | Strengths | Limitations)
3. Thematic Synthesis & Contrastive Analysis
4. Identified Research Gaps
""".strip()

    try:
        final_res = gemini_client.models.generate_content(
            model="gemini-flash-latest",
            contents=reduce_prompt,
            config=types.GenerateContentConfig(temperature=0.1)
        )
        return final_res.text
    except Exception as e:
        print(f"[Reduce Stage Error]: {str(e)}")
        raise RuntimeError(f"Gemini Literature Review Synthesis failed: {str(e)}")


def generate_answer(
    query: str, 
    top_k: int = 10, 
    explicit_docs: list[str] | None = None,
    chat_history: list[dict] | None = None,  # FR-05.1: Sliding window chat history
    model_name: str = "llama-3.3-70b-versatile"
) -> dict:
    """Orchestrates LLM query classification, context retrieval, and specialized model generation."""
    clean_query = query.strip()

    if not groq_client:
        raise ValueError("Groq API key is not configured in .env file.")

    # -------------------------------------------------------------------------
    # 0. Single-Pass LLM Intent & Execution Router (F-02 Refined)
    # -------------------------------------------------------------------------
    available_docs = list_indexed_documents()
    plan = classify_query_intent(
        query=clean_query, 
        available_docs=available_docs, 
        chat_history=chat_history
    )
    intent = plan.get("intent", "NEW_QUERY")
    print(f"\n[LLM Router] Intent: {intent} | Retrieval Mode: {plan.get('retrieval_mode')} | Targets: {plan.get('target_docs')}")

    # Branch A: CONVERSATIONAL Intent (Bypasses vector search completely)
    if intent == "CONVERSATIONAL":
        conv_prompt = f"You are ScholarsMate, a helpful academic research AI. Reply politely and concisely to: '{clean_query}'"
        res = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": conv_prompt}],
            model="llama-3.1-8b-instant",
            temperature=0.5,
            max_tokens=150
        )
        return {
            "query": query,
            "answer": res.choices[0].message.content,
            "sources_used": []
        }

    # Branch B: Workspace Meta-Query (Explicit workspace checks)
    if plan.get("is_meta_query"):
        if not available_docs:
            answer_text = "Your workspace currently has no documents indexed."
        else:
            answer_text = f"Your workspace currently contains **{len(available_docs)} document(s)**:\n" + "\n".join([f"- `{d}`" for d in available_docs])
        return {
            "query": query,
            "answer": answer_text,
            "sources_used": []
        }

    # -------------------------------------------------------------------------
    # 1. Retrieve Context (with FR-05 Context Memory Query Rewriting)
    # -------------------------------------------------------------------------
    retrieved_chunks, _ = retrieve_context(
        query=clean_query, 
        top_k=top_k, 
        explicit_docs=explicit_docs,
        chat_history=chat_history
    )

 # Branch C: Map-Reduce Synthesis (Literature Reviews over large contexts)
    if plan.get("generation_mode") == "map_reduce" and len(retrieved_chunks) >= 8:
        answer_text = execute_map_reduce_synthesis(clean_query, retrieved_chunks)
    else:
        # Branch D: Standard Single-Pass Synthesis using Groq 70B
        context_block = build_context_block(retrieved_chunks)
        full_prompt = construct_prompt(query=clean_query, context_block=context_block)

        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": full_prompt}],
            model=model_name,
            temperature=0.0
        )
        answer_text = chat_completion.choices[0].message.content
    # -------------------------------------------------------------------------
    # 2. Source Deduplication (Ensures page badges render cleanly)
    # -------------------------------------------------------------------------
    raw_sources = [
        {
            "chunk_id": c.get("chunk_id", ""),
            "doc_name": c.get("doc_name", "Unknown Document"),
            "page_number": c.get("page_number", 1)
        }
        for c in retrieved_chunks
    ]

    unique_sources = []
    seen = set()
    for src in raw_sources:
        key = (src["doc_name"], src["page_number"])
        if key not in seen:
            seen.add(key)
            unique_sources.append(src)

    return {
        "query": query,
        "answer": answer_text,
        "sources_used": unique_sources
    }


if __name__ == "__main__":
    test_q = sys.argv[1] if len(sys.argv) > 1 else "Summarise the main contributions"
    print(f"\n--- Testing Query: '{test_q}' ---")
    result = generate_answer(test_q)
    print("\n--- Answer ---")
    print(result["answer"])