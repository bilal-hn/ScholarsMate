import sys
import os
import re
from dotenv import load_dotenv
from groq import Groq

load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.env")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.rag.retriever import retrieve_context, build_context_block
from backend.rag.prompt_templates import construct_prompt, SOURCE_LOCKED_SYSTEM_PROMPT
from backend.embeddings.vector_store import list_indexed_documents

api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=api_key) if api_key else None

# Regex pattern for casual greetings, pleasantries, and conversational transitions
GREETING_REGEX = re.compile(
    r"^\s*(hi|hello|hey|greetings|good\s+(morning|afternoon|evening)|howdy|thanks|thank\s+you|who\s+are\s+you|what\s+can\s+you\s+do|one\s+more\s+question)\b",
    re.IGNORECASE
)


def execute_map_reduce_synthesis(query: str, chunks: list[dict], model_name: str = "llama-3.3-70b-versatile") -> str:
    """Executes a 2-stage map-reduce pass for literature reviews over large context."""
    # Group chunks by document
    docs_map = {}
    for c in chunks:
        docs_map.setdefault(c["doc_name"], []).append(c.get("content", c.get("text", "")))

    # Stage 1 (Map): Summarize each paper independently
    paper_summaries = []
    for doc_name, text_list in docs_map.items():
        doc_context = "\n".join(text_list[:10])  # Cap per paper
        map_prompt = f"Provide a detailed summary of key findings in '{doc_name}':\n\n{doc_context}"
        res = client.chat.completions.create(
            messages=[{"role": "user", "content": map_prompt}],
            model="llama-3.1-8b-instant",
            temperature=0.2
        )
        paper_summaries.append(f"### Paper Analysis: {doc_name}\n{res.choices[0].message.content}")

    # Stage 2 (Reduce): Synthesize all paper summaries into final literature review using 70B
    combined_summaries = "\n\n".join(paper_summaries)
    reduce_prompt = f"""
{SOURCE_LOCKED_SYSTEM_PROMPT}

### INDIVIDUAL PAPER SUMMARIES:
{combined_summaries}

---
### USER LITERATURE REVIEW REQUEST:
{query}

### SYNTHESIZED LITERATURE REVIEW:
""".strip()

    final_res = client.chat.completions.create(
        messages=[{"role": "user", "content": reduce_prompt}],
        model=model_name,
        temperature=0.1
    )
    return final_res.choices[0].message.content


def generate_answer(
    query: str, 
    top_k: int = 10, 
    explicit_docs: list[str] | None = None,
    model_name: str = "llama-3.3-70b-versatile"
) -> dict:
    """Orchestrates query classification, context retrieval, and specialized model generation."""
    clean_query = query.strip()

    # -------------------------------------------------------------------------
    # 0. Fast Path: Conversational & Greeting Router (No Groq/Retriever Calls)
    # -------------------------------------------------------------------------
    if GREETING_REGEX.search(clean_query) or len(clean_query.split()) <= 2:
        lower_q = clean_query.lower()

        if any(w in lower_q for w in ["hi", "hello", "hey", "greetings", "howdy"]):
            answer_text = (
                "Hello! I'm **ScholarsMate**, your research assistant. "
                "Ask me any question about your uploaded research papers, or request a summary, "
                "methodology breakdown, or comparative analysis across your workspace!"
            )
        elif any(w in lower_q for w in ["who are you", "what can you do"]):
            answer_text = (
                "I am **ScholarsMate**, a source-locked research intelligence system. "
                "I analyze research papers in your workspace, synthesize findings with exact inline "
                "citations, and prevent factual hallucinations by grounding responses strictly in your document context."
            )
        elif any(w in lower_q for w in ["thanks", "thank you"]):
            answer_text = "You're welcome! Let me know if you have any more questions about your papers."
        else:
            answer_text = "Sure! What else would you like to know about your research papers?"

        return {
            "query": query,
            "answer": answer_text,
            "sources_used": []
        }

    # Verify API Client for Academic Paths
    if not client:
        raise ValueError("Groq API key is not configured in .env file.")

    # -------------------------------------------------------------------------
    # 1. Retrieve Context & Execution Plan
    # -------------------------------------------------------------------------
    retrieved_chunks, plan = retrieve_context(query=clean_query, top_k=top_k, explicit_docs=explicit_docs)

    # Path A: Workspace Meta-Query (Explicit workspace checks)
    if plan.get("is_meta_query"):
        docs = list_indexed_documents()
        if not docs:
            answer_text = "Your workspace currently has no documents indexed."
        else:
            answer_text = f"Your workspace currently contains **{len(docs)} document(s)**:\n" + "\n".join([f"- `{d}`" for d in docs])
        return {
            "query": query,
            "answer": answer_text,
            "sources_used": []
        }

    # Path B: Map-Reduce Synthesis (Literature Reviews over 3+ papers)
    if plan.get("generation_mode") == "map_reduce" and len(retrieved_chunks) > 12:
        answer_text = execute_map_reduce_synthesis(clean_query, retrieved_chunks, model_name=model_name)
    else:
        # Path C: Single-Pass or Structured Comparison
        context_block = build_context_block(retrieved_chunks)
        full_prompt = construct_prompt(query=clean_query, context_block=context_block)

        chat_completion = client.chat.completions.create(
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