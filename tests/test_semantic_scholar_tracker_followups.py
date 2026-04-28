import asyncio
from datetime import datetime, timedelta, timezone

import httpx
import pytest

import abo.main as main_module
from abo.default_modules.semantic_scholar_tracker import SemanticScholarTracker
import abo.default_modules.semantic_scholar_tracker as s2_module
from abo.sdk.types import Item
from abo.tools.arxiv_api import (
    ArxivAPITool,
    extract_introduction_from_arxiv_html,
    extract_introduction_from_pdf_text,
)


def _paper(
    paper_id: str,
    title: str,
    publication_date: str | None,
    citation_count: int,
    year: int | None = None,
    external_ids: dict | None = None,
) -> dict:
    return {
        "paperId": paper_id,
        "title": title,
        "abstract": f"{title} abstract",
        "authors": [{"name": "Test Author"}],
        "year": year,
        "citationCount": citation_count,
        "referenceCount": 5,
        "fieldsOfStudy": ["Computer Science"],
        "publicationDate": publication_date,
        "venue": "TestConf",
        "externalIds": external_ids or {},
    }


@pytest.mark.asyncio
async def test_get_citing_papers_paginates_and_deduplicates():
    tracker = SemanticScholarTracker()
    pages = {
        0: {
            "data": [
                {"citingPaper": _paper("paper-1", "Paper 1", "2026-04-14", 3)},
                {"citingPaper": _paper("paper-2", "Paper 2", "2026-04-13", 6)},
            ],
            "next": 2,
        },
        2: {
            "data": [
                {"citingPaper": _paper("paper-2", "Paper 2 duplicate", "2026-04-13", 6)},
                {"citingPaper": _paper("paper-3", "Paper 3", "2026-04-12", 1)},
            ],
        },
    }
    seen_offsets: list[int] = []

    async def fake_request(client: httpx.AsyncClient, url: str, params: dict | None = None) -> httpx.Response:
        assert params is not None
        offset = int(params.get("offset", 0))
        seen_offsets.append(offset)
        return httpx.Response(
            200,
            json=pages[offset],
            request=httpx.Request("GET", url, params=params),
        )

    tracker._rate_limited_request = fake_request  # type: ignore[method-assign]

    async with httpx.AsyncClient() as client:
        papers = await tracker.get_citing_papers(client, "source-paper")

    assert seen_offsets == [0, 2]
    assert [paper["paperId"] for paper in papers] == ["paper-1", "paper-2", "paper-3"]


@pytest.mark.asyncio
async def test_fetch_followups_filters_recent_days_and_sorts_by_recency(monkeypatch: pytest.MonkeyPatch):
    tracker = SemanticScholarTracker()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    newest_date = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    recent_date = (now - timedelta(days=3)).strftime("%Y-%m-%d")
    old_date = (now - timedelta(days=20)).strftime("%Y-%m-%d")

    async def fake_search(_client: httpx.AsyncClient, _query: str) -> dict:
        return {
            "paperId": "source-paper",
            "title": "World Action Models are Zero-shot Policies",
            "abstract": "Source abstract",
            "authors": [{"name": "Alice Author"}],
            "year": 2025,
            "citationCount": 27,
            "referenceCount": 12,
            "venue": "ICLR",
            "publicationDate": "2025-05-01",
            "externalIds": {"ArXiv": "2501.12345"},
        }

    async def fake_get_citing_papers(_client: httpx.AsyncClient, paper_id: str, max_results: int | None = None) -> list[dict]:
        assert paper_id == "source-paper"
        assert max_results is None
        return [
            _paper("paper-old", "Old Follow-up", old_date, 80, year=2026),
            _paper("paper-recent", "Recent Follow-up", recent_date, 10, year=2026),
            _paper("paper-newest", "Newest Follow-up", newest_date, 2, year=2026, external_ids={"ArXiv": "2604.00001"}),
        ]

    monkeypatch.setattr(tracker, "search_paper_by_title", fake_search)
    monkeypatch.setattr(tracker, "get_citing_papers", fake_get_citing_papers)

    items = await tracker.fetch_followups(
        query="World Action Models are Zero-shot Policies",
        days_back=7,
        sort_by="recency",
    )

    assert [item.raw["paper_id"] for item in items] == ["paper-newest", "paper-recent"]
    assert items[0].id == "2604.00001"
    assert items[0].raw["source_paper"]["title"] == "World Action Models are Zero-shot Policies"
    assert items[0].raw["source_paper"]["arxiv_id"] == "2501.12345"


