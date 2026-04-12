"""小红书笔记入库爬取器。

把 skill 中验证过的单帖抓取流程封装成 ABO 可调用的后端能力：
- 优先后端请求详情页并解析 window.__INITIAL_STATE__
- 数据缺失时可复用本机 Edge/Chrome CDP 调试端口兜底
- 保留远程图片/视频链接，同时下载本地资源到 vault/xhs
- 输出 skill 风格 Markdown
"""

from __future__ import annotations

import asyncio
import json
import random
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx


BASE_URL = "https://www.xiaohongshu.com"
DEFAULT_VAULT = Path.home() / "Documents" / "Obsidian Vault"


@dataclass
class LocalResource:
    label: str
    type: str
    path: Path
    relative_path: str
    remote_url: str
    size: int = 0


@dataclass
class XHSCrawledNote:
    id: str
    title: str
    desc: str
    author: str
    author_id: str
    url: str
    note_type: str
    published_at: datetime | None
    ip_location: str = ""
    liked_count: int = 0
    collected_count: int = 0
    comment_count: int = 0
    share_count: int = 0
    tags: list[str] = field(default_factory=list)
    images: list[dict[str, Any]] = field(default_factory=list)
    video_url: str = ""
    live_urls: list[dict[str, Any]] = field(default_factory=list)
    local_resources: list[LocalResource] = field(default_factory=list)
    used_cdp: bool = False
    warnings: list[str] = field(default_factory=list)


@dataclass
class XHSAuthorCandidate:
    author: str
    author_id: str = ""
    note_count: int = 0
    total_likes: int = 0
    total_collects: int = 0
    total_comments: int = 0
    latest_date: str = ""
    latest_title: str = ""
    sample_note_urls: list[str] = field(default_factory=list)
    sample_titles: list[str] = field(default_factory=list)
    sample_albums: list[str] = field(default_factory=list)
    sample_tags: list[str] = field(default_factory=list)
    source_summary: str = ""
    score: float = 0.0


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _parse_count(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value).strip().replace(",", "")
    if not text:
        return 0
    try:
        if text.endswith("万"):
            return int(float(text[:-1]) * 10000)
        if text.endswith("k") or text.endswith("K"):
            return int(float(text[:-1]) * 1000)
        return int(float(text))
    except ValueError:
        return 0


def _extract_note_id(url_or_id: str) -> str:
    text = url_or_id.strip()
    if not text:
        return ""
    if text.startswith("http://") or text.startswith("https://"):
        path = urlsplit(text).path
        parts = [p for p in path.split("/") if p]
        if "explore" in parts:
            idx = parts.index("explore")
            if idx + 1 < len(parts):
                return parts[idx + 1]
        return parts[-1] if parts else ""
    return text.split("?")[0].split("/")[-1]


def normalize_note_url(url_or_id: str) -> str:
    if url_or_id.startswith("http://") or url_or_id.startswith("https://"):
        return url_or_id
    return f"{BASE_URL}/explore/{_extract_note_id(url_or_id)}"


def _sanitize_js_object_literal(text: str) -> str:
    sanitized = text
    replacements = [
        (":undefined", ":null"),
        (":NaN", ":null"),
        (":Infinity", ":null"),
        (":-Infinity", ":null"),
        ("[undefined]", "[null]"),
    ]
    for src, dst in replacements:
        sanitized = sanitized.replace(src, dst)
    sanitized = re.sub(r"(?<=[:\[,])\s*undefined(?=\s*[,}\]])", " null", sanitized)
    sanitized = re.sub(r"(?<=[:\[,])\s*NaN(?=\s*[,}\]])", " null", sanitized)
    sanitized = re.sub(r"(?<=[:\[,])\s*-?Infinity(?=\s*[,}\]])", " null", sanitized)
    return sanitized


def extract_initial_state(html: str) -> dict[str, Any]:
    marker = "window.__INITIAL_STATE__"
    idx = html.find(marker)
    if idx == -1:
        raise ValueError("页面中未找到 Initial State")
    start = html.find("{", idx)
    if start == -1:
        raise ValueError("Initial State JSON 起始位置缺失")
    end = html.find("</script>", start)
    payload = html[start:end] if end != -1 else html[start:]
    decoder = json.JSONDecoder()
    obj, _ = decoder.raw_decode(_sanitize_js_object_literal(payload))
    return obj


def _walk(obj: Any):
    if isinstance(obj, dict):
        yield obj
        for value in obj.values():
            yield from _walk(value)
    elif isinstance(obj, list):
        for item in obj:
            yield from _walk(item)


def _extract_note_root(state: dict[str, Any], note_id: str) -> dict[str, Any] | None:
    note_section = state.get("note")
    if isinstance(note_section, dict):
        detail_map = note_section.get("noteDetailMap")
        if isinstance(detail_map, dict) and detail_map:
            candidates = []
            if note_id in detail_map:
                candidates.append(detail_map[note_id])
            candidates.extend(detail_map.values())
            for item in candidates:
                if isinstance(item, dict):
                    note = item.get("note")
                    if isinstance(note, dict):
                        return note
                    if item.get("noteId") or item.get("id"):
                        return item

    for node in _walk(state):
        if (
            isinstance(node, dict)
            and ("noteId" in node or "id" in node)
            and ("title" in node or "desc" in node or "interactInfo" in node)
            and ("user" in node or "userInfo" in node or "imageList" in node or "video" in node)
        ):
            if not note_id or note_id in {_safe_str(node.get("noteId")), _safe_str(node.get("id"))}:
                return node
    return None


def _cookie_to_header(cookie: str | None) -> str:
    if not cookie:
        return ""
    text = cookie.strip()
    if not text:
        return ""
    if text.startswith("[") or text.startswith("{"):
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                data = [data]
            if isinstance(data, list):
                pairs = []
                for item in data:
                    if isinstance(item, dict) and item.get("name") and item.get("value") is not None:
                        pairs.append(f"{item['name']}={item['value']}")
                if pairs:
                    return "; ".join(pairs)
        except Exception:
            pass
    return text


def _cookie_to_playwright(cookie: str | None) -> list[dict[str, Any]]:
    text = (cookie or "").strip()
    if not text:
        return []
    if text.startswith("[") or text.startswith("{"):
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                data = [data]
            if isinstance(data, list):
                cookies = []
                for item in data:
                    if not isinstance(item, dict) or not item.get("name") or item.get("value") is None:
                        continue
                    cookies.append(
                        {
                            "name": str(item["name"]),
                            "value": str(item["value"]),
                            "domain": item.get("domain") or ".xiaohongshu.com",
                            "path": item.get("path") or "/",
                        }
                    )
                return cookies
        except Exception:
            pass

    cookies = []
    for pair in text.split(";"):
        pair = pair.strip()
        if "=" not in pair:
            continue
        name, value = pair.split("=", 1)
        cookies.append({"name": name.strip(), "value": value.strip(), "domain": ".xiaohongshu.com", "path": "/"})
    return cookies


def _headers(cookie: str | None = None, referer: str = BASE_URL) -> dict[str, str]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Referer": referer,
    }
    cookie_header = _cookie_to_header(cookie)
    if cookie_header:
        headers["Cookie"] = cookie_header
    return headers


async def _fetch_state_backend(url: str, cookie: str | None) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url, headers=_headers(cookie, BASE_URL))
        resp.raise_for_status()
        return extract_initial_state(resp.text)


