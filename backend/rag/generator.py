import sys
import os
from dotenv import load_dotenv
from groq import Groq

# Load environment variables from root .env file
load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.env")))

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.rag.retriever import retrieve_context, build_context_block
from backend.rag.prompt_templates import construct_prompt

# Initialize Groq Client
api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    print("Warning: GROQ_API_KEY not found in environment variables or .env file.")

client = Groq(api_key=api_key) if api_key else None


def generate_answer(query: str, top_k: int = 5, model_name: str = "llama-3.3-70b-versatile") -> dict:
    """Retrieves relevant context, constructs a source-locked prompt, and queries Groq."""
    if not client:
        raise ValueError("Groq API key is not configured. Please set GROQ_API_KEY in your .env file.")

    # 1. Retrieve matching chunks from vector store
    retrieved_chunks = retrieve_context(query=query, top_k=top_k)
    
    # 2. Build structured context block
    context_block = build_context_block(retrieved_chunks)

    # 3. Construct source-locked prompt
    full_prompt = construct_prompt(query=query, context_block=context_block)

    # 4. Call Groq API
    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "user",
                "content": full_prompt,
            }
        ],
        model=model_name,
        temperature=0.0,  # Temperature 0 for maximum factual adherence
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
    if len(sys.argv) > 1:
        user_query = sys.argv[1]
    else:
        user_query = "What problem does this work aim to solve?"

    print(f"\n--- Question: '{user_query}' ---\n")
    try:
        result = generate_answer(user_query, top_k=3)
        print("--- Answer ---")
        print(result["answer"])
        print("\n--- Sources Retained ---")
        for src in result["sources_used"]:
            print(f"- {src['chunk_id']} (Page {src['page_number']})")
    except Exception as e:
        print(f"Error executing generation: {e}")