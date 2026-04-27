from pathlib import Path

import frontmatter
import httpx
import pytest

import abo.main as main_module


pytestmark = pytest.mark.anyio


async def test_save_s2_to_literature_uses_metadata_source_paper_title(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "get_literature_path", lambda: tmp_path)
    monkeypatch.setattr(main_module, "get_vault_path", lambda: tmp_path)

    async def fake_fetch_paper_figures(arxiv_id: str, figures_dir: Path, max_figures: int = 5):
        return []

    async def fake_download_arxiv_pdf(arxiv_id: str, target_path: Path, timeout: int = 60):
        return None

    class DummyPaperStore:
        def __init__(self):
            self.payloads = []

        def upsert_from_payload(self, payload, source_module=None):
            self.payloads.append((payload, source_module))
            return payload

    store = DummyPaperStore()
    monkeypatch.setattr(main_module, "fetch_paper_figures", fake_fetch_paper_figures)
    monkeypatch.setattr(main_module, "download_arxiv_pdf", fake_download_arxiv_pdf)
    monkeypatch.setattr(main_module, "_paper_store", store)

    result = await main_module.save_s2_to_literature(
        {
            "paper": {
                "id": "2604.00001",
                "title": "A Strong Follow-up Paper",
                "summary": "summary",
                "score": 0.9,
                "tags": ["follow-up"],
                "source_url": "https://www.semanticscholar.org/paper/example",
                "metadata": {
                    "paper_id": "s2-paper-id",
                    "authors": ["Alice Author"],
                    "year": 2026,
                    "arxiv_id": "2604.00001",
                    "source_paper_title": "World Action Models are Zero-shot Policies",
                    "source_paper": {
                        "title": "World Action Models are Zero-shot Policies",
                        "abstract": "source abstract",
                        "introduction": "source introduction",
                        "authors": ["Alice Author"],
                        "year": 2025,
                        "venue": "ICLR",
                        "citation_count": 27,
                        "reference_count": 12,
                        "published": "2025-05-01",
                        "paper_id": "source-paper-id",
                        "arxiv_id": "2501.12345",
                        "s2_url": "https://www.semanticscholar.org/paper/source-paper-id",
                        "arxiv_url": "https://arxiv.org/abs/2501.12345",
                        "url": "https://arxiv.org/abs/2501.12345",
                    },
                    "abstract": "abstract",
                    "introduction": "introduction text",
                },
            },
            "save_pdf": False,
            "max_figures": 0,
        }
    )

    assert result["ok"] is True
    assert result["folder"] == "FollowUps/World Action Models are Zero-shot Policies/A Strong Follow-up Paper"
    assert result["path"] == (
        "FollowUps/World Action Models are Zero-shot Policies/"
        "A Strong Follow-up Paper/A Strong Follow-up Paper.md"
    )
    assert result["source_paper_path"] == (
        "FollowUps/World Action Models are Zero-shot Policies/"
        "World Action Models are Zero-shot Policies.md"
    )
    assert "FollowUps/Unknown/" not in result["folder"]

    saved_path = tmp_path / result["path"]
    assert saved_path.exists()
    post = frontmatter.loads(saved_path.read_text(encoding="utf-8"))
    assert post.metadata["source-paper-title"] == "World Action Models are Zero-shot Policies"
    assert post.metadata["abstract"] == "abstract"
    assert post.metadata["introduction"] == "introduction text"
    assert "## ABO Digest" in post.content
    assert "### Abstract" in post.content
    assert "### Introduction" in post.content

    source_post = frontmatter.loads((tmp_path / result["source_paper_path"]).read_text(encoding="utf-8"))
    assert source_post.metadata["paper-tracking-role"] == "source"
    assert source_post.metadata["arxiv-id"] == "2501.12345"
    assert source_post.metadata["abstract"] == "source abstract"
    assert source_post.metadata["introduction"] == "source introduction"
    assert "## 原文摘要" in source_post.content

    assert store.payloads[0][1] == "semantic-scholar-tracker"


