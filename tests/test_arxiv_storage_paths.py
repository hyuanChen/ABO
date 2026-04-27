from pathlib import Path

import frontmatter
import httpx
import pytest

import abo.main as main_module
import abo.routes.tools as tools_module


pytestmark = pytest.mark.anyio


def test_collect_saved_arxiv_ids_reads_grouped_notes_and_legacy_filenames(tmp_path: Path):
    arxiv_root = tmp_path / "arxiv"
    grouped_note = arxiv_root / "robotics" / "Grouped Paper" / "Grouped Paper.md"
    grouped_note.parent.mkdir(parents=True, exist_ok=True)
    grouped_note.write_text(
        frontmatter.dumps(frontmatter.Post("# Grouped Paper\n", **{"arxiv-id": "2604.12345"})),
        encoding="utf-8",
    )

    legacy_note = arxiv_root / "legacy" / "Legacy 2604.54321.md"
    legacy_note.parent.mkdir(parents=True, exist_ok=True)
    legacy_note.write_text("# Legacy\n", encoding="utf-8")

    assert main_module._collect_saved_arxiv_ids(arxiv_root) == {"2604.12345", "2604.54321"}


async def test_api_arxiv_save_uses_grouped_folder_and_local_pdf(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("abo.config.get_literature_path", lambda: tmp_path)

    async def fake_fetch_introduction(self, arxiv_id: str) -> str:
        assert arxiv_id == "2604.00001"
        return "Normalized introduction from save route."

    monkeypatch.setattr("abo.tools.arxiv_api.ArxivAPITool.fetch_introduction", fake_fetch_introduction)

    class DummyPaperStore:
        def __init__(self):
            self.payloads = []

        def upsert_from_payload(self, payload, source_module=None):
            self.payloads.append((payload, source_module))
            return payload

    class DummyAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url: str, follow_redirects: bool = False):
            if url.endswith(".pdf"):
                return httpx.Response(
                    200,
                    content=b"%PDF-test",
                    request=httpx.Request("GET", url),
                )
            if url.endswith(".png"):
                return httpx.Response(
                    200,
                    content=b"fake-png",
                    headers={"content-type": "image/png"},
                    request=httpx.Request("GET", url),
                )
            raise AssertionError(f"Unexpected URL: {url}")

    store = DummyPaperStore()
    monkeypatch.setattr(tools_module, "_paper_store", store)
    monkeypatch.setattr(httpx, "AsyncClient", DummyAsyncClient)

    result = await tools_module.api_arxiv_save(
        tools_module.ArxivSaveRequest(
            arxiv_id="2604.00001",
            title="API Saved Paper",
            authors=["Alice Author"],
            summary="API summary",
            pdf_url="https://arxiv.org/pdf/2604.00001.pdf",
            arxiv_url="https://arxiv.org/abs/2604.00001",
            primary_category="cs.RO",
            published="2026-04-24",
            tracking_label="robotics",
            figures=[
                {
                    "url": "https://arxiv.org/html/2604.00001/figure1.png",
                    "caption": "Overview",
                }
            ],
        )
    )

    assert result["success"] is True
    assert result["saved_to"] == "arxiv/robotics/API Saved Paper/API Saved Paper.md"
    assert result["pdf_path"] == "arxiv/robotics/API Saved Paper/paper.pdf"
    assert (tmp_path / result["saved_to"]).exists()
    assert (tmp_path / "arxiv/robotics/API Saved Paper/paper.pdf").exists()
    assert (tmp_path / "arxiv/robotics/API Saved Paper/figures/figure_1.png").exists()

    post = frontmatter.loads((tmp_path / result["saved_to"]).read_text(encoding="utf-8"))
    assert post.metadata["arxiv-id"] == "2604.00001"
    assert post.metadata["pdf-path"] == "paper.pdf"
    assert post.metadata["tracking-label"] == "robotics"
    assert post.metadata["introduction"] == "Normalized introduction from save route."
    assert "## Introduction" in post.content
    assert "Normalized introduction from save route." in post.content
    assert result["introduction"] == "Normalized introduction from save route."
    assert store.payloads[0][0]["literature_path"] == result["saved_to"]
    assert store.payloads[0][0]["metadata"]["introduction"] == "Normalized introduction from save route."
    assert store.payloads[0][1] == "arxiv-api"
