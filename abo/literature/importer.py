"""Literature importer — PDF and DOI ingestion."""
import asyncio
import re
import uuid
from pathlib import Path

import frontmatter
import httpx

from abo.literature.indexer import index_paper
from abo.game.skills import award_xp
from abo.game.state import load_state
from abo.vault.unified_entry import UnifiedVaultEntry


# ── PDF text extraction ───────────────────────────────────────────────────────

def _extract_pdf_text(pdf_path: Path) -> str:
    try:
        from pdfminer.high_level import extract_text
        return extract_text(str(pdf_path))
    except Exception:
        try:
            import pypdf
            reader = pypdf.PdfReader(str(pdf_path))
            return "\n".join(p.extract_text() or "" for p in reader.pages)
        except Exception:
            return ""


# ── DOI metadata ─────────────────────────────────────────────────────────────

async def _fetch_doi_meta(doi: str) -> dict:
    url = f"https://api.crossref.org/works/{doi}"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, headers={"User-Agent": "ABO/0.1 mailto:abo@local"})
    if r.status_code != 200:
        return {}
    work = r.json().get("message", {})
    authors = ", ".join(
        f"{a.get('family', '')}, {a.get('given', '')}"
        for a in work.get("author", [])
    )
    year = (work.get("published", {}).get("date-parts") or [[None]])[0][0]
    title_list = work.get("title", ["Untitled"])
    return {
        "title": title_list[0] if title_list else "Untitled",
        "authors": authors,
        "year": year,
        "doi": doi,
    }


# ── Paper ID helpers ──────────────────────────────────────────────────────────

def _safe_id(text: str) -> str:
    return re.sub(r"[^\w-]", "_", text)[:50]


def _build_paper_id(title: str, year: int | None, authors: str) -> str:
    first_author = (authors.split(",")[0] if authors else "Unknown").strip()
    year_str = str(year) if year else "XXXX"
    short_title = _safe_id("".join(title.split()[:3]))
    return f"{_safe_id(first_author)}{year_str}-{short_title}"


# ── Note template ─────────────────────────────────────────────────────────────

def _build_note(meta: dict, notes: str) -> str:
    title = meta.get("title", "Untitled")
    return f"""## 核心贡献

{notes}

## 方法论

## 实验结果

## 局限性

## 与我研究的关联

## 金句摘录
"""


# ── Main import functions ─────────────────────────────────────────────────────

async def import_pdf(
    pdf_path_str: str, vault_path: str, *, run_claude: bool = False
) -> dict:
    pdf_path = Path(pdf_path_str)
    if not pdf_path.exists():
        raise FileNotFoundError(pdf_path_str)

    text = _extract_pdf_text(pdf_path)
    title = pdf_path.stem.replace("_", " ").replace("-", " ").title()
    paper_id = _build_paper_id(title, None, "Unknown")

    notes = ""
    if run_claude:
        from abo.sdk.tools import agent
        prompt = (
            "请为以下学术论文生成简短的结构化笔记（核心贡献、方法论、局限性各一段）：\n\n"
            + text[:5000]
        )
        notes = await agent(prompt)

    _write_paper_note(vault_path, paper_id, {
        "abo-type": "literature", "title": title, "authors": "Unknown",
        "year": None, "doi": None, "digest-level": 0,
        "tags": [], "abo-skills": ["critical-reading"], "abo-xp": 5,
    }, _build_note({"title": title}, notes))

    md_path = str(Path(vault_path) / "Literature" / f"{paper_id}.md")
    index_paper(vault_path, paper_id, title, "Unknown", text, md_path)
    _award_import_xp(vault_path)

    return {"paper_id": paper_id, "title": title, "digest_level": 0}


