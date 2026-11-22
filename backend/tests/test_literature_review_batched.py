import pytest
from unittest.mock import MagicMock, patch
import json

from backend.rag.literature_review import (
    generate_literature_review,
    _clean_table_cell,
    _generate_batched_matrix_table,
    _extract_all_profiles_in_batches,
    _extract_paper_batch_profiles,
    _create_fallback_profile,
    _execute_review_call,
    BATCHED_PAPERS_THRESHOLD,
)


class TestTableFormattingAndGuarantees:
    def test_clean_table_cell_replaces_pipes_and_newlines(self):
        raw = "Feature A | Feature B\nLine 2   multiple spaces"
        cleaned = _clean_table_cell(raw)
        assert "\n" not in cleaned
        assert "\\|" in cleaned
        assert cleaned == "Feature A \\| Feature B Line 2 multiple spaces"

    def test_batched_matrix_table_has_all_papers_and_closed_rows(self):
        doc_names = [f"paper_{i:02d}.pdf" for i in range(1, 21)]
        mock_profiles = {
            doc: {
                "doc_name": doc,
                "thematic_cluster": "Adaptive RAG",
                "core_problem": f"Problem for {doc}",
                "architecture_and_mechanism": f"Mechanism with | pipe for {doc}",
                "datasets_and_benchmarks": "MS-MARCO, HotpotQA",
                "key_strengths": "Fast retrieval",
                "critical_limitations": "Memory bound",
            }
            for doc in doc_names
        }

        table = _generate_batched_matrix_table(mock_profiles, doc_names)
        lines = [l for l in table.split("\n") if l.strip()]

        # 1 header + 1 separator + 20 rows = 22 lines
        assert len(lines) == 22
        # Check every document appears in its own row
        for doc in doc_names:
            assert f"| **{doc}** |" in table

        # Every row starts and ends with |
        for line in lines:
            assert line.startswith("|")
            assert line.endswith("|")


class TestMapReduceExtraction:
    @patch("backend.rag.literature_review._execute_review_call")
    @patch("backend.rag.literature_review.get_all_chunks_for_doc")
    @patch("backend.rag.literature_review.search_similar_chunks")
    def test_extract_paper_batch_profiles_with_valid_json(self, mock_search, mock_chunks, mock_llm):
        mock_chunks.return_value = [{"content": "Introduction chunk"}]
        mock_search.return_value = {"documents": [["Methodology chunk"]]}

        docs = ["paper1.pdf", "paper2.pdf"]
        mock_response = json.dumps({
            "profiles": [
                {
                    "doc_name": "paper1.pdf",
                    "thematic_cluster": "Cluster A",
                    "core_problem": "Problem 1",
                    "architecture_and_mechanism": "Arch 1",
                    "datasets_and_benchmarks": "Bench 1",
                    "key_strengths": "Strength 1",
                    "critical_limitations": "Limit 1",
                },
                {
                    "doc_name": "paper2.pdf",
                    "thematic_cluster": "Cluster B",
                    "core_problem": "Problem 2",
                    "architecture_and_mechanism": "Arch 2",
                    "datasets_and_benchmarks": "Bench 2",
                    "key_strengths": "Strength 2",
                    "critical_limitations": "Limit 2",
                }
            ]
        })
        mock_llm.return_value = mock_response

        profiles = _extract_paper_batch_profiles(docs, "focus", "gemini/gemini-2.5-flash")
        assert len(profiles) == 2
        assert profiles[0]["doc_name"] == "paper1.pdf"
        assert profiles[1]["doc_name"] == "paper2.pdf"

    @patch("backend.rag.literature_review._execute_review_call")
    @patch("backend.rag.literature_review.get_all_chunks_for_doc")
    @patch("backend.rag.literature_review.search_similar_chunks")
    def test_extract_paper_batch_profiles_handles_malformed_json_fallback(self, mock_search, mock_chunks, mock_llm):
        mock_chunks.return_value = [{"content": "Intro text"}]
        mock_search.return_value = {"documents": [[]]}
        mock_llm.return_value = "Non-JSON response from LLM"

        docs = ["paperA.pdf", "paperB.pdf"]
        profiles = _extract_paper_batch_profiles(docs, "focus", "gemini/gemini-2.5-flash")
        
        # Guaranteed that all papers have fallback profiles
        assert len(profiles) == 2
        assert profiles[0]["doc_name"] == "paperA.pdf"
        assert profiles[1]["doc_name"] == "paperB.pdf"
        assert "General Methodology" in profiles[0]["thematic_cluster"]


class TestAdaptiveRouting:
    @patch("backend.rag.literature_review.list_indexed_documents")
    @patch("backend.rag.literature_review._generate_direct_literature_review")
    @patch("backend.rag.literature_review._generate_batched_literature_review")
    def test_routes_to_direct_pipeline_for_small_set(self, mock_batched, mock_direct, mock_list):
        docs = ["doc1.pdf", "doc2.pdf", "doc3.pdf"]
        mock_list.return_value = docs
        mock_direct.return_value = {"title": "Direct Review", "sections": []}

        res = generate_literature_review(doc_names=docs, model_name="gemini/gemini-2.5-flash")
        assert mock_direct.called
        assert not mock_batched.called
        assert res["title"] == "Direct Review"

    @patch("backend.rag.literature_review.list_indexed_documents")
    @patch("backend.rag.literature_review._generate_direct_literature_review")
    @patch("backend.rag.literature_review._generate_batched_literature_review")
    def test_routes_to_batched_pipeline_for_large_set(self, mock_batched, mock_direct, mock_list):
        docs = [f"doc_{i}.pdf" for i in range(1, 15)]  # 14 papers > 5
        mock_list.return_value = docs
        mock_batched.return_value = {"title": "Batched Review", "sections": []}

        res = generate_literature_review(doc_names=docs, model_name="gemini/gemini-2.5-flash")
        assert mock_batched.called
        assert not mock_direct.called
        assert res["title"] == "Batched Review"


class TestRoutewayExecutionSupport:
    @patch("backend.rag.literature_review.completion")
    def test_execute_review_call_configures_routeway(self, mock_comp):
        mock_resp = MagicMock()
        mock_resp.choices = [MagicMock(message=MagicMock(content="Routeway output"))]
        mock_comp.return_value = mock_resp

        output = _execute_review_call(
            prompt="Hello",
            model_name="routeway/gemma-4-26b-a4b-it-chimerax:free",
            custom_keys={"routeway": "test-routeway-key"}
        )

        assert output == "Routeway output"
        kwargs = mock_comp.call_args.kwargs
        assert kwargs.get("api_base") == "https://api.routeway.ai/v1"
        assert kwargs.get("model") == "openai/gemma-4-26b-a4b-it-chimerax:free"
        assert kwargs.get("api_key") == "test-routeway-key"
