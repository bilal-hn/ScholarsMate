import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from backend.db.session import Base
from backend.db.models import User, Workspace, UserDocument
from backend.db import crud


@pytest.fixture
async def async_db():
    """In-memory SQLite database fixture for fast, isolated testing."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        yield session

    await engine.dispose()


@pytest.mark.anyio
async def test_library_crud_and_metadata(async_db: AsyncSession):
    # 1. Setup users
    user_a = await crud.get_or_create_guest_user(async_db, "user_lib_a")
    user_b = await crud.get_or_create_guest_user(async_db, "user_lib_b")

    # 2. Add documents for user A
    doc1 = UserDocument(
        user_id=user_a.id,
        doc_name="attention.pdf",
        file_hash="hash_123",
        item_type="conference_paper",
        title="Attention Is All You Need",
        authors="Vaswani, Ashish and Shazeer, Noam",
        year="2017",
        venue="NeurIPS",
        doi="10.5555/3295222.3295349",
        tags=["#Transformer", "#NLP"],
        file_size_bytes=1048576,
    )
    doc2 = UserDocument(
        user_id=user_a.id,
        doc_name="bert.pdf",
        file_hash="hash_456",
        item_type="preprint",
        title="BERT: Pre-training of Deep Bidirectional Transformers",
        authors="Devlin, Jacob and Chang, Ming-Wei",
        year="2018",
        venue="arXiv",
        tags=["#Transformer", "#Pretraining"],
        file_size_bytes=2097152,
    )
    async_db.add_all([doc1, doc2])

    # Add document for user B (for isolation test)
    doc_b = UserDocument(
        user_id=user_b.id,
        doc_name="secret_b.pdf",
        file_hash="hash_789",
        title="Private Research",
        authors="User B",
        year="2024",
    )
    async_db.add(doc_b)
    await async_db.commit()

    # 3. Test list library for user A
    items_a = await crud.get_user_library(async_db, user_id=user_a.id)
    assert len(items_a) == 2
    # Ensure user B's doc is isolated
    assert not any(d.doc_name == "secret_b.pdf" for d in items_a)

    # 4. Test search filtering
    search_vaswani = await crud.get_user_library(async_db, user_id=user_a.id, search="Vaswani")
    assert len(search_vaswani) == 1
    assert search_vaswani[0].doc_name == "attention.pdf"

    search_bert = await crud.get_user_library(async_db, user_id=user_a.id, search="BERT")
    assert len(search_bert) == 1
    assert search_bert[0].doc_name == "bert.pdf"

    # 5. Test tag filtering
    nlp_docs = await crud.get_user_library(async_db, user_id=user_a.id, tag="#NLP")
    assert len(nlp_docs) == 1
    assert nlp_docs[0].doc_name == "attention.pdf"

    transformer_docs = await crud.get_user_library(async_db, user_id=user_a.id, tag="#Transformer")
    assert len(transformer_docs) == 2

    # 6. Test update document metadata
    updated = await crud.update_library_document(
        async_db,
        doc_id=doc1.id,
        user_id=user_a.id,
        updates={
            "venue": "NeurIPS 2017",
            "notes": "Fundamental paper on self-attention mechanisms.",
            "tags": ["#Transformer", "#NLP", "#CoreReading"]
        }
    )
    assert updated is not None
    assert updated.venue == "NeurIPS 2017"
    assert updated.notes == "Fundamental paper on self-attention mechanisms."
    assert "#CoreReading" in updated.tags

    # 7. Test workspace linking & delete disassociation
    ws, _ = await crud.create_workspace(
        async_db,
        name="NLP Survey",
        user_id=user_a.id,
        doc_names=["attention.pdf", "bert.pdf"]
    )
    assert len(ws.doc_names) == 2

    # Query library by workspace
    ws_docs = await crud.get_user_library(async_db, user_id=user_a.id, workspace_id=ws.id)
    assert len(ws_docs) == 2

    # Delete attention.pdf from library
    deleted = await crud.delete_library_document(async_db, doc_id=doc1.id, user_id=user_a.id)
    assert deleted is True

    # Verify doc is gone from library
    remaining = await crud.get_user_library(async_db, user_id=user_a.id)
    assert len(remaining) == 1
    assert remaining[0].doc_name == "bert.pdf"

    # Verify doc was disassociated from workspace
    refreshed_ws = await crud.get_workspace_by_id(async_db, ws.id, user_id=user_a.id)
    assert refreshed_ws.doc_names == ["bert.pdf"]


def test_citation_engine_formats():
    from backend.ingestion.citation_engine import (
        generate_citekey,
        format_apa,
        format_ieee,
        format_harvard,
        format_mla,
        format_bibtex,
        export_bibtex_file,
    )

    paper = {
        "title": "Attention Is All You Need",
        "authors": "Vaswani, Ashish and Shazeer, Noam and Parmar, Niki",
        "year": "2017",
        "venue": "NeurIPS",
        "doi": "10.5555/3295222.3295349",
        "item_type": "conference_paper",
    }

    # 1. Citekey
    citekey = generate_citekey(paper["authors"], paper["year"], paper["title"])
    assert citekey == "vaswani2017attention"

    # 2. APA
    apa = format_apa(paper)
    assert "Vaswani" in apa
    assert "(2017)" in apa
    assert "Attention Is All You Need." in apa
    assert "https://doi.org/10.5555/3295222.3295349" in apa

    # 3. IEEE
    ieee = format_ieee(paper)
    assert 'A. Vaswani' in ieee or 'Vaswani' in ieee
    assert '"Attention Is All You Need,"' in ieee
    assert "NeurIPS, 2017." in ieee

    # 4. Harvard
    harvard = format_harvard(paper)
    assert "Vaswani" in harvard
    assert "(2017)" in harvard
    assert "'Attention Is All You Need'" in harvard

    # 5. MLA
    mla = format_mla(paper)
    assert 'Vaswani' in mla
    assert '"Attention Is All You Need."' in mla

    # 6. BibTeX
    bib = format_bibtex(paper)
    assert "@inproceedings{vaswani2017attention," in bib
    assert "title = {Attention Is All You Need}," in bib
    assert "year = {2017}," in bib
    assert "booktitle = {NeurIPS}," in bib

    # 7. Bulk Export
    bulk = export_bibtex_file([paper])
    assert "% ScholarsMate Academic Reference Export (BibTeX)" in bulk
    assert "@inproceedings{vaswani2017attention," in bulk

