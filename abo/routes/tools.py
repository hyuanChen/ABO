"""工具 API 路由"""

import json
import os
import asyncio
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from abo.tools.xiaohongshu import (
    xiaohongshu_search,
    xiaohongshu_analyze_trends,
    xiaohongshu_fetch_comments,
    xiaohongshu_verify_cookie,
)
from abo.tools.xhs_crawler import (
    analyze_saved_xhs_authors,
    crawl_xhs_albums_incremental,
    crawl_xhs_note_to_vault,
    list_xhs_album_previews,
)
from abo.tools.bilibili import (
    bilibili_fetch_followed,
    bilibili_fetch_followed_ups,
    bilibili_verify_sessdata,
)
from abo.tools.bilibili_crawler import (
    crawl_selected_favorites_to_vault,
    crawl_bilibili_to_vault,
    export_bilibili_cookies_auto,
    fetch_favorite_folder_previews,
    resolve_cookie_header,
    save_selected_dynamics_to_vault,
    verify_cookie_header,
)
from abo.tools.zhihu import (
    zhihu_search,
    zhihu_analyze_trends,
    zhihu_fetch_comments,
)
from abo.tools.arxiv_api import arxiv_api_search
from abo.config import get_abo_dir

router = APIRouter(prefix="/api/tools", tags=["tools"])
_XHS_ALBUM_TASKS: dict[str, dict] = {}
_XHS_ALBUM_ASYNC_TASKS: dict[str, asyncio.Task] = {}
_XHS_TASKS: dict[str, dict] = {}
_BILIBILI_TASKS: dict[str, dict] = {}
_XHS_TASKS_PATH = get_abo_dir() / "xhs_tasks.json"

XHS_CREATOR_GROUP_OPTIONS = [
    {"value": "research", "label": "科研学习"},
    {"value": "writing", "label": "论文写作"},
    {"value": "ai", "label": "AI工具"},
    {"value": "productivity", "label": "效率知识库"},
    {"value": "study_abroad", "label": "留学读博"},
    {"value": "lifestyle", "label": "日常生活"},
    {"value": "other", "label": "其他"},
]


def classify_xhs_creator(sample_text: str) -> list[str]:
    haystack = sample_text.lower()
    mapping = [
        ("research", ["科研", "学术", "实验", "文献", "研究", "导师", "课题", "paper"]),
        ("writing", ["论文", "写作", "投稿", "润色", "sci", "introduction", "审稿"]),
        ("ai", ["ai", "人工智能", "大模型", "chatgpt", "claude", "agent", "prompt"]),
        ("productivity", ["效率", "知识库", "obsidian", "notion", "zotero", "workflow", "时间管理"]),
        ("study_abroad", ["留学", "申请", "读博", "phd", "博士", "海外", "签证"]),
        ("lifestyle", ["vlog", "日常", "生活", "穿搭", "咖啡", "宿舍", "通勤"]),
    ]
    groups = [group for group, keywords in mapping if any(keyword in haystack for keyword in keywords)]
    return groups or ["other"]


def _mask_cookie_fields(payload: dict) -> dict:
    masked = {}
    for key, value in payload.items():
        if key == "cookie" and value:
            masked[key] = "<configured>"
        else:
            masked[key] = value
    return masked


def _summarize_xhs_task_input(kind: str, payload: dict) -> str:
    if kind == "search":
        return f"关键词: {payload.get('keyword', '')} | 排序: {payload.get('sort_by', 'likes')} | 最低点赞: {payload.get('min_likes', 0)}"
    if kind == "trends":
        return f"趋势关键词: {payload.get('keyword', '')}"
    if kind == "comments":
        return f"评论目标: {payload.get('note_id', '') or payload.get('note_url', '')} | 数量: {payload.get('max_comments', 50)}"
    if kind == "following-feed":
        return f"关注流关键词: {', '.join(payload.get('keywords', []))} | 上限: {payload.get('max_notes', 50)}"
    if kind == "crawl-note":
        return f"单条入库: {payload.get('url', '')}"
    if kind == "crawl-batch":
        urls = payload.get("urls", [])
        return f"批量入库: {len(urls)} 条链接"
    if kind == "author-candidates":
        return f"作者候选分析 | 回查ID: {'开' if payload.get('resolve_author_ids', True) else '关'} | 限制: {payload.get('resolve_limit', 12)}"
    return kind


def _create_xhs_task(kind: str, input_payload: dict | None = None) -> str:
    task_id = uuid.uuid4().hex
    safe_payload = _mask_cookie_fields(input_payload or {})
    _XHS_TASKS[task_id] = {
        "task_id": task_id,
        "kind": kind,
        "status": "running",
        "stage": "任务已创建",
        "result": None,
        "error": None,
        "input": safe_payload,
        "input_summary": _summarize_xhs_task_input(kind, safe_payload),
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    _save_xhs_tasks()
    return task_id


def _update_xhs_task(task_id: str, **payload):
    if task_id in _XHS_TASKS:
        _XHS_TASKS[task_id].update(payload)
        _XHS_TASKS[task_id]["updated_at"] = datetime.utcnow().isoformat()
        _save_xhs_tasks()


def _save_xhs_tasks() -> None:
    _XHS_TASKS_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"tasks": list(_XHS_TASKS.values())[-200:]}
    tmp = _XHS_TASKS_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, _XHS_TASKS_PATH)


