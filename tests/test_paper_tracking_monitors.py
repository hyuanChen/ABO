from pathlib import Path

import frontmatter
import pytest

import abo.main as main_module
import abo.store.cards as cards_module
from abo.default_modules.arxiv import ArxivTracker
from abo.default_modules.semantic_scholar_tracker import SemanticScholarTracker
from abo.paper_tracking import normalize_keyword_monitors
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


def test_normalize_keyword_monitors_defaults_to_cs_all_categories():
    monitors = normalize_keyword_monitors(
        {
            "keyword_monitors": [
                {
                    "label": "Multimodal",
                    "query": "multimodal,agent",
                }
            ]
        }
    )

    assert monitors == [
        {
            "id": monitors[0]["id"],
            "label": "Multimodal",
            "query": "multimodal,agent",
            "categories": ["cs.*"],
            "enabled": True,
        }
    ]


async def test_arxiv_tracker_fetch_defaults_empty_categories_to_cs_all(monkeypatch: pytest.MonkeyPatch):
    tracker = ArxivTracker()
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        tracker,
        "_load_config",
        lambda: {
            "keyword_monitors": [
                {
                    "id": "default-cs",
                    "label": "Default CS",
                    "query": "multimodal",
                    "categories": [],
                    "enabled": True,
                }
            ],
            "max_results": 5,
            "days_back": 30,
        },
    )
    monkeypatch.setattr(tracker, "_load_existing_ids", lambda: set())

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
        captured["keywords"] = keywords
        captured["categories"] = categories
        return []

    monkeypatch.setattr("abo.default_modules.arxiv.arxiv_api_search", fake_arxiv_api_search)

    items = await tracker.fetch()

    assert items == []
    assert captured["keywords"] == ["multimodal"]
    assert captured["categories"] is not None
    assert all(str(category).startswith("cs.") for category in captured["categories"])


async def test_arxiv_tracker_process_outputs_followup_aligned_metadata(monkeypatch: pytest.MonkeyPatch):
    tracker = ArxivTracker()

    async def fake_agent_json(prompt: str, prefs: dict) -> dict:
        return {
            "score": 8,
            "summary": "统一卡片摘要",
            "tags": ["embodied-ai", "robotics"],
            "contribution": "统一后的核心创新",
        }

    async def fake_fetch_figures(self, arxiv_id: str) -> list[dict]:
        assert arxiv_id == "2604.00001"
        return [
            {
                "url": "https://arxiv.org/html/2604.00001/fig1.png",
                "caption": "System Overview",
                "is_method": True,
                "type": "img",
            }
        ]

    async def fake_fetch_introduction(self, arxiv_id: str) -> str:
        assert arxiv_id == "2604.00001"
        return "This is the normalized introduction."

    monkeypatch.setattr("abo.default_modules.arxiv.agent_json", fake_agent_json)
    monkeypatch.setattr("abo.tools.arxiv_api.ArxivAPITool.fetch_figures", fake_fetch_figures)
    monkeypatch.setattr("abo.tools.arxiv_api.ArxivAPITool.fetch_introduction", fake_fetch_introduction)

    cards = await tracker.process(
        [
            Item(
                id="2604.00001",
                raw={
                    "title": "Unified Search Paper",
                    "abstract": "Abstract body",
                    "authors": ["Alice Author"],
                    "author_count": 1,
                    "published": "2026-04-14T00:00:00",
                    "updated": "2026-04-14T00:00:00",
                    "primary_category": "cs.RO",
                    "primary_category_name": "Robotics",
                    "categories": ["cs.RO"],
                    "all_categories": ["Robotics"],
                    "comments": "",
                    "journal_ref": "",
                    "doi": "",
                    "url": "https://arxiv.org/abs/2604.00001",
                    "pdf_url": "https://arxiv.org/pdf/2604.00001.pdf",
                    "html_url": "https://arxiv.org/html/2604.00001",
                    "monitor_matches": [
                        {
                            "id": "robotics",
                            "label": "Robotics",
                            "query": "robot,manipulation",
                        }
                    ],
                },
            )
        ],
        prefs={},
    )

    assert len(cards) == 1
    assert cards[0].id == "arxiv-monitor:2604.00001"
    assert cards[0].module_id == "arxiv-tracker"
    metadata = cards[0].metadata
    assert metadata["arxiv_id"] == "2604.00001"
    assert metadata["arxiv-id"] == "2604.00001"
    assert metadata["arxiv_url"] == "https://arxiv.org/abs/2604.00001"
    assert metadata["pdf-url"] == "https://arxiv.org/pdf/2604.00001.pdf"
    assert metadata["html-url"] == "https://arxiv.org/html/2604.00001"
    assert metadata["paper_tracking_type"] == "keyword"
    assert metadata["paper_tracking_role"] == "keyword"
    assert metadata["paper_tracking_label"] == "Robotics"
    assert metadata["relationship"] == "keyword"
    assert metadata["relationship_label"] == "关键词追踪"
    assert metadata["figures"][0]["caption"] == "System Overview"
    assert metadata["introduction"] == "This is the normalized introduction."
    assert "## ABO Digest" in metadata["formatted-digest"]


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


