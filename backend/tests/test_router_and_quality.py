import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.rag.runtime import heuristic_intent
from backend.rag.router import sanitize_plan


def test_heuristic_intent_conversational_and_pauses():
    # 1. Thinking pauses and state markers (even with ongoing chat history)
    history = [
        {"sender": "user", "text": "What dataset did the BART paper use?"},
        {"sender": "bot", "text": "The BART paper evaluated on CNN/DailyMail and XSum datasets."}
    ]

    assert heuristic_intent("let me think", chat_history=history) == "CONVERSATIONAL"
    assert heuristic_intent("give me a second", chat_history=history) == "CONVERSATIONAL"
    assert heuristic_intent("give me a moment", chat_history=history) == "CONVERSATIONAL"
    assert heuristic_intent("wait a sec", chat_history=history) == "CONVERSATIONAL"
    assert heuristic_intent("hmmm", chat_history=history) == "CONVERSATIONAL"

    # 2. Casual acknowledgments (even with ongoing chat history)
    assert heuristic_intent("okay got it", chat_history=history) == "CONVERSATIONAL"
    assert heuristic_intent("got it", chat_history=history) == "CONVERSATIONAL"
    assert heuristic_intent("makes sense", chat_history=history) == "CONVERSATIONAL"
    assert heuristic_intent("understood", chat_history=history) == "CONVERSATIONAL"
    assert heuristic_intent("cool", chat_history=history) == "CONVERSATIONAL"
    assert heuristic_intent("alright", chat_history=history) == "CONVERSATIONAL"

    # 3. Greetings
    assert heuristic_intent("hello im bilal") == "CONVERSATIONAL"
    assert heuristic_intent("hi") == "CONVERSATIONAL"
    assert heuristic_intent("thanks") == "CONVERSATIONAL"


def test_heuristic_intent_follow_up_and_research():
    history = [
        {"sender": "user", "text": "Explain the attention mechanism."},
        {"sender": "bot", "text": "Multi-head attention computes scaled dot-product scores across queries, keys, and values."}
    ]

    # Active clarification questions MUST be FOLLOW_UP
    assert heuristic_intent("why is that?", chat_history=history) == "FOLLOW_UP"
    assert heuristic_intent("can you explain that simpler?", chat_history=history) == "FOLLOW_UP"
    assert heuristic_intent("can you give an example?", chat_history=history) == "FOLLOW_UP"
    assert heuristic_intent("elaborate on that", chat_history=history) == "FOLLOW_UP"
    assert heuristic_intent("how does scaling help?", chat_history=history) == "FOLLOW_UP"

    # Research queries
    assert heuristic_intent("What is the methodology in the Arslan paper?") == "NEW_QUERY"
    assert heuristic_intent("Compare the datasets across all papers in the workspace.") == "NEW_QUERY"

    # General knowledge
    assert heuristic_intent("Write a python function for binary search") == "GENERAL_KNOWLEDGE"


def test_sanitize_plan_routing():
    available_docs = ["sample.pdf", "sample2.pdf"]

    # Conversational plan sanitization
    plan_conv = sanitize_plan({"intent": "CONVERSATIONAL"}, "let me think", available_docs)
    assert plan_conv["intent"] == "CONVERSATIONAL"
    assert plan_conv["retrieval_mode"] == "none"
    assert plan_conv["recommended_top_k"] == 0

    # General Knowledge plan sanitization
    plan_gk = sanitize_plan({"intent": "GENERAL_KNOWLEDGE"}, "write a python quicksort", available_docs)
    assert plan_gk["intent"] == "GENERAL_KNOWLEDGE"
    assert plan_gk["retrieval_mode"] == "none"
    assert plan_gk["recommended_top_k"] == 0

    # Research plan sanitization
    plan_rq = sanitize_plan({"intent": "NEW_QUERY"}, "compare sample.pdf with other papers", available_docs)
    assert plan_rq["intent"] == "NEW_QUERY"
    assert plan_rq["retrieval_mode"] in ["vector_search", "per_document_search"]


def test_extract_sources_with_parentheses():
    from backend.rag.generator import extract_sources_from_text

    text = """
    The text covers construction of models [Build_a_Large_Language_Model_(From_Scrat (3).pdf, p.2] and 
    attention mechanisms [Build_a_Large_Language_Model_(From_Scrat (3).pdf, p.40] along with
    fine-tuning [Build_a_Large_Language_Model_(From_Scrat (3).pdf, p.233, p.254].
    """
    sources = extract_sources_from_text(text)
    assert len(sources) == 4
    pages = {s["page_number"] for s in sources}
    assert pages == {2, 40, 233, 254}
    assert all(s["doc_name"] == "Build_a_Large_Language_Model_(From_Scrat (3).pdf" for s in sources)


if __name__ == "__main__":
    print("Testing conversational & pause intent classification...")
    test_heuristic_intent_conversational_and_pauses()
    print("Testing follow-up and research queries...")
    test_heuristic_intent_follow_up_and_research()
    print("Testing execution plan sanitization...")
    test_sanitize_plan_routing()
    print("Testing citation extraction with filenames containing parentheses...")
    test_extract_sources_with_parentheses()
    print("\nALL 3-GATE ROUTER & SOURCE EXTRACTION TESTS PASSED SUCCESSFULLY! [OK]")
