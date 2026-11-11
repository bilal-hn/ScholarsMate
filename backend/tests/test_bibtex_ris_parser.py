import pytest
from backend.ingestion.bibtex_ris_parser import (
    parse_bibtex_text,
    parse_ris_text,
    parse_bibliographic_content,
    clean_latex_string,
)

SAMPLE_BIBTEX = """
@article{vaswani2017attention,
  title = {Attention {Is} All You Need},
  author = {Ashish Vaswani and Noam Shazeer and Niki Parmar},
  journal = {Advances in Neural Information Processing Systems},
  volume = {30},
  year = {2017},
  doi = {10.5555/3295222.3295349},
  eprint = {1706.03762},
  archivePrefix = {arXiv},
  url = {https://arxiv.org/abs/1706.03762},
  abstract = {The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...},
  keywords = {attention, transformers, deep learning}
}

@inproceedings{cen2019attributed,
  title = "Representation Learning for Attributed Multiplex Heterogeneous Network",
  author = "Yukuo Cen and Xu Zou and Jianwei Zhang",
  booktitle = "Proceedings of the 25th ACM SIGKDD International Conference on Knowledge Discovery & Data Mining",
  year = "2019",
  doi = "10.1145/3292500.3330964"
}
"""

SAMPLE_RIS = """
TY  - JOUR
TI  - Deep Residual Learning for Image Recognition
AU  - He, Kaiming
AU  - Zhang, Xiangyu
AU  - Ren, Shaoqing
AU  - Sun, Jian
JO  - IEEE Conference on Computer Vision and Pattern Recognition
PY  - 2016
DO  - 10.1109/CVPR.2016.90
UR  - https://doi.org/10.1109/CVPR.2016.90
AB  - Deeper neural networks are more difficult to train. We present a residual learning framework...
KW  - Deep Learning
KW  - ResNet
ER  - 

TY  - CONF
TI  - BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding
AU  - Devlin, Jacob
AU  - Chang, Ming-Wei
AU  - Lee, Kenton
AU  - Toutanova, Kristina
JO  - NAACL-HLT
PY  - 2019
ER  - 
"""


def test_parse_bibtex_multiple():
    items = parse_bibtex_text(SAMPLE_BIBTEX)
    assert len(items) == 2

    first = items[0]
    assert first["citekey"] == "vaswani2017attention"
    assert first["title"] == "Attention Is All You Need"
    assert "Ashish Vaswani" in first["authors"]
    assert first["year"] == "2017"
    assert first["venue"] == "Advances in Neural Information Processing Systems"
    assert first["arxiv_id"] == "1706.03762"
    assert first["item_type"] == "journal_article"
    assert "#attention" in first["tags"]
    assert "#transformers" in first["tags"]

    second = items[1]
    assert second["citekey"] == "cen2019attributed"
    assert second["doi"] == "10.1145/3292500.3330964"
    assert second["item_type"] == "conference_paper"


def test_parse_ris_multiple():
    items = parse_ris_text(SAMPLE_RIS)
    assert len(items) == 2

    first = items[0]
    assert first["title"] == "Deep Residual Learning for Image Recognition"
    assert "He, Kaiming" in first["authors"]
    assert first["year"] == "2016"
    assert first["venue"] == "IEEE Conference on Computer Vision and Pattern Recognition"
    assert first["doi"] == "10.1109/CVPR.2016.90"
    assert first["item_type"] == "journal_article"
    assert "#Deep Learning" in first["tags"]

    second = items[1]
    assert "BERT" in second["title"]
    assert second["year"] == "2019"
    assert second["item_type"] == "conference_paper"


def test_unified_entrypoint_detection():
    # Detect bib by extension
    bib_items = parse_bibliographic_content(SAMPLE_BIBTEX, filename="my_collection.bib")
    assert len(bib_items) == 2

    # Detect ris by extension
    ris_items = parse_bibliographic_content(SAMPLE_RIS, filename="scholar.ris")
    assert len(ris_items) == 2

    # Auto-detect from raw content with no filename
    auto_bib = parse_bibliographic_content(SAMPLE_BIBTEX)
    assert len(auto_bib) == 2

    auto_ris = parse_bibliographic_content(SAMPLE_RIS)
    assert len(auto_ris) == 2


def test_clean_latex_accents():
    raw = r"Sch{\"o}lkopf, Bernhard and M{\"u}ller, Klaus-Robert"
    cleaned = clean_latex_string(raw)
    assert "Schölkopf" in cleaned
    assert "Müller" in cleaned
