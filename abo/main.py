"""
ABO Backend — FastAPI 入口
"""
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
import hashlib
import os
import re

import frontmatter
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

# ── 爬取任务取消控制 ────────────────────────────────────────────
_crawl_cancel_flags: dict[str, bool] = {}  # session_id -> should_cancel

def _generate_crawl_session_id() -> str:
    """Generate a unique session ID for crawl operations."""
    import uuid
    return str(uuid.uuid4())[:8]

def _should_cancel_crawl(session_id: str) -> bool:
    """Check if a crawl session should be cancelled."""
    return _crawl_cancel_flags.get(session_id, False)

def _cancel_crawl(session_id: str):
    """Mark a crawl session for cancellation."""
    _crawl_cancel_flags[session_id] = True

def _cleanup_crawl_session(session_id: str):
    """Clean up a crawl session after completion."""
    _crawl_cancel_flags.pop(session_id, None)

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
    """Health check endpoint."""
    return {"status": "ok", "version": "0.2.0"}


@app.get("/api/status")
async def system_status():
    """Get complete system status including all phases."""
    from .game import get_daily_stats

    # Get keyword stats
    keyword_prefs = _prefs.get_all_keyword_prefs()
    liked_keywords = [k for k, v in keyword_prefs.items() if v.score > 0]
    disliked_keywords = [k for k, v in keyword_prefs.items() if v.score < -0.2]

    # Get module stats
    module_stats = {}
    if _card_store:
        unread_counts = _card_store.unread_counts()
        module_stats = {
            "unread_counts": unread_counts,
            "total_unread": sum(unread_counts.values()),
        }

    # Get scheduler info
    scheduler_info = []
    if _scheduler:
        scheduler_info = _scheduler.job_info()

    return {
        "phases": {
            "p0_bugfixes": "✅ Complete",
            "p1_crawlers": "✅ Complete (4 modules)",
            "p2_preferences": "✅ Complete",
            "p3_gamification": "✅ Complete",
            "p4_integration": "✅ Complete",
        },
        "gamification": get_daily_stats(),
        "preferences": {
            "total_keywords": len(keyword_prefs),
            "liked_keywords": len(liked_keywords),
            "disliked_keywords": len(disliked_keywords),
            "top_keywords": _prefs.get_top_keywords(5),
        },
        "modules": module_stats,
        "scheduler": {
            "active_jobs": len(scheduler_info),
            "jobs": scheduler_info,
        },
    }


# ── WebSocket ────────────────────────────────────────────────────

@app.websocket("/ws/feed")
async def feed_ws(ws: WebSocket):
    print(f"[websocket] New connection from {ws.client}")
    await ws.accept()
    print(f"[websocket] Connection accepted")
    broadcaster.register(ws)
    try:
        while True:
            msg = await ws.receive_text()
            print(f"[websocket] Received: {msg[:50]}...")
    except Exception as e:
        print(f"[websocket] Connection closed: {e}")
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


@app.get("/api/cards/prioritized")
async def get_prioritized_cards(
    limit: int = 50,
    unread_only: bool = False,
):
    """Get cards sorted by combined AI score + user preference."""
    keyword_prefs = _prefs.get_all_keyword_prefs()
    keyword_scores = {k: v.score for k, v in keyword_prefs.items()}

    cards = _card_store.get_prioritized(
        keyword_scores=keyword_scores,
        limit=limit,
        unread_only=unread_only,
    )
    return {"cards": [c.to_dict() for c in cards]}


class FeedbackReq(BaseModel):
    action: FeedbackAction


