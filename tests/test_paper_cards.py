from abo.paper_cards import sanitize_feed_card_payload


def test_unsaved_paper_cards_strip_stale_local_figure_paths(tmp_path):
    card = {
        "id": "arxiv-monitor:2604.20539v1",
        "module_id": "arxiv-tracker",
        "metadata": {
            "paper_tracking_type": "keyword",
            "saved_to_literature": False,
            "local_figures": [
                {
                    "filename": "figure_1.png",
                    "caption": "Overview",
                    "local_path": "arxiv/demo-paper/figures/figure_1.png",
                    "original_url": "https://arxiv.org/html/2604.20539v1/x1.png",
                }
            ],
        },
    }

    sanitized = sanitize_feed_card_payload(card, literature_root=tmp_path)
    metadata = sanitized["metadata"]

    assert "local_figures" not in metadata
    assert metadata["figures"][0]["url"] == "https://arxiv.org/html/2604.20539v1/x1.png"
    assert "local_path" not in metadata["figures"][0]


def test_missing_saved_note_is_downgraded_to_unsaved_card(tmp_path):
    card = {
        "id": "followup-monitor:s2_demo",
        "module_id": "semantic-scholar-tracker",
        "metadata": {
            "paper_tracking_type": "followup",
            "saved_to_literature": True,
            "literature_path": "FollowUps/Unknown/Demo Paper/Demo Paper.md",
            "pdf_path": "paper.pdf",
            "local_figures": [
                {
                    "filename": "figure_1.png",
                    "caption": "Pipeline",
                    "local_path": "FollowUps/Unknown/Demo Paper/figures/figure_1.png",
                    "original_url": "https://arxiv.org/html/2604.20539v1/figs/pipeline.png",
                }
            ],
        },
    }

    sanitized = sanitize_feed_card_payload(card, literature_root=tmp_path)
    metadata = sanitized["metadata"]

    assert metadata["saved_to_literature"] is False
    assert "literature_path" not in metadata
    assert "pdf_path" not in metadata
    assert "local_figures" not in metadata
    assert metadata["figures"][0]["url"] == "https://arxiv.org/html/2604.20539v1/figs/pipeline.png"


def test_valid_saved_paper_keeps_local_assets(tmp_path):
    paper_dir = tmp_path / "arxiv" / "Robotics" / "Demo Paper"
    figures_dir = paper_dir / "figures"
    figures_dir.mkdir(parents=True)
    (paper_dir / "Demo Paper.md").write_text("# Demo Paper", encoding="utf-8")
    (figures_dir / "figure_1.png").write_bytes(b"png")

    card = {
        "id": "arxiv-monitor:2604.21017v1",
        "module_id": "arxiv-tracker",
        "metadata": {
            "paper_tracking_type": "keyword",
            "saved_to_literature": True,
            "literature_path": "arxiv/Robotics/Demo Paper/Demo Paper.md",
            "local_figures": [
                {
                    "filename": "figure_1.png",
                    "caption": "Figure 1",
                    "local_path": "arxiv/Robotics/Demo Paper/figures/figure_1.png",
                    "original_url": "https://arxiv.org/html/2604.21017v1/x1.png",
                }
            ],
        },
    }

    sanitized = sanitize_feed_card_payload(card, literature_root=tmp_path)
    metadata = sanitized["metadata"]

    assert metadata["saved_to_literature"] is True
    assert metadata["literature_path"] == "arxiv/Robotics/Demo Paper/Demo Paper.md"
    assert metadata["local_figures"][0]["local_path"] == "arxiv/Robotics/Demo Paper/figures/figure_1.png"