@pytest.mark.asyncio
async def test_fetch_followups_logs_existing_dedupe_separately_from_date_filter(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
):
    tracker = SemanticScholarTracker()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    recent_date = (now - timedelta(days=2)).strftime("%Y-%m-%d")
    old_date = (now - timedelta(days=40)).strftime("%Y-%m-%d")

    async def fake_search(_client: httpx.AsyncClient, _query: str) -> dict:
        return {
            "paperId": "source-paper",
            "title": "Source Paper",
            "citationCount": 3,
        }

    async def fake_get_citing_papers(_client: httpx.AsyncClient, _paper_id: str, max_results: int | None = None) -> list[dict]:
        return [
            _paper("paper-existing", "Existing Recent Follow-up", recent_date, 5, year=2026, external_ids={"ArXiv": "2604.00001"}),
            _paper("paper-new", "New Recent Follow-up", recent_date, 3, year=2026, external_ids={"ArXiv": "2604.00002"}),
            _paper("paper-old", "Old Follow-up", old_date, 1, year=2026, external_ids={"ArXiv": "2603.00001"}),
        ]

    monkeypatch.setattr(tracker, "search_paper_by_title", fake_search)
    monkeypatch.setattr(tracker, "get_citing_papers", fake_get_citing_papers)

    items = await tracker.fetch_followups(
        query="Source Paper",
        days_back=30,
        existing_ids={"2604.00001"},
        sort_by="recency",
    )

    assert [item.id for item in items] == ["2604.00002"]
    output = capsys.readouterr().out
    assert "date_matched=2" in output
    assert "skipped_existing=1" in output
    assert "outside_window=1" in output


def test_load_existing_ids_reuses_saved_papers_and_crawl_history(monkeypatch: pytest.MonkeyPatch):
    tracker = SemanticScholarTracker()

    class DummyPaperStore:
        def existing_identifiers(self, saved_only: bool = False) -> set[str]:
            assert saved_only is True
            return {"2604.00001"}

    class DummyCardStore:
        def existing_processed_content_ids(self, *, module_ids=None) -> set[str]:
            assert module_ids == ["arxiv-tracker", "semantic-scholar-tracker"]
            return {"s2_paper-2", "2604.00003"}

    monkeypatch.setattr(s2_module, "PaperStore", DummyPaperStore)
    monkeypatch.setattr(s2_module, "CardStore", DummyCardStore)

    assert tracker._load_existing_ids() == {"2604.00001", "s2_paper-2", "2604.00003"}


@pytest.mark.asyncio
async def test_fetch_followups_applies_max_results_after_sort(monkeypatch: pytest.MonkeyPatch):
    tracker = SemanticScholarTracker()

    async def fake_search(_client: httpx.AsyncClient, _query: str) -> dict:
        return {
            "paperId": "source-paper",
            "title": "Source Paper",
            "citationCount": 3,
        }

    async def fake_get_citing_papers(_client: httpx.AsyncClient, _paper_id: str, max_results: int | None = None) -> list[dict]:
        assert max_results is None
        return [
            _paper("paper-low", "Low Citation", "2026-04-10", 1, year=2026),
            _paper("paper-high", "High Citation", "2026-04-09", 20, year=2026),
            _paper("paper-mid", "Mid Citation", "2026-04-08", 7, year=2026),
        ]

    monkeypatch.setattr(tracker, "search_paper_by_title", fake_search)
    monkeypatch.setattr(tracker, "get_citing_papers", fake_get_citing_papers)

    items = await tracker.fetch_followups(
        query="Source Paper",
        max_results=2,
        sort_by="citation_count",
    )

    assert [item.raw["paper_id"] for item in items] == ["paper-high", "paper-mid"]