async def import_doi(doi: str, vault_path: str, *, run_claude: bool = False) -> dict:
    meta = await _fetch_doi_meta(doi)
    if not meta:
        raise ValueError(f"Could not fetch metadata for DOI: {doi}")

    paper_id = _build_paper_id(meta["title"], meta.get("year"), meta.get("authors", ""))
    notes = ""
    if run_claude:
        from abo.sdk.tools import agent
        prompt = (
            f"请为论文《{meta['title']}》（{meta.get('authors', '')}，{meta.get('year', '')}）"
            "生成简短的结构化笔记（核心贡献、方法论、局限性各一段）。"
        )
        notes = await agent(prompt)

    _write_paper_note(vault_path, paper_id, {
        "abo-type": "literature",
        "title": meta["title"],
        "authors": meta.get("authors", ""),
        "year": meta.get("year"),
        "doi": doi,
        "digest-level": 0,
        "tags": [], "abo-skills": ["critical-reading"], "abo-xp": 5,
    }, _build_note(meta, notes))

    md_path = str(Path(vault_path) / "Literature" / f"{paper_id}.md")
    index_paper(vault_path, paper_id, meta["title"], meta.get("authors", ""),
                notes, md_path, meta.get("year"), doi)
    _award_import_xp(vault_path)

    return {"paper_id": paper_id, **meta, "digest_level": 0}


def _write_paper_note(vault_path: str, paper_id: str, metadata: dict, content: str) -> None:
    lit_dir = Path(vault_path) / "Literature"
    lit_dir.mkdir(parents=True, exist_ok=True)
    md_path = lit_dir / f"{paper_id}.md"
    post = frontmatter.Post(content, **metadata)
    post.metadata.update(
        UnifiedVaultEntry(
            entry_id=paper_id,
            entry_type="paper",
            title=str(metadata.get("title", "") or paper_id),
            summary="",
            source_url=str(metadata.get("doi", "") or ""),
            source_platform="literature",
            source_module="literature-importer",
            authors=[str(metadata.get("authors", "")).strip()] if isinstance(metadata.get("authors"), str) else metadata.get("authors", []),
            published=str(metadata.get("year", "") or ""),
            tags=metadata.get("tags", []),
            obsidian_path=f"Literature/{paper_id}.md",
            metadata={"abo-type": str(metadata.get("abo-type", "literature"))},
        ).to_metadata()
    )
    md_path.write_text(frontmatter.dumps(post), encoding="utf-8")


def _award_import_xp(vault_path: str) -> None:
    award_xp(vault_path, "literature-search", 5)
    from abo.game.state import increment_stat
    from abo.game.achievements import check_and_unlock
    increment_stat(vault_path, "papers_imported")
    increment_stat(vault_path, "active_days")
    check_and_unlock(vault_path)


# ── Digest level upgrade ──────────────────────────────────────────────────────

DIGEST_XP = {1: 15, 2: 40, 3: 80, 4: 120}

def upgrade_digest(vault_path: str, paper_id: str, target_level: int) -> dict:
    """Upgrade digest level: update frontmatter + award XP."""
    lit_dir = Path(vault_path) / "Literature"
    md_path = lit_dir / f"{paper_id}.md"
    if not md_path.exists():
        raise FileNotFoundError(paper_id)

    post = frontmatter.load(str(md_path))
    current = int(post.get("digest-level", 0))
    if target_level <= current:
        return {"paper_id": paper_id, "digest_level": current, "xp_awarded": 0}

    post["digest-level"] = target_level
    xp = DIGEST_XP.get(target_level, 20)
    post["abo-xp"] = int(post.get("abo-xp", 0)) + xp
    md_path.write_text(frontmatter.dumps(post), encoding="utf-8")

    from abo.literature.indexer import update_digest_level
    update_digest_level(vault_path, paper_id, target_level)
    award_xp(vault_path, "critical-reading", xp)

    # Track digest stats
    from abo.game.state import increment_stat
    from abo.game.achievements import check_and_unlock
    if target_level >= 2:
        increment_stat(vault_path, "papers_digested_lv2_plus")
    check_and_unlock(vault_path)

    return {"paper_id": paper_id, "digest_level": target_level, "xp_awarded": xp}
