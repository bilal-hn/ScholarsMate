import sys
import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.env")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.rag.retriever import retrieve_context, build_context_block
from backend.rag.prompt_templates import construct_prompt, SOURCE_LOCKED_SYSTEM_PROMPT
from backend.embeddings.vector_store import list_indexed_documents

api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=api_key) if api_key else None


def execute_map_reduce_synthesis(query: str, chunks: list[dict], model_name: str = "llama-3.3-70b-versatile") -> str:
    """Executes a 2-stage map-reduce pass for literature reviews over large context."""
    # Group chunks by document
    docs_map = {}
    for c in chunks:
        docs_map.setdefault(c["doc_name"], []).append(c["content"])

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
    if not client:
        raise ValueError("Groq API key is not configured in .env file.")

    # 1. Retrieve Context & Execution Plan
    retrieved_chunks, plan = retrieve_context(query=query, top_k=top_k, explicit_docs=explicit_docs)

    # Fast Path A: Workspace Meta-Query (Bypasses LLM entirely)
    if plan.get("is_meta_query"):
        docs = list_indexed_documents()
        answer_text = f"Your workspace currently contains **{len(docs)} document(s)**:\n" + "\n".join([f"- `{d}`" for d in docs])
        return {
            "query": query,
            "answer": answer_text,
            "sources_used": []
        }

    # Path B: Map-Reduce Synthesis (Literature Reviews over 3+ papers)
    if plan.get("generation_mode") == "map_reduce" and len(retrieved_chunks) > 12:
        answer_text = execute_map_reduce_synthesis(query, retrieved_chunks, model_name=model_name)
    else:
        # Path C: Single-Pass or Structured Comparison
        context_block = build_context_block(retrieved_chunks)
        full_prompt = construct_prompt(query=query, context_block=context_block)

        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": full_prompt}],
            model=model_name,
            temperature=0.0
        )
        answer_text = chat_completion.choices[0].message.content

    return {
        "query": query,
        "answer": answer_text,
        "sources_used": [
            {
                "chunk_id": c["chunk_id"],
                "doc_name": c["doc_name"],
                "page_number": c["page_number"]
            }
            for c in retrieved_chunks
        ]
    }


if __name__ == "__main__":
    test_q = sys.argv[1] if len(sys.argv) > 1 else "Summarise the main contributions"
    print(f"\n--- Testing Query: '{test_q}' ---")
    result = generate_answer(test_q)
    print("\n--- Answer ---")
    print(result["answer"])