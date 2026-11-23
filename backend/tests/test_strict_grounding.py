# backend/tests/test_strict_grounding.py

import pytest
from unittest.mock import patch, MagicMock
from backend.rag.generator import generate_answer
from backend.rag.prompt_templates import MAIN_RAG_PROMPT
from backend.rag.modes import ACADEMIC_MODES


def test_system_prompt_strictly_source_locked():
    """Verify that system prompts enforce strict grounding and forbid off-topic general knowledge fallback."""
    assert "STRICT REFUSAL RULE FOR OFF-TOPIC / UNCOVERED TOPICS" in MAIN_RAG_PROMPT
    assert "When answering general conceptual questions not covered by the workspace papers" not in MAIN_RAG_PROMPT

    assistant_directive = ACADEMIC_MODES["assistant"]["prompt_directive"]
    assert "You must answer strictly from the user's uploaded documents" in assistant_directive
    assert "If asked a general knowledge question not in the papers, answer clearly and helpfully" not in assistant_directive


def test_scenario_1_empty_chat_random_question_prompts_upload():
    """
    Scenario 1: User is given an empty chat on login with no uploaded documents.
    When asking a random question like 'give me a python script', the assistant MUST prompt
    the user to upload documents/materials first, rather than answering with general code/knowledge.
    """
    res = generate_answer(
        query="give me a python script for a web scraper",
        explicit_docs=[],
    )

    assert "Please upload or attach documents first" in res["answer"]
    assert "ScholarsMate only answers questions based on your uploaded materials" in res["answer"]
    assert res["sources_used"] == []


def test_scenario_1_empty_chat_greeting_guides_upload():
    """
    Scenario 1 (Greeting): User says hello in an empty chat.
    Assistant should welcome the user and guide them to upload documents.
    """
    res = generate_answer(
        query="Hello!",
        explicit_docs=[],
    )

    assert "Welcome to ScholarsMate" in res["answer"]
    assert "upload or attach your documents" in res["answer"].lower()
    assert res["sources_used"] == []


@patch("backend.rag.generator.retrieve_context")
@patch("backend.rag.generator.GuardrailPipeline.run_retrieval_rails")
def test_scenario_2_document_chat_offtopic_question_refused(mock_rails, mock_retrieve):
    """
    Scenario 2: User is in a chat with documents, but asks a question outside the documents.
    Retrieval finds no relevant chunks (or Gate 2 drops them).
    The system MUST refuse to answer from general knowledge and state the documents do not cover it.
    """
    mock_retrieve.return_value = ([], {"intent": "NEW_QUERY", "target_docs": ["attention.pdf"]})
    mock_rail_result = MagicMock()
    mock_rail_result.to_dict.return_value = {"action": "allow"}
    mock_rails.return_value = ([], mock_rail_result)

    res = generate_answer(
        query="Write a python script for binary search tree",
        explicit_docs=["attention.pdf"],
    )

    assert "I can only answer questions grounded in your uploaded documents" in res["answer"]
    assert "`attention.pdf`" in res["answer"]
    assert "could not find any relevant information" in res["answer"]
    assert res["sources_used"] == []


@patch("backend.rag.generator.retrieve_context")
@patch("backend.rag.generator.GuardrailPipeline.run_retrieval_rails")
@patch("backend.rag.generator._execute_completion_with_fallback")
def test_scenario_2_document_chat_relevant_question_answered_with_citations(
    mock_llm, mock_rails, mock_retrieve
):
    """
    Scenario 2 (Relevant): User asks a question answered by the uploaded document.
    Chunks are retrieved, and the answer is generated with inline citations.
    """
    chunk = {
        "chunk_id": "chunk_1",
        "doc_name": "attention.pdf",
        "page_number": 4,
        "content": "Scaled dot-product attention computes Attention(Q, K, V) = softmax(QK^T / sqrt(d_k))V."
    }
    mock_retrieve.return_value = ([chunk], {"intent": "NEW_QUERY", "target_docs": ["attention.pdf"]})
    mock_rail_result = MagicMock()
    mock_rail_result.to_dict.return_value = {"action": "allow"}
    mock_rails.return_value = ([chunk], mock_rail_result)

    mock_completion = MagicMock()
    mock_completion.choices = [
        MagicMock(message=MagicMock(content="Scaled dot-product attention scales query-key products by 1/sqrt(d_k) [attention.pdf, p.4]."))
    ]
    mock_llm.return_value = mock_completion

    res = generate_answer(
        query="What is the formula for scaled dot-product attention?",
        explicit_docs=["attention.pdf"],
    )

    assert "attention.pdf" in res["answer"]
    assert any(s["doc_name"] == "attention.pdf" for s in res["sources_used"])


def test_general_assistant_hybrid_prompt():
    """Verify that General Assistant mode employs hybrid grounding and allows drawing from broad knowledge."""
    from backend.rag.prompt_templates import construct_system_prompt

    prompt = construct_system_prompt(mode="general")
    assert "General Assistant" in prompt
    assert "Broad World Knowledge" in prompt
    assert "Never refuse a question simply because it is not explicitly discussed in the uploaded papers" in prompt