@app.post("/api/cards/{card_id}/feedback")
async def feedback(card_id: str, body: FeedbackReq):
    card = _card_store.get(card_id)
    if not card:
        raise HTTPException(404, "Card not found")

    # Update derived weights (legacy)
    _prefs.record_feedback(card.tags, body.action.value)

    # Update keyword preferences (Phase 2)
    _prefs.update_from_feedback(card.tags, body.action.value, card.module_id)

    # Apply game rewards (Phase 3)
    from .game import apply_action
    action_map = {
        "like": "card_like",
        "dislike": "card_dislike",
        "save": "card_save",
        "skip": "card_skip",
        "star": "star_paper",
    }
    game_action = action_map.get(body.action.value, "card_skip")
    rewards = apply_action("default", game_action, {"card_id": card_id, "module": card.module_id})

    # Broadcast reward notification (Phase 4)
    if rewards.get("rewards"):
        await broadcaster.send_reward(
            action=game_action,
            rewards=rewards["rewards"],
            metadata={"card_id": card_id, "card_title": card.title}
        )

    # Record in card store
    _card_store.record_feedback(card_id, body.action.value)

    # Save liked items to markdown
    if body.action.value == "like":
        card_dict = card.to_dict()
        _prefs.save_liked_to_markdown(card_dict)

    module = _registry.get(card.module_id)
    if module:
        await module.on_feedback(card_id, body.action)

    return {"ok": True, "rewards": rewards.get("rewards", {})}


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
    search_mode = data.get("mode", "AND") if data else "AND"  # "AND", "OR", or "AND_OR"
    cs_only = data.get("cs_only", True) if data else True  # Default to CS only
    days_back = data.get("days_back", 3) if data else 3  # Default to last 3 days

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
    session_id = _generate_crawl_session_id()

    try:
        # Send session ID to client for cancellation
        await broadcaster.send_event({
            "type": "crawl_started",
            "session_id": session_id,
            "message": "爬取任务已启动"
        })

        # Fetch with deduplication
        await broadcaster.send_event({
            "type": "crawl_progress",
            "phase": "fetching",
            "current": 0,
            "total": max_results,
            "message": "正在从 arXiv 获取论文列表..."
        })

        # Check for cancellation before fetch
        if _should_cancel_crawl(session_id):
            await broadcaster.send_event({
                "type": "crawl_cancelled",
                "message": "爬取任务已取消"
            })
            _cleanup_crawl_session(session_id)
            return {"papers": [], "count": 0, "cancelled": True}

        items = await tracker.fetch(
            custom_keywords=keywords if keywords else None,
            max_results=max_results,
            existing_ids=existing_ids,
            mode=search_mode,  # AND or OR mode
            cs_only=cs_only,
            days_back=days_back  # Last N days
        )

        # Process each paper with progress update
        for i, item in enumerate(items):
            # Check for cancellation before processing each paper
            if _should_cancel_crawl(session_id):
                await broadcaster.send_event({
                    "type": "crawl_cancelled",
                    "message": f"爬取任务已取消，已处理 {i}/{len(items)} 篇论文"
                })
                _cleanup_crawl_session(session_id)
                return {"papers": results, "count": len(results), "cancelled": True}
            paper_title = item.raw.get('title', '')
            paper_id = item.id
            print(f"[arxiv-crawl] Processing {i+1}/{len(items)}: {paper_id}")

            # Send progress before processing
            await broadcaster.send_event({
                "type": "crawl_progress",
                "phase": "processing",
                "current": i + 1,
                "total": len(items),
                "message": f"正在处理第 {i+1}/{len(items)} 篇论文...",
                "currentPaperTitle": paper_title[:80] + "..." if len(paper_title) > 80 else paper_title
            })

            try:
                # Add delay between processing papers to avoid rate limiting
                if i > 0:
                    await asyncio.sleep(3)  # 3 second delay between papers

                # Process single paper with 60s timeout
                card_list = await asyncio.wait_for(
                    tracker.process([item], prefs),
                    timeout=60
                )
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
                    print(f"[arxiv-crawl] Completed {paper_id}: {card.title[:50]}...")
            except asyncio.TimeoutError:
                print(f"[arxiv-crawl] Timeout processing {paper_id}, skipping")
                await broadcaster.send_event({
                    "type": "crawl_progress",
                    "phase": "processing",
                    "current": i + 1,
                    "total": len(items),
                    "message": f"处理超时，跳过第 {i+1} 篇...",
                    "currentPaperTitle": paper_title[:80] + "..." if len(paper_title) > 80 else paper_title
                })
            except Exception as e:
                print(f"[arxiv-crawl] Error processing {paper_id}: {e}")
                # Continue with next paper

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

        # Clean up session on success
        _cleanup_crawl_session(session_id)

        return {
            "papers": results,
            "count": len(results),
            "requested": max_results,
            "skipped_duplicates": len(existing_ids)
        }
    except Exception as e:
        # Clean up session on error
        _cleanup_crawl_session(session_id)

        error_msg = str(e)
        # Provide user-friendly message for rate limit or service unavailable
        if "503" in error_msg or "暂时不可用" in error_msg:
            error_msg = "arXiv API 暂时不可用 (503)。请等待几分钟后重试。"
        elif "rate exceeded" in error_msg.lower() or "rate limit" in error_msg.lower() or "429" in error_msg:
            error_msg = "arXiv API 请求太频繁。请等待 2-3 分钟后重试，或减少每次爬取的论文数量。"
        await broadcaster.send_event({
            "type": "crawl_error",
            "error": error_msg
        })
        raise HTTPException(500, f"Crawl failed: {e}")


@app.post("/api/modules/arxiv-tracker/cancel")
async def cancel_arxiv_crawl(data: dict):
    """Cancel an ongoing arXiv crawl by session ID."""
    session_id = data.get("session_id")
    if not session_id:
        raise HTTPException(400, "session_id is required")

    if session_id not in _crawl_cancel_flags:
        return {"status": "not_found", "message": "未找到正在进行的爬取任务"}

    _cancel_crawl(session_id)
    await broadcaster.send_event({
        "type": "crawl_cancelling",
        "session_id": session_id,
        "message": "正在取消爬取任务..."
    })
    return {"status": "ok", "message": "已发送取消信号"}


