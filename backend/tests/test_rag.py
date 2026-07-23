import pytest
from backend.rag.prompt_templates import construct_prompt, SOURCE_LOCKED_SYSTEM_PROMPT
from backend.rag.retriever import build_context_block


def test_build_context_block_empty():
    """Ensures empty chunk list returns a graceful fallback message."""
    result = build_context_block([])
    assert result == "No relevant documents found."


def test_build_context_block_formatting():
    """Ensures retrieved chunks are properly structured into context strings."""
    mock_chunks = [
        {
            "chunk_id": "test.pdf::p1::1",
            "doc_name": "test.pdf",
            "page_number": 1,
            "content": "Retrieval-Augmented Generation enhances LLM accuracy."
        }
    ]
    block = build_context_block(mock_chunks)
    assert "[Document: test.pdf | Page: 1 | Tag: test.pdf::p1::1]" in block
    assert "Retrieval-Augmented Generation enhances LLM accuracy." in block


def test_construct_prompt_source_locking():
    """Ensures system instructions and fallback rules are embedded in final prompt."""
    query = "What is RAG?"
    context = "RAG stands for Retrieval-Augmented Generation."
    prompt = construct_prompt(query, context)

    assert SOURCE_LOCKED_SYSTEM_PROMPT in prompt
    assert "USER QUESTION:\nWhat is RAG?" in prompt
    assert "RETRIEVED CONTEXT:\nRAG stands for Retrieval-Augmented Generation." in prompt