async def test_semantic_tracker_process_outputs_feed_ready_followup_metadata(monkeypatch: pytest.MonkeyPatch):
    tracker = SemanticScholarTracker()

    async def fake_agent_json(prompt: str, prefs: dict) -> dict:
        return {
            "score": 9,
            "summary": "统一后的 Follow Up 摘要",
            "tags": ["embodied-ai", "robotics"],
            "contribution": "验证了跨任务迁移能力",
        }

    async def fake_fetch_figures(self, arxiv_id: str) -> list[dict]:
        assert arxiv_id == "2604.10001"
        return [
            {
                "url": "https://arxiv.org/html/2604.10001/fig1.png",
                "caption": "Follow-up Pipeline",
                "is_method": True,
                "type": "img",
            }
        ]

    async def fake_fetch_introduction(self, arxiv_id: str) -> str:
        assert arxiv_id == "2604.10001"
        return "This is the follow-up introduction."

    monkeypatch.setattr("abo.default_modules.semantic_scholar_tracker.agent_json", fake_agent_json)
    monkeypatch.setattr("abo.tools.arxiv_api.ArxivAPITool.fetch_figures", fake_fetch_figures)
    monkeypatch.setattr("abo.tools.arxiv_api.ArxivAPITool.fetch_introduction", fake_fetch_introduction)

    cards = await tracker.process(
        [
            Item(
                id="paper-followup-1",
                raw={
                    "title": "Improving RT-2 Policies",
                    "authors": ["Alice Author", "Bob Author"],
                    "author_count": 2,
                    "paper_id": "paper-followup-1",
                    "arxiv_id": "2604.10001",
                    "year": 2026,
                    "venue": "ICRA",
                    "published": "2026-04-20T00:00:00",
                    "citation_count": 12,
                    "reference_count": 30,
                    "fields_of_study": ["Robotics"],
                    "source_paper_title": "RT-2",
                    "source_paper": {"title": "RT-2"},
                    "abstract": "Follow-up abstract body",
                    "s2_url": "https://www.semanticscholar.org/paper/paper-followup-1",
                    "arxiv_url": "https://arxiv.org/abs/2604.10001",
                    "url": "https://arxiv.org/abs/2604.10001",
                    "monitor_matches": [
                        {
                            "id": "rt2",
                            "label": "RT-2",
                            "query": "RT-2",
                            "type": "followup",
                        },
                        {
                            "id": "openvla",
                            "label": "OpenVLA",
                            "query": "OpenVLA",
                            "type": "followup",
                        },
                    ],
                },
            )
        ],
        prefs={},
    )

    assert len(cards) == 1
    assert cards[0].id == "followup-monitor:paper-followup-1"
    metadata = cards[0].metadata
    assert metadata["paper_tracking_type"] == "followup"
    assert metadata["paper_tracking_role"] == "followup"
    assert metadata["paper_tracking_label"] == "RT-2"
    assert metadata["paper_tracking_labels"] == ["RT-2", "OpenVLA"]
    assert metadata["source_paper_title"] == "RT-2"
    assert metadata["paper_tracking_matches"][1]["label"] == "OpenVLA"
    assert metadata["relationship_label"] == "Follow Up 追踪"
    assert metadata["figures"][0]["caption"] == "Follow-up Pipeline"
    assert metadata["introduction"] == "This is the follow-up introduction."


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
                    "abstract": "Original abstract",
                    "introduction": "Original introduction",
                    "keywords": ["robotics"],
                    "figures": [],
                },
            },
            "save_pdf": False,
        }
    )

    assert result["ok"] is True
    assert result["folder"] == "arxiv/robotics/Monitored Paper"
    assert result["path"] == "arxiv/robotics/Monitored Paper/Monitored Paper.md"
    saved_path = tmp_path / result["path"]
    assert saved_path.exists()
    post = frontmatter.loads(saved_path.read_text(encoding="utf-8"))
    assert post.metadata["arxiv-id"] == "2604.00001"
    assert post.metadata["abstract"] == "Original abstract"
    assert post.metadata["introduction"] == "Original introduction"
    assert "## ABO Digest" in post.content
    assert "### Abstract" in post.content
    assert "### Introduction" in post.content
    assert paper_store.payloads[0][1] == "arxiv-tracker"
