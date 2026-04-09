"""
Wiki 知识库 API 路由 — /api/wiki/{wiki_type}/*
"""
import json as _json
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import get_vault_path, is_demo_mode
from ..demo.data import get_demo_wiki_pages, get_demo_wiki_graph, get_demo_wiki_stats
from .builder import WikiBuilder
from .store import WikiStore

router = APIRouter(prefix="/api/wiki")

_VALID_WIKI_TYPES = {"intel", "lit"}


def _check_wiki_type(wiki_type: str) -> None:
    if wiki_type not in _VALID_WIKI_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"wiki_type 必须是 'intel' 或 'lit'，收到：{wiki_type}",
        )


def _get_vault():
    vp = get_vault_path()
    if not vp:
        raise HTTPException(
            status_code=503,
            detail="Vault 路径未配置，请先在设置中指定 Obsidian Vault 路径",
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


@router.get("/{wiki_type}/index")
async def get_index(wiki_type: str):
    _check_wiki_type(wiki_type)
    if is_demo_mode():
        pages = get_demo_wiki_pages(wiki_type)
        lines = [f"# {wiki_type.upper()} Wiki\n"]
        for p in pages:
            lines.append(f"- [[{p['title']}]] — {p['category']}")
        return {"wiki_type": wiki_type, "content": "\n".join(lines)}
    vault_path = _get_vault()
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
    if is_demo_mode():
        pages = get_demo_wiki_pages(wiki_type)
        if q:
            ql = q.lower()
            pages = [p for p in pages if ql in p["title"].lower() or ql in p["content"].lower()]
        if category:
            pages = [p for p in pages if p.get("category") == category]
        return {"wiki_type": wiki_type, "pages": pages, "total": len(pages)}
    vault_path = _get_vault()
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
    if is_demo_mode():
        pages = get_demo_wiki_pages(wiki_type)
        page = next((p for p in pages if p["slug"] == slug), None)
        if page is None:
            raise HTTPException(status_code=404, detail=f"页面 '{slug}' 不存在")
        return page
    vault_path = _get_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    page = WikiStore.get_page(vault_path, wiki_type, slug)
    if page is None:
        raise HTTPException(status_code=404, detail=f"页面 '{slug}' 不存在")
    return page


@router.post("/{wiki_type}/page/{slug}")
async def save_page(wiki_type: str, slug: str, body: SavePageRequest):
    _check_wiki_type(wiki_type)
    vault_path = _get_vault()
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
    vault_path = _get_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    deleted = WikiStore.delete_page(vault_path, wiki_type, slug)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"页面 '{slug}' 不存在")
    return {"ok": True, "slug": slug}


@router.get("/{wiki_type}/graph")
async def get_graph(wiki_type: str):
    _check_wiki_type(wiki_type)
    if is_demo_mode():
        graph = get_demo_wiki_graph(wiki_type)
        return {"wiki_type": wiki_type, **graph}
    vault_path = _get_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    graph = WikiStore.get_graph(vault_path, wiki_type)
    return {"wiki_type": wiki_type, **graph}


@router.post("/{wiki_type}/ingest")
async def ingest(wiki_type: str, body: IngestRequest):
    _check_wiki_type(wiki_type)
    vault_path = _get_vault()

    if body.source_type not in {"card", "url", "paper", "text"}:
        raise HTTPException(
            status_code=400,
            detail="source_type 必须是 card / url / paper / text",
        )

    WikiStore.ensure_structure(vault_path, wiki_type)

    if body.source_type == "card":
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
    vault_path = _get_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    result = await WikiBuilder.lint(vault_path, wiki_type)
    return {"wiki_type": wiki_type, **result}


@router.get("/{wiki_type}/backlinks/{slug}")
async def get_backlinks(wiki_type: str, slug: str):
    _check_wiki_type(wiki_type)
    if is_demo_mode():
        import re
        pages = get_demo_wiki_pages(wiki_type)
        backlinks = []
        for p in pages:
            links = re.findall(r'\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]', p["content"])
            slugs = [l.strip().lower().replace(" ", "-") for l in links]
            if slug in slugs:
                backlinks.append({"slug": p["slug"], "title": p["title"]})
        return {"wiki_type": wiki_type, "slug": slug, "backlinks": backlinks, "count": len(backlinks)}
    vault_path = _get_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    backlinks = WikiStore.get_backlinks(vault_path, wiki_type, slug)
    return {"wiki_type": wiki_type, "slug": slug, "backlinks": backlinks, "count": len(backlinks)}


@router.get("/{wiki_type}/stats")
async def get_stats(wiki_type: str):
    _check_wiki_type(wiki_type)
    if is_demo_mode():
        return get_demo_wiki_stats(wiki_type)
    vault_path = _get_vault()
    WikiStore.ensure_structure(vault_path, wiki_type)
    stats = WikiStore.get_stats(vault_path, wiki_type)
    return stats
