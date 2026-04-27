from abo.sdk.types import Card
from abo.store.cards import CardStore


def test_card_store_persists_crawl_records_and_seen_count(tmp_path):
    db_path = tmp_path / "cards.db"
    store = CardStore(db_path)

    first_card = Card(
        id="xhs-keyword:note-1",
        module_id="xiaohongshu-tracker",
        title="科研工作流",
        summary="第一次抓取",
        score=0.81,
        tags=["科研"],
        source_url="https://www.xiaohongshu.com/explore/note-1",
        obsidian_path="xhs/note-1.md",
        metadata={
            "note_id": "note-1",
            "author": "Tester",
            "crawl_source": "keyword:科研",
            "published": "2026-04-25T09:00:00",
        },
        created_at=1714000000.0,
    )
    second_card = Card(
        id="xhs-keyword:note-1",
        module_id="xiaohongshu-tracker",
        title="科研工作流",
        summary="第二次抓取",
        score=0.83,
        tags=["科研", "效率"],
        source_url="https://www.xiaohongshu.com/explore/note-1",
        obsidian_path="xhs/note-1.md",
        metadata={
            "note_id": "note-1",
            "author": "Tester",
            "crawl_source": "keyword:科研",
            "published": "2026-04-25T09:30:00",
        },
        created_at=1714001800.0,
    )
    demo_card = Card(
        id="demo-ignore",
        module_id="xiaohongshu-tracker",
        title="Demo",
        summary="should be ignored",
        score=0.5,
        tags=[],
        source_url="",
        obsidian_path="",
        metadata={"demo": True},
        created_at=1714002000.0,
    )

    store.save(first_card)
    store.save(second_card)
    store.save(demo_card)

    records = store.list_crawl_records(limit=10)

    assert store.count_crawl_records() == 1
    assert len(records) == 1
    assert records[0]["record_key"] == "xiaohongshu-tracker:xhs-keyword:note-1"
    assert records[0]["content_id"] == "note-1"
    assert records[0]["author"] == "Tester"
    assert records[0]["seen_count"] == 2
    assert records[0]["last_seen_at"] == 1714001800.0
    assert records[0]["tags"] == ["科研", "效率"]

    reloaded = CardStore(db_path)
    reloaded_records = reloaded.list_crawl_records(limit=10)
    assert reloaded.count_crawl_records() == 1
    assert reloaded_records[0]["seen_count"] == 2


def test_card_store_prunes_legacy_semantic_scholar_tracker_cards(tmp_path):
    db_path = tmp_path / "cards.db"
    store = CardStore(db_path)

    legacy_card = Card(
        id="s2-citation-legacy-paper",
        module_id="semantic-scholar-tracker",
        title="Legacy Follow Up",
        summary="old card shape",
        score=0.72,
        tags=["follow-up"],
        source_url="https://www.semanticscholar.org/paper/legacy-paper",
        obsidian_path="FollowUps/Unknown/Legacy Follow Up/Legacy Follow Up.md",
        metadata={"saved_to_literature": True},
        created_at=1714000000.0,
    )
    current_card = Card(
        id="followup-monitor:paper-1",
        module_id="semantic-scholar-tracker",
        title="Current Follow Up",
        summary="current card shape",
        score=0.91,
        tags=["follow-up"],
        source_url="https://www.semanticscholar.org/paper/current-paper",
        obsidian_path="Literature/FollowUps/Source/Current Follow Up/Current Follow Up.md",
        metadata={
            "paper_tracking_type": "followup",
            "paper_tracking_role": "followup",
            "paper_tracking_label": "Source Paper",
            "source_paper_title": "Source Paper",
        },
        created_at=1714000100.0,
    )

    store.save(legacy_card)
    store.save(current_card)

    reloaded = CardStore(db_path)

    assert reloaded.get("s2-citation-legacy-paper") is None
    assert reloaded.get("followup-monitor:paper-1") is not None
    assert reloaded.count_crawl_records(module_id="semantic-scholar-tracker") == 1
    records = reloaded.list_crawl_records(module_id="semantic-scholar-tracker", limit=10)
    assert [record["card_id"] for record in records] == ["followup-monitor:paper-1"]