@pytest.mark.asyncio
async def test_process_enriches_arxiv_assets(monkeypatch: pytest.MonkeyPatch):
    tracker = SemanticScholarTracker()

    async def fake_agent_json(prompt: str, prefs: dict) -> dict:
        return {
            "score": 8,
            "summary": "测试摘要",
            "tags": ["robotics"],
            "contribution": "测试贡献",
        }

    async def fake_fetch_figures(self, arxiv_id: str) -> list[dict]:
        assert arxiv_id == "2604.00001"
        return [
            {
                "url": "https://arxiv.org/html/2604.00001/fig1.png",
                "caption": "Pipeline",
                "is_method": True,
                "type": "img",
            }
        ]

    monkeypatch.setattr(s2_module, "agent_json", fake_agent_json)
    monkeypatch.setattr("abo.tools.arxiv_api.ArxivAPITool.fetch_figures", fake_fetch_figures)

    async def fake_fetch_introduction(self, arxiv_id: str) -> str:
        assert arxiv_id == "2604.00001"
        return "Introduction text"

    monkeypatch.setattr("abo.tools.arxiv_api.ArxivAPITool.fetch_introduction", fake_fetch_introduction)

    cards = await tracker.process(
        [
            Item(
                id="2604.00001",
                raw={
                    "title": "Follow-up Paper",
                    "abstract": "Abstract",
                    "authors": ["Test Author"],
                    "author_count": 1,
                    "year": 2026,
                    "venue": "TestConf",
                    "published": "2026-04-14",
                    "citation_count": 6,
                    "reference_count": 3,
                    "fields_of_study": ["Computer Science"],
                    "paper_id": "paper-id",
                    "arxiv_id": "2604.00001",
                    "source_paper_title": "Source Paper",
                    "source_paper": {
                        "title": "Source Paper",
                        "abstract": "Source abstract",
                        "authors": ["Original Author"],
                        "paper_id": "source-paper-id",
                        "arxiv_id": "2501.12345",
                    },
                    "s2_url": "https://www.semanticscholar.org/paper/paper-id",
                    "arxiv_url": "https://arxiv.org/abs/2604.00001",
                    "url": "https://arxiv.org/abs/2604.00001",
                },
            )
        ],
        prefs={},
    )

    assert len(cards) == 1
    metadata = cards[0].metadata
    assert metadata["arxiv_url"] == "https://arxiv.org/abs/2604.00001"
    assert metadata["pdf-url"] == "https://arxiv.org/pdf/2604.00001.pdf"
    assert metadata["html-url"] == "https://arxiv.org/html/2604.00001"
    assert metadata["figures"][0]["caption"] == "Pipeline"
    assert metadata["introduction"] == "Introduction text"
    assert metadata["source_paper"]["title"] == "Source Paper"


@pytest.mark.asyncio
async def test_process_skips_agent_when_paper_ai_scoring_disabled(monkeypatch: pytest.MonkeyPatch):
    tracker = SemanticScholarTracker()

    async def fail_agent_json(prompt: str, prefs: dict) -> dict:
        raise AssertionError("agent_json should not be called when paper AI scoring is disabled")

    monkeypatch.setattr(s2_module, "agent_json", fail_agent_json)
    monkeypatch.setattr(s2_module, "is_paper_ai_scoring_enabled", lambda: False)

    async def fake_fetch_figures(self, arxiv_id: str) -> list[dict]:
        return []

    async def fake_fetch_introduction(self, arxiv_id: str) -> str:
        return ""

    monkeypatch.setattr("abo.tools.arxiv_api.ArxivAPITool.fetch_figures", fake_fetch_figures)
    monkeypatch.setattr("abo.tools.arxiv_api.ArxivAPITool.fetch_introduction", fake_fetch_introduction)

    cards = await tracker.process(
        [
            Item(
                id="2604.00002",
                raw={
                    "title": "Follow-up Without AI Scoring",
                    "abstract": "Abstract fallback text",
                    "authors": ["Test Author"],
                    "author_count": 1,
                    "year": 2026,
                    "venue": "TestConf",
                    "published": "2026-04-14",
                    "citation_count": 0,
                    "reference_count": 0,
                    "fields_of_study": ["Computer Science"],
                    "paper_id": "paper-id",
                    "arxiv_id": "2604.00002",
                    "source_paper_title": "Source Paper",
                    "s2_url": "https://www.semanticscholar.org/paper/paper-id",
                    "arxiv_url": "https://arxiv.org/abs/2604.00002",
                    "url": "https://arxiv.org/abs/2604.00002",
                },
            )
        ],
        prefs={},
    )

    assert len(cards) == 1
    assert cards[0].summary == "Abstract fallback text"
    assert cards[0].score == 0.5
    assert cards[0].metadata["contribution"] == ""


