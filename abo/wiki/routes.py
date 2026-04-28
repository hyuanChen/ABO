"""
Wiki 知识库 API 路由 — /api/wiki/{wiki_type}/*
"""
import json as _json
import subprocess
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import is_demo_mode
from ..demo.data import get_demo_wiki_pages, get_demo_wiki_graph, get_demo_wiki_stats
from ..store.papers import PaperStore
from .builder import WikiBuilder
from .store import WikiStore

router = APIRouter(prefix="/api/wiki")
_paper_store = PaperStore()

_VALID_WIKI_TYPES = {"intel", "lit"}


def _check_wiki_type(wiki_type: str) -> None:
    if wiki_type not in _VALID_WIKI_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"wiki_type 必须是 'intel' 或 'lit'，收到：{wiki_type}",
        )


def _resolve_real_wiki_vault():
    return WikiBuilder.resolve_wiki_vault()


def _should_use_demo() -> bool:
    return is_demo_mode() and _resolve_real_wiki_vault() is None


def _get_wiki_vault():
    vp = _resolve_real_wiki_vault()
    if not vp:
        raise HTTPException(
            status_code=503,
            detail="未找到可用的 Wiki Vault，请先在设置中配置可读写的 Obsidian 路径",
        )
    return vp


class SavePageRequest(BaseModel):
    title: str
    content: str
    category: str
    tags: list[str] = []
    sources: list[str] = []


class IngestRequest(BaseModel):
    source_type: str
    source_id: Optional[str] = None
    source_content: Optional[str] = None


class OpenWikiRequest(BaseModel):
    slug: Optional[str] = None


class SourceConfigRequest(BaseModel):
    folder_states: dict[str, bool]


@router.get("/{wiki_type}/index")
async def get_index(wiki_type: str):
    _check_wiki_type(wiki_type)
    if _should_use_demo():
        pages = get_demo_wiki_pages(wiki_type)
        lines = [f"# {wiki_type.upper()} Wiki\n"]
        for p in pages:
            lines.append(f"- [[{p['title']}]] — {p['category']}")
        return {"wiki_type": wiki_type, "content": "\n".join(lines)}
    vault_path = _get_wiki_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    content = WikiStore.get_index(vault_path, wiki_type)
    return {"wiki_type": wiki_type, "content": content}


@router.get("/{wiki_type}/pages")
async def list_pages(
    wiki_type: str,
    q: Optional[str] = None,
    category: Optional[str] = None,
):
    _check_wiki_type(wiki_type)
    if _should_use_demo():
        pages = get_demo_wiki_pages(wiki_type)
        if q:
            ql = q.lower()
            pages = [p for p in pages if ql in p["title"].lower() or ql in p["content"].lower()]
        if category:
            pages = [p for p in pages if p.get("category") == category]
        return {"wiki_type": wiki_type, "pages": pages, "total": len(pages)}
    vault_path = _get_wiki_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    if q:
        pages = WikiStore.search_pages(vault_path, wiki_type, q)
        if category:
            pages = [p for p in pages if p.get("category") == category]
    else:
        pages = WikiStore.list_pages(vault_path, wiki_type, category=category)
    return {"wiki_type": wiki_type, "pages": pages, "total": len(pages)}


@router.get("/{wiki_type}/page/{slug}")
async def get_page(wiki_type: str, slug: str):
    _check_wiki_type(wiki_type)
    if _should_use_demo():
        pages = get_demo_wiki_pages(wiki_type)
        page = next((p for p in pages if p["slug"] == slug), None)
        if page is None:
            raise HTTPException(status_code=404, detail=f"页面 '{slug}' 不存在")
        return page
    vault_path = _get_wiki_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    page = WikiStore.get_page(vault_path, wiki_type, slug)
    if page is None:
        raise HTTPException(status_code=404, detail=f"页面 '{slug}' 不存在")
    return page