async def test_fetch_figures_from_arxiv_html_falls_back_to_ar5iv(tmp_path, monkeypatch):
    arxiv_id = "2604.00002"
    figures_dir = tmp_path / "figures"

    class DummyImage:
        def verify(self):
            return None

    monkeypatch.setattr("PIL.Image.open", lambda *args, **kwargs: DummyImage())

    class DummyClient:
        def __init__(self):
            self.calls: list[str] = []

        async def get(self, url: str, headers=None, timeout=None):
            self.calls.append(url)
            if url == f"https://arxiv.org/html/{arxiv_id}":
                return httpx.Response(404, request=httpx.Request("GET", url))
            if url == f"https://ar5iv.labs.arxiv.org/html/{arxiv_id}":
                return httpx.Response(
                    200,
                    text='<html><body><img src="figures/overview.png" alt="Pipeline overview"></body></html>',
                    request=httpx.Request("GET", url),
                )
            if url == f"https://ar5iv.labs.arxiv.org/html/{arxiv_id}/figures/overview.png":
                return httpx.Response(
                    200,
                    content=b"fake-png",
                    headers={"content-type": "image/png"},
                    request=httpx.Request("GET", url),
                )
            raise AssertionError(f"Unexpected URL requested: {url}")

    client = DummyClient()

    figures = await main_module.fetch_figures_from_arxiv_html(
        arxiv_id,
        figures_dir,
        client,  # type: ignore[arg-type]
        max_figures=2,
    )

    assert client.calls[:2] == [
        f"https://arxiv.org/html/{arxiv_id}",
        f"https://ar5iv.labs.arxiv.org/html/{arxiv_id}",
    ]
    assert len(figures) == 1
    assert figures[0]["original_url"] == f"https://ar5iv.labs.arxiv.org/html/{arxiv_id}/figures/overview.png"
    assert (figures_dir / figures[0]["filename"]).exists()


async def test_save_s2_source_paper_to_literature_uses_top_level_source_note(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "get_literature_path", lambda: tmp_path)
    monkeypatch.setattr(main_module, "get_vault_path", lambda: tmp_path)

    async def fake_download_arxiv_pdf(arxiv_id: str, target_path: Path, timeout: int = 60):
        assert arxiv_id == "2501.12345"
        target_path.write_bytes(b"%PDF-test-source")
        return str(target_path)

    class DummyPaperStore:
        def __init__(self):
            self.payloads = []

        def upsert_from_payload(self, payload, source_module=None):
            self.payloads.append((payload, source_module))
            return payload

    store = DummyPaperStore()
    monkeypatch.setattr(main_module, "_paper_store", store)
    monkeypatch.setattr(main_module, "download_arxiv_pdf", fake_download_arxiv_pdf)

    result = await main_module.save_s2_to_literature(
        {
            "paper": {
                "id": "source-paper:2501.12345",
                "title": "World Action Models are Zero-shot Policies",
                "summary": "source abstract",
                "score": 0.8,
                "tags": ["source-paper"],
                "source_url": "https://arxiv.org/abs/2501.12345",
                "metadata": {
                    "paper_tracking_role": "source",
                    "authors": ["Alice Author"],
                    "paper_id": "source-paper-id",
                    "arxiv_id": "2501.12345",
                    "year": 2025,
                    "venue": "ICLR",
                    "published": "2025-05-01",
                    "citation_count": 27,
                    "reference_count": 12,
                    "fields_of_study": ["Computer Science"],
                    "abstract": "source abstract",
                    "introduction": "source introduction",
                    "s2_url": "https://www.semanticscholar.org/paper/source-paper-id",
                    "arxiv_url": "https://arxiv.org/abs/2501.12345",
                },
            },
            "save_pdf": True,
            "max_figures": 0,
        }
    )

    assert result["ok"] is True
    assert result["folder"] == "FollowUps/World Action Models are Zero-shot Policies"
    assert result["path"] == "FollowUps/World Action Models are Zero-shot Policies/World Action Models are Zero-shot Policies.md"
    assert result["source_paper_path"] == result["path"]
    assert result["pdf"] == "paper.pdf"
    assert (tmp_path / "FollowUps/World Action Models are Zero-shot Policies/paper.pdf").exists()

    saved_path = tmp_path / result["path"]
    post = frontmatter.loads(saved_path.read_text(encoding="utf-8"))
    assert post.metadata["paper-tracking-role"] == "source"
    assert post.metadata["arxiv-id"] == "2501.12345"
    assert post.metadata["pdf-path"] == "paper.pdf"
    assert store.payloads[0][1] == "semantic-scholar-tracker"