def test_source_paper_to_item_marks_source_role():
    tracker = SemanticScholarTracker()

    item = tracker.source_paper_to_item(
        {
            "paperId": "source-paper",
            "title": "Source Paper",
            "abstract": "Source abstract",
            "authors": [{"name": "Alice Author"}],
            "year": 2025,
            "citationCount": 11,
            "referenceCount": 5,
            "fieldsOfStudy": ["Computer Science"],
            "publicationDate": "2025-05-01",
            "venue": "ICLR",
            "externalIds": {"ArXiv": "2501.12345"},
            "url": "https://www.semanticscholar.org/paper/source-paper",
        }
    )

    assert item.id == "2501.12345"
    assert item.raw["paper_tracking_role"] == "source"
    assert item.raw["source_paper_title"] == "Source Paper"
    assert item.raw["source_paper"]["arxiv_id"] == "2501.12345"


@pytest.mark.asyncio
async def test_arxiv_api_fetch_figures_normalizes_relative_urls_and_skips_data_assets():
    tool = ArxivAPITool()
    html = """
    <html>
      <body>
        <img src="/static/browse/logo.svg" alt="logo">
        <img src="2604.00001v1/x1.png" alt="Pipeline overview">
        <img src="x2.png" alt="Model architecture">
        <img src="data:image/png;base64,abcd" alt="[LOGO]">
      </body>
    </html>
    """

    async def fake_request(client: httpx.AsyncClient, url: str, timeout: int = 15) -> httpx.Response:
        return httpx.Response(
            200,
            text=html,
            request=httpx.Request("GET", url),
        )

    tool._rate_limited_request = fake_request  # type: ignore[method-assign]

    figures = await tool.fetch_figures("2604.00001")

    assert {figure["url"] for figure in figures} == {
        "https://arxiv.org/html/2604.00001v1/x1.png",
        "https://arxiv.org/html/2604.00001/x2.png",
    }
    assert all(not figure["url"].startswith("data:") for figure in figures)


@pytest.mark.asyncio
async def test_arxiv_api_fetch_figures_falls_back_to_ar5iv_when_arxiv_html_missing():
    tool = ArxivAPITool()
    arxiv_id = "2604.00002"
    calls: list[str] = []
    responses = {
        f"https://arxiv.org/html/{arxiv_id}": httpx.Response(
            404,
            request=httpx.Request("GET", f"https://arxiv.org/html/{arxiv_id}"),
        ),
        f"https://ar5iv.labs.arxiv.org/html/{arxiv_id}": httpx.Response(
            200,
            text='<html><body><img src="figures/overview.png" alt="Pipeline overview"></body></html>',
            request=httpx.Request("GET", f"https://ar5iv.labs.arxiv.org/html/{arxiv_id}"),
        ),
    }

    async def fake_request(client: httpx.AsyncClient, url: str, timeout: int = 15) -> httpx.Response:
        calls.append(url)
        return responses[url]

    tool._rate_limited_request = fake_request  # type: ignore[method-assign]

    figures = await tool.fetch_figures(arxiv_id)

    assert calls == [
        f"https://arxiv.org/html/{arxiv_id}",
        f"https://ar5iv.labs.arxiv.org/html/{arxiv_id}",
    ]
    assert figures == [
        {
            "url": "https://ar5iv.labs.arxiv.org/html/2604.00002/figures/overview.png",
            "caption": "Pipeline overview",
            "is_method": True,
            "type": "img",
        }
    ]


