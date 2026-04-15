from pathlib import Path

import frontmatter
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
                    "abstract": "abstract",
                },
            },
            "save_pdf": False,
            "max_figures": 0,
        }
    )

    assert result["ok"] is True
    assert result["folder"].startswith("FollowUps/World Action Models are Zero-shot Policies/")
    assert "FollowUps/Unknown/" not in result["folder"]

    saved_path = tmp_path / result["path"]
    assert saved_path.exists()
    post = frontmatter.loads(saved_path.read_text(encoding="utf-8"))
    assert post.metadata["source-paper-title"] == "World Action Models are Zero-shot Policies"
    assert store.payloads[0][1] == "semantic-scholar-tracker"