def test_card_store_detects_prior_crawl_record_by_content_id_and_source_url(tmp_path):
    db_path = tmp_path / "cards.db"
    store = CardStore(db_path)

    store.save(
        Card(
            id="xhs-keyword:note-1",
            module_id="xiaohongshu-tracker",
            title="科研工作流",
            summary="第一次抓取",
            score=0.81,
            tags=["科研"],
            source_url="https://www.xiaohongshu.com/explore/note-1",
            obsidian_path="xhs/note-1.md",
            metadata={"note_id": "note-1"},
            created_at=1714000000.0,
        )
    )

    assert store.has_crawl_record(module_ids="xiaohongshu-tracker", content_id="note-1")
    assert store.has_crawl_record(
        module_ids=["xiaohongshu-tracker", "bilibili-tracker"],
        source_url="https://www.xiaohongshu.com/explore/note-1",
    )
    assert not store.has_crawl_record(module_ids="bilibili-tracker", content_id="note-1")
    assert not store.has_crawl_record(module_ids="xiaohongshu-tracker", content_id="note-2")


def test_card_store_feedback_marks_duplicate_identity_cards_read(tmp_path):
    db_path = tmp_path / "cards.db"
    store = CardStore(db_path)

    store.save(
        Card(
            id="xhs-keyword:note-1",
            module_id="xiaohongshu-tracker",
            title="科研工作流",
            summary="关键词抓取版本",
            score=0.81,
            tags=["科研"],
            source_url="https://www.xiaohongshu.com/explore/note-1",
            obsidian_path="xhs/keyword/note-1.md",
            metadata={"note_id": "note-1"},
            created_at=1714000000.0,
        )
    )
    store.save(
        Card(
            id="xhs-following:note-1",
            module_id="xiaohongshu-tracker",
            title="科研工作流",
            summary="关注流抓取版本",
            score=0.79,
            tags=["科研"],
            source_url="https://www.xiaohongshu.com/explore/note-1",
            obsidian_path="xhs/following/note-1.md",
            metadata={"note_id": "note-1"},
            created_at=1714000200.0,
        )
    )

    affected_ids = store.record_feedback("xhs-keyword:note-1", "skip")

    assert affected_ids == ["xhs-keyword:note-1", "xhs-following:note-1"]
    assert store.count_feedback("xiaohongshu-tracker", "skip") == 1
    assert store.list(unread_only=True, limit=10) == []


def test_card_store_auto_hides_new_duplicate_after_prior_feedback(tmp_path):
    db_path = tmp_path / "cards.db"
    store = CardStore(db_path)

    store.save(
        Card(
            id="xhs-keyword:note-1",
            module_id="xiaohongshu-tracker",
            title="科研工作流",
            summary="第一次抓取",
            score=0.81,
            tags=["科研"],
            source_url="https://www.xiaohongshu.com/explore/note-1",
            obsidian_path="xhs/keyword/note-1.md",
            metadata={"note_id": "note-1"},
            created_at=1714000000.0,
        )
    )
    store.record_feedback("xhs-keyword:note-1", "skip")

    store.save(
        Card(
            id="xhs-following:note-1",
            module_id="xiaohongshu-tracker",
            title="科研工作流",
            summary="第二次从关注流抓到",
            score=0.83,
            tags=["科研"],
            source_url="https://www.xiaohongshu.com/explore/note-1",
            obsidian_path="xhs/following/note-1.md",
            metadata={"note_id": "note-1"},
            created_at=1714003600.0,
        )
    )

    assert store.count_feedback("xiaohongshu-tracker", "skip") == 1
    assert store.list(unread_only=True, limit=10) == []