@pytest.mark.asyncio
async def test_semantic_scholar_crawl_can_cancel_during_followup_fetch(monkeypatch: pytest.MonkeyPatch):
    events: list[dict] = []

    class DummyBroadcaster:
        async def send_event(self, event: dict):
            events.append(event)

    class DummyTracker:
        async def fetch_followups(self, **kwargs) -> list[Item]:
            await asyncio.sleep(5)
            return []

    monkeypatch.setattr(main_module, "broadcaster", DummyBroadcaster())
    monkeypatch.setattr(main_module._prefs, "get_prefs_for_module", lambda _module: {})
    monkeypatch.setattr(s2_module, "SemanticScholarTracker", DummyTracker)

    session_id = "s2-cancel-fetch"
    crawl_task = asyncio.create_task(main_module.crawl_semantic_scholar_tracker({
        "query": "World Action Models are Zero-shot Policies",
        "session_id": session_id,
    }))

    await asyncio.sleep(0.05)
    cancel_result = await main_module.cancel_semantic_scholar_tracker_crawl({"session_id": session_id})
    result = await asyncio.wait_for(crawl_task, timeout=1.0)

    assert cancel_result["status"] == "ok"
    assert result["cancelled"] is True
    assert result["count"] == 0
    assert any(event["type"] == "crawl_cancelling" for event in events)
    assert any(event["type"] == "crawl_cancelled" for event in events)


@pytest.mark.asyncio
async def test_semantic_scholar_crawl_skips_saved_source_paper(monkeypatch: pytest.MonkeyPatch, tmp_path):
    events: list[dict] = []
    source_processed = False

    class DummyBroadcaster:
        async def send_event(self, event: dict):
            events.append(event)

    class DummyPaperStore:
        def get_by_arxiv_id(self, arxiv_id: str):
            assert arxiv_id == "2501.12345"
            return {
                "saved_to_literature": True,
                "literature_path": "arxiv/World Action Models are Zero-shot Policies.md",
                "metadata": {},
            }

        def get_by_s2_paper_id(self, s2_paper_id: str):
            assert s2_paper_id == "source-paper-id"
            return None

        def upsert_from_payload(self, payload, source_module=None):
            return payload

    class DummyTracker:
        async def resolve_source_paper(self, query: str) -> dict:
            assert query == "World Action Models are Zero-shot Policies"
            return {
                "paperId": "source-paper-id",
                "title": "World Action Models are Zero-shot Policies",
                "abstract": "Source abstract",
                "authors": [{"name": "Alice Author"}],
                "year": 2025,
                "citationCount": 27,
                "referenceCount": 12,
                "fieldsOfStudy": ["Computer Science"],
                "publicationDate": "2025-05-01",
                "venue": "ICLR",
                "externalIds": {"ArXiv": "2501.12345"},
                "url": "https://www.semanticscholar.org/paper/source-paper-id",
            }

        def source_paper_to_item(self, source_paper: dict) -> Item:
            return Item(
                id="2501.12345",
                raw={
                    "title": source_paper["title"],
                    "abstract": source_paper["abstract"],
                    "authors": ["Alice Author"],
                    "author_count": 1,
                    "year": 2025,
                    "venue": "ICLR",
                    "published": "2025-05-01",
                    "citation_count": 27,
                    "reference_count": 12,
                    "fields_of_study": ["Computer Science"],
                    "paper_id": "source-paper-id",
                    "arxiv_id": "2501.12345",
                    "source_paper_title": source_paper["title"],
                    "s2_url": "https://www.semanticscholar.org/paper/source-paper-id",
                    "arxiv_url": "https://arxiv.org/abs/2501.12345",
                    "url": "https://arxiv.org/abs/2501.12345",
                },
            )

        async def process(self, items: list[Item], prefs: dict):
            nonlocal source_processed
            source_processed = True
            return []

        async def fetch_followups(self, **kwargs) -> list[Item]:
            return []

    monkeypatch.setattr(main_module, "broadcaster", DummyBroadcaster())
    monkeypatch.setattr(main_module, "_paper_store", DummyPaperStore())
    monkeypatch.setattr(main_module, "get_literature_path", lambda: tmp_path)
    monkeypatch.setattr(main_module, "get_vault_path", lambda: tmp_path)
    monkeypatch.setattr(main_module._prefs, "get_prefs_for_module", lambda _module: {})
    monkeypatch.setattr(s2_module, "SemanticScholarTracker", DummyTracker)

    result = await main_module.crawl_semantic_scholar_tracker({
        "query": "World Action Models are Zero-shot Policies",
        "session_id": "s2-skip-source",
    })

    assert result["count"] == 0
    assert source_processed is False
    assert any(
        event["type"] == "crawl_progress" and "跳过源论文抓取" in str(event.get("message", ""))
        for event in events
    )
    assert not any(event["type"] == "crawl_paper" and event.get("current") == 0 for event in events)