def _load_xhs_tasks() -> None:
    if not _XHS_TASKS_PATH.exists():
        return
    try:
        data = json.loads(_XHS_TASKS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return
    tasks = data.get("tasks", [])
    for task in tasks[-200:]:
        if not isinstance(task, dict) or not task.get("task_id"):
            continue
        if task.get("status") == "running":
            task["status"] = "interrupted"
            task["stage"] = "应用重启后中断"
            task["error"] = task.get("error") or "后台进程已重启，未完成任务无法自动续跑"
            task["updated_at"] = datetime.utcnow().isoformat()
        _XHS_TASKS[str(task["task_id"])] = task


_load_xhs_tasks()


class SearchRequest(BaseModel):
    keyword: str
    max_results: int = 20
    min_likes: int = 100
    sort_by: str = "likes"  # likes, time
    cookie: Optional[str] = None  # 小红书登录 Cookie


class CommentsRequest(BaseModel):
    note_id: str
    note_url: Optional[str] = None
    max_comments: int = 50
    sort_by: str = "likes"
    cookie: Optional[str] = None


class XHSCrawlNoteRequest(BaseModel):
    url: str
    cookie: Optional[str] = None
    include_images: bool = False
    include_video: bool = False
    include_live_photo: bool = False
    include_comments: bool = False
    include_sub_comments: bool = False
    comments_limit: int = 20
    use_cdp: bool = True
    cdp_port: int = 9222
    vault_path: Optional[str] = None


class XHSCrawlBatchRequest(BaseModel):
    urls: list[str]
    cookie: Optional[str] = None
    include_images: bool = False
    include_video: bool = False
    include_live_photo: bool = False
    include_comments: bool = False
    include_sub_comments: bool = False
    comments_limit: int = 20
    use_cdp: bool = True
    cdp_port: int = 9222
    vault_path: Optional[str] = None


class XHSSavePreviewNote(BaseModel):
    id: str = ""
    title: str = "无标题"
    content: str = ""
    author: str = "未知"
    likes: int = 0
    collects: int = 0
    comments_count: int = 0
    url: str = ""
    published_at: Optional[str] = None
    cover_image: Optional[str] = None
    note_type: Optional[str] = None
    images: list[str] = []
    video_url: Optional[str] = None
    xsec_token: str = ""
    xsec_source: str = ""


class XHSSavePreviewsRequest(BaseModel):
    notes: list[XHSSavePreviewNote]
    vault_path: Optional[str] = None


class XHSAlbumListRequest(BaseModel):
    cookie: Optional[str] = None
    cdp_port: int = 9222
    background: bool = True
    allow_cdp_fallback: bool = False
    vault_path: Optional[str] = None


class XHSAlbumCrawlRequest(BaseModel):
    albums: list[dict]
    cookie: Optional[str] = None
    include_images: bool = False
    include_video: bool = False
    include_live_photo: bool = False
    include_comments: bool = False
    include_sub_comments: bool = False
    comments_limit: int = 20
    cdp_port: int = 9222
    max_notes_per_album: Optional[int] = None
    before_date: Optional[str] = None
    recent_days: Optional[int] = None
    crawl_mode: str = "incremental"
    crawl_delay_seconds: float = 8.0
    vault_path: Optional[str] = None


class XHSAuthorCandidatesRequest(BaseModel):
    cookie: Optional[str] = None
    resolve_author_ids: bool = True
    resolve_limit: int = 12
    vault_path: Optional[str] = None


class XHSAuthorSyncRequest(BaseModel):
    authors: list[dict]


class TrendsRequest(BaseModel):
    keyword: str
    cookie: Optional[str] = None


class ZhihuSearchRequest(BaseModel):
    keyword: str
    max_results: int = 20
    min_votes: int = 100
    sort_by: str = "votes"  # votes, time
    cookie: Optional[str] = None


class ZhihuCommentsRequest(BaseModel):
    content_id: str
    max_comments: int = 50
    sort_by: str = "likes"


class ZhihuTrendsRequest(BaseModel):
    keyword: str


class ArxivAPISearchRequest(BaseModel):
    keywords: list[str]
    categories: Optional[list[str]] = None
    mode: str = "OR"
    max_results: int = 50
    days_back: Optional[int] = None
    sort_by: str = "submittedDate"
    sort_order: str = "descending"


class ArxivAPISearchResponse(BaseModel):
    total: int
    papers: list[dict]
    query: str
    search_time_ms: float


@router.post("/xiaohongshu/search")
async def api_xiaohongshu_search(req: SearchRequest):
    """搜索小红书高赞内容"""
    from fastapi import HTTPException
    from abo.config import load as load_config
    try:
        result = await xiaohongshu_search(
            keyword=req.keyword,
            max_results=req.max_results,
            min_likes=req.min_likes,
            sort_by=req.sort_by,
            cookie=req.cookie or load_config().get("xiaohongshu_cookie"),
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/xiaohongshu/config")
async def get_xiaohongshu_config():
    """获取小红书工具配置（从全局配置中读取）"""
    from abo.config import load as load_config
    config = load_config()
    return {
        "cookie_configured": bool(config.get("xiaohongshu_cookie")),
        "cookie_preview": config.get("xiaohongshu_cookie", "")[:50] + "..." if config.get("xiaohongshu_cookie") else None,
    }


class CookieConfig(BaseModel):
    cookie: str


class FollowingFeedRequest(BaseModel):
    cookie: Optional[str] = None
    keywords: list[str]
    max_notes: int = 50


@router.post("/xiaohongshu/following-feed")
async def api_xiaohongshu_following_feed(req: FollowingFeedRequest):
    """获取关注列表中匹配关键词的笔记"""
    from abo.tools.xiaohongshu import XiaohongshuAPI
    from abo.config import load as load_config

    api = XiaohongshuAPI()
    try:
        notes = await api.get_following_feed_with_cookie(
            cookie=req.cookie or load_config().get("xiaohongshu_cookie"),
            keywords=req.keywords,
            max_notes=req.max_notes,
        )
        return {
            "total_found": len(notes),
            "notes": [
                {
                    "id": n.id,
                    "title": n.title,
                    "content": n.content,
                    "author": n.author,
                    "likes": n.likes,
                    "collects": n.collects,
                    "comments_count": n.comments_count,
                    "url": n.url,
                    "published_at": n.published_at.isoformat() if n.published_at else None,
                    "matched_keywords": getattr(n, 'matched_keywords', []),
                }
                for n in notes
            ]
        }
    finally:
        await api.close()


@router.post("/xiaohongshu/config")
async def set_xiaohongshu_config(config: CookieConfig):
    """保存小红书 Cookie 配置"""
    from abo.config import load as load_config, save as save_config
    existing = load_config()
    existing["xiaohongshu_cookie"] = config.cookie
    save_config(existing)
    return {
        "success": True,
        "cookie_configured": True,
        "cookie_preview": config.cookie[:50] + "..." if len(config.cookie) > 50 else config.cookie,
    }


@router.post("/xiaohongshu/config/from-browser")
async def get_cookie_from_browser():
    """从本地浏览器自动获取小红书 Cookie。优先使用 CDP，失败再尝试系统浏览器 Cookie。"""
    async def get_cookies_from_cdp(port: int = 9222) -> list[dict]:
        import httpx
        import websockets

        async with httpx.AsyncClient(timeout=5) as client:
            version = (await client.get(f"http://127.0.0.1:{port}/json/version")).json()
        browser_ws = version.get("webSocketDebuggerUrl")
        if not browser_ws:
            raise RuntimeError("CDP 调试端口未返回 webSocketDebuggerUrl")

        async with websockets.connect(browser_ws, max_size=16 * 1024 * 1024) as ws:
            await ws.send(json.dumps({"id": 1, "method": "Storage.getCookies", "params": {}}))
            while True:
                data = json.loads(await ws.recv())
                if data.get("id") == 1:
                    cookies = data.get("result", {}).get("cookies", [])
                    break

        return [
            {
                "name": item.get("name"),
                "value": item.get("value"),
                "domain": item.get("domain"),
                "path": item.get("path", "/"),
            }
            for item in cookies
            if "xiaohongshu.com" in str(item.get("domain", ""))
        ]

    def get_default_browser_order() -> list[str]:
        import subprocess

        mapping = {
            "com.microsoft.edgemac": "edge",
            "com.google.chrome": "chrome",
            "com.apple.safari": "safari",
            "org.mozilla.firefox": "firefox",
            "com.brave.browser": "brave",
            "com.brave.Browser": "brave",
        }
        order: list[str] = []
        try:
            bundle_id = subprocess.check_output(
                ["osascript", "-e", "id of app (path to default web browser)"],
                text=True,
                timeout=3,
            ).strip()
            default_name = mapping.get(bundle_id)
            if default_name:
                order.append(default_name)
        except Exception as e:
            errors.append(f"默认浏览器识别失败: {e}")

        for name in ["edge", "chrome", "chromium", "brave", "safari", "firefox", "opera"]:
            if name not in order:
                order.append(name)
        return order

    def get_cookies_from_browser_cookie3() -> tuple[list[dict], str]:
        import browser_cookie3

        cookie_list: list[dict] = []
        loaders = []
        for name in get_default_browser_order():
            loader = getattr(browser_cookie3, name, None)
            if loader:
                loaders.append((name, loader))

        seen: set[tuple[str, str, str]] = set()
        used_sources: list[str] = []
        for loader_name, loader in loaders:
            try:
                jar = loader(domain_name="xiaohongshu.com")
            except Exception as e:
                errors.append(f"{loader_name}: {e}")
                continue
            found_in_loader = 0
            for cookie in jar:
                key = (cookie.name, cookie.domain, cookie.path)
                if key in seen:
                    continue
                seen.add(key)
                found_in_loader += 1
                cookie_list.append(
                    {
                        "name": cookie.name,
                        "value": cookie.value,
                        "domain": cookie.domain,
                        "path": cookie.path,
                    }
                )
            if found_in_loader:
                used_sources.append(loader_name)
        return cookie_list, "默认浏览器" if used_sources else "浏览器 Cookie 库"

    def pick_cookie(cookie_list: list[dict], name: str) -> Optional[str]:
        for cookie in cookie_list:
            if cookie.get("name") == name:
                return cookie.get("value")
        return None

    errors: list[str] = []
    try:
        try:
            cookie_list = await get_cookies_from_cdp()
            source = "CDP 浏览器"
        except Exception as e:
            errors.append(f"CDP: {e}")
            cookie_list, source = get_cookies_from_browser_cookie3()

        if not cookie_list:
            return {
                "success": False,
                "error": "未找到小红书 Cookie。请先在本机浏览器登录 xiaohongshu.com；如果要使用 CDP，请用 --remote-debugging-port=9222 启动浏览器。",
                "debug": errors,
            }

        cookie_json = json.dumps(cookie_list, ensure_ascii=False)
        from abo.config import load as load_config, save as save_config
        existing = load_config()
        existing["xiaohongshu_cookie"] = cookie_json
        save_config(existing)

        web_session = pick_cookie(cookie_list, "web_session")
        id_token = pick_cookie(cookie_list, "id_token")

        return {
            "success": True,
            "cookie_count": len(cookie_list),
            "cookie": cookie_json,
            "cookie_preview": cookie_json[:100] + "...",
            "web_session": web_session,
            "id_token": id_token,
            "source": source,
            "message": f"成功从{source}获取 {len(cookie_list)} 个 Cookie",
            "debug": errors,
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"获取浏览器 Cookie 失败: {str(e)}",
            "debug": errors,
        }


@router.post("/xiaohongshu/comments")
async def api_xiaohongshu_comments(req: CommentsRequest):
    """获取笔记评论（按赞排序）"""
    from abo.config import load as load_config
    result = await xiaohongshu_fetch_comments(
        note_id=req.note_id,
        note_url=req.note_url,
        max_comments=req.max_comments,
        sort_by=req.sort_by,
        cookie=req.cookie or load_config().get("xiaohongshu_cookie"),
    )
    return result


@router.post("/xiaohongshu/crawl-note")
async def api_xiaohongshu_crawl_note(req: XHSCrawlNoteRequest):
    """抓取单条小红书笔记并保存到情报库 xhs 文件夹。"""
    from fastapi import HTTPException
    from abo.config import get_vault_path, load as load_config

    config = load_config()
    cookie = req.cookie or config.get("xiaohongshu_cookie")
    vault_path = req.vault_path or (str(get_vault_path()) if get_vault_path() else None)
    try:
        return await crawl_xhs_note_to_vault(
            req.url,
            cookie=cookie,
            vault_path=vault_path,
            include_images=req.include_images,
            include_video=req.include_video,
            include_live_photo=req.include_live_photo,
            include_comments=req.include_comments,
            include_sub_comments=req.include_sub_comments,
            comments_limit=req.comments_limit,
            use_cdp=req.use_cdp,
            cdp_port=req.cdp_port,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/xiaohongshu/crawl-batch")
async def api_xiaohongshu_crawl_batch(req: XHSCrawlBatchRequest):
    """批量抓取小红书笔记并保存到情报库 xhs 文件夹。"""
    from abo.config import get_vault_path, load as load_config

    config = load_config()
    cookie = req.cookie or config.get("xiaohongshu_cookie")
    vault_path = req.vault_path or (str(get_vault_path()) if get_vault_path() else None)

    results = []
    for url in req.urls:
        clean = url.strip()
        if not clean:
            continue
        try:
            result = await crawl_xhs_note_to_vault(
                clean,
                cookie=cookie,
                vault_path=vault_path,
                include_images=req.include_images,
                include_video=req.include_video,
                include_live_photo=req.include_live_photo,
                include_comments=req.include_comments,
                include_sub_comments=req.include_sub_comments,
                comments_limit=req.comments_limit,
                use_cdp=req.use_cdp,
                cdp_port=req.cdp_port,
            )
            results.append(result)
        except Exception as e:
            results.append({"success": False, "url": clean, "error": str(e)})

    return {
        "success": True,
        "total": len(results),
        "saved": sum(1 for item in results if item.get("success")),
        "failed": sum(1 for item in results if not item.get("success")),
        "results": results,
    }


def _xhs_preview_slug(text: str, fallback: str) -> str:
    import re

    clean = re.sub(r'[\\/:*?"<>|#\n\r\t]+', " ", text or "").strip()
    clean = re.sub(r"\s+", " ", clean)[:42].strip()
    return clean or fallback or "xhs-note"


def _xhs_preview_markdown(note: XHSSavePreviewNote) -> str:
    title = (note.title or "小红书笔记").strip()
    content = (note.content or "搜索预览未提供正文。").strip()
    date = (note.published_at or datetime.now().strftime("%Y-%m-%d")).split("T", 1)[0]
    images = [url for url in (note.images or []) if url]
    if note.cover_image and note.cover_image not in images:
        images.insert(0, note.cover_image)

    detail_lines = [
        f"原帖标题：{title}",
        "",
        content,
        "",
    ]
    for index, image_url in enumerate(images[:12], 1):
        detail_lines.append(f"![图{index}]({image_url})")
        detail_lines.append("")
    if note.video_url:
        detail_lines.append(f"[打开视频]({note.video_url})")
        detail_lines.append("")

    attr_lines = [
        f"- **来源**: 小红书 · {note.author or '未知'}",
        f"- **帖子ID**: {note.id or '未知'}",
        f"- **链接**: {note.url or '未知'}",
        f"- **日期**: {date}",
        f"- **类型**: {note.note_type or 'normal'}",
        f"- **互动**: {int(note.likes or 0)}赞 / {int(note.collects or 0)}收藏 / {int(note.comments_count or 0)}评论",
    ]
    if note.xsec_token:
        attr_lines.append(f"- **xsec_token**: {note.xsec_token}")
    if note.xsec_source:
        attr_lines.append(f"- **xsec_source**: {note.xsec_source}")

    def quote(lines: list[str]) -> str:
        return "\n".join([f"> {line}" if line else ">" for line in lines])

    parts = [
        f"# {title}",
        "",
        content.splitlines()[0][:160] if content else "已保存这条小红书搜索预览。",
        "",
        "**与我的关联：** 这条来自小红书搜索结果，已进入可检索的 Obsidian 流程。",
        "",
        "**值得深挖吗：** 先按搜索预览保留，后续需要完整正文时再执行详情抓取。",
        "",
        "> [!tip]- 详情",
        quote(detail_lines),
        "",
        "> [!quote]- 评论与点赞",
        quote([f"搜索预览显示：{int(note.likes or 0)}赞 / {int(note.collects or 0)}收藏 / {int(note.comments_count or 0)}评论。"]),
        "",
        "> [!info]- 笔记属性",
        quote(attr_lines),
        "",
    ]
    return "\n".join(parts).rstrip() + "\n"


@router.post("/xiaohongshu/save-previews")
async def api_xiaohongshu_save_previews(req: XHSSavePreviewsRequest):
    """把搜索结果预览直接保存到情报库 xhs 文件夹，不再回抓详情页。"""
    from abo.config import get_vault_path

    vault_path = Path(req.vault_path).expanduser() if req.vault_path else get_vault_path()
    if not vault_path:
        raise HTTPException(status_code=400, detail="未配置情报库路径，请先在设置或引导中选择情报库")

    xhs_dir = vault_path / "xhs"
    xhs_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for note in req.notes:
        try:
            note_id = note.id or uuid.uuid4().hex[:8]
            date = (note.published_at or datetime.now().strftime("%Y-%m-%d")).split("T", 1)[0]
            filename = f"{date} {_xhs_preview_slug(note.title, note_id)}.md"
            path = xhs_dir / filename
            path.write_text(_xhs_preview_markdown(note), encoding="utf-8")
            results.append({"success": True, "note_id": note_id, "title": note.title, "markdown_path": str(path)})
        except Exception as exc:
            results.append({"success": False, "note_id": note.id, "title": note.title, "error": str(exc)})

    return {
        "success": True,
        "total": len(results),
        "saved": sum(1 for item in results if item.get("success")),
        "failed": sum(1 for item in results if not item.get("success")),
        "xhs_dir": str(xhs_dir),
        "results": results,
    }


@router.post("/xiaohongshu/albums")
async def api_xiaohongshu_albums(req: XHSAlbumListRequest):
    """列出小红书收藏专辑，并带上本地增量进度。"""
    from fastapi import HTTPException
    from abo.config import get_vault_path, load as load_config

    config = load_config()
    cookie = req.cookie or config.get("xiaohongshu_cookie")
    vault_path = req.vault_path or (str(get_vault_path()) if get_vault_path() else None)
    try:
        return await list_xhs_album_previews(
            cookie=cookie,
            vault_path=vault_path,
            cdp_port=req.cdp_port,
            background=req.background,
            allow_cdp_fallback=req.allow_cdp_fallback,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/xiaohongshu/albums/start")
async def api_xiaohongshu_albums_start(req: XHSAlbumListRequest):
    """后台启动收藏专辑发现任务。"""
    from abo.config import get_vault_path, load as load_config
    import asyncio

    config = load_config()
    cookie = req.cookie or config.get("xiaohongshu_cookie")
    vault_path = req.vault_path or (str(get_vault_path()) if get_vault_path() else None)
    task_id = uuid.uuid4().hex
    _XHS_ALBUM_TASKS[task_id] = {
        "task_id": task_id,
        "status": "running",
        "stage": "任务已创建",
        "albums_total": 0,
        "result": None,
        "error": None,
        "kind": "list",
        "can_cancel": True,
    }

    def update_progress(payload: dict):
        _XHS_ALBUM_TASKS[task_id].update(payload)

    async def runner():
        try:
            result = await list_xhs_album_previews(
                cookie=cookie,
                vault_path=vault_path,
                cdp_port=req.cdp_port,
                background=req.background,
                allow_cdp_fallback=req.allow_cdp_fallback,
                progress_callback=update_progress,
            )
            _XHS_ALBUM_TASKS[task_id]["status"] = "completed"
            _XHS_ALBUM_TASKS[task_id]["stage"] = "专辑列表读取完成"
            _XHS_ALBUM_TASKS[task_id]["albums_total"] = result.get("total", 0)
            _XHS_ALBUM_TASKS[task_id]["result"] = result
            _XHS_ALBUM_TASKS[task_id]["can_cancel"] = False
        except asyncio.CancelledError:
            _XHS_ALBUM_TASKS[task_id]["status"] = "cancelled"
            _XHS_ALBUM_TASKS[task_id]["stage"] = "已中断"
            _XHS_ALBUM_TASKS[task_id]["can_cancel"] = False
        except Exception as e:
            _XHS_ALBUM_TASKS[task_id]["status"] = "failed"
            _XHS_ALBUM_TASKS[task_id]["stage"] = "读取失败"
            _XHS_ALBUM_TASKS[task_id]["error"] = str(e)
            _XHS_ALBUM_TASKS[task_id]["can_cancel"] = False
        finally:
            _XHS_ALBUM_ASYNC_TASKS.pop(task_id, None)

    _XHS_ALBUM_ASYNC_TASKS[task_id] = asyncio.create_task(runner())
    return {"success": True, "task_id": task_id}


@router.get("/xiaohongshu/albums/{task_id}")
async def api_xiaohongshu_albums_progress(task_id: str):
    task = _XHS_ALBUM_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    return task


@router.post("/xiaohongshu/albums/crawl")
async def api_xiaohongshu_albums_crawl(req: XHSAlbumCrawlRequest):
    """启动按选中的收藏专辑抓取任务。"""
    from abo.config import get_vault_path, load as load_config
    import asyncio

    config = load_config()
    cookie = req.cookie or config.get("xiaohongshu_cookie")
    vault_path = req.vault_path or (str(get_vault_path()) if get_vault_path() else None)
    task_id = uuid.uuid4().hex
    _XHS_ALBUM_TASKS[task_id] = {
        "task_id": task_id,
        "status": "running",
        "stage": "任务已创建",
        "saved": 0,
        "skipped": 0,
        "failed": 0,
        "total_albums": len(req.albums),
        "current_album": "",
        "current_album_index": 0,
        "current_note_index": 0,
        "total_notes": 0,
        "result": None,
        "error": None,
        "kind": "crawl",
        "can_cancel": True,
    }

    def update_progress(payload: dict):
        _XHS_ALBUM_TASKS[task_id].update(payload)

    async def runner():
        try:
            result = await crawl_xhs_albums_incremental(
                req.albums,
                cookie=cookie,
                vault_path=vault_path,
                include_images=req.include_images,
                include_video=req.include_video,
                include_live_photo=req.include_live_photo,
                include_comments=req.include_comments,
                include_sub_comments=req.include_sub_comments,
                comments_limit=req.comments_limit,
                cdp_port=req.cdp_port,
                max_notes_per_album=req.max_notes_per_album,
                before_date=req.before_date,
                recent_days=req.recent_days,
                crawl_mode=req.crawl_mode,
                crawl_delay_seconds=req.crawl_delay_seconds,
                progress_callback=update_progress,
            )
            _XHS_ALBUM_TASKS[task_id]["status"] = "completed"
            _XHS_ALBUM_TASKS[task_id]["stage"] = "全部完成"
            _XHS_ALBUM_TASKS[task_id]["result"] = result
            _XHS_ALBUM_TASKS[task_id]["can_cancel"] = False
        except asyncio.CancelledError:
            _XHS_ALBUM_TASKS[task_id]["status"] = "cancelled"
            _XHS_ALBUM_TASKS[task_id]["stage"] = "已中断"
            _XHS_ALBUM_TASKS[task_id]["can_cancel"] = False
        except Exception as e:
            _XHS_ALBUM_TASKS[task_id]["status"] = "failed"
            _XHS_ALBUM_TASKS[task_id]["error"] = str(e)
            _XHS_ALBUM_TASKS[task_id]["stage"] = "任务失败"
            _XHS_ALBUM_TASKS[task_id]["can_cancel"] = False
        finally:
            _XHS_ALBUM_ASYNC_TASKS.pop(task_id, None)

    _XHS_ALBUM_ASYNC_TASKS[task_id] = asyncio.create_task(runner())
    return {"success": True, "task_id": task_id}


@router.post("/xiaohongshu/albums/tasks/{task_id}/cancel")
async def api_xiaohongshu_album_task_cancel(task_id: str):
    task_state = _XHS_ALBUM_TASKS.get(task_id)
    if not task_state:
        raise HTTPException(status_code=404, detail="task not found")
    if task_state.get("status") not in {"running", "pending"}:
        return {"success": True, "status": task_state.get("status"), "message": "任务已经结束"}
    task_state["status"] = "cancelling"
    task_state["stage"] = "正在中断"
    task_state["can_cancel"] = False
    running_task = _XHS_ALBUM_ASYNC_TASKS.get(task_id)
    if running_task:
        running_task.cancel()
    return {"success": True, "status": "cancelling"}


@router.get("/xiaohongshu/albums/crawl/{task_id}")
async def api_xiaohongshu_albums_crawl_progress(task_id: str):
    task = _XHS_ALBUM_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    return task


@router.post("/xiaohongshu/authors/candidates")
async def api_xiaohongshu_author_candidates(req: XHSAuthorCandidatesRequest):
    """从本地 xhs 收藏结果聚合作者候选，并尽量回查作者 ID。"""
    from abo.config import get_vault_path, load as load_config

    config = load_config()
    vault_path = req.vault_path or (str(get_vault_path()) if get_vault_path() else None)
    return await analyze_saved_xhs_authors(
        vault_path=vault_path,
        cookie=req.cookie or config.get("xiaohongshu_cookie"),
        resolve_author_ids=req.resolve_author_ids,
        resolve_limit=req.resolve_limit,
    )


@router.post("/xiaohongshu/authors/sync")
async def api_xiaohongshu_author_sync(req: XHSAuthorSyncRequest):
    """把作者候选同步到模块管理的小红书 user_ids 订阅。"""
    from abo.main import _prefs, _subscription_store

    selected = req.authors or []
    author_ids: list[str] = []
    skipped = []
    profiles: dict[str, dict] = {}
    for item in selected:
        author_id = str(item.get("author_id") or "").strip()
        author = str(item.get("author") or "").strip()
        if not author_id:
            skipped.append({"author": author, "reason": "missing_author_id"})
            continue
        author_ids.append(author_id)
        sample_text = " ".join(
            [
                author,
                str(item.get("latest_title") or ""),
                str(item.get("source_summary") or ""),
                " ".join(item.get("sample_titles") or []),
                " ".join(item.get("sample_albums") or []),
                " ".join(item.get("sample_tags") or []),
            ]
        )
        profiles[author_id] = {
            "author": author,
            "author_id": author_id,
            "smart_groups": classify_xhs_creator(sample_text),
            "latest_title": str(item.get("latest_title") or ""),
            "sample_titles": item.get("sample_titles") or [],
            "sample_albums": item.get("sample_albums") or [],
            "sample_tags": item.get("sample_tags") or [],
            "source_summary": str(item.get("source_summary") or ""),
            "synced_at": str(uuid.uuid4()),
        }

    prefs = _prefs.all_data()
    prefs.setdefault("modules", {})
    module_prefs = prefs["modules"].setdefault("xiaohongshu-tracker", {})
    existing_ids = list(module_prefs.get("user_ids", []))
    creator_profiles = dict(module_prefs.get("creator_profiles", {}))
    disabled_creator_ids = set(str(item) for item in module_prefs.get("disabled_creator_ids", []))

    added = []
    for author_id in author_ids:
        if author_id in existing_ids:
            if author_id in profiles:
                creator_profiles[author_id] = {**creator_profiles.get(author_id, {}), **profiles[author_id]}
            disabled_creator_ids.discard(author_id)
            continue
        existing_ids.append(author_id)
        added.append(author_id)
        if author_id in profiles:
            creator_profiles[author_id] = profiles[author_id]
        disabled_creator_ids.discard(author_id)
        _subscription_store.add_subscription(
            module_id="xiaohongshu-tracker",
            sub_type="user_id",
            value=author_id,
            added_by="xhs-author-sync",
        )

    module_prefs["user_ids"] = existing_ids
    module_prefs["creator_profiles"] = creator_profiles
    module_prefs["disabled_creator_ids"] = [item for item in module_prefs.get("disabled_creator_ids", []) if str(item) in disabled_creator_ids]
    module_prefs["creator_push_enabled"] = True
    module_prefs.setdefault("creator_group_options", XHS_CREATOR_GROUP_OPTIONS)
    _prefs.update(prefs)

    return {
        "success": True,
        "added_count": len(added),
        "added_user_ids": added,
        "total_user_ids": len(existing_ids),
        "skipped": skipped,
        "creator_profiles": creator_profiles,
    }


@router.get("/xiaohongshu/tasks/{task_id}")
async def api_xiaohongshu_task_progress(task_id: str):
    task = _XHS_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    return task


@router.get("/xiaohongshu/tasks")
async def api_xiaohongshu_task_list(limit: int = 20):
    tasks = sorted(
        _XHS_TASKS.values(),
        key=lambda item: (item.get("updated_at") or item.get("created_at") or ""),
        reverse=True,
    )
    return {"tasks": tasks[: max(1, min(limit, 100))]}


@router.post("/xiaohongshu/search/start")
async def api_xiaohongshu_search_start(req: SearchRequest):
    from abo.config import load as load_config
    import asyncio

    task_id = _create_xhs_task("search", req.model_dump())

    async def runner():
        try:
            _update_xhs_task(task_id, stage="搜索小红书笔记")
            result = await xiaohongshu_search(
                keyword=req.keyword,
                max_results=req.max_results,
                min_likes=req.min_likes,
                sort_by=req.sort_by,
                cookie=req.cookie or load_config().get("xiaohongshu_cookie"),
            )
            _update_xhs_task(task_id, status="completed", stage="搜索完成", result=result)
        except Exception as e:
            _update_xhs_task(task_id, status="failed", stage="搜索失败", error=str(e))

    asyncio.create_task(runner())
    return {"success": True, "task_id": task_id}


@router.post("/xiaohongshu/trends/start")
async def api_xiaohongshu_trends_start(req: TrendsRequest):
    from abo.config import load as load_config
    import asyncio

    task_id = _create_xhs_task("trends", req.model_dump())

    async def runner():
        try:
            _update_xhs_task(task_id, stage="分析热门趋势")
            result = await xiaohongshu_analyze_trends(
                keyword=req.keyword,
                cookie=req.cookie or load_config().get("xiaohongshu_cookie"),
            )
            _update_xhs_task(task_id, status="completed", stage="趋势分析完成", result=result)
        except Exception as e:
            _update_xhs_task(task_id, status="failed", stage="趋势分析失败", error=str(e))

    asyncio.create_task(runner())
    return {"success": True, "task_id": task_id}


@router.post("/xiaohongshu/comments/start")
async def api_xiaohongshu_comments_start(req: CommentsRequest):
    from abo.config import load as load_config
    import asyncio

    task_id = _create_xhs_task("comments", req.model_dump())

    async def runner():
        try:
            _update_xhs_task(task_id, stage="抓取评论")
            result = await xiaohongshu_fetch_comments(
                note_id=req.note_id,
                note_url=req.note_url,
                max_comments=req.max_comments,
                sort_by=req.sort_by,
                cookie=req.cookie or load_config().get("xiaohongshu_cookie"),
            )
            _update_xhs_task(task_id, status="completed", stage="评论抓取完成", result=result)
        except Exception as e:
            _update_xhs_task(task_id, status="failed", stage="评论抓取失败", error=str(e))

    asyncio.create_task(runner())
    return {"success": True, "task_id": task_id}


@router.post("/xiaohongshu/following-feed/start")
async def api_xiaohongshu_following_feed_start(req: FollowingFeedRequest):
    from abo.tools.xiaohongshu import XiaohongshuAPI
    from abo.config import load as load_config
    import asyncio

    task_id = _create_xhs_task("following-feed", req.model_dump())

    async def runner():
        api = XiaohongshuAPI()
        try:
            _update_xhs_task(task_id, stage="扫描关注流")
            notes = await api.get_following_feed_with_cookie(
                cookie=req.cookie or load_config().get("xiaohongshu_cookie"),
                keywords=req.keywords,
                max_notes=req.max_notes,
            )
            result = {
                "total_found": len(notes),
                "notes": [
                    {
                        "id": n.id,
                        "title": n.title,
                        "content": n.content,
                        "author": n.author,
                        "likes": n.likes,
                        "collects": n.collects,
                        "comments_count": n.comments_count,
                        "url": n.url,
                        "published_at": n.published_at.isoformat() if n.published_at else None,
                        "matched_keywords": getattr(n, "matched_keywords", []),
                    }
                    for n in notes
                ],
            }
            _update_xhs_task(task_id, status="completed", stage="关注流扫描完成", result=result)
        except Exception as e:
            _update_xhs_task(task_id, status="failed", stage="关注流扫描失败", error=str(e))
        finally:
            await api.close()

    asyncio.create_task(runner())
    return {"success": True, "task_id": task_id}


@router.post("/xiaohongshu/crawl-note/start")
async def api_xiaohongshu_crawl_note_start(req: XHSCrawlNoteRequest):
    from abo.config import get_vault_path, load as load_config
    import asyncio

    config = load_config()
    cookie = req.cookie or config.get("xiaohongshu_cookie")
    vault_path = req.vault_path or (str(get_vault_path()) if get_vault_path() else None)
    task_id = _create_xhs_task("crawl-note", req.model_dump())

    async def runner():
        try:
            _update_xhs_task(task_id, stage="保存单条笔记到 xhs")
            result = await crawl_xhs_note_to_vault(
                req.url,
                cookie=cookie,
                vault_path=vault_path,
                include_images=req.include_images,
                include_video=req.include_video,
                include_live_photo=req.include_live_photo,
                include_comments=req.include_comments,
                include_sub_comments=req.include_sub_comments,
                comments_limit=req.comments_limit,
                use_cdp=req.use_cdp,
                cdp_port=req.cdp_port,
            )
            _update_xhs_task(task_id, status="completed", stage="单条入库完成", result=result)
        except Exception as e:
            _update_xhs_task(task_id, status="failed", stage="单条入库失败", error=str(e))

    asyncio.create_task(runner())
    return {"success": True, "task_id": task_id}


@router.post("/xiaohongshu/crawl-batch/start")
async def api_xiaohongshu_crawl_batch_start(req: XHSCrawlBatchRequest):
    from abo.config import get_vault_path, load as load_config
    import asyncio

    config = load_config()
    cookie = req.cookie or config.get("xiaohongshu_cookie")
    vault_path = req.vault_path or (str(get_vault_path()) if get_vault_path() else None)
    task_id = _create_xhs_task("crawl-batch", req.model_dump())

    async def runner():
        results: list[dict] = []
        saved = 0
        failed = 0
        total = len(req.urls)
        try:
            for index, url in enumerate(req.urls, 1):
                _update_xhs_task(task_id, stage=f"批量入库 {index}/{total}", current=index, total=total)
                try:
                    result = await crawl_xhs_note_to_vault(
                        url,
                        cookie=cookie,
                        vault_path=vault_path,
                        include_images=req.include_images,
                        include_video=req.include_video,
                        include_live_photo=req.include_live_photo,
                        include_comments=req.include_comments,
                        include_sub_comments=req.include_sub_comments,
                        comments_limit=req.comments_limit,
                        use_cdp=req.use_cdp,
                        cdp_port=req.cdp_port,
                    )
                    results.append(result)
                    saved += 1
                except Exception as item_error:
                    results.append({"success": False, "url": url, "error": str(item_error)})
                    failed += 1
            _update_xhs_task(
                task_id,
                status="completed",
                stage="批量入库完成",
                result={"success": True, "total": total, "saved": saved, "failed": failed, "results": results},
            )
        except Exception as e:
            _update_xhs_task(task_id, status="failed", stage="批量入库失败", error=str(e))

    asyncio.create_task(runner())
    return {"success": True, "task_id": task_id}


@router.post("/xiaohongshu/authors/candidates/start")
async def api_xiaohongshu_author_candidates_start(req: XHSAuthorCandidatesRequest):
    from abo.config import get_vault_path, load as load_config
    import asyncio

    config = load_config()
    vault_path = req.vault_path or (str(get_vault_path()) if get_vault_path() else None)
    task_id = _create_xhs_task("author-candidates", req.model_dump())

    async def runner():
        try:
            _update_xhs_task(task_id, stage="分析本地收藏作者")
            result = await analyze_saved_xhs_authors(
                vault_path=vault_path,
                cookie=req.cookie or config.get("xiaohongshu_cookie"),
                resolve_author_ids=req.resolve_author_ids,
                resolve_limit=req.resolve_limit,
            )
            _update_xhs_task(task_id, status="completed", stage="作者候选分析完成", result=result)
        except Exception as e:
            _update_xhs_task(task_id, status="failed", stage="作者候选分析失败", error=str(e))

    asyncio.create_task(runner())
    return {"success": True, "task_id": task_id}


@router.post("/xiaohongshu/trends")
async def api_xiaohongshu_trends(req: TrendsRequest):
    """分析小红书 Trends"""
    from abo.config import load as load_config
    result = await xiaohongshu_analyze_trends(
        keyword=req.keyword,
        cookie=req.cookie or load_config().get("xiaohongshu_cookie"),
    )
    return result


class XiaohongshuVerifyRequest(BaseModel):
    web_session: str
    id_token: Optional[str] = None


@router.post("/xiaohongshu/verify")
async def api_xiaohongshu_verify(req: XiaohongshuVerifyRequest):
    """验证小红书 web_session 是否有效"""
    result = await xiaohongshu_verify_cookie(req.web_session, req.id_token)
    return result


# ===== 哔哩哔哩工具 =====

class BilibiliFollowedRequest(BaseModel):
    sessdata: str
    keywords: list[str] = []
    dynamic_types: list[int] = [8, 2, 4, 64]  # video, image, text, article
    limit: int = 20
    days_back: int = 7


class BilibiliFollowedUpsRequest(BaseModel):
    sessdata: str
    max_count: int = 5000


class BilibiliFollowedUpsCrawlRequest(BaseModel):
    sessdata: str
    max_count: int = 5000


class BilibiliVerifyRequest(BaseModel):
    sessdata: str


class BilibiliCrawlVaultRequest(BaseModel):
    cookie: Optional[str] = None
    vault_path: Optional[str] = None
    include_dynamics: bool = True
    include_favorites: bool = True
    include_watch_later: bool = True
    dynamic_limit: int = 9
    favorite_folder_limit: int = 1
    favorite_item_limit: int = 3
    watch_later_limit: int = 3
    use_cdp: bool = True
    cdp_port: int = 9222


class BilibiliFavoriteFoldersRequest(BaseModel):
    cookie: Optional[str] = None
    use_cdp: bool = True
    cdp_port: int = 9222


class BilibiliFavoriteCrawlRequest(BaseModel):
    cookie: Optional[str] = None
    vault_path: Optional[str] = None
    folder_ids: list[str]
    crawl_mode: str = "incremental"
    item_limit: int = 20
    since_days: Optional[int] = None
    since_date: Optional[str] = None
    use_cdp: bool = True
    cdp_port: int = 9222


class BilibiliDynamicItem(BaseModel):
    id: str
    dynamic_id: str
    title: str
    content: str
    author: str
    author_id: str
    url: str
    published_at: Optional[str] = None
    dynamic_type: str
    pic: Optional[str] = None
    images: list[str] = []


class BilibiliSelectedDynamicsSaveRequest(BaseModel):
    vault_path: Optional[str] = None
    dynamics: list[BilibiliDynamicItem]


@router.post("/bilibili/followed")
async def api_bilibili_followed(req: BilibiliFollowedRequest):
    """
    获取哔哩哔哩关注列表动态（带关键词过滤）

    - sessdata: B站登录 Cookie
    - keywords: 关键词过滤列表
    - dynamic_types: [8=视频, 2=图文, 4=文字, 64=专栏]
    - limit: 最大返回数量
    - days_back: 只返回几天内的动态
    """
    result = await bilibili_fetch_followed(
        sessdata=req.sessdata,
        keywords=req.keywords if req.keywords else None,
        dynamic_types=req.dynamic_types,
        limit=req.limit,
        days_back=req.days_back,
    )
    return result


@router.post("/bilibili/followed-ups")
async def api_bilibili_followed_ups(req: BilibiliFollowedUpsRequest):
    """获取哔哩哔哩关注的 UP 列表。"""
    result = await bilibili_fetch_followed_ups(
        sessdata=req.sessdata,
        max_count=req.max_count,
    )
    return result


@router.post("/bilibili/followed-ups/crawl")
async def api_bilibili_followed_ups_crawl(req: BilibiliFollowedUpsCrawlRequest):
    """后台抓取关注 UP 列表，并返回分页进度。"""
    import asyncio

    task_id = uuid.uuid4().hex
    _BILIBILI_TASKS[task_id] = {
        "task_id": task_id,
        "kind": "followed-ups",
        "status": "running",
        "stage": "任务已创建",
        "current_page": 0,
        "page_size": 50,
        "fetched_count": 0,
        "result": None,
        "error": None,
        "updated_at": datetime.utcnow().isoformat(),
    }

    def update_progress(payload: dict):
        if task_id not in _BILIBILI_TASKS:
            return
        _BILIBILI_TASKS[task_id].update(payload)
        _BILIBILI_TASKS[task_id]["updated_at"] = datetime.utcnow().isoformat()

    async def runner():
        try:
            result = await bilibili_fetch_followed_ups(
                sessdata=req.sessdata,
                max_count=req.max_count,
                progress_callback=update_progress,
            )
            _BILIBILI_TASKS[task_id]["status"] = "completed"
            _BILIBILI_TASKS[task_id]["stage"] = "关注列表抓取完成"
            _BILIBILI_TASKS[task_id]["result"] = result
            _BILIBILI_TASKS[task_id]["updated_at"] = datetime.utcnow().isoformat()
        except Exception as e:
            _BILIBILI_TASKS[task_id]["status"] = "failed"
            _BILIBILI_TASKS[task_id]["stage"] = "关注列表抓取失败"
            _BILIBILI_TASKS[task_id]["error"] = str(e)
            _BILIBILI_TASKS[task_id]["updated_at"] = datetime.utcnow().isoformat()

    asyncio.create_task(runner())
    return {"success": True, "task_id": task_id}


@router.get("/bilibili/followed-ups/crawl/{task_id}")
async def api_bilibili_followed_ups_crawl_progress(task_id: str):
    task = _BILIBILI_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    return task


@router.post("/bilibili/verify")
async def api_bilibili_verify(req: BilibiliVerifyRequest):
    """验证 SESSDATA 是否有效"""
    result = await bilibili_verify_sessdata(req.sessdata)
    return result


@router.post("/bilibili/crawl-to-vault")
async def api_bilibili_crawl_to_vault(req: BilibiliCrawlVaultRequest):
    """抓取 Bilibili 动态、收藏夹、稍后再看到情报库 bilibili 文件夹。"""
    try:
        result = await crawl_bilibili_to_vault(
            cookie=req.cookie,
            vault_path=req.vault_path,
            include_dynamics=req.include_dynamics,
            include_favorites=req.include_favorites,
            include_watch_later=req.include_watch_later,
            dynamic_limit=req.dynamic_limit,
            favorite_folder_limit=req.favorite_folder_limit,
            favorite_item_limit=req.favorite_item_limit,
            watch_later_limit=req.watch_later_limit,
            use_cdp=req.use_cdp,
            cdp_port=req.cdp_port,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bilibili/dynamics/save-selected")
async def api_bilibili_save_selected_dynamics(req: BilibiliSelectedDynamicsSaveRequest):
    """把预览中勾选的 Bilibili 动态写入情报库。"""
    try:
        if not req.dynamics:
            raise HTTPException(status_code=400, detail="未选择任何动态")
        return save_selected_dynamics_to_vault(
            [item.model_dump() for item in req.dynamics],
            vault_path=req.vault_path,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bilibili/favorites/folders")
async def api_bilibili_favorite_folders(req: BilibiliFavoriteFoldersRequest):
    """列出 Bilibili 收藏夹，并返回每个收藏夹第一个视频封面。"""
    try:
        cookie_header = await resolve_cookie_header(req.cookie, use_cdp=req.use_cdp, cdp_port=req.cdp_port)
        if "SESSDATA=" not in cookie_header:
            raise RuntimeError("未获取到 Bilibili SESSDATA，请先登录浏览器")
        verify = await verify_cookie_header(cookie_header)
        if not verify["valid"]:
            raise RuntimeError(f"Bilibili 登录态无效: {verify}")
        folders = await fetch_favorite_folder_previews(cookie_header, mid=verify["mid"])
        return {
            "success": True,
            "folders": folders,
            "folder_count": len(folders),
            "login": verify,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bilibili/favorites/folders/crawl")
async def api_bilibili_favorite_folders_crawl(req: BilibiliFavoriteFoldersRequest):
    """后台读取收藏栏预览，返回当前步骤与已处理数量。"""
    import asyncio

    task_id = uuid.uuid4().hex
    _BILIBILI_TASKS[task_id] = {
        "task_id": task_id,
        "kind": "favorite-folders",
        "status": "running",
        "stage": "任务已创建",
        "processed_folders": 0,
        "total_folders": 0,
        "current_folder": "",
        "result": None,
        "error": None,
        "updated_at": datetime.utcnow().isoformat(),
    }

    def update_progress(payload: dict):
        if task_id not in _BILIBILI_TASKS:
            return
        _BILIBILI_TASKS[task_id].update(payload)
        _BILIBILI_TASKS[task_id]["updated_at"] = datetime.utcnow().isoformat()

    async def runner():
        try:
            cookie_header = await resolve_cookie_header(req.cookie, use_cdp=req.use_cdp, cdp_port=req.cdp_port)
            if "SESSDATA=" not in cookie_header:
                raise RuntimeError("未获取到 Bilibili SESSDATA，请先登录浏览器")
            verify = await verify_cookie_header(cookie_header)
            if not verify["valid"]:
                raise RuntimeError(f"Bilibili 登录态无效: {verify}")
            folders = await fetch_favorite_folder_previews(
                cookie_header,
                mid=verify["mid"],
                progress_callback=update_progress,
            )
            _BILIBILI_TASKS[task_id]["status"] = "completed"
            _BILIBILI_TASKS[task_id]["stage"] = "收藏栏预览读取完成"
            _BILIBILI_TASKS[task_id]["result"] = {
                "success": True,
                "folders": folders,
                "folder_count": len(folders),
                "login": verify,
            }
            _BILIBILI_TASKS[task_id]["updated_at"] = datetime.utcnow().isoformat()
        except Exception as e:
            _BILIBILI_TASKS[task_id]["status"] = "failed"
            _BILIBILI_TASKS[task_id]["stage"] = "收藏栏预览读取失败"
            _BILIBILI_TASKS[task_id]["error"] = str(e)
            _BILIBILI_TASKS[task_id]["updated_at"] = datetime.utcnow().isoformat()

    asyncio.create_task(runner())
    return {"success": True, "task_id": task_id}


@router.get("/bilibili/favorites/folders/crawl/{task_id}")
async def api_bilibili_favorite_folders_crawl_progress(task_id: str):
    task = _BILIBILI_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    return task


@router.post("/bilibili/favorites/crawl")
async def api_bilibili_crawl_favorites(req: BilibiliFavoriteCrawlRequest):
    """按选中的收藏夹增量抓取，已记录的 BV/资源不会重复写入。"""
    try:
        result = await crawl_selected_favorites_to_vault(
            cookie=req.cookie,
            vault_path=req.vault_path,
            folder_ids=req.folder_ids,
            crawl_mode=req.crawl_mode,
            item_limit=req.item_limit,
            since_days=req.since_days,
            since_date=req.since_date,
            use_cdp=req.use_cdp,
            cdp_port=req.cdp_port,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bilibili/favorites/crawl/start")
async def api_bilibili_crawl_favorites_start(req: BilibiliFavoriteCrawlRequest):
    """后台增量抓取选中的收藏夹/稍后再看，并暴露进度。"""
    import asyncio

    task_id = uuid.uuid4().hex
    _BILIBILI_TASKS[task_id] = {
        "task_id": task_id,
        "kind": "favorite-crawl",
        "status": "running",
        "stage": "任务已创建",
        "selected_folder_count": len(req.folder_ids),
        "current_step": "init",
        "current_folder": "",
        "current_page": 0,
        "fetched_count": 0,
        "saved_count": 0,
        "skipped_count": 0,
        "result": None,
        "error": None,
        "updated_at": datetime.utcnow().isoformat(),
    }

    def update_progress(payload: dict):
        if task_id not in _BILIBILI_TASKS:
            return
        _BILIBILI_TASKS[task_id].update(payload)
        _BILIBILI_TASKS[task_id]["updated_at"] = datetime.utcnow().isoformat()

    async def runner():
        try:
            result = await crawl_selected_favorites_to_vault(
                cookie=req.cookie,
                vault_path=req.vault_path,
                folder_ids=req.folder_ids,
                crawl_mode=req.crawl_mode,
                item_limit=req.item_limit,
                since_days=req.since_days,
                since_date=req.since_date,
                use_cdp=req.use_cdp,
                cdp_port=req.cdp_port,
                progress_callback=update_progress,
            )
            _BILIBILI_TASKS[task_id]["status"] = "completed"
            _BILIBILI_TASKS[task_id]["stage"] = "收藏内容入库完成"
            _BILIBILI_TASKS[task_id]["result"] = result
            _BILIBILI_TASKS[task_id]["updated_at"] = datetime.utcnow().isoformat()
        except Exception as e:
            _BILIBILI_TASKS[task_id]["status"] = "failed"
            _BILIBILI_TASKS[task_id]["stage"] = "收藏内容入库失败"
            _BILIBILI_TASKS[task_id]["error"] = str(e)
            _BILIBILI_TASKS[task_id]["updated_at"] = datetime.utcnow().isoformat()

    asyncio.create_task(runner())
    return {"success": True, "task_id": task_id}


@router.get("/bilibili/favorites/crawl/{task_id}")
async def api_bilibili_crawl_favorites_progress(task_id: str):
    task = _BILIBILI_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    return task


@router.post("/bilibili/debug")
async def api_bilibili_debug(req: BilibiliVerifyRequest):
    """
    调试端点：直接测试 Bilibili API 并返回原始响应
    用于诊断为什么获取不到关注动态
    """
    import httpx

    DYNAMIC_API = "https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/dynamic_new"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": f"SESSDATA={req.sessdata}",
        "Referer": "https://t.bilibili.com/",
    }

    results = {}

    async with httpx.AsyncClient(timeout=30) as client:
        # 测试 1: type_list=8 (仅视频)
        try:
            resp1 = await client.get(DYNAMIC_API, params={"type_list": 8}, headers=headers)
            data1 = resp1.json()
            results["video_only"] = {
                "status_code": resp1.status_code,
                "code": data1.get("code"),
                "message": data1.get("message"),
                "cards_count": len(data1.get("data", {}).get("cards", [])),
            }
        except Exception as e:
            results["video_only"] = {"error": str(e)}

        # 测试 2: type_list=268435455 (全部)
        try:
            resp2 = await client.get(DYNAMIC_API, params={"type_list": 268435455}, headers=headers)
            data2 = resp2.json()
            cards = data2.get("data", {}).get("cards", [])
            results["all_types"] = {
                "status_code": resp2.status_code,
                "code": data2.get("code"),
                "message": data2.get("message"),
                "cards_count": len(cards),
                "first_card_types": [c.get("desc", {}).get("type") for c in cards[:5]],
            }
        except Exception as e:
            results["all_types"] = {"error": str(e)}

        # 测试 3: 无 type_list 参数
        try:
            resp3 = await client.get(DYNAMIC_API, headers=headers)
            data3 = resp3.json()
            results["no_params"] = {
                "status_code": resp3.status_code,
                "code": data3.get("code"),
                "message": data3.get("message"),
                "cards_count": len(data3.get("data", {}).get("cards", [])),
            }
        except Exception as e:
            results["no_params"] = {"error": str(e)}

    return {
        "sessdata_preview": req.sessdata[:20] + "..." if len(req.sessdata) > 20 else req.sessdata,
        "tests": results,
        "suggestions": [
            "如果所有测试都返回 0 卡片，可能是：",
            "1. SESSDATA 过期但 API 没有正确返回错误码",
            "2. 账号没有关注任何用户",
            "3. 关注用户最近没有发布动态",
            "4. API 端点或参数格式已更改",
            "5. 需要在 Cookie 中提供额外的验证字段（如 bili_jct）",
        ]
    }


@router.get("/bilibili/config")
async def get_bilibili_config():
    """获取哔哩哔哩工具配置（从全局配置中读取）"""
    from abo.config import load as load_config
    config = load_config()
    return {
        "cookie_configured": bool(config.get("bilibili_cookie")),
        "cookie_preview": config.get("bilibili_cookie", "")[:50] + "..." if config.get("bilibili_cookie") else None,
    }


@router.post("/bilibili/config")
async def set_bilibili_config(config: CookieConfig):
    """保存哔哩哔哩 Cookie 配置"""
    from abo.config import load as load_config, save as save_config
    existing = load_config()
    existing["bilibili_cookie"] = config.cookie
    save_config(existing)
    return {
        "success": True,
        "cookie_configured": True,
        "cookie_preview": config.cookie[:50] + "..." if len(config.cookie) > 50 else config.cookie,
    }


@router.post("/bilibili/config/from-browser")
async def get_bilibili_cookie_from_browser():
    """从本地 Chrome/Edge CDP 调试端口自动获取哔哩哔哩完整 Cookie"""
    try:
        cookie_list = await export_bilibili_cookies_auto(port=9222)

        if not cookie_list:
            return {
                "success": False,
                "error": "未找到哔哩哔哩 Cookie，请先登录 bilibili.com",
            }

        # 保存到配置
        from abo.config import load as load_config, save as save_config
        existing = load_config()
        existing["bilibili_cookie"] = json.dumps(cookie_list)
        save_config(existing)

        return {
            "success": True,
            "cookie_count": len(cookie_list),
            "cookie": json.dumps(cookie_list, ensure_ascii=False),
            "cookie_preview": json.dumps(cookie_list, ensure_ascii=False)[:100] + "...",
            "message": f"成功从本机浏览器获取 {len(cookie_list)} 个 Cookie",
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"获取浏览器 Cookie 失败: {str(e)}",
        }


# === 知乎工具 API ===

@router.post("/zhihu/search")
async def api_zhihu_search(req: ZhihuSearchRequest):
    """搜索知乎高赞内容"""
    result = await zhihu_search(
        keyword=req.keyword,
        max_results=req.max_results,
        min_votes=req.min_votes,
        sort_by=req.sort_by,
        cookie=req.cookie,
    )
    return result


@router.get("/zhihu/config")
async def get_zhihu_config():
    """获取知乎工具配置"""
    from abo.config import load as load_config
    config = load_config()
    return {
        "cookie_configured": bool(config.get("zhihu_cookie")),
        "cookie_preview": config.get("zhihu_cookie", "")[:50] + "..." if config.get("zhihu_cookie") else None,
    }


@router.post("/zhihu/config")
async def set_zhihu_config(config: CookieConfig):
    """保存知乎 Cookie 配置"""
    from abo.config import load as load_config, save as save_config
    existing = load_config()
    existing["zhihu_cookie"] = config.cookie
    save_config(existing)
    return {
        "success": True,
        "cookie_configured": True,
        "cookie_preview": config.cookie[:50] + "..." if len(config.cookie) > 50 else config.cookie,
    }


@router.post("/zhihu/config/from-browser")
async def get_zhihu_cookie_from_browser():
    """从本地浏览器自动获取知乎 Cookie"""
    try:
        import browser_cookie3

        # 获取 Chrome 浏览器的 cookie
        cj = browser_cookie3.chrome(domain_name="zhihu.com")

        # 转换为列表格式
        cookie_list = []
        for cookie in cj:
            cookie_list.append({
                "name": cookie.name,
                "value": cookie.value,
                "domain": cookie.domain,
                "path": cookie.path,
            })

        if not cookie_list:
            return {
                "success": False,
                "error": "未找到知乎 Cookie，请先登录 zhihu.com",
            }

        # 保存到配置
        from abo.config import load as load_config, save as save_config
        existing = load_config()
        existing["zhihu_cookie"] = json.dumps(cookie_list)
        save_config(existing)

        return {
            "success": True,
            "cookie_count": len(cookie_list),
            "cookie_preview": json.dumps(cookie_list)[:100] + "...",
            "message": f"成功从浏览器获取 {len(cookie_list)} 个 Cookie",
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"获取浏览器 Cookie 失败: {str(e)}",
        }


@router.post("/zhihu/comments")
async def api_zhihu_comments(req: ZhihuCommentsRequest):
    """获取知乎内容评论"""
    result = await zhihu_fetch_comments(
        content_id=req.content_id,
        max_comments=req.max_comments,
        sort_by=req.sort_by,
    )
    return result


@router.post("/zhihu/trends")
async def api_zhihu_trends(req: ZhihuTrendsRequest):
    """分析知乎 Trends"""
    result = await zhihu_analyze_trends(keyword=req.keyword)
    return result


# ===== arXiv API 工具 =====

@router.post("/arxiv/search")
async def api_arxiv_search(req: ArxivAPISearchRequest):
    import time
    from fastapi import HTTPException
    start_time = time.time()

    if req.mode not in ("AND", "OR"):
        raise HTTPException(status_code=400, detail="mode must be 'AND' or 'OR'")

    try:
        papers = await arxiv_api_search(
            keywords=req.keywords,
            categories=req.categories,
            mode=req.mode,
            max_results=req.max_results,
            days_back=req.days_back,
            sort_by=req.sort_by,
            sort_order=req.sort_order,
        )
        search_time_ms = (time.time() - start_time) * 1000
        return {
            "total": len(papers),
            "papers": papers,
            "query": " ".join(req.keywords),
            "search_time_ms": round(search_time_ms, 2),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"arXiv API error: {str(e)}")


@router.get("/arxiv/categories")
async def get_arxiv_categories():
    from abo.default_modules.arxiv.category import ALL_SUBCATEGORIES
    return {
        "categories": [
            {"code": code, "name": name, "main": code.split(".")[0]}
            for code, name in ALL_SUBCATEGORIES.items()
        ]
    }


class ArxivFiguresRequest(BaseModel):
    arxiv_id: str


@router.post("/arxiv/figures")
async def api_arxiv_figures(req: ArxivFiguresRequest):
    """获取arXiv论文的图片（模型架构图等）"""
    from abo.tools.arxiv_api import ArxivAPITool
    tool = ArxivAPITool()
    try:
        figures = await tool.fetch_figures(req.arxiv_id)
        return {"figures": figures}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch figures: {str(e)}")


class ArxivSaveRequest(BaseModel):
    arxiv_id: str
    title: str
    authors: list[str]
    summary: str
    pdf_url: str
    arxiv_url: str
    primary_category: str
    published: str
    comment: Optional[str] = None
    figures: list[dict] = []


@router.post("/arxiv/save")
async def api_arxiv_save(req: ArxivSaveRequest):
    """保存arXiv论文为markdown格式，同时下载PDF到文献库/arxiv目录"""
    from pathlib import Path
    import httpx
    import aiofiles
    import re
    import base64
    from mimetypes import guess_extension
    from abo.config import get_literature_path

    # 获取文献库路径，如果不存在则报错
    lit_path = get_literature_path()
    if not lit_path:
        raise HTTPException(status_code=400, detail="未配置文献库路径，请先在设置中配置")

    # 保存到文献库/arxiv目录
    base_dir = lit_path / "arxiv"
    try:
        base_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"无法创建目录: {str(e)}")

    # 清理标题作为文件名 (标题在前，arxiv id 在后)
    safe_title = re.sub(r'[^\w\s-]', '', req.title)[:50].strip().replace(' ', '_')
    md_file_name = f"{safe_title}_{req.arxiv_id}.md"
    pdf_file_name = f"{safe_title}_{req.arxiv_id}.pdf"
    md_file_path = base_dir / md_file_name
    pdf_file_path = base_dir / pdf_file_name

    # 构建markdown内容
    md_content = f"""# {req.title}

**Authors:** {', '.join(req.authors)}

**arXiv ID:** [{req.arxiv_id}]({req.arxiv_url})

**Category:** {req.primary_category}

**Published:** {req.published}

**PDF:** [[{pdf_file_name}]]

{req.comment and f"**Comment:** {req.comment}" or ""}

## Abstract

{req.summary}

"""

    # 下载图片并嵌入base64
    if req.figures:
        md_content += "## Figures\n\n"
        async with httpx.AsyncClient(timeout=30) as client:
            for i, fig in enumerate(req.figures[:6]):  # 最多6张图
                try:
                    img_url = fig.get("url", "")
                    if not img_url:
                        continue
                    img_resp = await client.get(img_url)
                    if img_resp.status_code == 200:
                        # 获取图片格式
                        content_type = img_resp.headers.get("content-type", "image/png")
                        ext = guess_extension(content_type) or ".png"
                        ext = ext.lstrip(".") or "png"
                        # 转base64
                        b64_data = base64.b64encode(img_resp.content).decode("utf-8")
                        caption = fig.get("caption", f"Figure {i+1}")
                        md_content += f"### {caption}\n\n"
                        md_content += f"<img src=\"data:{content_type};base64,{b64_data}\" width=\"600\" />\n\n"
                except Exception as e:
                    md_content += f"*Figure {i+1}: [图片链接]({fig.get('url', '')})*\n\n"

    # 同时执行：写入markdown + 下载PDF
    async with httpx.AsyncClient(timeout=120) as client:
        # 下载PDF
        pdf_downloaded = False
        try:
            pdf_resp = await client.get(req.pdf_url, follow_redirects=True)
            if pdf_resp.status_code == 200:
                async with aiofiles.open(pdf_file_path, "wb") as f:
                    await f.write(pdf_resp.content)
                pdf_downloaded = True
        except Exception as e:
            print(f"Failed to download PDF: {e}")

    # 写入markdown文件
    async with aiofiles.open(md_file_path, "w", encoding="utf-8") as f:
        await f.write(md_content)

    return {
        "success": True,
        "saved_to": str(md_file_path),
        "pdf_path": str(pdf_file_path) if pdf_downloaded else None,
        "files": [md_file_name, pdf_file_name] if pdf_downloaded else [md_file_name],
    }