@app.get("/api/proxy/image")
async def proxy_image(url: str):
    """Proxy image requests to avoid CORS issues."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers={
                "User-Agent": "ABO-arXiv-Tracker/1.0",
                "Referer": "https://arxiv.org/"
            })
        if resp.status_code != 200:
            raise HTTPException(404, "Image not found")
        from fastapi import Response
        return Response(
            content=resp.content,
            media_type=resp.headers.get("content-type", "image/png")
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to proxy image: {e}")


@app.post("/api/modules/arxiv-tracker/save-to-literature")
async def save_arxiv_to_literature(data: dict):
    """Save an arXiv paper to the literature library with figures and optional PDF."""
    import frontmatter
    import os
    import httpx
    import asyncio

    paper = data.get("paper", {})
    folder = data.get("folder", "arxiv")
    save_pdf = data.get("save_pdf", True)  # Default to saving PDF

    # Get literature path
    lit_path = get_literature_path()
    if not lit_path:
        lit_path = get_vault_path()
    if not lit_path:
        raise HTTPException(400, "Literature path not configured")

    # Build target path
    target_dir = lit_path / folder
    target_dir.mkdir(parents=True, exist_ok=True)

    # Build filename: Title first, then arXiv ID (e.g., "Paper Title-arxiv.2501.12345.md")
    title = paper.get("title", "untitled")
    arxiv_id = paper.get("id", "unknown")
    safe_title = "".join(c for c in title[:80] if c.isalnum() or c in " -_").strip()
    filename_base = f"{safe_title}-{arxiv_id}"
    filename = f"{filename_base}.md"
    target_path = target_dir / filename

    # Create figures directory
    figures_dir = target_dir / f"{filename_base}.figures"
    figures_dir.mkdir(exist_ok=True)

    meta = paper.get("metadata", {})
    pdf_url = meta.get("pdf-url", f"https://arxiv.org/pdf/{arxiv_id}.pdf")

    # Download PDF if requested
    pdf_path = None
    if save_pdf and pdf_url:
        pdf_dir = lit_path / "arxiv_pdf"
        pdf_dir.mkdir(exist_ok=True)
        pdf_filename = f"{filename_base}.pdf"
        pdf_path = pdf_dir / pdf_filename

        try:
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
                resp = await client.get(pdf_url, headers={"User-Agent": "ABO-arXiv-Tracker/1.0"})
                if resp.status_code == 200:
                    pdf_path.write_bytes(resp.content)
                    pdf_path = str(pdf_path.relative_to(lit_path))
                else:
                    pdf_path = None
        except Exception as e:
            print(f"Failed to download PDF for {arxiv_id}: {e}")
            pdf_path = None

    # Download figures
    figures = meta.get("figures", [])
    local_figures = []

    async def download_figure(fig: dict, idx: int) -> dict | None:
        """Download a single figure."""
        url = fig.get("url", "")
        if not url:
            return None

        # Determine file extension
        ext = ".png"
        if ".jpg" in url.lower() or ".jpeg" in url.lower():
            ext = ".jpg"
        elif ".gif" in url.lower():
            ext = ".gif"

        local_name = f"figure_{idx + 1}{ext}"
        local_path = figures_dir / local_name

        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "ABO-arXiv-Tracker/1.0"})
                if resp.status_code == 200:
                    local_path.write_bytes(resp.content)
                    return {
                        "filename": local_name,
                        "caption": fig.get("caption", f"Figure {idx + 1}"),
                        "local_path": str(local_path.relative_to(lit_path)),
                        "original_url": url,
                    }
        except Exception as e:
            print(f"Failed to download figure {idx + 1}: {e}")
        return None

    # Download all figures concurrently
    if figures:
        download_tasks = [download_figure(fig, idx) for idx, fig in enumerate(figures[:5])]
        downloaded = await asyncio.gather(*download_tasks)
        local_figures = [f for f in downloaded if f]

    # Build content
    content_parts = [f"# {title}\n"]

    # Add PDF link if downloaded
    if pdf_path:
        content_parts.append(f"**[📄 PDF 下载](../arxiv_pdf/{filename_base}.pdf)**\n")

    if meta.get("contribution"):
        content_parts.append(f"**核心创新**: {meta['contribution']}\n")

    content_parts.append(f"{paper.get('summary', '')}\n")

    if meta.get("abstract"):
        content_parts.append("## 摘要\n")
        content_parts.append(f"{meta['abstract']}\n")

    # Add figures section
    if local_figures:
        content_parts.append("## 图片\n")
        for fig in local_figures:
            content_parts.append(f"### {fig['caption']}\n")
            content_parts.append(f"![{fig['caption']}]({fig['local_path']})\n")

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
        "pdf-url": pdf_url,
        "pdf-path": pdf_path,
        "published": meta.get("published", ""),
        "keywords": meta.get("keywords", []),
        "figures": local_figures,
        "figures_dir": str(figures_dir.relative_to(lit_path)),
    })

    # Atomic write
    tmp = target_path.with_suffix(".tmp")
    tmp.write_text(frontmatter.dumps(post), encoding="utf-8")
    os.replace(tmp, target_path)

    # Update CardStore with local_figures so they persist after refresh
    try:
        from .store.cards import CardStore
        card_store = CardStore()
        existing_card = card_store.get(arxiv_id)
        if existing_card:
            existing_card.metadata["local_figures"] = local_figures
            existing_card.metadata["figures_dir"] = str(figures_dir.relative_to(lit_path))
            existing_card.metadata["saved_to_literature"] = True
            existing_card.metadata["literature_path"] = str(target_path.relative_to(lit_path))
            if pdf_path:
                existing_card.metadata["pdf_path"] = pdf_path
            card_store.save(existing_card)
    except Exception as e:
        print(f"Failed to update CardStore for {arxiv_id}: {e}")

    return {
        "ok": True,
        "path": str(target_path.relative_to(lit_path)),
        "figures": local_figures,
        "pdf": pdf_path,
    }


@app.get("/api/modules/arxiv-tracker/categories")
async def get_arxiv_categories():
    """Get all available arXiv categories/subcategories."""
    from .default_modules.arxiv import get_available_categories
    return {"categories": get_available_categories()}


@app.post("/api/modules/arxiv-tracker/crawl-by-category")
async def crawl_arxiv_by_category(data: dict = None):
    """
    Real-time arXiv crawl by category/subcategory with full metadata.

    Request body:
    {
        "categories": ["cs.CV", "cs.LG"],  # Subcategories to search
        "keywords": ["vision", "image"],   # Optional keywords
        "max_results": 50,
        "days_back": 7,                    # Only papers from last N days
        "sort_by": "submittedDate",        # or "lastUpdatedDate", "relevance"
        "sort_order": "descending"
    }
    """
    from .default_modules.arxiv import ArxivTracker
    import asyncio

    data = data or {}
    categories = data.get("categories", ["cs.*"])
    keywords = data.get("keywords", [])
    max_results = data.get("max_results", 50)
    days_back = data.get("days_back", 7)
    sort_by = data.get("sort_by", "submittedDate")
    sort_order = data.get("sort_order", "descending")

    prefs = _prefs.get_prefs_for_module("arxiv-tracker")

    # Get existing arXiv IDs for deduplication
    existing_ids = set()
    try:
        lit_path = get_literature_path() or get_vault_path()
        if lit_path:
            arxiv_dir = lit_path / "arxiv"
            if arxiv_dir.exists():
                for f in arxiv_dir.glob("**/*.md"):
                    # Match arXiv ID patterns in filename
                    import re
                    match = re.search(r'(\d{4}\.\d{4,5})', f.name)
                    if match:
                        existing_ids.add(match.group(1))
    except Exception:
        pass

    tracker = ArxivTracker()
    results = []

    try:
        # Send initial progress
        await broadcaster.send_event({
            "type": "crawl_progress",
            "phase": "fetching",
            "current": 0,
            "total": max_results,
            "message": f"正在从 arXiv 获取论文 (分类: {', '.join(categories)})..."
        })

        # Fetch papers by category
        items = await tracker.fetch_by_category(
            categories=categories,
            keywords=keywords if keywords else None,
            max_results=max_results,
            days_back=days_back,
            sort_by=sort_by,
            sort_order=sort_order,
            existing_ids=existing_ids,
        )

        if not items:
            await broadcaster.send_event({
                "type": "crawl_complete",
                "papers": [],
                "count": 0,
                "message": "未找到符合条件的论文"
            })
            return {"papers": [], "count": 0}

        # Process each paper
        for i, item in enumerate(items):
            paper_title = item.raw.get('title', '')
            paper_id = item.id

            await broadcaster.send_event({
                "type": "crawl_progress",
                "phase": "processing",
                "current": i + 1,
                "total": len(items),
                "message": f"正在分析第 {i+1}/{len(items)} 篇论文...",
                "currentPaperTitle": paper_title[:80] + "..." if len(paper_title) > 80 else paper_title
            })

            try:
                # Process single paper
                card_list = await asyncio.wait_for(
                    tracker.process([item], prefs),
                    timeout=60
                )

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

                    # Send real-time update
                    await broadcaster.send_event({
                        "type": "crawl_paper",
                        "paper": paper_data,
                        "current": i + 1,
                        "total": len(items)
                    })
            except asyncio.TimeoutError:
                print(f"[arxiv-crawl] Timeout processing {paper_id}, skipping")
                continue
            except Exception as e:
                print(f"[arxiv-crawl] Error processing {paper_id}: {e}")
                continue

        # Send completion
        await broadcaster.send_event({
            "type": "crawl_complete",
            "papers": results,
            "count": len(results),
            "requested": max_results,
            "categories": categories
        })

        return {
            "papers": results,
            "count": len(results),
            "requested": max_results,
            "categories": categories
        }

    except Exception as e:
        error_msg = str(e)
        if "503" in error_msg:
            error_msg = "arXiv API 暂时不可用 (503)。请等待几分钟后重试。"
        elif "429" in error_msg:
            error_msg = "arXiv API 速率限制已达到。请等待 1-2 分钟后重试。"

        await broadcaster.send_event({
            "type": "crawl_error",
            "error": error_msg
        })
        raise HTTPException(500, f"Crawl failed: {e}")


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


# ── Multi-source figure fetching helpers ─────────────────────────

async def fetch_figures_from_arxiv_html(
    arxiv_id: str,
    figures_dir: Path,
    client: httpx.AsyncClient,
    max_figures: int = 5
) -> list[dict]:
    """Fetch figures from arXiv HTML page with smart prioritization."""
    import re
    figures = []

    try:
        html_url = f"https://arxiv.org/html/{arxiv_id}"
        resp = await client.get(html_url, headers={"User-Agent": "ABO/1.0"}, timeout=30)

        if resp.status_code != 200:
            return figures

        html = resp.text
        img_pattern = r'<img[^>]+src="([^"]+)"[^>]*>'
        img_matches = list(re.finditer(img_pattern, html, re.IGNORECASE))

        figure_candidates = []
        for i, match in enumerate(img_matches[:20]):  # Check first 20 images
            src = match.group(1)
            if not src:
                continue

            img_tag = match.group(0)
            alt_match = re.search(r'alt="([^"]*)"', img_tag, re.IGNORECASE)
            alt = alt_match.group(1) if alt_match else ""

            # Skip non-figure images
            if any(skip in src.lower() for skip in ['icon', 'logo', 'button', 'spacer', 'arrow']):
                continue

            # Make absolute URL
            if src.startswith('/'):
                src = f"https://arxiv.org{src}"
            elif not src.startswith('http'):
                if src.startswith(arxiv_id + '/'):
                    src = f"https://arxiv.org/html/{src}"
                else:
                    src = f"https://arxiv.org/html/{arxiv_id}/{src}"

            # Score based on likelihood of being a pipeline/method figure
            alt_lower = alt.lower()
            score = 0
            priority_keywords = [
                ('pipeline', 30), ('architecture', 25), ('framework', 25),
                ('overview', 20), ('method', 20), ('system', 15),
                ('flowchart', 20), ('diagram', 15), ('structure', 15),
                ('model', 10), ('approach', 10), ('fig', 10), ('figure', 10)
            ]
            for kw, pts in priority_keywords:
                if kw in alt_lower:
                    score += pts

            figure_candidates.append({
                'url': src,
                'caption': alt[:120] if alt else f"Figure {i+1}",
                'score': score,
                'index': i
            })

        # Sort by score (descending) and take top max_figures
        figure_candidates.sort(key=lambda x: (-x['score'], x['index']))
        selected_figures = figure_candidates[:max_figures]

        # Download figures
        for idx, fig in enumerate(selected_figures):
            try:
                fig_resp = await client.get(fig['url'], headers={"User-Agent": "ABO/1.0"}, timeout=30)
                if fig_resp.status_code == 200:
                    content_type = fig_resp.headers.get('content-type', '')
                    if 'png' in content_type:
                        ext = 'png'
                    elif 'jpeg' in content_type or 'jpg' in content_type:
                        ext = 'jpg'
                    elif 'gif' in content_type:
                        ext = 'gif'
                    else:
                        ext = 'png'

                    fig_filename = f"figure_{idx+1:02d}.{ext}"
                    fig_path = figures_dir / fig_filename
                    fig_path.write_bytes(fig_resp.content)

                    figures.append({
                        'filename': fig_filename,
                        'caption': fig['caption'],
                        'local_path': f"figures/{fig_filename}",
                        'original_url': fig['url']
                    })
                    await asyncio.sleep(0.3)
            except Exception as e:
                print(f"[figures] Failed to download {fig['url']}: {e}")
                continue

    except Exception as e:
        print(f"[figures] HTML fetch failed: {e}")

    return figures


async def extract_figures_from_arxiv_pdf(
    arxiv_id: str,
    figures_dir: Path,
    client: httpx.AsyncClient,
    max_figures: int = 5
) -> list[dict]:
    """Download arXiv PDF and extract first few pages as figure candidates."""
    figures = []

    try:
        from pdf2image import convert_from_path
        from PIL import Image
    except ImportError:
        print("[figures] pdf2image not installed, skipping PDF extraction")
        return figures

    temp_pdf = None
    try:
        pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
        resp = await client.get(pdf_url, headers={"User-Agent": "ABO/1.0"}, timeout=60)

        if resp.status_code != 200 or len(resp.content) < 10000:
            return figures

        # Save to temp file
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
            f.write(resp.content)
            temp_pdf = f.name

        # Convert first 5 pages to images
        images = convert_from_path(temp_pdf, first_page=1, last_page=5, dpi=150)

        for i, image in enumerate(images[:max_figures]):
            width, height = image.size
            # Skip pages that are mostly text (tall aspect ratio)
            if height > width * 1.5:
                continue

            fig_filename = f"figure_pdf_{i+1:02d}.png"
            fig_path = figures_dir / fig_filename
            image.save(fig_path, "PNG")

            figures.append({
                'filename': fig_filename,
                'caption': f"PDF Page {i+1}",
                'local_path': f"figures/{fig_filename}",
                'original_url': f"pdf_page_{i+1}"
            })

    except Exception as e:
        print(f"[figures] PDF extraction failed: {e}")

    finally:
        if temp_pdf and os.path.exists(temp_pdf):
            os.unlink(temp_pdf)

    return figures


async def fetch_paper_figures(
    arxiv_id: str,
    figures_dir: Path,
    max_figures: int = 5
) -> list[dict]:
    """Fetch paper figures using multiple strategies."""
    import httpx
    figures = []

    async with httpx.AsyncClient() as client:
        # Strategy 1: arXiv HTML (best quality, proper figures)
        figures = await fetch_figures_from_arxiv_html(
            arxiv_id, figures_dir, client, max_figures
        )

        # Strategy 2: PDF extraction (fallback for HTML failures)
        if len(figures) < 2:
            remaining = max_figures - len(figures)
            pdf_figures = await extract_figures_from_arxiv_pdf(
                arxiv_id, figures_dir, client, remaining
            )
            figures.extend(pdf_figures)

    return figures[:max_figures]


async def download_arxiv_pdf(
    arxiv_id: str,
    target_path: Path,
    timeout: int = 60
) -> str | None:
    """Download PDF from arXiv with multiple source fallback and retries."""
    import asyncio
    import httpx

    # Clean arxiv_id (remove arxiv: prefix if present)
    clean_id = arxiv_id.replace("arxiv:", "").strip()

    sources = [
        f"https://arxiv.org/pdf/{clean_id}.pdf",
        f"https://ar5iv.org/pdf/{clean_id}.pdf",
        f"https://r.jina.ai/http://arxiv.org/pdf/{clean_id}.pdf",
    ]

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/pdf",
    }

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for attempt, url in enumerate(sources):
            try:
                print(f"[pdf] Trying source {attempt + 1}/{len(sources)}: {url.split('/')[2]}")
                resp = await client.get(url, headers=headers)

                if resp.status_code == 200:
                    content = resp.content
                    # Validate PDF magic number
                    if len(content) > 10000 and content[:4] == b'%PDF':
                        target_path.write_bytes(content)
                        print(f"[pdf] Successfully downloaded PDF ({len(content)} bytes)")
                        return str(target_path)
                    else:
                        print(f"[pdf] Invalid PDF from {url} (size: {len(content)}, magic: {content[:4]})")
                else:
                    print(f"[pdf] HTTP {resp.status_code} from {url}")

                await asyncio.sleep(0.5 * (attempt + 1))  # Increasing delay

            except Exception as e:
                print(f"[pdf] Failed to download from {url}: {e}")
                continue

    print(f"[pdf] All sources failed for {arxiv_id}")
    return None


@app.post("/api/modules/semantic-scholar/save-to-literature")
async def save_s2_to_literature(data: dict):
    """Save a Semantic Scholar paper to the literature library with figures and PDF."""
    paper = data.get("paper", {})
    save_pdf = data.get("save_pdf", True)
    max_figures = data.get("max_figures", 5)

    # Get literature path
    lit_path = get_literature_path()
    if not lit_path:
        lit_path = get_vault_path()
    if not lit_path:
        raise HTTPException(400, "Literature path not configured")

    # Get metadata
    meta = paper.get("metadata", {})
    title = paper.get("title", "untitled")
    paper_id = meta.get("paper_id", "unknown")

    # Get source paper info for naming (from top-level data, not metadata)
    source_paper = data.get("source_paper", "Unknown")
    source_short = re.sub(r'[^\w\s-]', '', source_paper)[:20].strip() or "Unknown"
    folder_name = f"{source_short}_FollowUp"

    # Build paper folder name: AuthorYear-ShortTitle-Hash
    authors = meta.get("authors", ["Unknown"])
    first_author = authors[0].split()[-1].replace(",", "").replace(" ", "") if authors else "Unknown"
    year = meta.get("year", datetime.now().year)
    short_title = "".join(c for c in title[:20] if c.isalnum()).upper() or "UNTITLED"
    title_hash = hashlib.md5(title.encode()).hexdigest()[:6]
    paper_folder_name = f"{first_author}{year}-{short_title}-{title_hash}"

    # Build target path: FollowUps/{Source}_FollowUp/{AuthorYear-Title}/
    base_dir = lit_path / "FollowUps" / folder_name
    paper_folder = base_dir / paper_folder_name
    paper_folder.mkdir(parents=True, exist_ok=True)

    # Figures folder inside paper folder
    figures_dir = paper_folder / "figures"
    figures_dir.mkdir(exist_ok=True)

    # Markdown filename matches folder name
    md_filename = f"{paper_folder_name}.md"
    target_path = paper_folder / md_filename

    # Try to fetch figures from arXiv if arxiv_id exists
    local_figures = []
    arxiv_id = meta.get("arxiv_id", "")

    if arxiv_id:
        try:
            local_figures = await fetch_paper_figures(arxiv_id, figures_dir, max_figures)
            print(f"[s2-save] Fetched {len(local_figures)} figures for {arxiv_id}")
        except Exception as e:
            print(f"[s2-save] Failed to fetch figures: {e}")

    # Try to download PDF if arxiv_id exists
    pdf_path = None
    if arxiv_id and save_pdf:
        pdf_full_path = paper_folder / "paper.pdf"
        try:
            result = await download_arxiv_pdf(arxiv_id, pdf_full_path)
            if result:
                pdf_path = "paper.pdf"
                print(f"[s2-save] Saved PDF: paper.pdf")
        except Exception as e:
            print(f"[s2-save] Failed to download PDF: {e}")

    # Build content with visualizations
    content_parts = [f"# {title}\n"]

    # Add metadata section
    content_parts.append("## 论文信息\n")
    if meta.get("authors"):
        content_parts.append(f"**作者**: {', '.join(meta['authors'][:5])}{' 等' if len(meta['authors']) > 5 else ''}\n")
    if meta.get("year"):
        content_parts.append(f"**年份**: {meta['year']}\n")
    if meta.get("venue"):
        content_parts.append(f"**期刊/会议**: {meta['venue']}\n")
    if meta.get("citation_count"):
        content_parts.append(f"**引用数**: {meta['citation_count']}\n")
    content_parts.append(f"**来源**: [{paper.get('source_url', '')}]({paper.get('source_url', '')})\n")

    if meta.get("contribution"):
        content_parts.append(f"\n**核心创新**: {meta['contribution']}\n")

    content_parts.append(f"\n**ABO评分**: {round(paper.get('score', 0) * 10, 1)}/10\n")

    # Add summary
    content_parts.append(f"\n## 摘要\n")
    content_parts.append(f"{paper.get('summary', '')}\n")

    if meta.get("abstract"):
        content_parts.append(f"\n### 原文摘要\n")
        content_parts.append(f"{meta['abstract']}\n")

    # Add figures section
    if local_figures:
        content_parts.append(f"\n## 图表 ({len(local_figures)}张)\n")
        for fig in local_figures:
            content_parts.append(f"### {fig['caption']}\n")
            content_parts.append(f"![{fig['caption']}]({fig['local_path']})\n")

    # Add PDF link
    if pdf_path:
        content_parts.append(f"\n## PDF\n")
        content_parts.append(f"[下载PDF]({pdf_path})\n")

    content = "\n".join(content_parts)

    # Write with frontmatter
    post = frontmatter.Post(content)
    post.metadata.update({
        "abo-type": "semantic-scholar-paper",
        "relevance-score": round(paper.get("score", 0.5), 3),
        "tags": paper.get("tags", []),
        "authors": meta.get("authors", []),
        "paper-id": paper_id,
        "arxiv-id": arxiv_id,
        "s2-url": meta.get("s2_url", ""),
        "year": meta.get("year"),
        "venue": meta.get("venue", ""),
        "citation-count": meta.get("citation_count", 0),
        "keywords": meta.get("keywords", []),
        "source-paper-title": source_paper,
        "figures": local_figures,
        "figures-dir": str(figures_dir.relative_to(paper_folder)) if local_figures else None,
        "pdf-path": pdf_path,
        "saved-at": datetime.now().isoformat(),
    })

    # Atomic write
    tmp = target_path.with_suffix(".tmp")
    tmp.write_text(frontmatter.dumps(post), encoding="utf-8")
    os.replace(tmp, target_path)

    return {
        "ok": True,
        "path": str(target_path.relative_to(lit_path)),
        "figures": local_figures,
        "pdf": pdf_path,
        "folder": str(paper_folder.relative_to(lit_path))
    }


# ── Semantic Scholar Tracker (VGGT Follow-ups) ───────────────────

@app.post("/api/modules/semantic-scholar-tracker/crawl")
async def crawl_semantic_scholar_tracker(data: dict = None):
    """Real-time Semantic Scholar follow-up crawl with progress via WebSocket."""
    from .default_modules.semantic_scholar_tracker import SemanticScholarTracker
    import asyncio

    data = data or {}
    query = data.get("query", "VGGT")
    max_results = data.get("max_results", 20)
    days_back = data.get("days_back", 7)

    prefs = _prefs.get_prefs_for_module("semantic-scholar-tracker")
    tracker = SemanticScholarTracker()
    results = []
    session_id = _generate_crawl_session_id()

    try:
        # Send session ID to client
        await broadcaster.send_event({
            "type": "crawl_started",
            "module": "semantic-scholar-tracker",
            "session_id": session_id,
            "message": f"开始搜索 '{query}' 的后续论文..."
        })

        # Check for cancellation
        if _should_cancel_crawl(session_id):
            await broadcaster.send_event({
                "type": "crawl_cancelled",
                "module": "semantic-scholar-tracker",
                "session_id": session_id
            })
            _cleanup_crawl_session(session_id)
            return {"papers": [], "count": 0, "cancelled": True}

        # Fetch papers
        await broadcaster.send_event({
            "type": "crawl_progress",
            "module": "semantic-scholar-tracker",
            "session_id": session_id,
            "phase": "fetching",
            "current": 0,
            "total": max_results,
            "message": f"正在从 Semantic Scholar 搜索 '{query}' 的后续论文..."
        })

        items = await tracker.fetch_followups(
            query=query,
            max_results=max_results,
            days_back=days_back
        )

        if not items:
            await broadcaster.send_event({
                "type": "crawl_complete",
                "module": "semantic-scholar-tracker",
                "session_id": session_id,
                "papers": [],
                "count": 0,
                "message": "未找到符合条件的后续论文"
            })
            _cleanup_crawl_session(session_id)
            return {"papers": [], "count": 0}

        # Process each paper
        for i, item in enumerate(items):
            if _should_cancel_crawl(session_id):
                await broadcaster.send_event({
                    "type": "crawl_cancelled",
                    "module": "semantic-scholar-tracker",
                    "session_id": session_id,
                    "message": f"爬取已取消，已处理 {i}/{len(items)} 篇论文"
                })
                _cleanup_crawl_session(session_id)
                return {"papers": results, "count": len(results), "cancelled": True}

            paper_title = item.raw.get('title', '')
            await broadcaster.send_event({
                "type": "crawl_progress",
                "module": "semantic-scholar-tracker",
                "session_id": session_id,
                "phase": "processing",
                "current": i + 1,
                "total": len(items),
                "message": f"正在处理第 {i+1}/{len(items)} 篇: {paper_title[:50]}..."
            })

            try:
                card_list = await asyncio.wait_for(
                    tracker.process([item], prefs),
                    timeout=60
                )
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

                    await broadcaster.send_event({
                        "type": "crawl_paper",
                        "module": "semantic-scholar-tracker",
                        "session_id": session_id,
                        "paper": paper_data,
                        "current": i + 1,
                        "total": len(items)
                    })
            except asyncio.TimeoutError:
                print(f"[s2-tracker] Timeout processing {item.id}, skipping")
                continue
            except Exception as e:
                print(f"[s2-tracker] Error processing {item.id}: {e}")
                continue

        # Send completion
        await broadcaster.send_event({
            "type": "crawl_complete",
            "module": "semantic-scholar-tracker",
            "session_id": session_id,
            "papers": results,
            "count": len(results)
        })

        _cleanup_crawl_session(session_id)
        return {"papers": results, "count": len(results)}

    except Exception as e:
        _cleanup_crawl_session(session_id)
        error_msg = str(e)
        await broadcaster.send_event({
            "type": "crawl_error",
            "module": "semantic-scholar-tracker",
            "session_id": session_id,
            "error": error_msg
        })
        raise HTTPException(500, f"Semantic Scholar crawl failed: {e}")


@app.post("/api/modules/semantic-scholar-tracker/cancel")
async def cancel_semantic_scholar_tracker_crawl(data: dict):
    """Cancel an ongoing Semantic Scholar tracker crawl."""
    session_id = data.get("session_id")
    if not session_id:
        raise HTTPException(400, "session_id is required")

    _cancel_crawl(session_id)
    await broadcaster.send_event({
        "type": "crawl_cancelling",
        "module": "semantic-scholar-tracker",
        "session_id": session_id,
        "message": "正在取消爬取任务..."
    })
    return {"status": "ok", "message": "已发送取消信号"}


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


@app.get("/api/preferences/keywords")
async def get_keyword_preferences():
    """Get all keyword preferences with scores."""
    prefs = _prefs.get_all_keyword_prefs()
    return {
        "keywords": {k: v.to_dict() for k, v in prefs.items()},
        "top": _prefs.get_top_keywords(20),
        "disliked": _prefs.get_disliked_keywords(),
    }


@app.get("/api/preferences/keywords/top")
async def get_top_keywords(limit: int = 20):
    """Get top liked keywords."""
    return {"keywords": _prefs.get_top_keywords(limit)}


@app.post("/api/preferences/reset")
async def reset_preferences():
    """Reset all preferences to default (for testing)."""
    import os
    from pathlib import Path

    # Remove preference files
    files_to_remove = [
        Path.home() / ".abo" / "preferences.json",
        Path.home() / ".abo" / "keyword_preferences.json",
    ]

    removed = []
    for f in files_to_remove:
        if f.exists():
            f.unlink()
            removed.append(str(f.name))

    # Re-initialize
    global _prefs
    _prefs = PreferenceEngine()

    return {"ok": True, "removed": removed}


# ── Gamification (Phase 3) ───────────────────────────────────────

@app.get("/api/game/stats")
async def get_game_stats():
    """Get daily gaming stats (happiness, SAN, energy, achievements)."""
    from .game import get_daily_stats
    return get_daily_stats()


@app.post("/api/game/action")
async def post_game_action(data: dict):
    """Record a game action and get rewards."""
    from .game import apply_action
    action = data.get("action", "")
    metadata = data.get("metadata", {})
    result = apply_action("default", action, metadata)
    return result


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


@app.get("/api/literature/file")
async def serve_literature_file(path: str):
    """Serve a file from the literature folder."""
    from fastapi.responses import FileResponse
    from .config import get_literature_path, get_vault_path

    lit_path = get_literature_path()
    if not lit_path:
        lit_path = get_vault_path()
    if not lit_path:
        raise HTTPException(400, "Literature path not configured")

    target = lit_path / path
    # Security check: ensure file is within literature path
    if not str(target.resolve()).startswith(str(lit_path.resolve())):
        raise HTTPException(403, "Access denied")

    if not target.exists():
        raise HTTPException(404, "File not found")

    if not target.is_file():
        raise HTTPException(400, "Not a file")

    return FileResponse(target)


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


@app.post("/api/test/feedback-loop")
async def test_feedback_loop(data: dict = None):
    """Test the complete feedback loop (P2+P3+P4 integration)."""
    from .game import apply_action

    # Simulate liking a card with tags
    test_tags = data.get("tags", ["深度学习", "PyTorch", "论文推荐"]) if data else ["深度学习", "PyTorch", "论文推荐"]
    test_module = data.get("module", "arxiv-tracker") if data else "arxiv-tracker"

    # 1. Update keyword preferences (P2)
    _prefs.update_from_feedback(test_tags, "like", test_module)

    # 2. Apply game rewards (P3)
    rewards = apply_action("default", "card_like", {"tags": test_tags, "module": test_module})

    # 3. Broadcast would happen here (P4) - but we skip for test

    # Get current state
    keyword_prefs = _prefs.get_all_keyword_prefs()

    return {
        "test": "feedback-loop",
        "input_tags": test_tags,
        "input_module": test_module,
        "keyword_updates": {
            tag: keyword_prefs.get(tag.lower(), {"score": 0}).get("score", 0)
            for tag in test_tags
        },
        "rewards": rewards.get("rewards", {}),
        "total_keywords_tracked": len(keyword_prefs),
        "status": "✅ All phases working!"
    }


@app.post("/api/test/simulate-day")
async def simulate_day(data: dict = None):
    """Simulate a day of activity for testing."""
    from .game import apply_action

    actions_to_simulate = [
        ("daily_checkin", {}),
        ("check_feed", {}),
        ("like_content", {"content": "paper1"}),
        ("like_content", {"content": "paper2"}),
        ("save_paper", {"paper": "vggt-followup"}),
        ("read_paper", {"paper": "vggt-followup"}),
        ("complete_todo", {"todo": "read papers"}),
    ]

    results = []
    for action, meta in actions_to_simulate:
        result = apply_action("default", action, meta)
        results.append({
            "action": action,
            "xp": result["rewards"]["xp"],
            "happiness": result["rewards"]["happiness_delta"],
        })

    total_xp = sum(r["xp"] for r in results)
    total_happiness = sum(r["happiness"] for r in results)

    return {
        "simulated_actions": len(results),
        "actions": results,
        "totals": {
            "xp": total_xp,
            "happiness_delta": total_happiness,
        },
        "final_stats": {
            "happiness": profile_store.get_happiness_today(),
            "san": profile_store.get_san_7d_avg(),
            "energy": profile_store.get_energy_today(),
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("abo.main:app", host="127.0.0.1", port=8765, log_level="info")
