from datetime import datetime, timedelta, timezone

import httpx
import pytest

from abo.default_modules.semantic_scholar_tracker import SemanticScholarTracker
import abo.default_modules.semantic_scholar_tracker as s2_module
from abo.sdk.types import Item
from abo.tools.arxiv_api import ArxivAPITool


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
            "citationCount": 27,
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