@pytest.mark.asyncio
async def test_arxiv_crawl_can_cancel_during_first_paper_enrichment(monkeypatch: pytest.MonkeyPatch):
    events: list[dict] = []

    class DummyBroadcaster:
        async def send_event(self, event: dict):
            events.append(event)

    async def fake_arxiv_search(**kwargs) -> list[dict]:
        categories = kwargs.get("categories")
        assert categories is not None
        assert all(str(category).startswith("cs.") for category in categories)
        return [
            {
                "id": "2604.00001",
                "title": "A Slow Intro Paper",
                "summary": "summary",
                "authors": ["Test Author"],
                "published": "2026-04-15T00:00:00",
                "updated": "2026-04-15T00:00:00",
                "categories": ["cs.AI"],
                "primary_category": "cs.AI",
                "pdf_url": "https://arxiv.org/pdf/2604.00001.pdf",
                "arxiv_url": "https://arxiv.org/abs/2604.00001",
                "doi": None,
                "journal_ref": None,
                "comment": None,
            }
        ]

    async def fake_build_tracking_payload(self, item, prefs, *, arxiv_api=None, ai_scoring_enabled=None) -> dict:
        await asyncio.sleep(5)
        return {
            "title": item.raw["title"],
            "summary": item.raw["abstract"],
            "score": 0.8,
            "tags": ["robotics"],
            "source_url": item.raw["url"],
            "obsidian_path": f"Literature/arXiv/cs_AI/{item.id}.md",
            "metadata": {
                "arxiv_id": item.id,
                "arxiv-id": item.id,
                "arxiv_url": item.raw["url"],
                "pdf-url": item.raw["pdf_url"],
                "html-url": item.raw["html_url"],
                "abstract": item.raw["abstract"],
                "introduction": "Late introduction",
                "paper_tracking_type": "keyword",
                "paper_tracking_role": "keyword",
                "relationship": "keyword",
                "relationship_label": "关键词追踪",
            },
        }

    class DummyPaperStore:
        def upsert_from_payload(self, payload, source_module=None):
            return payload

    monkeypatch.setattr(main_module, "broadcaster", DummyBroadcaster())
    monkeypatch.setattr(main_module, "_paper_store", DummyPaperStore())
    monkeypatch.setattr("abo.tools.arxiv_api.arxiv_api_search", fake_arxiv_search)
    monkeypatch.setattr("abo.default_modules.arxiv.ArxivTracker.build_tracking_payload", fake_build_tracking_payload)

    crawl_task = asyncio.create_task(main_module.crawl_arxiv_live({
        "keywords": ["robotics"],
        "max_results": 5,
        "mode": "AND",
        "cs_only": True,
        "days_back": 30,
    }))

    session_id = None
    for _ in range(20):
        await asyncio.sleep(0.02)
        started_event = next((event for event in events if event.get("type") == "crawl_started"), None)
        if started_event:
            session_id = started_event.get("session_id")
            break

    assert session_id is not None

    cancel_result = await main_module.cancel_arxiv_crawl({"session_id": session_id})
    result = await asyncio.wait_for(crawl_task, timeout=1.0)

    assert cancel_result["status"] == "ok"
    assert result["cancelled"] is True
    assert result["count"] == 0
    assert any(event["type"] == "crawl_cancelling" for event in events)
    assert any(event["type"] == "crawl_cancelled" for event in events)


