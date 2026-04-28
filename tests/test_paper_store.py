from abo.store.papers import PaperStore


def test_paper_store_merges_arxiv_search_followup_and_figures(tmp_path):
    store = PaperStore(db_path=tmp_path / "papers.db")

    search_record = store.upsert_from_payload(
        {
            "id": "2604.00001",
            "title": "World Action Models are Zero-shot Policies",
            "authors": ["Alice Author", "Bob Author"],
            "summary": "Original abstract",
            "published": "2026-04-14T00:00:00",
            "categories": ["cs.RO", "cs.AI"],
            "pdf_url": "https://arxiv.org/pdf/2604.00001.pdf",
            "arxiv_url": "https://arxiv.org/abs/2604.00001",
        },
        source_module="arxiv-api",
    )

    assert search_record is not None
    assert search_record["paper_key"] == "arxiv:2604.00001"
    assert search_record["categories"] == ["cs.RO", "cs.AI"]

    figures_record = store.record_figures(
        "2604.00001",
        [
            {
                "url": "https://arxiv.org/html/2604.00001/fig1.png",
                "caption": "Pipeline",
                "is_method": True,
            }
        ],
    )
    assert figures_record["figures"][0]["caption"] == "Pipeline"

    merged = store.upsert_from_payload(
        {
            "id": "2604.00001",
            "title": "World Action Models are Zero-shot Policies",
            "summary": "中文摘要",
            "score": 0.9,
            "tags": ["follow-up", "robotics"],
            "source_url": "https://arxiv.org/abs/2604.00001",
            "metadata": {
                "abo-type": "semantic-scholar-paper",
                "authors": ["Alice Author", "Bob Author"],
                "abstract": "Long abstract",
                "paper_id": "s2-paper-id",
                "arxiv_id": "2604.00001",
                "arxiv_url": "https://arxiv.org/abs/2604.00001",
                "citation_count": 27,
                "source_paper_title": "Source Paper",
                "contribution": "Learns a zero-shot world-action policy",
                "local_figures": [
                    {
                        "filename": "figure_1.png",
                        "caption": "Saved pipeline",
                        "local_path": "FollowUps/paper/figures/figure_1.png",
                    }
                ],
            },
        },
        source_module="semantic-scholar-tracker",
    )

    assert merged is not None
    stored = store.get("arxiv:2604.00001")
    assert stored is not None
    assert stored["citation_count"] == 27
    assert stored["source_paper_title"] == "Source Paper"
    assert stored["contribution"] == "Learns a zero-shot world-action policy"
    assert stored["figures"][0]["caption"] == "Pipeline"
    assert stored["local_figures"][0]["caption"] == "Saved pipeline"
    assert stored["source_modules"] == ["arxiv-api", "semantic-scholar-tracker"]


def test_paper_store_ignores_non_paper_cards(tmp_path):
    store = PaperStore(db_path=tmp_path / "papers.db")

    record = store.upsert_from_payload(
        {
            "id": "note-1",
            "title": "普通卡片",
            "summary": "只是一个 feed item",
            "source_url": "https://example.com/post/1",
            "tags": ["feed"],
        },
        source_module="xiaohongshu-tracker",
    )

    assert record is None
    assert store.list() == []


def test_paper_store_get_by_s2_paper_id(tmp_path):
    store = PaperStore(db_path=tmp_path / "papers.db")

    store.upsert_from_payload(
        {
            "id": "s2_source-paper-id",
            "title": "Source Paper",
            "summary": "Source abstract",
            "source_url": "https://www.semanticscholar.org/paper/source-paper-id",
            "metadata": {
                "abo-type": "semantic-scholar-paper",
                "paper_id": "source-paper-id",
                "authors": ["Alice Author"],
                "year": 2025,
            },
        },
        source_module="semantic-scholar-tracker",
    )

    record = store.get_by_s2_paper_id("source-paper-id")

    assert record is not None
    assert record["title"] == "Source Paper"


def test_existing_identifiers_ignores_legacy_semantic_scholar_tracker_records(tmp_path):
    store = PaperStore(db_path=tmp_path / "papers.db")

    store.upsert_from_payload(
        {
            "id": "legacy-s2-paper",
            "title": "Legacy Follow Up",
            "source_url": "https://www.semanticscholar.org/paper/legacy-s2-paper",
            "path": "FollowUps/Unknown/Legacy Follow Up/Legacy Follow Up.md",
            "saved_to_literature": True,
            "metadata": {
                "abo-type": "semantic-scholar-paper",
                "paper_id": "legacy-s2-paper",
                "authors": ["Legacy Author"],
            },
        },
        source_module="semantic-scholar-tracker",
    )
    store.upsert_from_payload(
        {
            "id": "current-s2-paper",
            "title": "Current Follow Up",
            "source_url": "https://www.semanticscholar.org/paper/current-s2-paper",
            "metadata": {
                "abo-type": "semantic-scholar-paper",
                "paper_id": "current-s2-paper",
                "authors": ["Current Author"],
                "paper_tracking_type": "followup",
                "paper_tracking_role": "followup",
                "paper_tracking_label": "Source Paper",
                "source_paper_title": "Source Paper",
            },
        },
        source_module="semantic-scholar-tracker",
    )

    identifiers = store.existing_identifiers(source_module="semantic-scholar-tracker")

    assert "s2:legacy-s2-paper" not in identifiers
    assert "legacy-s2-paper" not in identifiers
    assert "s2:current-s2-paper" in identifiers
    assert "current-s2-paper" in identifiers


def test_existing_identifiers_saved_only_ignores_seen_but_unsaved_papers(tmp_path):
    store = PaperStore(db_path=tmp_path / "papers.db")

    store.upsert_from_payload(
        {
            "id": "2604.00001",
            "title": "Seen But Unsaved Paper",
            "authors": ["Alice Author"],
            "source_url": "https://arxiv.org/abs/2604.00001",
            "metadata": {
                "abo-type": "arxiv-paper",
                "arxiv_id": "2604.00001",
            },
        },
        source_module="arxiv-tracker",
    )
    store.upsert_from_payload(
        {
            "id": "2604.00002",
            "title": "Saved Paper",
            "authors": ["Bob Author"],
            "source_url": "https://arxiv.org/abs/2604.00002",
            "path": "arxiv/Saved Paper.md",
            "metadata": {
                "abo-type": "arxiv-paper",
                "arxiv_id": "2604.00002",
                "saved_to_literature": True,
            },
        },
        source_module="semantic-scholar-tracker",
    )

    all_identifiers = store.existing_identifiers()
    saved_identifiers = store.existing_identifiers(saved_only=True)

    assert "2604.00001" in all_identifiers
    assert "2604.00001" not in saved_identifiers
    assert "2604.00002" in saved_identifiers
