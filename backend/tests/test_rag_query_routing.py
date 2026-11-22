import pytest
from unittest.mock import MagicMock, patch

from backend.rag.router import classify_query_intent, sanitize_plan
from backend.rag.retriever import retrieve_context
from backend.guardrails import GuardrailPipeline


def test_sanitize_plan_does_not_suppress_retrieval_when_docs_exist():
    # If the user has active workspace documents, questions should never have retrieval suppressed to 'none'
    docs = ["THE_MECHANISMS_OF_MUSCLE_HYPERTROPHY_AND.pdf"]
    raw_plan = {"intent": "GENERAL_KNOWLEDGE"}
    plan = sanitize_plan(raw_plan, "hello what is muscle hyperthrophy?", docs)
    assert plan["intent"] == "NEW_QUERY"
    assert plan["retrieval_mode"] in ["vector_search", "per_document_search"]
    assert plan["target_docs"] == docs


def test_multi_doc_summary_fast_path():
    docs = ["paper1.pdf", "paper2.pdf", "paper3.pdf"]
    plan = classify_query_intent("summarise all three papers", available_docs=docs)
    assert plan["intent"] == "NEW_QUERY"
    assert plan["retrieval_mode"] == "per_document_search"
    assert plan["is_meta_query"] is False
    assert plan["target_docs"] == docs


def test_what_are_the_papers_about_not_classified_as_meta_file_list():
    docs = ["paper1.pdf", "paper2.pdf"]
    plan = classify_query_intent("what are the papers about?", available_docs=docs)
    assert plan["is_meta_query"] is False
    assert plan["retrieval_mode"] == "per_document_search"


@patch("backend.rag.retriever.list_indexed_documents")
@patch("backend.rag.retriever.expand_query")
@patch("backend.rag.retriever.search_similar_chunks")
@patch("backend.rag.retriever.get_all_chunks_for_doc")
def test_retriever_overview_pre_seeding_for_summary(mock_chunks, mock_search, mock_expand, mock_list):
    docs = ["docA.pdf", "docB.pdf"]
    mock_list.return_value = docs
    mock_expand.return_value = ["summarise all three papers"]
    mock_chunks.return_value = [
        {"chunk_id": "chunk_1", "doc_name": "docA.pdf", "page_number": 1, "content": "Abstract of doc A"}
    ]
    mock_search.return_value = {"documents": [[]], "metadatas": [[]], "distances": [[]]}

    plan = {
        "intent": "NEW_QUERY",
        "retrieval_mode": "per_document_search",
        "target_docs": docs,
        "is_meta_query": False,
        "recommended_top_k": 6,
    }
    chunks, _ = retrieve_context("summarise all three papers", explicit_docs=docs, plan=plan)
    assert len(chunks) > 0
    assert any("Abstract of doc A" in c["content"] for c in chunks)