@router.post("/{wiki_type}/page/{slug}")
async def save_page(wiki_type: str, slug: str, body: SavePageRequest):
    _check_wiki_type(wiki_type)
    vault_path = _get_wiki_vault()
    if not slug or not body.title or not body.category:
        raise HTTPException(status_code=400, detail="slug、title、category 均不能为空")
    WikiStore.ensure_structure(vault_path, wiki_type)
    result = WikiStore.save_page(
        vault_path=vault_path,
        wiki_type=wiki_type,
        slug=slug,
        title=body.title,
        content=body.content,
        category=body.category,
        tags=body.tags,
        sources=body.sources,
    )
    return {"ok": True, "page": result}


@router.delete("/{wiki_type}/page/{slug}")
async def delete_page(wiki_type: str, slug: str):
    _check_wiki_type(wiki_type)
    vault_path = _get_wiki_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    deleted = WikiStore.delete_page(vault_path, wiki_type, slug)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"页面 '{slug}' 不存在")
    return {"ok": True, "slug": slug}


@router.get("/{wiki_type}/graph")
async def get_graph(wiki_type: str):
    _check_wiki_type(wiki_type)
    if _should_use_demo():
        graph = get_demo_wiki_graph(wiki_type)
        return {"wiki_type": wiki_type, **graph}
    vault_path = _get_wiki_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    graph = WikiStore.get_graph(vault_path, wiki_type)
    return {"wiki_type": wiki_type, **graph}


@router.get("/{wiki_type}/control")
async def get_control(wiki_type: str):
    _check_wiki_type(wiki_type)
    if _should_use_demo():
        return {
            "wiki_type": wiki_type,
            "wiki_title": "Internet Wiki" if wiki_type == "intel" else "Literature Wiki",
            "has_overview": True,
            "primary_action_label": "查看示例总览",
            "workflow_hint": "当前是演示模式，切换到真实路径后可根据收藏生成自己的总览。",
            "source_summary": {
                "total_sources": 0,
                "total_discovered_sources": 0,
                "enabled_folder_count": 0,
                "disabled_folder_count": 0,
                "collections": [],
                "top_tags": [],
                "recent_sources": [],
            },
            "source_folders": [],
            "scan_roots": [],
            "source_config_updated": "",
            "reference_notes": [],
        }
    vault_path = _get_wiki_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    return WikiBuilder.describe_workspace(wiki_type, vault_path)


@router.post("/{wiki_type}/sources")
async def save_source_config(wiki_type: str, body: SourceConfigRequest):
    _check_wiki_type(wiki_type)
    vault_path = _get_wiki_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    config = WikiStore.save_source_config(vault_path, wiki_type, body.folder_states)
    control = WikiBuilder.describe_workspace(wiki_type, vault_path)
    return {
        "ok": True,
        "wiki_type": wiki_type,
        "config": config,
        "control": control,
    }


@router.post("/{wiki_type}/bootstrap")
async def bootstrap_wiki(wiki_type: str):
    _check_wiki_type(wiki_type)
    vault_path = _get_wiki_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    pages = await WikiBuilder.bootstrap(vault_path, wiki_type)
    return {
        "ok": True,
        "wiki_type": wiki_type,
        "pages_updated": len(pages),
        "pages": pages,
    }


@router.post("/{wiki_type}/open")
async def open_wiki(wiki_type: str, body: OpenWikiRequest):
    _check_wiki_type(wiki_type)
    vault_path = _get_wiki_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    vault_name = vault_path.name

    if body.slug:
        page_path = WikiStore.get_page_path(vault_path, wiki_type, body.slug)
        if page_path is None:
            raise HTTPException(status_code=404, detail=f"页面 '{body.slug}' 不存在")
        relative_path = str(page_path.relative_to(vault_path))
        subprocess.run(["open", f"obsidian://open?vault={vault_name}&file={relative_path}"], check=True)
        return {"ok": True, "slug": body.slug}

    wiki_root = WikiStore.get_wiki_root(vault_path, wiki_type)
    subprocess.run(["open", "-a", "Obsidian", str(wiki_root.resolve())], check=True)
    return {"ok": True}


