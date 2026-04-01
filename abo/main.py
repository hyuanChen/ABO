"""
ABO Backend — FastAPI 入口
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import get_vault_path, get_literature_path, load as load_config, save as save_config
from .preferences.engine import PreferenceEngine
from .profile.routes import router as profile_router, init_routes as init_profile_routes
from .runtime.broadcaster import broadcaster
from .runtime.discovery import ModuleRegistry, start_watcher
from .runtime.runner import ModuleRunner
from .runtime.scheduler import ModuleScheduler
from .sdk.types import FeedbackAction
from .store.cards import CardStore

# ── 全局单例 ────────────────────────────────────────────────────
_registry = ModuleRegistry()
_card_store = CardStore()
_prefs = PreferenceEngine()
_scheduler: ModuleScheduler | None = None

init_profile_routes(_card_store)


def _write_sdk_readme():
    path = Path.home() / ".abo" / "sdk" / "README.md"
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "# ABO Module SDK\n\n"
        "ABO 自动发现 `~/.abo/modules/<name>/__init__.py` 中的模块。\n"
        "保存后立即热加载，无需重启。\n\n"
        "## 最小可用模块\n\n"
        "```python\n"
        "from abo.sdk import Module, Item, Card, claude_json\n\n"
        "class MyModule(Module):\n"
        "    id       = 'my-module'\n"
        "    name     = '我的模块'\n"
        "    schedule = '0 8 * * *'\n"
        "    icon     = 'rss'\n"
        "    output   = ['obsidian', 'ui']\n\n"
        "    async def fetch(self):\n"
        "        return [Item(id='1', raw={'title': '示例', 'url': ''})]\n\n"
        "    async def process(self, items, prefs):\n"
        "        result = await claude_json(\n"
        "            f'评分(1-10)并用中文总结：{items[0].raw[\"title\"]}',\n"
        "            prefs=prefs\n"
        "        )\n"
        "        return [Card(\n"
        "            id=items[0].id, title=items[0].raw['title'],\n"
        "            summary=result.get('summary', ''), score=result.get('score', 5) / 10,\n"
        "            tags=result.get('tags', []), source_url='',\n"
        "            obsidian_path='Notes/test.md'\n"
        "        )]\n"
        "```\n\n"
        "## 调度表达式示例\n\n"
        "```\n"
        "\"0 8 * * *\"      每天 08:00\n"
        "\"0 */2 * * *\"    每 2 小时\n"
        "\"*/30 * * * *\"   每 30 分钟\n"
        "```\n"
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler
    vault_path = get_vault_path()
    _registry.load_all()
    runner = ModuleRunner(_card_store, _prefs, broadcaster, vault_path)
    _scheduler = ModuleScheduler(runner)
    _scheduler.start(_registry.enabled())
    start_watcher(_registry, lambda reg: _scheduler.reschedule(reg.enabled()))
    _write_sdk_readme()
    yield
    if _scheduler:
        _scheduler.shutdown()


app = FastAPI(title="ABO Backend", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(profile_router)


# ── Health ───────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


# ── WebSocket ────────────────────────────────────────────────────

@app.websocket("/ws/feed")
async def feed_ws(ws: WebSocket):
    await ws.accept()
    broadcaster.register(ws)
    try:
        while True:
            await ws.receive_text()
    except Exception:
        broadcaster.unregister(ws)


# ── Cards ────────────────────────────────────────────────────────

@app.get("/api/cards")
async def get_cards(
    module_id: str | None = None,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
):
    cards = _card_store.list(
        module_id=module_id, unread_only=unread_only,
        limit=limit, offset=offset,
    )
    return {"cards": [c.to_dict() for c in cards]}


@app.get("/api/cards/unread-counts")
async def unread_counts():
    return _card_store.unread_counts()


class FeedbackReq(BaseModel):
    action: FeedbackAction


@app.post("/api/cards/{card_id}/feedback")
async def feedback(card_id: str, body: FeedbackReq):
    card = _card_store.get(card_id)
    if not card:
        raise HTTPException(404, "Card not found")
    _prefs.record_feedback(card.tags, body.action.value)
    _card_store.record_feedback(card_id, body.action.value)
    module = _registry.get(card.module_id)
    if module:
        await module.on_feedback(card_id, body.action)
    return {"ok": True}


# ── Modules ──────────────────────────────────────────────────────

@app.get("/api/modules")
async def list_modules():
    job_map = {j["id"]: j for j in (_scheduler.job_info() if _scheduler else [])}
    return {
        "modules": [
            {**m.get_status(), "next_run": job_map.get(m.id, {}).get("next_run")}
            for m in _registry.all()
        ]
    }


@app.post("/api/modules/{module_id}/run")
async def run_module(module_id: str):
    if not _scheduler:
        raise HTTPException(503, "Scheduler not ready")
    ok = await _scheduler.run_now(module_id, _registry)
    if not ok:
        raise HTTPException(404, f"Module {module_id} not found")
    return {"ok": True}


@app.post("/api/modules/arxiv-tracker/crawl")
async def crawl_arxiv_live(data: dict = None):
    """Real-time arXiv crawl with keyword support, deduplication, and progress via WebSocket."""
    from .default_modules.arxiv import ArxivTracker
    import re
    import asyncio

    prefs = _prefs.get_prefs_for_module("arxiv-tracker")
    keywords = data.get("keywords", []) if data else []
    max_results = data.get("max_results", 20) if data else 20
    search_mode = data.get("mode", "AND") if data else "AND"  # "AND" or "OR"
    cs_only = data.get("cs_only", True) if data else True  # Default to CS only

    # Get existing arXiv IDs from literature library to avoid duplicates
    existing_ids = set()
    try:
        lit_path = get_literature_path()
        if not lit_path:
            lit_path = get_vault_path()
        if lit_path:
            arxiv_dir = lit_path / "arxiv"
            if arxiv_dir.exists():
                for f in arxiv_dir.glob("*.md"):
                    match = re.match(r'([\d.]+)-', f.name)
                    if match:
                        existing_ids.add(match.group(1))
    except Exception:
        pass

    tracker = ArxivTracker()
    results = []

    try:
        # Fetch with deduplication
        await broadcaster.send_event({
            "type": "crawl_progress",
            "phase": "fetching",
            "current": 0,
            "total": max_results,
            "message": "正在从 arXiv 获取论文列表..."
        })

        items = await tracker.fetch(
            custom_keywords=keywords if keywords else None,
            max_results=max_results,
            existing_ids=existing_ids,
            mode=search_mode,  # AND or OR mode
            cs_only=cs_only
        )

        # Process each paper with progress update
        for i, item in enumerate(items):
            # Send progress before processing
            await broadcaster.send_event({
                "type": "crawl_progress",
                "phase": "processing",
                "current": i + 1,
                "total": len(items),
                "message": f"正在处理第 {i+1}/{len(items)} 篇论文: {item.raw.get('title', '')[:40]}..."
            })

            card_list = await tracker.process([item], prefs)
            if card_list:
                card = card_list[0]
                paper_data = {
                    "id": card.id,
                    "title": card.title,
                    "summary": card.summary,
                    "score": card.score,
                    "tags": card.tags,
                    "source_url": card.source_url,
                    "metadata": card.metadata,
                }
                results.append(paper_data)

                # Send partial result
                await broadcaster.send_event({
                    "type": "crawl_paper",
                    "paper": paper_data,
                    "current": i + 1,
                    "total": len(items)
                })

        # Sort by published date (descending)
        results.sort(key=lambda x: x.get("metadata", {}).get("published", ""), reverse=True)

        # Send completion
        await broadcaster.send_event({
            "type": "crawl_complete",
            "papers": results,
            "count": len(results),
            "requested": max_results,
            "skipped_duplicates": len(existing_ids)
        })

        return {
            "papers": results,
            "count": len(results),
            "requested": max_results,
            "skipped_duplicates": len(existing_ids)
        }
    except Exception as e:
        await broadcaster.send_event({
            "type": "crawl_error",
            "error": str(e)
        })
        raise HTTPException(500, f"Crawl failed: {e}")


@app.post("/api/modules/arxiv-tracker/save-to-literature")
async def save_arxiv_to_literature(data: dict):
    """Save an arXiv paper to the literature library."""
    import frontmatter
    import os

    paper = data.get("paper", {})
    folder = data.get("folder", "arxiv")

    # Get literature path
    lit_path = get_literature_path()
    if not lit_path:
        lit_path = get_vault_path()
    if not lit_path:
        raise HTTPException(400, "Literature path not configured")

    # Build target path
    target_dir = lit_path / folder
    target_dir.mkdir(parents=True, exist_ok=True)

    # Build filename from title
    title = paper.get("title", "untitled")
    arxiv_id = paper.get("id", "unknown")
    safe_title = "".join(c for c in title[:50] if c.isalnum() or c in " -_").strip()
    filename = f"{arxiv_id}-{safe_title}.md"
    target_path = target_dir / filename

    # Build content
    meta = paper.get("metadata", {})
    content_parts = [f"# {title}\n"]

    if meta.get("contribution"):
        content_parts.append(f"**核心创新**: {meta['contribution']}\n")

    content_parts.append(f"{paper.get('summary', '')}\n")

    if meta.get("abstract"):
        content_parts.append("## 摘要\n")
        content_parts.append(f"{meta['abstract']}\n")

    content_parts.append(f"[原文链接]({paper.get('source_url', '')})")

    content = "\n".join(content_parts)

    # Write with frontmatter
    post = frontmatter.Post(content)
    post.metadata.update({
        "abo-type": "arxiv-paper",
        "relevance-score": round(paper.get("score", 0.5), 3),
        "tags": paper.get("tags", []),
        "authors": meta.get("authors", []),
        "arxiv-id": arxiv_id,
        "pdf-url": meta.get("pdf-url", ""),
        "published": meta.get("published", ""),
        "keywords": meta.get("keywords", []),
    })

    # Atomic write
    tmp = target_path.with_suffix(".tmp")
    tmp.write_text(frontmatter.dumps(post), encoding="utf-8")
    os.replace(tmp, target_path)

    return {"ok": True, "path": str(target_path.relative_to(lit_path))}


@app.post("/api/modules/semantic-scholar/follow-ups")
async def fetch_semantic_scholar_follow_ups(data: dict):
    """Fetch follow-up papers from Semantic Scholar for a given arXiv ID."""
    from .default_modules.semantic_scholar import SemanticScholarTracker
    import os

    arxiv_id = data.get("arxiv_id", "")
    fetch_citations = data.get("fetch_citations", True)
    fetch_references = data.get("fetch_references", False)
    limit = data.get("limit", 20)

    if not arxiv_id:
        raise HTTPException(400, "arxiv_id is required")

    tracker = SemanticScholarTracker()
    results = []

    try:
        # Send initial progress
        await broadcaster.send_event({
            "type": "s2_progress",
            "phase": "fetching",
            "current": 0,
            "total": 1,
            "message": f"正在从 Semantic Scholar 查询论文 {arxiv_id}..."
        })

        # Fetch follow-up papers
        items = await tracker.fetch(
            arxiv_id=arxiv_id,
            fetch_citations=fetch_citations,
            fetch_references=fetch_references,
            limit=limit
        )

        if not items:
            await broadcaster.send_event({
                "type": "s2_complete",
                "papers": [],
                "count": 0,
                "arxiv_id": arxiv_id
            })
            return {"papers": [], "count": 0, "arxiv_id": arxiv_id}

        prefs = _prefs.get_prefs_for_module("semantic-scholar-tracker")

        # Process each paper with progress updates
        for i, item in enumerate(items):
            await broadcaster.send_event({
                "type": "s2_progress",
                "phase": "processing",
                "current": i + 1,
                "total": len(items),
                "message": f"正在处理第 {i+1}/{len(items)} 篇相关论文: {item.raw.get('title', '')[:40]}..."
            })

            card_list = await tracker.process([item], prefs)
            if card_list:
                card = card_list[0]
                paper_data = {
                    "id": card.id,
                    "title": card.title,
                    "summary": card.summary,
                    "score": card.score,
                    "tags": card.tags,
                    "source_url": card.source_url,
                    "metadata": card.metadata,
                }
                results.append(paper_data)

                # Send partial result
                await broadcaster.send_event({
                    "type": "s2_paper",
                    "paper": paper_data,
                    "current": i + 1,
                    "total": len(items)
                })

        # Sort by citation count (descending)
        results.sort(key=lambda x: x.get("metadata", {}).get("citation_count", 0), reverse=True)

        # Send completion
        await broadcaster.send_event({
            "type": "s2_complete",
            "papers": results,
            "count": len(results),
            "arxiv_id": arxiv_id
        })

        return {
            "papers": results,
            "count": len(results),
            "arxiv_id": arxiv_id
        }

    except Exception as e:
        await broadcaster.send_event({
            "type": "s2_error",
            "error": str(e),
            "arxiv_id": arxiv_id
        })
        raise HTTPException(500, f"Semantic Scholar fetch failed: {e}")


@app.post("/api/modules/semantic-scholar/save-to-literature")
async def save_s2_to_literature(data: dict):
    """Save a Semantic Scholar paper to the literature library in a subfolder."""
    import frontmatter
    import os

    paper = data.get("paper", {})

    # Get literature path
    lit_path = get_literature_path()
    if not lit_path:
        lit_path = get_vault_path()
    if not lit_path:
        raise HTTPException(400, "Literature path not configured")

    # Get source arXiv ID for subfolder naming (first 6 letters)
    meta = paper.get("metadata", {})
    source_arxiv = meta.get("source_arxiv_id", "unknown")
    subfolder = source_arxiv[:6] if len(source_arxiv) >= 6 else source_arxiv

    # Build target path with subfolder
    target_dir = lit_path / "FollowUps" / subfolder
    target_dir.mkdir(parents=True, exist_ok=True)

    # Build filename from title
    title = paper.get("title", "untitled")
    paper_id = meta.get("paper_id", "unknown")
    safe_title = "".join(c for c in title[:50] if c.isalnum() or c in " -_").strip()
    filename = f"{paper_id}-{safe_title}.md"
    target_path = target_dir / filename

    # Build content
    content_parts = [f"# {title}\n"]

    if meta.get("contribution"):
        content_parts.append(f"**核心创新**: {meta['contribution']}\n")

    if meta.get("relationship_label"):
        content_parts.append(f"**关系**: 原论文的{meta['relationship_label']}\n")

    content_parts.append(f"{paper.get('summary', '')}\n")

    if meta.get("abstract"):
        content_parts.append("## 摘要\n")
        content_parts.append(f"{meta['abstract']}\n")

    content_parts.append(f"[原文链接]({paper.get('source_url', '')})")

    content = "\n".join(content_parts)

    # Write with frontmatter
    post = frontmatter.Post(content)
    post.metadata.update({
        "abo-type": "semantic-scholar-paper",
        "relevance-score": round(paper.get("score", 0.5), 3),
        "tags": paper.get("tags", []),
        "authors": meta.get("authors", []),
        "paper-id": paper_id,
        "s2-url": meta.get("s2_url", ""),
        "year": meta.get("year"),
        "citation-count": meta.get("citation_count", 0),
        "keywords": meta.get("keywords", []),
        "relationship": meta.get("relationship", ""),
        "source-arxiv-id": source_arxiv,
    })

    # Atomic write
    tmp = target_path.with_suffix(".tmp")
    tmp.write_text(frontmatter.dumps(post), encoding="utf-8")
    os.replace(tmp, target_path)

    return {"ok": True, "path": str(target_path.relative_to(lit_path))}


@app.patch("/api/modules/{module_id}/toggle")
async def toggle_module(module_id: str):
    module = _registry.get(module_id)
    if not module:
        raise HTTPException(404, "Module not found")
    module.enabled = not module.enabled
    return {"enabled": module.enabled}


# ── Config ───────────────────────────────────────────────────────

@app.get("/api/config")
async def get_config():
    return load_config()


@app.post("/api/config")
async def update_config(data: dict):
    save_config(data)
    return load_config()


# ── Preferences ──────────────────────────────────────────────────

@app.get("/api/preferences")
async def get_prefs():
    return _prefs.all_data()


@app.post("/api/preferences")
async def update_prefs(data: dict):
    _prefs.update(data)
    return {"ok": True}


# ── Vault Browser ────────────────────────────────────────────────

class VaultItem(BaseModel):
    name: str
    path: str
    type: str  # "folder" or "file"
    size: int | None = None
    modified: float  # timestamp


@app.get("/api/vault/browse")
async def browse_vault(path: str = ""):
    """Browse vault folder structure."""
    vault_path = get_vault_path()
    if not vault_path:
        raise HTTPException(400, "Vault not configured")
    return _browse_folder(vault_path, path)


@app.get("/api/literature/browse")
async def browse_literature(path: str = ""):
    """Browse literature folder structure. Falls back to vault path if literature_path not set."""
    from .config import get_literature_path, get_vault_path
    lit_path = get_literature_path()
    if not lit_path:
        # Fall back to vault path
        lit_path = get_vault_path()
    if not lit_path:
        raise HTTPException(400, "Literature path not configured")
    if not lit_path.exists():
        raise HTTPException(404, "Literature folder not found")
    return _browse_folder(lit_path, path)


def _browse_folder(base_path: Path, sub_path: str = ""):
    """Common logic for browsing folders."""
    target = base_path / sub_path if sub_path else base_path

    if not str(target.resolve()).startswith(str(base_path.resolve())):
        raise HTTPException(403, "Access denied")

    if not target.exists():
        raise HTTPException(404, "Path not found")

    items = []
    try:
        for item in sorted(target.iterdir()):
            if item.name.startswith("."):
                continue
            stat = item.stat()
            items.append(VaultItem(
                name=item.name,
                path=str(item.relative_to(base_path)),
                type="folder" if item.is_dir() else "file",
                size=stat.st_size if item.is_file() else None,
                modified=stat.st_mtime,
            ))
    except PermissionError:
        raise HTTPException(403, "Permission denied")

    return {"items": items, "current_path": sub_path}


@app.post("/api/vault/open")
async def open_vault_item(data: dict):
    """Open file or folder with system default application."""
    import subprocess
    vault_path = get_vault_path()
    if not vault_path:
        raise HTTPException(400, "Vault not configured")
    return _open_in_finder(vault_path, data.get("path", ""))


@app.post("/api/literature/open")
async def open_literature_item(data: dict):
    """Open file or folder in literature folder with system default. Falls back to vault path."""
    from .config import get_literature_path, get_vault_path
    lit_path = get_literature_path()
    if not lit_path:
        # Fall back to vault path
        lit_path = get_vault_path()
    if not lit_path:
        raise HTTPException(400, "Literature path not configured")
    return _open_in_finder(lit_path, data.get("path", ""))


def _open_in_finder(base_path: Path, item_path: str = ""):
    """Common logic for opening files/folders in Finder."""
    import subprocess
    target = base_path / item_path if item_path else base_path

    if not str(target.resolve()).startswith(str(base_path.resolve())):
        raise HTTPException(403, "Access denied")

    if not target.exists():
        raise HTTPException(404, "Path not found")

    try:
        subprocess.run(["open", str(target.resolve())], check=True)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, f"Failed to open: {e}")


@app.post("/api/vault/open-obsidian")
async def open_in_obsidian(data: dict = None):
    """Open vault or specific file in Obsidian app."""
    import subprocess
    vault_path = get_vault_path()
    if not vault_path:
        raise HTTPException(400, "Vault not configured")

    item_path = data.get("path", "") if data else ""
    target = Path(vault_path) / item_path if item_path else Path(vault_path)

    # Security check
    if not str(target.resolve()).startswith(str(Path(vault_path).resolve())):
        raise HTTPException(403, "Access denied")

    try:
        # Use 'open' with Obsidian app bundle ID
        # Try to open the specific file/folder with Obsidian
        if target.is_file():
            # For files, use obsidian:// url scheme via 'open'
            vault_name = Path(vault_path).name
            relative_path = str(target.relative_to(vault_path))
            url = f"obsidian://open?vault={vault_name}&file={relative_path}"
            subprocess.run(["open", url], check=True)
        else:
            # For folders, just open the vault
            subprocess.run(["open", "-a", "Obsidian", str(target.resolve())], check=True)
        return {"ok": True}
    except Exception as e:
        # Fallback: try to just open Obsidian app
        try:
            subprocess.run(["open", "-a", "Obsidian"], check=True)
            return {"ok": True}
        except:
            raise HTTPException(500, f"Failed to open Obsidian: {e}")


@app.post("/api/literature/open-obsidian")
async def open_literature_in_obsidian(data: dict = None):
    """Open literature folder in Obsidian app."""
    import subprocess
    from .config import get_literature_path, get_vault_path

    lit_path = get_literature_path()
    if not lit_path:
        # Fall back to vault path
        lit_path = get_vault_path()
    if not lit_path:
        raise HTTPException(400, "Literature path not configured")

    item_path = data.get("path", "") if data else ""
    target = lit_path / item_path if item_path else lit_path

    # Security check
    if not str(target.resolve()).startswith(str(lit_path.resolve())):
        raise HTTPException(403, "Access denied")

    try:
        # Open the literature folder with Obsidian
        subprocess.run(["open", "-a", "Obsidian", str(target.resolve())], check=True)
        return {"ok": True}
    except Exception as e:
        # Fallback: try to just open Obsidian app
        try:
            subprocess.run(["open", "-a", "Obsidian"], check=True)
            return {"ok": True}
        except:
            raise HTTPException(500, f"Failed to open Obsidian: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("abo.main:app", host="127.0.0.1", port=8765, log_level="info")