@pytest.mark.asyncio
async def test_arxiv_crawl_uses_selected_non_cs_categories(monkeypatch: pytest.MonkeyPatch):
    captured: dict[str, object] = {}

    class DummyBroadcaster:
        async def send_event(self, event: dict):
            return event

    class DummyPaperStore:
        def upsert_from_payload(self, payload, source_module=None):
            return payload

    async def fake_arxiv_search(**kwargs) -> list[dict]:
        captured["keywords"] = kwargs.get("keywords")
        captured["categories"] = kwargs.get("categories")
        return [
            {
                "id": "2604.10001",
                "title": "Cross-domain Optimization Paper",
                "summary": "summary",
                "authors": ["Test Author"],
                "published": "2026-04-20T00:00:00",
                "updated": "2026-04-20T00:00:00",
                "categories": ["math.OC", "stat.ML"],
                "primary_category": "math.OC",
                "pdf_url": "https://arxiv.org/pdf/2604.10001.pdf",
                "arxiv_url": "https://arxiv.org/abs/2604.10001",
                "doi": None,
                "journal_ref": None,
                "comment": None,
            }
        ]

    async def fake_build_tracking_payload(self, item, prefs, *, arxiv_api=None, ai_scoring_enabled=None) -> dict:
        return {
            "title": item.raw["title"],
            "summary": item.raw["abstract"],
            "score": 0.7,
            "tags": ["optimization"],
            "source_url": item.raw["url"],
            "obsidian_path": f"Literature/arXiv/{item.id}.md",
            "metadata": {
                "arxiv_id": item.id,
                "paper_tracking_label": item.raw.get("paper_tracking_label"),
            },
        }

    monkeypatch.setattr(main_module, "broadcaster", DummyBroadcaster())
    monkeypatch.setattr(main_module, "_paper_store", DummyPaperStore())
    monkeypatch.setattr("abo.tools.arxiv_api.arxiv_api_search", fake_arxiv_search)
    monkeypatch.setattr("abo.default_modules.arxiv.ArxivTracker.build_tracking_payload", fake_build_tracking_payload)

    result = await main_module.crawl_arxiv_live({
        "keywords": ["diffusion"],
        "max_results": 5,
        "mode": "AND",
        "cs_only": False,
        "days_back": 30,
        "categories": ["math.OC", "stat.ML"],
    })

    assert captured["keywords"] == ["diffusion"]
    assert captured["categories"] == ["math.OC", "stat.ML"]
    assert result["count"] == 1
    assert result["papers"][0]["metadata"]["paper_tracking_label"] == "diffusion · math.OC, stat.ML"


@pytest.mark.asyncio
async def test_arxiv_crawl_without_selected_categories_uses_all_disciplines(monkeypatch: pytest.MonkeyPatch):
    captured: dict[str, object] = {}

    class DummyBroadcaster:
        async def send_event(self, event: dict):
            return event

    class DummyPaperStore:
        def upsert_from_payload(self, payload, source_module=None):
            return payload

    async def fake_arxiv_search(**kwargs) -> list[dict]:
        captured["keywords"] = kwargs.get("keywords")
        captured["categories"] = kwargs.get("categories")
        return []

    monkeypatch.setattr(main_module, "broadcaster", DummyBroadcaster())
    monkeypatch.setattr(main_module, "_paper_store", DummyPaperStore())
    monkeypatch.setattr("abo.tools.arxiv_api.arxiv_api_search", fake_arxiv_search)

    result = await main_module.crawl_arxiv_live({
        "keywords": ["multimodal"],
        "max_results": 5,
        "mode": "AND",
        "cs_only": False,
        "days_back": 30,
        "categories": [],
    })

    assert captured["keywords"] == ["multimodal"]
    assert captured["categories"] is None
    assert result["count"] == 0


@pytest.mark.asyncio
async def test_arxiv_crawl_accepts_empty_limit_and_days_back(monkeypatch: pytest.MonkeyPatch):
    captured: dict[str, object] = {}
    events: list[dict] = []

    class DummyBroadcaster:
        async def send_event(self, event: dict):
            events.append(event)
            return event

    class DummyPaperStore:
        def upsert_from_payload(self, payload, source_module=None):
            return payload

    async def fake_arxiv_search(**kwargs) -> list[dict]:
        captured["max_results"] = kwargs.get("max_results")
        captured["days_back"] = kwargs.get("days_back")
        return []

    monkeypatch.setattr(main_module, "broadcaster", DummyBroadcaster())
    monkeypatch.setattr(main_module, "_paper_store", DummyPaperStore())
    monkeypatch.setattr("abo.tools.arxiv_api.arxiv_api_search", fake_arxiv_search)

    result = await main_module.crawl_arxiv_live({
        "keywords": ["agent"],
        "max_results": "",
        "mode": "AND",
        "cs_only": True,
        "days_back": "",
    })

    assert captured["max_results"] is None
    assert captured["days_back"] is None
    assert result["count"] == 0
    assert any(
        event.get("type") == "crawl_progress"
        and event.get("phase") == "fetching"
        and event.get("total") == 0
        and "不限篇数" in str(event.get("message", ""))
        for event in events
    )


