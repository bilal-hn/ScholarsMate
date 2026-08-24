from unittest.mock import patch

import pytest
from backend.rag.prompt_templates import construct_prompt, SOURCE_LOCKED_SYSTEM_PROMPT
from backend.rag.retriever import build_context_block, retrieve_context


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


def _hit_results(query_text: str):
    return {
        "documents": [[f"chunk for {query_text}"]],
        "metadatas": [[{"chunk_id": "p.pdf::p1::1", "source": "p.pdf", "page_number": 1}]],
    }


@patch("backend.rag.retriever.search_similar_chunks")
@patch("backend.rag.retriever.expand_query", side_effect=lambda q, **kwargs: [q])
@patch("backend.rag.retriever.rewrite_query_with_history")
@patch("backend.rag.retriever.classify_query_intent")
@patch("backend.rag.retriever.list_indexed_documents", return_value=["p.pdf"])
def test_retrieve_skips_rewrite_for_new_query(
    _list_docs, mock_classify, mock_rewrite, _expand, mock_search
):
    mock_search.side_effect = lambda query, **kwargs: _hit_results(query)
    plan = {
        "intent": "NEW_QUERY",
        "retrieval_mode": "vector_search",
        "recommended_top_k": 4,
        "is_meta_query": False,
    }

    chunks, returned_plan = retrieve_context(
        query="What dataset did the BART paper use?",
        explicit_docs=["p.pdf"],
        plan=plan,
    )

    mock_classify.assert_not_called()
    mock_rewrite.assert_not_called()
    mock_search.assert_called()
    assert returned_plan["intent"] == "NEW_QUERY"
    assert chunks


@patch("backend.rag.retriever.search_similar_chunks")
@patch("backend.rag.retriever.expand_query", side_effect=lambda q, **kwargs: [q])
@patch(
    "backend.rag.retriever.rewrite_query_with_history",
    return_value="BART paper methodology",
)
@patch("backend.rag.retriever.classify_query_intent")
@patch("backend.rag.retriever.list_indexed_documents", return_value=["p.pdf"])
def test_retrieve_rewrites_only_for_follow_up(
    _list_docs, mock_classify, mock_rewrite, _expand, mock_search
):
    mock_search.side_effect = lambda query, **kwargs: _hit_results(query)
    plan = {
        "intent": "FOLLOW_UP",
        "retrieval_mode": "vector_search",
        "recommended_top_k": 4,
        "is_meta_query": False,
    }

    retrieve_context(
        query="summarise it",
        explicit_docs=["p.pdf"],
        chat_history=[{"sender": "user", "text": "Tell me about the BART paper"}],
        plan=plan,
    )

    mock_classify.assert_not_called()
    mock_rewrite.assert_called_once()
    assert mock_search.call_args.kwargs["query"] == "BART paper methodology"


@patch("backend.rag.retriever.search_similar_chunks")
@patch("backend.rag.retriever.expand_query")
@patch("backend.rag.retriever.rewrite_query_with_history")
@patch("backend.rag.retriever.classify_query_intent")
@patch("backend.rag.retriever.list_indexed_documents", return_value=["p.pdf"])
def test_retrieve_skips_search_for_conversational_plan(
    _list_docs, mock_classify, mock_rewrite, mock_expand, mock_search
):
    chunks, returned_plan = retrieve_context(
        query="thanks",
        explicit_docs=["p.pdf"],
        plan={"intent": "CONVERSATIONAL", "is_meta_query": False},
    )

    mock_classify.assert_not_called()
    mock_rewrite.assert_not_called()
    mock_expand.assert_not_called()
    mock_search.assert_not_called()
    assert chunks == []
    assert returned_plan["intent"] == "CONVERSATIONAL"