@router.post("/{wiki_type}/ingest")
async def ingest(wiki_type: str, body: IngestRequest):
    _check_wiki_type(wiki_type)
    vault_path = _get_wiki_vault()

    if body.source_type not in {"card", "url", "paper", "text"}:
        raise HTTPException(
            status_code=400,
            detail="source_type 必须是 card / url / paper / text",
        )

    WikiStore.ensure_structure(vault_path, wiki_type)

    if body.source_type == "card":
        if wiki_type != "intel":
            raise HTTPException(status_code=400, detail="card 只能写入 Internet Wiki")
        card_data: dict = {
            "id": body.source_id or "unknown",
            "title": "",
            "summary": body.source_content or "",
            "tags": [],
            "source_url": "",
        }
        if body.source_content:
            try:
                parsed = _json.loads(body.source_content)
                if isinstance(parsed, dict):
                    card_data.update(parsed)
            except Exception:
                pass
        saved = await WikiBuilder.ingest_card(vault_path, card_data, wiki_type)

    elif body.source_type == "paper":
        if wiki_type != "lit":
            raise HTTPException(status_code=400, detail="paper 只能写入 Literature Wiki")
        paper_data: dict = {
            "id": body.source_id or "unknown",
            "title": "",
            "summary": "",
            "tags": [],
            "source_url": "",
            "metadata": {},
        }
        if body.source_content:
            try:
                parsed = _json.loads(body.source_content)
                if isinstance(parsed, dict):
                    paper_data.update(parsed)
            except Exception:
                paper_data["summary"] = body.source_content
        saved = await WikiBuilder.ingest_paper(vault_path, paper_data, wiki_type)
        _paper_store.upsert_from_payload(
            {
                **paper_data,
                "metadata": {
                    **(paper_data.get("metadata") or {}),
                    "wiki_ingested": True,
                    "wiki_type": wiki_type,
                    "wiki_pages": saved,
                    "saved_to_wiki": True,
                },
            },
            source_module=str(
                paper_data.get("module_id")
                or (paper_data.get("metadata") or {}).get("source_module")
                or (paper_data.get("metadata") or {}).get("source-module")
                or ""
            ) or None,
        )

    elif body.source_type == "text":
        text = body.source_content or ""
        if not text:
            raise HTTPException(
                status_code=400,
                detail="source_type=text 时必须提供 source_content",
            )
        saved = await WikiBuilder.ingest_text(vault_path, text, wiki_type)

    else:
        text = body.source_content or f"来源：{body.source_id}"
        saved = await WikiBuilder.ingest_text(vault_path, text, wiki_type)

    return {
        "ok": True,
        "wiki_type": wiki_type,
        "source_type": body.source_type,
        "pages_updated": len(saved),
        "pages": saved,
    }


@router.post("/{wiki_type}/lint")
async def lint(wiki_type: str):
    _check_wiki_type(wiki_type)
    vault_path = _get_wiki_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    result = await WikiBuilder.lint(vault_path, wiki_type)
    return {"wiki_type": wiki_type, **result}


@router.get("/{wiki_type}/backlinks/{slug}")
async def get_backlinks(wiki_type: str, slug: str):
    _check_wiki_type(wiki_type)
    if _should_use_demo():
        import re
        pages = get_demo_wiki_pages(wiki_type)
        backlinks = []
        for p in pages:
            links = re.findall(r'\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]', p["content"])
            slugs = [l.strip().lower().replace(" ", "-") for l in links]
            if slug in slugs:
                backlinks.append({"slug": p["slug"], "title": p["title"]})
        return {"wiki_type": wiki_type, "slug": slug, "backlinks": backlinks, "count": len(backlinks)}
    vault_path = _get_wiki_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    backlinks = WikiStore.get_backlinks(vault_path, wiki_type, slug)
    return {"wiki_type": wiki_type, "slug": slug, "backlinks": backlinks, "count": len(backlinks)}


@router.get("/{wiki_type}/stats")
async def get_stats(wiki_type: str):
    _check_wiki_type(wiki_type)
    if _should_use_demo():
        return get_demo_wiki_stats(wiki_type)
    vault_path = _get_wiki_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    stats = WikiStore.get_stats(vault_path, wiki_type)
    return stats