def test_extract_introduction_from_arxiv_html_returns_main_section_only():
    html = """
    <html>
      <body>
        <h2>1 Introduction</h2>
        <p>Intro paragraph one with enough content to be preserved in the extracted section.</p>
        <p>Intro paragraph two adds more detail about the method motivation and setup.</p>
        <h2>2 Related Work</h2>
        <p>This paragraph should not be included.</p>
      </body>
    </html>
    """

    introduction = extract_introduction_from_arxiv_html(html)

    assert "Intro paragraph one" in introduction
    assert "Intro paragraph two" in introduction
    assert "should not be included" not in introduction


def test_extract_introduction_from_arxiv_html_handles_roman_numeral_heading():
    html = """
    <html>
      <body>
        <section class="ltx_section" id="S1">
          <h2 class="ltx_title ltx_title_section">
            <span class="ltx_tag ltx_tag_section">I </span>Introduction
          </h2>
          <div class="ltx_para"><p>This introduction should be extracted even when the section number uses Roman numerals.</p></div>
        </section>
        <section class="ltx_section" id="S2">
          <h2 class="ltx_title ltx_title_section">
            <span class="ltx_tag ltx_tag_section">II </span>Method
          </h2>
          <div class="ltx_para"><p>This paragraph should not be included.</p></div>
        </section>
      </body>
    </html>
    """

    introduction = extract_introduction_from_arxiv_html(html)

    assert "Roman numerals" in introduction
    assert "should not be included" not in introduction


def test_extract_introduction_from_pdf_text_returns_section_body():
    text = """
    Abstract
    Short abstract here.

    1. Introduction
    This introduction should be extracted from PDF text when HTML is unavailable.
    It should continue until the next section heading.

    2. Related Work
    This paragraph should not be included.
    """

    introduction = extract_introduction_from_pdf_text(text)

    assert "HTML is unavailable" in introduction
    assert "should not be included" not in introduction


@pytest.mark.asyncio
async def test_fetch_introduction_falls_back_to_ar5iv_html():
    tool = ArxivAPITool()
    html = """
        <html>
          <body>
            <section class="ltx_section" id="S1">
              <h2><span>I </span>Introduction</h2>
              <div class="ltx_para"><p>Fallback introduction from ar5iv should be used when arxiv html returns 404 for this paper.</p></div>
            </section>
            <section class="ltx_section" id="S2">
              <h2><span>II </span>Method</h2>
          <div class="ltx_para"><p>Stop here.</p></div>
        </section>
      </body>
    </html>
    """

    async def fake_request(client: httpx.AsyncClient, url: str, timeout: int = 20) -> httpx.Response:
        if url.startswith("https://arxiv.org/html/"):
            return httpx.Response(404, request=httpx.Request("GET", url))
        return httpx.Response(200, text=html, request=httpx.Request("GET", url))

    tool._rate_limited_request = fake_request  # type: ignore[method-assign]

    introduction = await tool.fetch_introduction("2307.15818")

    assert "Fallback introduction from ar5iv" in introduction


@pytest.mark.asyncio
async def test_fetch_introduction_falls_back_to_pdf_when_html_unavailable():
    tool = ArxivAPITool()

    async def fake_request(client: httpx.AsyncClient, url: str, timeout: int = 20) -> httpx.Response:
        return httpx.Response(404, request=httpx.Request("GET", url))

    async def fake_pdf(client: httpx.AsyncClient, arxiv_id: str) -> str:
        assert arxiv_id == "2307.15818"
        return "Introduction from PDF fallback."

    tool._rate_limited_request = fake_request  # type: ignore[method-assign]
    tool._fetch_introduction_from_pdf = fake_pdf  # type: ignore[method-assign]

    introduction = await tool.fetch_introduction("2307.15818")

    assert introduction == "Introduction from PDF fallback."
