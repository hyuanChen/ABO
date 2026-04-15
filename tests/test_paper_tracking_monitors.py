from pathlib import Path

import frontmatter
import pytest

import abo.main as main_module
import abo.store.cards as cards_module
from abo.default_modules.arxiv import ArxivTracker
from abo.default_modules.semantic_scholar_tracker import SemanticScholarTracker
from abo.sdk.types import Item


pytestmark = pytest.mark.anyio


def _arxiv_paper(paper_id: str, title: str, category: str = "cs.CV") -> dict:
    return {
        "id": paper_id,
        "title": title,
        "authors": ["Alice Author"],
        "summary": f"{title} summary",
        "published": "2026-04-14T00:00:00",
        "updated": "2026-04-14T00:00:00",
        "categories": [category],
        "primary_category": category,
        "pdf_url": f"https://arxiv.org/pdf/{paper_id}.pdf",
        "arxiv_url": f"https://arxiv.org/abs/{paper_id}",
        "doi": None,
        "journal_ref": None,
        "comment": "",
    }


async def test_arxiv_tracker_fetch_reads_keyword_monitors_and_merges_matches(monkeypatch: pytest.MonkeyPatch):
    tracker = ArxivTracker()

    monkeypatch.setattr(
        tracker,
        "_load_config",
        lambda: {
            "keyword_monitors": [
                {
                    "id": "vision-language",
                    "label": "Vision-Language",
                    "query": "vision,language",
                    "categories": ["cs.CV"],
                    "enabled": True,
                },
                {
                    "id": "robotics",
                    "label": "Robotics",
                    "query": "robot,manipulation | vision,language",
                    "categories": ["cs.RO"],
                    "enabled": True,
                },
            ],
            "max_results": 5,
            "days_back": 30,
        },
    )
    monkeypatch.setattr(tracker, "_load_existing_ids", lambda: {"2604.99999"})

    async def fake_arxiv_api_search(
        keywords: list[str],
        categories: list[str] | None = None,
        mode: str = "AND",
        max_results: int = 50,
        days_back: int | None = None,
        sort_by: str = "submittedDate",
        sort_order: str = "descending",
        author: str | None = None,
        title: str | None = None,
    ) -> list[dict]:
        assert mode == "AND"
        if keywords == ["vision", "language"]:
            return [_arxiv_paper("2604.00001", "Vision Language Policy", "cs.CV")]
        if keywords == ["robot", "manipulation"]:
            return [
                _arxiv_paper("2604.00001", "Vision Language Policy", "cs.CV"),
                _arxiv_paper("2604.00002", "Robot Manipulation Policy", "cs.RO"),
            ]
        return []

    monkeypatch.setattr("abo.default_modules.arxiv.arxiv_api_search", fake_arxiv_api_search)

    items = await tracker.fetch()

    assert [item.id for item in items] == ["2604.00001", "2604.00002"]
    merged = next(item for item in items if item.id == "2604.00001")
    assert [match["label"] for match in merged.raw["monitor_matches"]] == ["Vision-Language", "Robotics"]


async def test_semantic_tracker_fetch_reads_followup_monitors_and_merges_matches(monkeypatch: pytest.MonkeyPatch):
    tracker = SemanticScholarTracker()

    monkeypatch.setattr(
        tracker,
        "_load_config",
        lambda: {
            "followup_monitors": [
                {
                    "id": "world-action-models",
                    "label": "WAM",
                    "query": "World Action Models are Zero-shot Policies",
                    "enabled": True,
                },
                {
                    "id": "rt2",
                    "label": "RT-2",
                    "query": "RT-2",
                    "enabled": True,
                },
            ],
            "max_results": 5,
            "days_back": 30,
            "sort_by": "recency",
        },
    )
    monkeypatch.setattr(tracker, "_load_existing_ids", lambda: set())

    async def fake_fetch_followups(
        *,
        query: str,
        max_results: int | None = None,
        days_back: int | None = None,
        existing_ids: set[str] | None = None,
        sort_by: str = "recency",
    ) -> list[Item]:
        if query == "World Action Models are Zero-shot Policies":
            return [
                Item(
                    id="2604.00001",
                    raw={
                        "title": "Shared Follow-up",
                        "paper_id": "paper-a",
                        "source_paper_title": query,
                    },
                )
            ]
        return [
            Item(
                id="2604.00001",
                raw={
                    "title": "Shared Follow-up",
                    "paper_id": "paper-a",
                    "source_paper_title": query,
                },
            ),
            Item(
                id="s2_paper-b",
                raw={
                    "title": "RT-2 Only Follow-up",
                    "paper_id": "paper-b",
                    "source_paper_title": query,
                },
            ),
        ]

    monkeypatch.setattr(tracker, "fetch_followups", fake_fetch_followups)

    items = await tracker.fetch()

    assert [item.id for item in items] == ["2604.00001", "s2_paper-b"]
    shared = next(item for item in items if item.id == "2604.00001")
    assert [match["label"] for match in shared.raw["monitor_matches"]] == ["WAM", "RT-2"]


async def test_save_arxiv_to_literature_extracts_real_arxiv_id_from_monitor_card(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(main_module, "get_literature_path", lambda: tmp_path)
    monkeypatch.setattr(main_module, "get_vault_path", lambda: tmp_path)

    class DummyPaperStore:
        def __init__(self):
            self.payloads = []

        def upsert_from_payload(self, payload, source_module=None):
            self.payloads.append((payload, source_module))
            return payload

    class DummyCardStore:
        def get(self, card_id: str):
            return None

        def save(self, card):
            return None

    paper_store = DummyPaperStore()
    monkeypatch.setattr(main_module, "_paper_store", paper_store)
    monkeypatch.setattr(cards_module, "CardStore", DummyCardStore)

    result = await main_module.save_arxiv_to_literature(
        {
            "paper": {
                "id": "arxiv-monitor:2604.00001",
                "title": "Monitored Paper",
                "summary": "summary",
                "score": 0.8,
                "tags": ["robotics"],
                "source_url": "https://arxiv.org/abs/2604.00001",
                "metadata": {
                    "arxiv-id": "2604.00001",
                    "authors": ["Alice Author"],
                    "published": "2026-04-14",
                    "keywords": ["robotics"],
                    "figures": [],
                },
            },
            "save_pdf": False,
        }
    )

    assert result["ok"] is True
    saved_path = tmp_path / result["path"]
    assert saved_path.exists()
    post = frontmatter.loads(saved_path.read_text(encoding="utf-8"))
    assert post.metadata["arxiv-id"] == "2604.00001"
    assert paper_store.payloads[0][1] == "arxiv-tracker"
