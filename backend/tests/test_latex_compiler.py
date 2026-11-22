import io
import zipfile
import pytest
from backend.rag.latex_compiler import (
    sanitize_latex_text,
    markdown_to_latex_fragment,
    generate_bibtex_content,
    build_full_latex_document,
    compile_monograph_to_pdf_bytes,
    create_latex_project_zip_bytes,
)


def test_sanitize_latex_text_escapes_special_chars():
    raw = "Accuracy improved by 15% in sample_dataset.pdf with cost & latency tradeoffs."
    sanitized = sanitize_latex_text(raw)
    assert r"15\%" in sanitized
    assert r"sample\_dataset.pdf" in sanitized
    assert r"\&" in sanitized


def test_sanitize_latex_text_preserves_math_blocks():
    # Math formulas should NOT have their subscripts or percentages escaped, and placeholders must not leak
    raw = "Rate is $p < 0.05$ where $\\beta_1 = 0.45$ and $\\Delta \\text{CSA}$ gained 12% in test_file.pdf."
    sanitized = sanitize_latex_text(raw)
    assert "$p < 0.05$" in sanitized
    assert "$\\beta_1 = 0.45$" in sanitized
    assert "$\\Delta \\text{CSA}$" in sanitized
    assert r"12\%" in sanitized
    assert r"test\_file.pdf" in sanitized
    assert "MATHPH" not in sanitized
    assert "SMATEMATH" not in sanitized


def test_markdown_to_latex_fragment_math_blocks():
    md = """### 1.1 Hypertrophy Kinetics
The empirical equation is:
$$
\\Delta \\text{CSA} = \\beta_0 + \\beta_1 \\cdot \\text{Vol} + \\epsilon_i
$$
where $\\beta_1 = 0.45$.

```math
\\text{mTORC1} = f(\\text{tension})
```
"""
    latex = markdown_to_latex_fragment(md)
    # Check that display math was converted cleanly into \[ ... \] without \par or escaped subscripts
    assert r"\subsection{Hypertrophy Kinetics}" in latex
    assert r"\Delta \text{CSA} = \beta_0 + \beta_1 \cdot \text{Vol} + \epsilon_i" in latex
    assert r"\text{mTORC1} = f(\text{tension})" in latex
    assert r"\beta\_0" not in latex  # subscripts must NOT be escaped
    assert "SMATEDISPLAYMATH" not in latex


def test_markdown_to_latex_fragment_subsections():
    md = """### 1.1 Conceptual Foundations
This is paragraph one discussing [1].

### 1.2 Mechanistic Analysis
This is paragraph two discussing [2]."""
    latex = markdown_to_latex_fragment(md)
    assert r"\subsection{Conceptual Foundations}" in latex
    assert r"\subsection{Mechanistic Analysis}" in latex


def test_generate_bibtex_content():
    docs = ["schoenfeld-et-al-2020-hypertrophy.pdf", "He_2015_Deep_Residual_Learning.pdf"]
    bibtex_str, entries = generate_bibtex_content(docs)
    assert len(entries) == 2
    assert "@article{doc_1," in bibtex_str
    assert "@article{doc_2," in bibtex_str
    assert "Schoenfeld" in bibtex_str


def test_create_latex_project_zip_bytes():
    monograph = {
        "title": "Test Synthesis Review",
        "doc_names": ["doc1.pdf", "doc2.pdf"],
        "sections": [
            {
                "section_number": 1,
                "title": "Introduction",
                "content": "### 1.1 Overview\nParagraph here."
            }
        ]
    }
    zip_bytes = create_latex_project_zip_bytes(monograph)
    assert len(zip_bytes) > 0
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        names = z.namelist()
        assert "main.tex" in names
        assert "references.bib" in names
        assert "README.md" in names
        assert any(n.startswith("sections/") for n in names)


def test_tectonic_pdf_compilation():
    monograph = {
        "title": "Automated Benchmark Review",
        "doc_names": ["paper_a.pdf"],
        "sections": [
            {
                "section_number": 1,
                "title": "Background",
                "content": "### 1.1 Taxonomy\nFormal taxonomy analysis [1]."
            }
        ],
        "conclusion": "Final concluding remarks."
    }
    pdf_bytes = compile_monograph_to_pdf_bytes(monograph)
    assert len(pdf_bytes) > 1000
    assert pdf_bytes.startswith(b"%PDF-")


def test_tectonic_pdf_compilation_with_math_and_matrix():
    monograph = {
        "title": "Skeletal Muscle Hypertrophy Synthesis",
        "doc_names": [
            "schiaffino-et-al-2020-molecular-mechanisms-of-skeletal-muscle-hypertrophy.pdf",
            "THE_MECHANISMS_OF_MUSCLE_HYPERTROPHY_AND_THEIR_APPLICATION.pdf"
        ],
        "sections": [
            {
                "section_number": 1,
                "title": "Quantitative Kinetics",
                "content": r"""### 1.1 Empirical Equations
The cross-sectional area expansion is modeled by:
$$
\Delta \text{CSA} = \beta_0 + \beta_1 \cdot \text{Vol} + \epsilon_i
$$
where $\beta_1 = 0.45$ ($p < 0.01$).

```math
\text{mTORC1} = f(\text{Tension}, \text{Leucine})
```
"""
            }
        ],
        "matrix_table": r"""| Paper / Citation | Core Methodology & Architecture | Primary Datasets / Benchmarks | Key Strengths | Critical Limitations |
| :--- | :--- | :--- | :--- | :--- |
| **[1] schiaffino-et-al-2020-molecular-mechanisms-of-skeletal-muscle-hypertrophy.pdf** | In-depth molecular review of signaling pathways | In vivo murine models, human biopsies | Unifies mechanical tension and ribosome biogenesis | Lacks quantitative resistance load comparisons |
| **[2] THE_MECHANISMS_OF_MUSCLE_HYPERTROPHY_AND_THEIR_APPLICATION.pdf** | Systematic meta-analysis of volume dosage | 45 randomized resistance training trials | Establishes dose-response relationship | High heterogeneity in training status |""",
        "conclusion": "Comprehensive synthesis establishes robust mechanistic foundations."
    }
    pdf_bytes = compile_monograph_to_pdf_bytes(monograph)
    assert len(pdf_bytes) > 5000
    assert pdf_bytes.startswith(b"%PDF-")