async def _fetch_state_via_cdp(url: str, port: int = 9222, wait_seconds: float = 10.0) -> dict[str, Any]:
    """从已打开的浏览器调试端口读取页面 state。"""
    try:
        import websockets
    except ImportError as exc:
        raise RuntimeError("缺少 websockets，无法使用 CDP 兜底") from exc

    version_url = f"http://127.0.0.1:{port}/json/version"
    async with httpx.AsyncClient(timeout=5) as client:
        version = (await client.get(version_url)).json()
        browser_ws = version.get("webSocketDebuggerUrl")
        if not browser_ws:
            raise RuntimeError("CDP 调试端口未返回 webSocketDebuggerUrl")

    async with websockets.connect(browser_ws, max_size=32 * 1024 * 1024) as browser:
        next_id = 1

        async def call(method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
            nonlocal next_id
            msg_id = next_id
            next_id += 1
            await browser.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
            while True:
                raw = await browser.recv()
                data = json.loads(raw)
                if data.get("id") == msg_id:
                    return data

        created = await call("Target.createTarget", {"url": url, "background": False})
        target_id = created["result"]["targetId"]
        attached = await call("Target.attachToTarget", {"targetId": target_id, "flatten": True})
        session_id = attached["result"]["sessionId"]

        async def session_call(method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
            nonlocal next_id
            msg_id = next_id
            next_id += 1
            await browser.send(
                json.dumps(
                    {
                        "id": msg_id,
                        "sessionId": session_id,
                        "method": method,
                        "params": params or {},
                    }
                )
            )
            while True:
                raw = await browser.recv()
                data = json.loads(raw)
                if data.get("id") == msg_id:
                    return data

        try:
            await session_call("Page.enable")
            await session_call("Runtime.enable")
            await asyncio.sleep(wait_seconds)
            note_id = _extract_note_id(url)
            note_id_js = json.dumps(note_id)
            evaluated = await session_call(
                "Runtime.evaluate",
                {
                    "expression": (
                        "(() => {"
                        "const state = window.__INITIAL_STATE__ || {};"
                        "const map = state.note?.noteDetailMap || {};"
                        f"const noteId = {note_id_js};"
                        "const detail = map[noteId] || Object.values(map)[0] || null;"
                        "return JSON.stringify({note:{noteDetailMap:{[noteId || 'note']: detail}}});"
                        "})()"
                    ),
                    "returnByValue": True,
                    "awaitPromise": True,
                },
            )
            state_value = evaluated.get("result", {}).get("result", {}).get("value")
            state = json.loads(state_value) if isinstance(state_value, str) else state_value
            if not isinstance(state, dict) or not state:
                raise RuntimeError("CDP 页面未返回有效 Initial State")
            return state
        finally:
            await call("Target.closeTarget", {"targetId": target_id})


async def _evaluate_cdp_json(
    url: str,
    expression: str,
    port: int = 9222,
    wait_seconds: float = 8.0,
    close_target: bool = True,
    background: bool = False,
) -> Any:
    """在 CDP 新页面执行表达式。表达式必须返回 JSON 字符串。"""
    try:
        import websockets
    except ImportError as exc:
        raise RuntimeError("缺少 websockets，无法使用 CDP") from exc

    async with httpx.AsyncClient(timeout=5) as client:
        version = (await client.get(f"http://127.0.0.1:{port}/json/version")).json()
        browser_ws = version.get("webSocketDebuggerUrl")
        if not browser_ws:
            raise RuntimeError("CDP 调试端口未返回 webSocketDebuggerUrl")

    async with websockets.connect(browser_ws, max_size=32 * 1024 * 1024) as browser:
        next_id = 1

        async def call(method: str, params: dict[str, Any] | None = None, session_id: str | None = None) -> dict[str, Any]:
            nonlocal next_id
            msg_id = next_id
            next_id += 1
            payload = {"id": msg_id, "method": method, "params": params or {}}
            if session_id:
                payload["sessionId"] = session_id
            await browser.send(json.dumps(payload))
            while True:
                data = json.loads(await browser.recv())
                if data.get("id") == msg_id:
                    return data

        created = await call("Target.createTarget", {"url": url, "background": background})
        target_id = created["result"]["targetId"]
        attached = await call("Target.attachToTarget", {"targetId": target_id, "flatten": True})
        session_id = attached["result"]["sessionId"]
        try:
            await call("Page.enable", session_id=session_id)
            await call("Runtime.enable", session_id=session_id)
            await asyncio.sleep(wait_seconds)
            evaluated = await call(
                "Runtime.evaluate",
                {"expression": expression, "returnByValue": True, "awaitPromise": True},
                session_id=session_id,
            )
            value = evaluated.get("result", {}).get("result", {}).get("value")
            return json.loads(value) if isinstance(value, str) else value
        finally:
            if close_target:
                await call("Target.closeTarget", {"targetId": target_id})


async def _evaluate_existing_xhs_pages(expression: str, port: int = 9222) -> list[Any]:
    """在已打开的小红书页面上执行表达式，用于读取用户主页/收藏页 DOM。"""
    try:
        import websockets
    except ImportError as exc:
        raise RuntimeError("缺少 websockets，无法使用 CDP") from exc

    async with httpx.AsyncClient(timeout=5) as client:
        version = (await client.get(f"http://127.0.0.1:{port}/json/version")).json()
        browser_ws = version.get("webSocketDebuggerUrl")
        if not browser_ws:
            raise RuntimeError("CDP 调试端口未返回 webSocketDebuggerUrl")

    results: list[Any] = []
    async with websockets.connect(browser_ws, max_size=32 * 1024 * 1024) as browser:
        next_id = 1

        async def call(method: str, params: dict[str, Any] | None = None, session_id: str | None = None) -> dict[str, Any]:
            nonlocal next_id
            msg_id = next_id
            next_id += 1
            payload = {"id": msg_id, "method": method, "params": params or {}}
            if session_id:
                payload["sessionId"] = session_id
            await browser.send(json.dumps(payload))
            while True:
                data = json.loads(await browser.recv())
                if data.get("id") == msg_id:
                    return data

        targets = (await call("Target.getTargets")).get("result", {}).get("targetInfos", [])
        for target in targets:
            if target.get("type") != "page" or "xiaohongshu.com" not in str(target.get("url", "")):
                continue
            target_id = target["targetId"]
            attached = await call("Target.attachToTarget", {"targetId": target_id, "flatten": True})
            session_id = attached["result"]["sessionId"]
            try:
                evaluated = await call(
                    "Runtime.evaluate",
                    {"expression": expression, "returnByValue": True, "awaitPromise": True},
                    session_id=session_id,
                )
                value = evaluated.get("result", {}).get("result", {}).get("value")
                parsed = json.loads(value) if isinstance(value, str) else value
                if parsed:
                    results.append(parsed)
            finally:
                await call("Target.detachFromTarget", {"sessionId": session_id})
    return results


def _extract_url_candidates(obj: Any) -> list[str]:
    urls: list[str] = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            if isinstance(value, str) and value.startswith("http"):
                if any(token in key.lower() for token in ["url", "stream", "origin", "master", "link"]):
                    urls.append(value)
            else:
                urls.extend(_extract_url_candidates(value))
    elif isinstance(obj, list):
        for item in obj:
            urls.extend(_extract_url_candidates(item))

    ordered: list[str] = []
    for url in urls:
        if url not in ordered:
            ordered.append(url)
    return ordered


def _image_urls(item: dict[str, Any]) -> dict[str, str]:
    result: dict[str, str] = {}
    for key, label in [
        ("urlDefault", "default"),
        ("urlPre", "pre"),
        ("url", "default"),
        ("originUrl", "origin"),
    ]:
        value = item.get(key)
        if isinstance(value, str) and value.startswith("http") and label not in result:
            result[label] = value

    info_list = item.get("infoList")
    if isinstance(info_list, list):
        for idx, info in enumerate(info_list):
            if not isinstance(info, dict):
                continue
            url = info.get("url")
            if isinstance(url, str) and url.startswith("http"):
                key = _safe_str(info.get("imageScene")) or f"extra{idx}"
                result.setdefault(key, url)
    return result


def _extract_live_url(image_item: dict[str, Any]) -> str:
    stream = image_item.get("stream") or {}
    if not isinstance(stream, dict):
        return ""
    for codec in ["h264", "h265", "av1", "h266"]:
        variants = stream.get(codec)
        if isinstance(variants, list):
            for variant in variants:
                if not isinstance(variant, dict):
                    continue
                master = variant.get("masterUrl")
                if isinstance(master, str) and master.startswith("http"):
                    return master
                backups = variant.get("backupUrls")
                if isinstance(backups, list):
                    for backup in backups:
                        if isinstance(backup, str) and backup.startswith("http"):
                            return backup
    return ""


def _extract_video_url(note_root: dict[str, Any]) -> str:
    video = note_root.get("video") or note_root.get("videoInfoV2") or {}
    candidates = _extract_url_candidates(video)
    for url in candidates:
        lowered = url.lower()
        if ".mp4" in lowered or "master" in lowered or "h264" in lowered:
            return url
    return candidates[0] if candidates else ""


def _extract_tags(note_root: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    for key in ["tagList", "hashTag", "topics"]:
        value = note_root.get(key)
        if not isinstance(value, list):
            continue
        for item in value:
            if isinstance(item, str):
                tags.append(item)
            elif isinstance(item, dict):
                tag = _safe_str(item.get("name") or item.get("title") or item.get("tagName"))
                if tag:
                    tags.append(tag)
    unique: list[str] = []
    for tag in tags:
        if tag not in unique:
            unique.append(tag)
    return unique


def _extract_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, str):
        if value.isdigit():
            value = int(value)
        else:
            return None
    if isinstance(value, (int, float)):
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp /= 1000
        try:
            return datetime.fromtimestamp(timestamp, tz=timezone.utc).astimezone()
        except Exception:
            return None
    return None


def _note_from_root(note_root: dict[str, Any], url: str, used_cdp: bool = False) -> XHSCrawledNote:
    note_id = _safe_str(note_root.get("noteId") or note_root.get("id")) or _extract_note_id(url)
    user = note_root.get("user") or note_root.get("userInfo") or {}
    interact = note_root.get("interactInfo") or {}

    images: list[dict[str, Any]] = []
    live_urls: list[dict[str, Any]] = []
    image_list = note_root.get("imageList") or note_root.get("imagesList") or note_root.get("imageInfoList") or []
    if isinstance(image_list, list):
        for idx, item in enumerate(image_list):
            if not isinstance(item, dict):
                continue
            urls = _image_urls(item)
            images.append(
                {
                    "index": idx,
                    "urls": urls,
                    "remote_default": urls.get("default") or urls.get("origin") or next(iter(urls.values()), ""),
                    "live_photo": bool(item.get("livePhoto")),
                }
            )
            if item.get("livePhoto"):
                live_url = _extract_live_url(item)
                if live_url:
                    live_urls.append({"index": idx, "url": live_url})

    return XHSCrawledNote(
        id=note_id,
        title=_safe_str(note_root.get("title")) or "无标题",
        desc=_safe_str(note_root.get("desc") or note_root.get("content") or note_root.get("noteDesc")),
        author=_safe_str(user.get("nickname") or user.get("name") or user.get("userName")) or "未知",
        author_id=_safe_str(user.get("userId") or user.get("uid") or user.get("id")),
        url=normalize_note_url(url),
        note_type=_safe_str(note_root.get("type")) or "normal",
        published_at=_extract_datetime(note_root.get("time") or note_root.get("publishTime") or note_root.get("lastUpdateTime")),
        ip_location=_safe_str(note_root.get("ipLocation") or note_root.get("ip_location")),
        liked_count=_parse_count(interact.get("likedCount") or note_root.get("likedCount")),
        collected_count=_parse_count(interact.get("collectedCount") or note_root.get("collectedCount")),
        comment_count=_parse_count(interact.get("commentCount") or note_root.get("commentCount")),
        share_count=_parse_count(interact.get("shareCount") or note_root.get("shareCount")),
        tags=_extract_tags(note_root),
        images=images,
        video_url=_extract_video_url(note_root),
        live_urls=live_urls,
        used_cdp=used_cdp,
    )


def _vault_xhs_dir(vault_path: str | Path | None) -> Path:
    root = Path(vault_path).expanduser() if vault_path else DEFAULT_VAULT
    return root / "xhs"


def _extract_md_field(text: str, label: str) -> str:
    pattern = rf"- \*\*{re.escape(label)}\*\*: (.+)"
    match = re.search(pattern, text)
    return match.group(1).strip() if match else ""


def _parse_saved_xhs_note(path: Path) -> dict[str, Any] | None:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None

    title_match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
    author_line = _extract_md_field(text, "来源")
    author = author_line.split("·", 1)[-1].strip() if author_line else ""
    if not author:
        return None

    stats_line = _extract_md_field(text, "互动")
    stats_match = re.search(r"(\d+)赞\s*/\s*(\d+)收藏\s*/\s*(\d+)评论", stats_line)
    likes = int(stats_match.group(1)) if stats_match else 0
    collects = int(stats_match.group(2)) if stats_match else 0
    comments = int(stats_match.group(3)) if stats_match else 0

    return {
        "title": title_match.group(1).strip() if title_match else path.stem,
        "author": author,
        "author_id": _extract_md_field(text, "作者ID").replace("未知", "").strip(),
        "url": _extract_md_field(text, "链接"),
        "note_id": _extract_note_id(_extract_md_field(text, "链接")),
        "date": _extract_md_field(text, "日期"),
        "tags": [
            item.strip()
            for item in _extract_md_field(text, "标签").replace("无", "").split("、")
            if item.strip()
        ],
        "likes": likes,
        "collects": collects,
        "comments": comments,
        "path": str(path),
    }


async def analyze_saved_xhs_authors(
    *,
    vault_path: str | Path | None = None,
    cookie: str | None = None,
    resolve_author_ids: bool = True,
    resolve_limit: int = 12,
) -> dict[str, Any]:
    xhs_dir = _vault_xhs_dir(vault_path)
    if not xhs_dir.exists():
        return {
            "success": True,
            "xhs_dir": str(xhs_dir),
            "total_notes": 0,
            "candidates": [],
            "message": "还没有本地 xhs 收藏结果，请先执行收藏抓取。",
        }

    aggregates: dict[str, XHSAuthorCandidate] = {}
    total_notes = 0
    album_progress = _load_album_progress(vault_path)
    note_albums_by_id: dict[str, list[str]] = {}
    for note_id, state in album_progress.get("notes", {}).items():
        if isinstance(state, dict):
            note_albums_by_id[str(note_id)] = [str(item) for item in state.get("albums", []) if item]

    for path in sorted(xhs_dir.glob("*.md")):
        note = _parse_saved_xhs_note(path)
        if not note:
            continue
        total_notes += 1
        author = note["author"]
        candidate = aggregates.setdefault(author, XHSAuthorCandidate(author=author))
        candidate.note_count += 1
        candidate.total_likes += note["likes"]
        candidate.total_collects += note["collects"]
        candidate.total_comments += note["comments"]
        if note["author_id"] and not candidate.author_id:
            candidate.author_id = note["author_id"]
        if note["url"] and note["url"] not in candidate.sample_note_urls and len(candidate.sample_note_urls) < 3:
            candidate.sample_note_urls.append(note["url"])
        if note["title"] and note["title"] not in candidate.sample_titles and len(candidate.sample_titles) < 3:
            candidate.sample_titles.append(note["title"])
        note_id = _extract_note_id(note["url"])
        for album_name in note_albums_by_id.get(note_id, []):
            if album_name and album_name not in candidate.sample_albums and len(candidate.sample_albums) < 4:
                candidate.sample_albums.append(album_name)
        for tag in note.get("tags", []):
            if tag and tag not in candidate.sample_tags and len(candidate.sample_tags) < 6:
                candidate.sample_tags.append(tag)
        if note["date"] and note["date"] >= candidate.latest_date:
            candidate.latest_date = note["date"]
            candidate.latest_title = note["title"]

    ordered = sorted(
        aggregates.values(),
        key=lambda item: (
            item.note_count,
            item.total_collects,
            item.total_likes,
            item.latest_date,
        ),
        reverse=True,
    )

    if resolve_author_ids and cookie:
        from abo.tools.xiaohongshu import XiaohongshuAPI

        api = XiaohongshuAPI()
        try:
            for candidate in ordered[:resolve_limit]:
                if candidate.author_id or not candidate.sample_note_urls:
                    continue
                for note_url in candidate.sample_note_urls:
                    try:
                        detail = await api.fetch_note_detail(note_url, cookie)
                    except Exception:
                        detail = None
                    if detail and detail.author_id:
                        candidate.author_id = detail.author_id
                        break
        finally:
            await api.close()

    for candidate in ordered:
        candidate.score = round(
            candidate.note_count * 4
            + min(candidate.total_collects / 500, 4)
            + min(candidate.total_likes / 1000, 4)
            + min(candidate.total_comments / 200, 2),
            2,
        )
        if candidate.sample_albums:
            candidate.source_summary = "来自收藏专辑：" + "、".join(candidate.sample_albums[:3])
        elif candidate.sample_tags:
            candidate.source_summary = "来自标签：" + "、".join(candidate.sample_tags[:4])
        elif candidate.sample_titles:
            candidate.source_summary = "来自收藏笔记：" + "、".join(candidate.sample_titles[:2])
        else:
            candidate.source_summary = f"来自本地收藏 {candidate.note_count} 条笔记"

    return {
        "success": True,
        "xhs_dir": str(xhs_dir),
        "total_notes": total_notes,
        "candidates": [
            {
                "author": candidate.author,
                "author_id": candidate.author_id,
                "note_count": candidate.note_count,
                "total_likes": candidate.total_likes,
                "total_collects": candidate.total_collects,
                "total_comments": candidate.total_comments,
                "latest_date": candidate.latest_date,
                "latest_title": candidate.latest_title,
                "sample_note_urls": candidate.sample_note_urls,
                "sample_titles": candidate.sample_titles,
                "sample_albums": candidate.sample_albums,
                "sample_tags": candidate.sample_tags,
                "source_summary": candidate.source_summary,
                "score": candidate.score,
            }
            for candidate in ordered
        ],
        "message": f"从 {total_notes} 条本地收藏笔记中整理出 {len(ordered)} 位作者候选。",
    }


def _slug(text: str, fallback: str) -> str:
    clean = re.sub(r'[\\/:*?"<>|#\n\r\t]+', " ", text).strip()
    clean = re.sub(r"\s+", " ", clean)
    clean = clean[:36].strip()
    return clean or fallback


def _safe_folder_name(text: str, fallback: str) -> str:
    name = _slug(text, fallback)
    name = name.strip(". ")
    return name or fallback


def _media_ext(url: str, content_type: str, default: str) -> str:
    lowered = url.lower()
    for ext in [".webp", ".jpg", ".jpeg", ".png", ".gif", ".mp4"]:
        if ext in lowered:
            return ext
    if "webp" in content_type:
        return ".webp"
    if "jpeg" in content_type:
        return ".jpg"
    if "png" in content_type:
        return ".png"
    if "mp4" in content_type or "video" in content_type:
        return ".mp4"
    return default


async def _download_resource(
    client: httpx.AsyncClient,
    url: str,
    dest: Path,
    label: str,
    resource_type: str,
    xhs_dir: Path,
) -> LocalResource | None:
    if not url:
        return None
    try:
        resp = await client.get(url, headers=_headers(referer=BASE_URL), follow_redirects=True)
        resp.raise_for_status()
        content = resp.content
        if not content:
            return None
        ext = _media_ext(url, resp.headers.get("content-type", ""), dest.suffix or ".bin")
        final_path = dest.with_suffix(ext)
        final_path.parent.mkdir(parents=True, exist_ok=True)
        final_path.write_bytes(content)
        return LocalResource(
            label=label,
            type=resource_type,
            path=final_path,
            relative_path=final_path.relative_to(xhs_dir).as_posix(),
            remote_url=url,
            size=len(content),
        )
    except Exception:
        return None


async def _download_media(
    note: XHSCrawledNote,
    xhs_dir: Path,
    include_images: bool,
    include_video: bool,
    include_live_photo: bool,
) -> None:
    img_dir = xhs_dir / "img"
    video_dir = xhs_dir / "video"
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        tasks = []
        if include_images:
            for image in note.images:
                idx = int(image.get("index", 0))
                urls = image.get("urls") or {}
                for label, url in urls.items():
                    base = img_dir / f"xhs_{note.id[:8]}_{idx}_{label}"
                    tasks.append(_download_resource(client, url, base, f"图{idx + 1} {label}", "image", xhs_dir))

        if include_live_photo:
            for item in note.live_urls:
                idx = int(item.get("index", 0))
                base = video_dir / f"xhs_{note.id[:8]}_live_{idx}"
                tasks.append(_download_resource(client, item.get("url", ""), base, f"Live 图{idx + 1}", "live", xhs_dir))

        if include_video and note.video_url:
            base = video_dir / f"xhs_{note.id[:8]}"
            tasks.append(_download_resource(client, note.video_url, base, "视频", "video", xhs_dir))

        results = await asyncio.gather(*tasks) if tasks else []

    note.local_resources = [item for item in results if item is not None]


def _quote_block(lines: list[str]) -> str:
    return "\n".join(["> " + line if line else ">" for line in lines])


def _render_markdown(
    note: XHSCrawledNote,
    include_comments: bool,
    include_sub_comments: bool,
    comments_limit: int,
) -> str:
    date = note.published_at.strftime("%Y-%m-%d") if note.published_at else datetime.now().strftime("%Y-%m-%d")
    desc = note.desc.strip() or "原文未提供正文。"
    h1 = note.title.strip() or "小红书笔记"
    has_live = bool(note.live_urls)
    has_video = bool(note.video_url)
    type_label = note.note_type
    if has_live:
        type_label += " / Live 图"
    if has_video and note.note_type == "video":
        type_label += " / 视频"

    detail_lines = ["原文：", "", desc, "", "图片：", ""]
    image_count = 0
    for image in note.images:
        remote = image.get("remote_default") or ""
        if remote:
            image_count += 1
            detail_lines.append(f"![图{image_count}]({remote})")
            detail_lines.append("")

    if note.video_url:
        detail_lines.extend(["视频：", "", f"[打开视频]({note.video_url})", ""])

    if note.live_urls:
        detail_lines.extend(["Live 图：", ""])
        for idx, item in enumerate(note.live_urls, 1):
            detail_lines.append(f"[打开 Live 动态片段 {idx}]({item['url']})")
        detail_lines.append("")

    comment_lines: list[str]
    if include_comments:
        comment_lines = [
            "评论正文需要动态评论接口。当前入库流程已保留选项，但本次未抓到评论正文。",
            f"请求数量：{comments_limit} 条；二级评论：{'开启' if include_sub_comments else '关闭'}。",
        ]
    else:
        comment_lines = ["未抓取评论正文。"]

    attr_lines = [
        f"- **来源**: 小红书 · {note.author}",
        f"- **作者ID**: {note.author_id or '未知'}",
        f"- **帖子ID**: {note.id}",
        f"- **链接**: {note.url}",
        f"- **日期**: {date}",
        f"- **类型**: {type_label}",
        f"- **互动**: {note.liked_count}赞 / {note.collected_count}收藏 / {note.comment_count}评论 / {note.share_count}分享",
        f"- **IP属地**: {note.ip_location or '未知'}",
        f"- **标签**: {'、'.join(note.tags) if note.tags else '无'}",
    ]

    local_lines = []
    if note.local_resources:
        for resource in note.local_resources:
            local_lines.append(f"- **{resource.label}**: [{Path(resource.relative_path).name}]({resource.relative_path})")
    else:
        local_lines.append("- 无本地资源。")

    parts = [
        f"# {h1}",
        "",
        desc.splitlines()[0][:160] if desc else "已保存这条小红书笔记。",
        "",
        "**与我的关联：** 作为小红书情报样本保存，后续可在 xhs 文件夹里继续整理。",
        "",
        "**值得深挖吗：** 视后续关联主题决定。",
        "",
        "> [!tip]- 详情",
        _quote_block(detail_lines),
        "",
        "> [!quote]- 评论与点赞",
        _quote_block(comment_lines),
        "",
        "> [!info]- 笔记属性",
        _quote_block(attr_lines),
        "",
        "> [!info]- 本地资源",
        _quote_block(local_lines),
        "",
    ]
    return "\n".join(parts)


async def crawl_xhs_note_to_vault(
    url: str,
    *,
    cookie: str | None = None,
    vault_path: str | Path | None = None,
    include_images: bool = False,
    include_video: bool = False,
    include_live_photo: bool = False,
    include_comments: bool = False,
    include_sub_comments: bool = False,
    comments_limit: int = 20,
    use_cdp: bool = True,
    cdp_port: int = 9222,
    subfolder: str | None = None,
) -> dict[str, Any]:
    """抓取单条小红书笔记并保存到 vault/xhs。"""
    normalized_url = normalize_note_url(url)
    note_id = _extract_note_id(normalized_url)
    warnings: list[str] = []
    used_cdp = False

    try:
        state = await _fetch_state_backend(normalized_url, cookie)
        note_root = _extract_note_root(state, note_id)
    except Exception as exc:
        warnings.append(f"后端详情请求失败: {exc}")
        note_root = None

    if not note_root and use_cdp:
        try:
            state = await _fetch_state_via_cdp(normalized_url, cdp_port)
            note_root = _extract_note_root(state, note_id)
            used_cdp = True
        except Exception as exc:
            warnings.append(f"CDP 兜底失败: {exc}")

    if not note_root:
        detail = "；".join(warnings) if warnings else "无更多错误信息"
        raise RuntimeError(f"没有提取到笔记详情数据：{detail}")

    note = _note_from_root(note_root, normalized_url, used_cdp=used_cdp)
    note.warnings.extend(warnings)

    root_xhs_dir = _vault_xhs_dir(vault_path)
    xhs_dir = root_xhs_dir / _safe_folder_name(subfolder, "未命名专辑") if subfolder else root_xhs_dir
    xhs_dir.mkdir(parents=True, exist_ok=True)
    (xhs_dir / "img").mkdir(exist_ok=True)
    (xhs_dir / "video").mkdir(exist_ok=True)

    await _download_media(
        note,
        xhs_dir,
        include_images=include_images,
        include_video=include_video,
        include_live_photo=include_live_photo,
    )

    date = note.published_at.strftime("%Y-%m-%d") if note.published_at else datetime.now().strftime("%Y-%m-%d")
    md_name = f"{date} {_slug(note.title, note.id[:8])}.md"
    md_path = xhs_dir / md_name
    md_path.write_text(
        _render_markdown(
            note,
            include_comments=include_comments,
            include_sub_comments=include_sub_comments,
            comments_limit=comments_limit,
        ),
        encoding="utf-8",
    )

    return {
        "success": True,
        "note_id": note.id,
        "title": note.title,
        "author": note.author,
        "url": note.url,
        "markdown_path": str(md_path),
        "xhs_dir": str(xhs_dir),
        "xhs_root_dir": str(root_xhs_dir),
        "used_cdp": note.used_cdp,
        "warnings": note.warnings,
        "remote_resources": {
            "images": [image.get("remote_default") for image in note.images if image.get("remote_default")],
            "video": note.video_url or None,
            "live": [item["url"] for item in note.live_urls],
        },
        "local_resources": [
            {
                "label": item.label,
                "type": item.type,
                "path": str(item.path),
                "relative_path": item.relative_path,
                "remote_url": item.remote_url,
                "size": item.size,
            }
            for item in note.local_resources
        ],
    }


def _albums_progress_path(vault_path: str | Path | None) -> Path:
    return _vault_xhs_dir(vault_path) / ".xhs-albums-progress.json"


def _albums_cache_path(vault_path: str | Path | None) -> Path:
    return _vault_xhs_dir(vault_path) / ".xhs-albums-cache.json"


def _load_album_cache(vault_path: str | Path | None) -> list[dict[str, Any]]:
    path = _albums_cache_path(vault_path)
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        albums = data.get("albums") if isinstance(data, dict) else data
        return albums if isinstance(albums, list) else []
    except Exception:
        return []


def _save_album_cache(vault_path: str | Path | None, albums: list[dict[str, Any]]) -> None:
    path = _albums_cache_path(vault_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {"updated_at": datetime.now().astimezone().isoformat(), "albums": albums},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def _load_album_progress(vault_path: str | Path | None) -> dict[str, Any]:
    path = _albums_progress_path(vault_path)
    if not path.exists():
        return {"last_run_at": "", "albums": {}, "notes": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data.setdefault("albums", {})
            data.setdefault("notes", {})
            return data
    except Exception:
        pass
    return {"last_run_at": "", "albums": {}, "notes": {}}


def _save_album_progress(vault_path: str | Path | None, progress: dict[str, Any]) -> None:
    path = _albums_progress_path(vault_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    progress["last_run_at"] = datetime.now().astimezone().isoformat()
    path.write_text(json.dumps(progress, ensure_ascii=False, indent=2), encoding="utf-8")


ALBUM_EXTRACT_JS = r"""
() => {
  const out = [];
  const seen = new Set();
  for (const a of document.querySelectorAll('a[href*="/board/"]')) {
    const m = a.href.match(/\/board\/([0-9a-f]{24})/);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const lines = (a.innerText || '').trim().split(/\n+/).map(s => s.trim()).filter(Boolean);
    const countLine = lines.find(x => x.includes('笔记・') || x.includes('笔记·')) || '';
    const cm = countLine.match(/笔记[・·](\d+)/);
    const img = a.querySelector('img');
    out.push({
      board_id: m[1],
      name: lines[0] || '未命名专辑',
      count: cm ? Number(cm[1]) : null,
      url: a.href,
      preview_image: img?.src || '',
      latest_title: lines.find(x => x && x !== lines[0] && !x.includes('笔记')) || ''
    });
  }
  return out;
}
"""


async def _list_albums_headless(cookie: str | None, progress_callback: Any | None = None) -> list[dict[str, Any]]:
    """用无界面 Playwright 打开收藏专辑页，不影响用户当前浏览器。"""
    def report(stage: str, current_step: int = 0, total_steps: int = 7) -> None:
        if progress_callback:
            progress_callback({"stage": stage, "current_step": current_step, "total_steps": total_steps})

    if not cookie:
        return []
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return []

    cookies = _cookie_to_playwright(cookie)
    if not cookies:
        return []

    async with async_playwright() as p:
        report("启动无界面浏览器", 1)
        browser = await p.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
            locale="zh-CN",
            timezone_id="Asia/Shanghai",
            viewport={"width": 1440, "height": 900},
        )
        try:
            await context.add_cookies(cookies)
            page = await context.new_page()
            report("进入小红书首页", 2)
            await page.goto("https://www.xiaohongshu.com/explore", wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(5000)
            report("打开个人主页", 3)
            await page.locator('a[href*="/user/profile/"]').filter(has_text="我").first.click(timeout=10000)
            await page.wait_for_timeout(6000)
            report("打开收藏页", 4)
            await page.locator(".reds-tab-item").filter(has_text="收藏").first.click(timeout=10000)
            await page.wait_for_timeout(3000)
            report("打开专辑页", 5)
            await page.locator(".reds-tab-item").filter(has_text="专辑").first.click(timeout=10000)
            await page.wait_for_timeout(5000)
            report("读取专辑列表", 6)
            albums = await page.evaluate(ALBUM_EXTRACT_JS)
            report("专辑列表读取完成", 7)
            return albums if isinstance(albums, list) else []
        finally:
            await browser.close()


async def list_xhs_album_previews(
    *,
    cookie: str | None = None,
    vault_path: str | Path | None = None,
    cdp_port: int = 9222,
    background: bool = True,
    allow_cdp_fallback: bool = False,
    progress_callback: Any | None = None,
) -> dict[str, Any]:
    """从已打开的小红书收藏/专辑页面提取专辑预览。"""
    expression = r"""
    (() => {
      const out = [];
      const seen = new Set();
      for (const a of document.querySelectorAll('a[href*="/board/"]')) {
        const m = a.href.match(/\/board\/([0-9a-f]{24})/);
        if (!m || seen.has(m[1])) continue;
        seen.add(m[1]);
        const lines = (a.innerText || '').trim().split(/\n+/).map(s => s.trim()).filter(Boolean);
        const countLine = lines.find(x => x.includes('笔记・') || x.includes('笔记·')) || '';
        const cm = countLine.match(/笔记[・·](\d+)/);
        const img = a.querySelector('img');
        out.push({
          board_id: m[1],
          name: lines[0] || '未命名专辑',
          count: cm ? Number(cm[1]) : null,
          url: a.href,
          preview_image: img?.src || '',
          latest_title: lines.find(x => x && x !== lines[0] && !x.includes('笔记')) || ''
        });
      }
      return JSON.stringify(out);
    })()
    """

    def collect_albums(page_results: list[Any]) -> list[dict[str, Any]]:
        collected: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for result in page_results:
            if isinstance(result, dict):
                result = result.get("albums", [])
            if not isinstance(result, list):
                continue
            for album in result:
                board_id = str(album.get("board_id") or "")
                if not board_id or board_id in seen_ids:
                    continue
                seen_ids.add(board_id)
                collected.append(album)
        return collected

    headless_error = ""
    try:
        albums = await _list_albums_headless(cookie, progress_callback=progress_callback)
    except Exception as exc:
        albums = []
        headless_error = str(exc)
    auto_message = "headless"

    if not albums and not allow_cdp_fallback:
        cached = _load_album_cache(vault_path)
        if cached:
            progress = _load_album_progress(vault_path)
            for album in cached:
                state = progress.get("albums", {}).get(str(album.get("board_id") or ""), {})
                album["seen_count"] = len(state.get("seen_note_ids", []))
                album["new_estimate"] = None
                if isinstance(album.get("count"), int):
                    album["new_estimate"] = max(int(album["count"]) - album["seen_count"], 0)
            return {
                "success": True,
                "albums": cached,
                "total": len(cached),
                "progress_path": str(_albums_progress_path(vault_path)),
                "message": f"后台读取失败，已恢复本地缓存的 {len(cached)} 个专辑",
                "from_cache": True,
                "warning": headless_error,
            }
        return {
            "success": True,
            "albums": [],
            "total": 0,
            "progress_path": str(_albums_progress_path(vault_path)),
            "message": "无界面浏览器没有读取到收藏专辑。请先点一键获取 Cookie，或确认 Cookie 仍有效。",
            "warning": headless_error,
        }

    if not albums:
        page_results = await _evaluate_existing_xhs_pages(expression, port=cdp_port)
        albums = collect_albums(page_results)
        auto_message = ""

    if not albums:
        auto_expression = r"""
        (async () => {
          const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
          const extract = () => {
            const out = [];
            const seen = new Set();
            for (const a of document.querySelectorAll('a[href*="/board/"]')) {
              const m = a.href.match(/\/board\/([0-9a-f]{24})/);
              if (!m || seen.has(m[1])) continue;
              seen.add(m[1]);
              const lines = (a.innerText || '').trim().split(/\n+/).map(s => s.trim()).filter(Boolean);
              const countLine = lines.find(x => x.includes('笔记・') || x.includes('笔记·')) || '';
              const cm = countLine.match(/笔记[・·](\d+)/);
              const img = a.querySelector('img');
              out.push({
                board_id: m[1],
                name: lines[0] || '未命名专辑',
                count: cm ? Number(cm[1]) : null,
                url: a.href,
                preview_image: img?.src || '',
                latest_title: lines.find(x => x && x !== lines[0] && !x.includes('笔记')) || ''
              });
            }
            return out;
          };
          const clickTarget = (predicate) => {
            const target = [...document.querySelectorAll('a,button,div,span')].find(predicate);
            if (!target) return false;
            const clickable = target.closest('a,button,[role="button"],.reds-tab-item,.sub-tab-list') || target;
            clickable.scrollIntoView({block: 'center', inline: 'center'});
            clickable.click();
            return true;
          };

          let albums = extract();
          if (albums.length) return JSON.stringify({stage: 'already', href: location.href, albums});

          if (!/\/user\/profile\//.test(location.href)) {
            const mineLink = [...document.querySelectorAll('a[href*="/user/profile/"]')]
              .find(a => (a.innerText || '').trim() === '我' || (a.getAttribute('aria-label') || '').includes('我'));
            if (mineLink) {
              mineLink.click();
            } else {
              clickTarget(el => (el.innerText || el.textContent || '').trim() === '我');
            }
            await sleep(6000);
          }

          clickTarget(el => {
            const text = (el.innerText || el.textContent || '').trim();
            return text === '收藏' && (String(el.className).includes('tab') || el.tagName === 'SPAN');
          });
          await sleep(3000);
          clickTarget(el => {
            const text = (el.innerText || el.textContent || '').trim();
            return /^专辑[・·]\d+/.test(text) || text === '专辑';
          });
          await sleep(5000);
          albums = extract();
          return JSON.stringify({
            stage: albums.length ? 'opened_albums' : 'not_found',
            href: location.href,
            title: document.title,
            body: (document.body?.innerText || '').slice(0, 600),
            albums
          });
        })()
        """
        auto_result = await _evaluate_cdp_json(
            "https://www.xiaohongshu.com/explore",
            auto_expression,
            port=cdp_port,
            wait_seconds=8,
            close_target=False,
            background=background,
        )
        albums = collect_albums([auto_result])
        if isinstance(auto_result, dict):
            auto_message = f"自动打开结果: {auto_result.get('stage', '')} {auto_result.get('href', '')}".strip()

    progress = _load_album_progress(vault_path)
    for album in albums:
        state = progress.get("albums", {}).get(album["board_id"], {})
        album["seen_count"] = len(state.get("seen_note_ids", []))
        album["new_estimate"] = None
        if isinstance(album.get("count"), int):
            album["new_estimate"] = max(int(album["count"]) - album["seen_count"], 0)

    if albums:
        _save_album_cache(vault_path, albums)

    return {
        "success": True,
        "albums": albums,
        "total": len(albums),
        "progress_path": str(_albums_progress_path(vault_path)),
        "message": (
            f"找到 {len(albums)} 个专辑"
            if albums
            else f"已自动尝试打开个人主页 -> 收藏 -> 专辑，但仍未发现专辑。{auto_message}".strip()
        ),
    }


def _board_notes_extract_expression(board_id: str) -> str:
    return (
        "(() => {"
        "const state = window.__INITIAL_STATE__ || {};"
        "const boardId = " + json.dumps(board_id) + ";"
        "const feedMapRaw = state.board?.boardFeedsMap || {};"
        "const feedMap = feedMapRaw._value || feedMapRaw._rawValue || feedMapRaw;"
        "const notes = feedMap?.[boardId]?.notes || [];"
        "return JSON.stringify(notes.map(n => ({"
        "note_id: n.noteId || n.note_id || n.id,"
        "xsec_token: n.xsecToken || n.xsec_token || '',"
        "title: n.displayTitle || n.title || '',"
        "type: n.type || '',"
        "time: n.time || n.publishTime || n.publish_time || 0,"
        "cover: n.cover?.url || n.cover?.urlPre || n.cover?.urlDefault || n.image || '',"
        "author: n.user?.nickName || n.user?.nickname || '',"
        "likes: n.interactInfo?.likedCount || n.interact_info?.liked_count || 0"
        "})));"
        "})()"
    )


async def _fetch_board_notes_headless(
    board_id: str,
    url: str,
    cookie: str | None,
    expected_total: int | None = None,
    progress_callback: Any | None = None,
) -> list[dict[str, Any]]:
    if not cookie:
        return []
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return []

    board_url = url or f"https://www.xiaohongshu.com/board/{board_id}?source=web_user_page"
    cookies = _cookie_to_playwright(cookie)
    if not cookies:
        return []

    expression = _board_notes_extract_expression(board_id)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
            locale="zh-CN",
            timezone_id="Asia/Shanghai",
            viewport={"width": 1440, "height": 900},
        )
        try:
            await context.add_cookies(cookies)
            page = await context.new_page()
            seen: dict[str, dict[str, Any]] = {}
            await page.goto(board_url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(5000)
            if progress_callback:
                progress_callback({"stage": "读取专辑笔记列表", "pages_loaded": 1, "total_notes": 0})
            data = await page.evaluate(expression)
            notes = json.loads(data) if isinstance(data, str) else data
            notes = notes if isinstance(notes, list) else []
            seen = {
                str(item.get("note_id") or index): item for index, item in enumerate(notes) if isinstance(item, dict)
            }
            no_growth_rounds = 0
            pages_loaded = 1
            if progress_callback:
                progress_callback(
                    {
                        "stage": "读取专辑笔记列表",
                        "pages_loaded": pages_loaded,
                        "total_notes": len(seen),
                        "expected_total": expected_total,
                    }
                )
            target_total = max(int(expected_total or 0), 0)
            max_scroll_rounds = 240 if target_total > 120 else 100
            while pages_loaded < max_scroll_rounds:
                before_count = len(seen)
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(1200)
                await page.mouse.wheel(0, 3200)
                await page.keyboard.press("End")
                pages_loaded += 1
                await page.wait_for_timeout(3200)
                data = await page.evaluate(expression)
                page_notes = json.loads(data) if isinstance(data, str) else data
                if isinstance(page_notes, list):
                    for index, item in enumerate(page_notes):
                        if isinstance(item, dict):
                            seen[str(item.get("note_id") or f"{pages_loaded}-{index}")] = item
                if len(seen) <= before_count:
                    no_growth_rounds += 1
                else:
                    no_growth_rounds = 0
                if progress_callback:
                    progress_callback(
                        {
                            "stage": "专辑列表翻页",
                            "pages_loaded": pages_loaded,
                            "total_notes": len(seen),
                            "no_growth_rounds": no_growth_rounds,
                            "expected_total": expected_total,
                        }
                    )
                if target_total and len(seen) >= target_total:
                    break
                if target_total:
                    if no_growth_rounds >= 10 and pages_loaded >= 20 and len(seen) >= max(int(target_total * 0.92), target_total - 8):
                        break
                elif no_growth_rounds >= 8 and pages_loaded >= 12:
                    break
            if progress_callback:
                progress_callback(
                    {
                        "stage": "专辑笔记列表读取完成",
                        "pages_loaded": pages_loaded,
                        "total_notes": len(seen),
                        "expected_total": expected_total,
                    }
                )
            return list(seen.values())
        finally:
            await browser.close()


async def _fetch_board_notes(
    board_id: str,
    url: str,
    cdp_port: int,
    cookie: str | None = None,
    expected_total: int | None = None,
    progress_callback: Any | None = None,
) -> list[dict[str, Any]]:
    board_url = url or f"https://www.xiaohongshu.com/board/{board_id}?source=web_user_page"
    expression = _board_notes_extract_expression(board_id)
    headless_error: Exception | None = None
    try:
        notes = await _fetch_board_notes_headless(
            board_id,
            url,
            cookie,
            expected_total=expected_total,
            progress_callback=progress_callback,
        )
        if notes:
            return notes
    except Exception as exc:
        headless_error = exc

    try:
        if progress_callback:
            progress_callback({"stage": "CDP 读取专辑笔记列表", "pages_loaded": 1, "expected_total": expected_total})
        data = await _evaluate_cdp_json(board_url, expression, port=cdp_port, wait_seconds=8, background=True)
        notes = data if isinstance(data, list) else []
        if progress_callback:
            progress_callback(
                {
                    "stage": "专辑笔记列表读取完成",
                    "pages_loaded": 1,
                    "total_notes": len(notes),
                    "expected_total": expected_total,
                }
            )
        return notes
    except Exception:
        if headless_error:
            raise headless_error
        raise


async def crawl_xhs_albums_incremental(
    albums: list[dict[str, Any]],
    *,
    cookie: str | None = None,
    vault_path: str | Path | None = None,
    include_images: bool = False,
    include_video: bool = False,
    include_live_photo: bool = False,
    include_comments: bool = False,
    include_sub_comments: bool = False,
    comments_limit: int = 20,
    cdp_port: int = 9222,
    max_notes_per_album: int | None = None,
    before_date: str | None = None,
    recent_days: int | None = None,
    crawl_mode: str = "incremental",
    crawl_delay_seconds: float = 8.0,
    progress_callback: Any | None = None,
) -> dict[str, Any]:
    """按选中的收藏专辑抓取。incremental 跳过已记录笔记，full 处理专辑内全部已加载笔记。"""
    if not albums:
        raise RuntimeError("请选择至少一个专辑")
    mode = "full" if str(crawl_mode).lower() == "full" else "incremental"

    progress = _load_album_progress(vault_path)
    results: list[dict[str, Any]] = []
    saved = 0
    skipped = 0
    failed = 0
    cutoff_dt = None
    since_dt = None
    if recent_days and mode != "full":
        try:
            days = max(1, int(recent_days))
            since_dt = datetime.now().astimezone().date() - timedelta(days=days - 1)
        except Exception:
            since_dt = None
    if before_date and mode != "full":
        try:
            cutoff_dt = datetime.strptime(before_date, "%Y-%m-%d").date()
        except Exception:
            cutoff_dt = None

    def report(stage: str, **extra: Any) -> None:
        if progress_callback:
            progress_callback(
                {
                    "stage": stage,
                    "saved": saved,
                    "skipped": skipped,
                    "failed": failed,
                    "total_albums": len(albums),
                    **extra,
                }
            )

    for album_index, album in enumerate(albums, 1):
        board_id = str(album.get("board_id") or album.get("boardId") or "")
        name = str(album.get("name") or "未命名专辑")
        url = str(album.get("url") or "")
        report("读取专辑", current_album=name, current_album_index=album_index)
        if not board_id:
            failed += 1
            results.append({"success": False, "album": name, "error": "缺少 board_id"})
            report("专辑失败", current_album=name, current_album_index=album_index)
            continue

        album_state = progress["albums"].setdefault(
            board_id,
            {"name": name, "count": album.get("count"), "seen_note_ids": [], "last_cursor": "", "done": False},
        )
        seen_ids = set(album_state.get("seen_note_ids", []))
        try:
            def report_board_progress(payload: dict[str, Any]) -> None:
                stage = str(payload.pop("stage", "读取专辑笔记列表"))
                report(stage, current_album=name, current_album_index=album_index, **payload)

            notes = await _fetch_board_notes(
                board_id,
                url,
                cdp_port,
                cookie=cookie,
                expected_total=album.get("count"),
                progress_callback=report_board_progress,
            )
        except Exception as exc:
            failed += 1
            results.append({"success": False, "album": name, "board_id": board_id, "error": str(exc)})
            report("专辑失败", current_album=name, current_album_index=album_index)
            continue

        album_saved = 0
        album_skipped = 0
        notes_to_process = notes if max_notes_per_album is None else notes[:max(1, int(max_notes_per_album))]
        processed_note_count = len(notes_to_process)
        for note_index, item in enumerate(notes_to_process, 1):
            note_id = str(item.get("note_id") or "")
            if not note_id:
                continue
            note_date = _extract_datetime(item.get("time"))
            if since_dt and note_date and note_date.date() < since_dt:
                album_skipped += 1
                skipped += 1
                report(
                    "跳过较旧笔记",
                    current_album=name,
                    current_album_index=album_index,
                    current_note_index=note_index,
                    total_notes=processed_note_count,
                )
                continue
            if cutoff_dt and note_date and note_date.date() > cutoff_dt:
                album_skipped += 1
                skipped += 1
                report(
                    "跳过较新笔记",
                    current_album=name,
                    current_album_index=album_index,
                    current_note_index=note_index,
                    total_notes=processed_note_count,
                )
                continue
            if mode == "incremental" and note_id in seen_ids:
                album_skipped += 1
                skipped += 1
                report(
                    "跳过已抓笔记",
                    current_album=name,
                    current_album_index=album_index,
                    current_note_index=note_index,
                    total_notes=processed_note_count,
                )
                continue
            detail_url = (
                f"https://www.xiaohongshu.com/explore/{note_id}"
                f"?xsec_token={item.get('xsec_token', '')}&xsec_source=pc_collect_board"
            )
            try:
                report(
                    "抓取笔记详情",
                    current_album=name,
                    current_album_index=album_index,
                    current_note_index=note_index,
                    total_notes=processed_note_count,
                )
                note_result = await crawl_xhs_note_to_vault(
                    detail_url,
                    cookie=cookie,
                    vault_path=vault_path,
                    include_images=include_images,
                    include_video=include_video,
                    include_live_photo=include_live_photo,
                    include_comments=include_comments,
                    include_sub_comments=include_sub_comments,
                    comments_limit=comments_limit,
                    use_cdp=True,
                    cdp_port=cdp_port,
                    subfolder=name,
                )
                seen_ids.add(note_id)
                album_state["seen_note_ids"] = sorted(seen_ids)
                progress["notes"].setdefault(
                    note_id,
                    {"file": note_result.get("markdown_path"), "albums": [], "last_seen_at": ""},
                )
                note_state = progress["notes"][note_id]
                note_state["file"] = note_result.get("markdown_path")
                note_state["last_seen_at"] = datetime.now().astimezone().isoformat()
                note_state.setdefault("albums", [])
                if name not in note_state["albums"]:
                    note_state["albums"].append(name)
                _save_album_progress(vault_path, progress)
                album_saved += 1
                saved += 1
                report(
                    "已保存笔记",
                    current_album=name,
                    current_album_index=album_index,
                    current_note_index=note_index,
                    total_notes=processed_note_count,
                )
            except Exception as exc:
                failed += 1
                results.append({"success": False, "album": name, "note_id": note_id, "error": str(exc)})
                report(
                    "单条失败",
                    current_album=name,
                    current_album_index=album_index,
                    current_note_index=note_index,
                    total_notes=processed_note_count,
                )
            finally:
                if crawl_delay_seconds > 0 and note_index < processed_note_count:
                    max_delay = min(max(3.0, float(crawl_delay_seconds)), 8.0)
                    delay = random.uniform(3.0, max_delay)
                    report(
                        "等待限速",
                        current_album=name,
                        current_album_index=album_index,
                        current_note_index=note_index,
                        total_notes=processed_note_count,
                        delay_seconds=round(delay, 1),
                    )
                    await asyncio.sleep(delay)

        album_state["name"] = name
        album_state["count"] = album.get("count")
        _save_album_progress(vault_path, progress)
        results.append(
            {
                "success": True,
                "album": name,
                "board_id": board_id,
                "found": len(notes),
                "saved": album_saved,
                "skipped": album_skipped,
            }
        )
        report("专辑完成", current_album=name, current_album_index=album_index)

    return {
        "success": True,
        "saved": saved,
        "skipped": skipped,
        "failed": failed,
        "crawl_mode": mode,
        "progress_path": str(_albums_progress_path(vault_path)),
        "results": results,
    }
