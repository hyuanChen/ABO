"""小红书笔记入库爬取器。

当前主链路：
- 优先通过本地浏览器扩展 bridge 复用真实浏览器和真实登录态
- bridge 不可用时再复用本机 Edge/Chrome CDP 调试端口
- 两条浏览器链路都失败时，最后再回退到后端详情页 HTML 解析
- 保留远程图片/视频链接，同时下载本地资源到 vault/xhs
- 输出 skill 风格 Markdown
"""

from __future__ import annotations

import asyncio
import json
import math
import random
import re
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx

from abo.creator_smart_groups import extract_signal_tokens
from abo.tools.xhs_extension_bridge import XHSExtensionBridge
from abo.vault.unified_entry import UnifiedVaultEntry, first_non_empty, normalize_string_list, safe_load_frontmatter
from abo.vault.writer import write_unified_note


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
    comments: list[dict[str, Any]] = field(default_factory=list)
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
    content_signals: list[str] = field(default_factory=list)
    source_summary: str = ""
    score: float = 0.0


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _extension_should_navigate_background(dedicated_window_mode: bool) -> bool:
    return bool(dedicated_window_mode)


def _is_xhs_risk_error(error: Any) -> bool:
    text = _safe_str(error)
    if not text:
        return False
    keywords = [
        "300012",
        "300013",
        "安全限制",
        "访问频繁",
        "请稍后再试",
        "ip存在风险",
        "ip 风险",
        "登录状态异常",
    ]
    lowered = text.lower()
    return any(keyword.lower() in lowered for keyword in keywords)


def _classify_xhs_page_text(text: str) -> tuple[str, str] | None:
    normalized = _safe_str(text)
    if not normalized:
        return None

    rules = [
        ("risk_limited", "访问频繁", "命中小红书访问频繁限制，任务已停止"),
        ("risk_limited", "安全限制", "命中小红书安全限制，任务已停止"),
        ("risk_limited", "安全访问", "命中小红书安全访问限制，任务已停止"),
        ("risk_limited", "请稍后再试", "小红书要求稍后重试，任务已停止"),
        ("manual_required", "扫码", "页面要求扫码验证，任务已停止，等待人工处理"),
        ("auth_invalid", "请先登录", "当前浏览器未登录小红书，任务已停止"),
        ("auth_invalid", "登录后查看更多内容", "当前页面要求登录后查看，任务已停止"),
        ("not_found", "300031", "当前笔记暂时无法浏览，任务已停止"),
        ("not_found", "页面不见了", "页面已不可访问，任务已停止"),
        ("not_found", "你访问的页面不见了", "页面已不可访问，任务已停止"),
        ("not_found", "内容无法展示", "页面内容不可展示，任务已停止"),
        ("not_found", "笔记不存在", "笔记不存在或已删除，任务已停止"),
        ("not_found", "内容已无法查看", "内容已无法查看，任务已停止"),
    ]
    for code, marker, message in rules:
        if marker in normalized:
            return code, message
    return None


def _should_stop_xhs_task(error: Any) -> bool:
    text = _safe_str(error)
    stop_markers = [
        "[risk_limited]",
        "[manual_required]",
        "[auth_invalid]",
        "[not_found]",
        "任务已停止",
    ]
    lowered = text.lower()
    return any(marker.lower() in lowered for marker in stop_markers)


def classify_xhs_runtime_error(error: Any) -> dict[str, Any]:
    text = _safe_str(error)
    match = re.search(r"\[(?P<code>[a-z_]+)\]\s*(?P<message>.+)", text)
    if match:
        code = match.group("code")
        message = match.group("message")
        return {"code": code, "message": message, "stop": _should_stop_xhs_task(text)}

    if _is_xhs_risk_error(text):
        return {"code": "risk_limited", "message": text or "命中风控限制", "stop": True}

    return {"code": "unknown_error", "message": text or "未知错误", "stop": _should_stop_xhs_task(text)}


def _raise_for_xhs_snapshot(snapshot: Any) -> None:
    if not isinstance(snapshot, dict):
        return
    risk = snapshot.get("risk")
    if isinstance(risk, dict) and risk.get("code"):
        code = _safe_str(risk.get("code"))
        message = _safe_str(risk.get("message")) or "页面状态异常"
        raise RuntimeError(f"[{code}] {message}，任务已停止")


async def _wait_xhs_state_via_bridge(
    bridge: XHSExtensionBridge,
    *,
    kind: str,
    note_id: str = "",
    board_id: str = "",
    timeout_ms: int = 15000,
    interval_ms: int = 500,
    command_timeout: float = 20.0,
) -> dict[str, Any]:
    """在页面 MAIN world 等待 XHS 状态对象就绪。

    参考 xiaohongshu-skills 的 bridge 思路：
    CLI/后端 -> bridge -> 扩展 -> 真实浏览器 tab -> MAIN world 读取页面状态。
    这里不抓接口，优先等页面已经渲染出的状态路径：
    - 首页 Feed: window.__INITIAL_STATE__.feed.feeds
    - 搜索结果: window.__INITIAL_STATE__.search.feeds
    - 详情页: window.__INITIAL_STATE__.note.noteDetailMap
    - 专辑页: window.__INITIAL_STATE__.board.boardFeedsMap[boardId].notes
    """
    snapshot = await bridge.call(
        "wait_for_xhs_state",
        {
            "kind": kind,
            "noteId": note_id,
            "boardId": board_id,
            "timeout": timeout_ms,
            "interval": interval_ms,
        },
        timeout=command_timeout,
    )
    _raise_for_xhs_snapshot(snapshot)
    return snapshot if isinstance(snapshot, dict) else {}


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
            if note_id and note_id in detail_map:
                candidates.append(detail_map[note_id])
            elif not note_id:
                candidates.extend(detail_map.values())
            if note_id and not candidates:
                for item in detail_map.values():
                    if not isinstance(item, dict):
                        continue
                    note = item.get("note") if isinstance(item.get("note"), dict) else item
                    candidate_id = _safe_str(note.get("noteId") or note.get("id")) if isinstance(note, dict) else ""
                    if candidate_id == note_id:
                        candidates.append(item)
                        break
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


async def _macos_real_browser_tab_pulse() -> dict[str, Any]:
    if sys.platform != "darwin":
        return {"ok": False, "reason": "unsupported_platform"}

    async def run_for_app(app_name: str) -> dict[str, Any]:
        script = f'''
tell application "{app_name}"
  if not running then error "not_running"
  activate
  if (count of windows) = 0 then error "no_window"
  set targetWindow to front window
  set tabCount to count of tabs of targetWindow
  if tabCount < 1 then error "no_tab"
  set originalIndex to active tab index of targetWindow
  if tabCount > 1 then
    set altIndex to originalIndex + 1
    if altIndex > tabCount then set altIndex to 1
    set active tab index of targetWindow to altIndex
    delay 0.35
    set active tab index of targetWindow to originalIndex
    delay 0.35
    return "ok|existing_tab"
  end if
  return "single_tab"
end tell
'''
        proc = await asyncio.create_subprocess_exec(
            "/usr/bin/osascript",
            "-",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate(script.encode("utf-8"))
        if proc.returncode != 0:
            return {
                "ok": False,
                "app": app_name,
                "reason": "osascript_failed",
                "stderr": (stderr or b"").decode("utf-8", errors="ignore").strip(),
            }
        text = (stdout or b"").decode("utf-8", errors="ignore").strip()
        if text == "ok|existing_tab":
            return {"ok": True, "app": app_name, "mode": "existing_tab"}
        if text == "single_tab":
            return {"ok": False, "app": app_name, "reason": "single_tab"}
        return {"ok": False, "app": app_name, "reason": "invalid_output", "output": text}

    errors: list[dict[str, Any]] = []
    for app_name in ["Microsoft Edge", "Google Chrome", "Chromium"]:
        result = await run_for_app(app_name)
        if result.get("ok"):
            return result
        if result.get("reason") == "single_tab":
            return result
        errors.append(result)
    return {"ok": False, "reason": "no_supported_browser", "attempts": errors}


async def _macos_frontmost_app_name() -> str:
    if sys.platform != "darwin":
        return ""
    proc = await asyncio.create_subprocess_exec(
        "/usr/bin/osascript",
        "-e",
        'tell application "System Events" to get name of first application process whose frontmost is true',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    if proc.returncode != 0:
        return ""
    return (stdout or b"").decode("utf-8", errors="ignore").strip()


async def _macos_activate_app(app_name: str) -> dict[str, Any]:
    if sys.platform != "darwin" or not app_name:
        return {"ok": False, "reason": "unsupported_or_empty"}
    proc = await asyncio.create_subprocess_exec(
        "/usr/bin/osascript",
        "-e",
        f'tell application "{app_name}" to activate',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        return {
            "ok": False,
            "reason": "activate_failed",
            "app": app_name,
            "stderr": (stderr or b"").decode("utf-8", errors="ignore").strip(),
        }
    return {"ok": True, "app": app_name}


async def _fetch_state_backend(url: str, cookie: str | None) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url, headers=_headers(cookie, BASE_URL))
        resp.raise_for_status()
        return extract_initial_state(resp.text)


def _build_extension_note_expression(note_id: str) -> str:
    note_id_js = json.dumps(note_id, ensure_ascii=False)
    return (
        "(() => {"
        f"const noteId = {note_id_js};"
        "const unwrap = (value) => {"
        "  let current = value;"
        "  const seen = new Set();"
        "  while (current && typeof current === 'object' && !seen.has(current)) {"
        "    seen.add(current);"
        "    if (Array.isArray(current)) return current;"
        "    if ('_value' in current) { current = current._value; continue; }"
        "    if ('value' in current) { current = current.value; continue; }"
        "    break;"
        "  }"
        "  return current;"
        "};"
        "const isNoteLike = (value) => {"
        "  if (!value || typeof value !== 'object') return false;"
        "  const id = value.noteId || value.note_id || value.id || '';"
        "  const hasText = !!(value.title || value.desc || value.content || value.noteDesc || value.displayTitle);"
        "  const hasMedia = Array.isArray(value.imageList) || !!value.video || !!value.interactInfo || !!value.user || !!value.userInfo;"
        "  return !!id && hasText && hasMedia;"
        "};"
        "const wrapDetail = (value) => {"
        "  if (!value || typeof value !== 'object') return null;"
        "  if (value.note && typeof value.note === 'object') return value;"
        "  if (isNoteLike(value)) return { note: value };"
        "  return null;"
        "};"
        "const state = window.__INITIAL_STATE__ || {};"
        "const text = document.body?.innerText || '';"
        "const noteState = unwrap(state.note) || {};"
        "const map = unwrap(noteState.noteDetailMap) || {};"
        "const mapValues = map && typeof map === 'object' ? Object.values(map) : [];"
        "const findDetailById = (items, targetId) => {"
        "  for (const item of (Array.isArray(items) ? items : [])) {"
        "    if (!item || typeof item !== 'object') continue;"
        "    const note = item.note && typeof item.note === 'object' ? item.note : item;"
        "    const candidateId = note.noteId || note.note_id || note.id || '';"
        "    if (!targetId || candidateId === targetId) return item;"
        "  }"
        "  return null;"
        "};"
        "let detail = noteId ? (map[noteId] || findDetailById(mapValues, noteId)) : (mapValues[0] || null);"
        "let detailStrategy = detail ? 'extension_note_detail_map' : '';"
        "if (!detail) {"
        "  const roots = ["
        "    unwrap(state.note),"
        "    unwrap(state.feed?.feeds),"
        "    unwrap(state.feed?.items),"
        "    unwrap(state.search?.feeds),"
        "    unwrap(state.search?.notes),"
        "    unwrap(state.search?.noteList),"
        "    unwrap(state.board?.boardFeedsMap)"
        "  ].filter(Boolean);"
        "  const queue = roots.map((value) => ({ value, depth: 0 }));"
        "  const seenObjects = new WeakSet();"
        "  let visits = 0;"
        "  while (queue.length && visits < 2800 && !detail) {"
        "    const current = queue.shift();"
        "    const value = current?.value;"
        "    const depth = current?.depth || 0;"
        "    if (!value || typeof value !== 'object' || depth > 6 || seenObjects.has(value)) continue;"
        "    seenObjects.add(value);"
        "    visits += 1;"
        "    if (value.note && typeof value.note === 'object' && isNoteLike(value.note)) {"
        "      const candidateId = value.note.noteId || value.note.note_id || value.note.id || '';"
        "      if (!noteId || candidateId === noteId) {"
        "        detail = value;"
        "        detailStrategy = 'extension_state_tree_detail';"
        "        break;"
        "      }"
        "    }"
        "    if (isNoteLike(value)) {"
        "      const candidateId = value.noteId || value.note_id || value.id || '';"
        "      if (!noteId || candidateId === noteId) {"
        "        detail = { note: value };"
        "        detailStrategy = 'extension_state_tree_note';"
        "        break;"
        "      }"
        "    }"
        "    const children = Array.isArray(value)"
        "      ? value.slice(0, 120)"
        "      : Object.keys(value).slice(0, 120).map((key) => {"
        "          try { return value[key]; } catch (_) { return null; }"
        "        });"
        "    for (const child of children) {"
        "      if (child && typeof child === 'object') queue.push({ value: child, depth: depth + 1 });"
        "    }"
        "  }"
        "}"
        "const feedState = unwrap(state.feed) || {};"
        "const feeds = unwrap(feedState.feeds);"
        "const feedItems = Array.isArray(feeds) ? feeds.slice(0, 10).map((item) => ({"
        "  id: item?.id || item?.noteId || item?.note_id || item?.noteCard?.noteId || '',"
        "  xsecToken: item?.xsecToken || item?.xsec_token || item?.noteCard?.xsecToken || item?.noteCard?.xsec_token || '',"
        "  title: item?.noteCard?.displayTitle || item?.noteCard?.title || item?.title || ''"
        "})) : [];"
        "return {"
        "  href: location.href,"
        "  title: document.title || '',"
        "  text: text.slice(0, 2000),"
        "  hasState: !!window.__INITIAL_STATE__,"
        "  hasDetail: !!detail,"
        "  detailStrategy: detailStrategy || '',"
        "  feedItems,"
        "  state: detail ? { note: { noteDetailMap: { [noteId || 'note']: detail } } } : null"
        "};"
        "})()"
    )


def _build_extension_dom_note_expression(note_id: str) -> str:
    note_id_js = json.dumps(note_id, ensure_ascii=False)
    return (
        "(() => {"
        f"const noteId = {note_id_js};"
        "const textOf = (selectors) => {"
        "  for (const selector of selectors) {"
        "    const el = document.querySelector(selector);"
        "    const text = (el?.innerText || el?.textContent || '').trim();"
        "    if (text) return text;"
        "  }"
        "  return '';"
        "};"
        "const attrOf = (selector, attr) => document.querySelector(selector)?.getAttribute(attr) || '';"
        "const parseCount = (text) => {"
        "  const clean = String(text || '').replace(/[,，\\s]/g, '').trim();"
        "  if (!clean) return 0;"
        "  const m = clean.match(/([0-9]+(?:\\.[0-9]+)?)(万)?/);"
        "  if (!m) return 0;"
        "  const value = Number(m[1]);"
        "  return Number.isFinite(value) ? Math.round(m[2] ? value * 10000 : value) : 0;"
        "};"
        "const detailRoot = document.querySelector('.note-scroller, .note-content, article, main') || document.body;"
        "const withinRoot = (selector) => detailRoot?.querySelector(selector) || null;"
        "const title = (withinRoot('h1')?.innerText || withinRoot('[data-testid=\"note-title\"]')?.innerText || withinRoot('.title')?.innerText || '').trim() ||"
        "  textOf(['h1', '[data-testid=\"note-title\"]', '.note-content .title']);"
        "const desc = (withinRoot('.desc, .note-content, .note-scroller, article')?.innerText || '').trim() ||"
        "  attrOf('meta[name=\"description\"]', 'content');"
        "const authorLink = [...document.querySelectorAll('a[href*=\"/user/profile/\"]')].find((el) => {"
        "  const text = (el.innerText || el.textContent || '').trim();"
        "  return text && text !== '我' && !/关注|粉丝|获赞/.test(text);"
        "}) || withinRoot('a[href*=\"/user/profile/\"]');"
        "const author = (authorLink?.innerText || authorLink?.textContent || '').trim() ||"
        "  ((withinRoot('.author-container .username, .user-name, .author-name')?.innerText || '').trim());"
        "const authorHref = authorLink?.getAttribute('href') || '';"
        "const authorIdMatch = authorHref.match(/\\/user\\/profile\\/([^/?#]+)/);"
        "const ipLocationText = Array.from(detailRoot.querySelectorAll('span,div,p')).map((el) => (el.innerText || '').trim()).find((text) => text.includes('IP') && text.includes('属地')) || '';"
        "const metrics = Array.from(detailRoot.querySelectorAll('button, span, div')).map((el) => (el.innerText || '').trim()).filter(Boolean);"
        "const liked = parseCount(metrics.find((text) => /赞|点赞/.test(text)) || '');"
        "const collected = parseCount(metrics.find((text) => /收藏/.test(text)) || '');"
        "const comments = parseCount(metrics.find((text) => /评论/.test(text)) || '');"
        "const shares = parseCount(metrics.find((text) => /分享/.test(text)) || '');"
        "const images = Array.from(detailRoot.querySelectorAll('img')).map((img) => img.getAttribute('src') || img.getAttribute('data-src') || '').filter((src) => /^https?:/.test(src) && !/sns-avatar/.test(src));"
        "const uniqueImages = [...new Set(images)].slice(0, 20).map((src, index) => ({ index, urlDefault: src, urlPre: src, livePhoto: false }));"
        "const video = withinRoot('video source')?.getAttribute('src') || withinRoot('video')?.getAttribute('src') || attrOf('video source', 'src') || attrOf('video', 'src');"
        "const tags = Array.from(detailRoot.querySelectorAll('a, span')).map((el) => (el.innerText || '').trim()).filter((text) => /^#/.test(text)).slice(0, 20);"
        "if (!title && !desc && !author) return null;"
        "return {"
        "  noteId: noteId || (location.pathname.match(/\\/explore\\/([^/?#]+)/)?.[1] || ''),"
        "  title: title || '无标题',"
        "  desc: desc || '',"
        "  type: video ? 'video' : 'normal',"
        "  time: 0,"
        "  ipLocation: ipLocationText,"
        "  user: { nickname: author || '未知', userId: authorIdMatch ? authorIdMatch[1] : '' },"
        "  interactInfo: {"
        "    likedCount: liked,"
        "    collectedCount: collected,"
        "    commentCount: comments,"
        "    shareCount: shares"
        "  },"
        "  tagList: tags.map((name) => ({ name })),"
        "  imageList: uniqueImages,"
        "  video: video ? { media: { stream: { h264: [{ masterUrl: video, backupUrls: [] }] } }, url: video } : {}"
        "};"
        "})()"
    )


async def _fetch_note_payload_via_extension(
    url: str,
    port: int = 9334,
    connect_timeout: float = 20.0,
    page_timeout: float = 45.0,
    dedicated_window_mode: bool = False,
) -> dict[str, Any]:
    note_id = _extract_note_id(url)
    if not note_id:
        raise RuntimeError("无法从 URL 中提取 note_id")

    async with XHSExtensionBridge(port=port) as bridge:
        await bridge.wait_until_ready(timeout=connect_timeout)
        navigate_background = _extension_should_navigate_background(dedicated_window_mode)

        if dedicated_window_mode:
            await bridge.call(
                "ensure_dedicated_xhs_tab",
                {"url": url},
                timeout=60.0,
            )

        async def read_page() -> dict[str, Any]:
            await bridge.call("wait_dom_stable", {"timeout": 12000, "interval": 500}, timeout=15.0)
            result: dict[str, Any] | None = None
            last_state_error = ""
            for attempt in range(3):
                try:
                    # 先观察页面 MAIN world 状态对象是否就绪，再读取详情。
                    # 这里优先多观察几次当前真实页面，而不是立刻触发更多兜底请求。
                    await _wait_xhs_state_via_bridge(
                        bridge,
                        kind="note",
                        note_id=note_id,
                        timeout_ms=15000 if attempt == 0 else 6000,
                        interval_ms=500,
                        command_timeout=20.0,
                    )
                except Exception as exc:
                    last_state_error = _safe_str(exc)
                current = await bridge.call(
                    "evaluate",
                    {"expression": _build_extension_note_expression(note_id)},
                    timeout=20.0,
                )
                if isinstance(current, dict):
                    result = current
                    state = current.get("state")
                    note_map = (
                        state.get("note", {}).get("noteDetailMap", {})
                        if isinstance(state, dict)
                        else {}
                    )
                    detail = note_map.get(note_id) if isinstance(note_map, dict) else None
                    note_obj = detail.get("note") if isinstance(detail, dict) else None
                    if isinstance(note_obj, dict) and note_obj:
                        break
                if attempt < 2:
                    await asyncio.sleep(0.8 + attempt * 0.7)
                    await bridge.call("wait_dom_stable", {"timeout": 6000, "interval": 400}, timeout=8.0)

            if not isinstance(result, dict):
                raise RuntimeError(last_state_error or "扩展未返回有效页面状态")
            page_text = _safe_str(result.get("text"))
            page_title = _safe_str(result.get("title"))
            page_href = _safe_str(result.get("href"))
            classified = _classify_xhs_page_text("\n".join([page_title, page_href, page_text]))
            if classified:
                code, message = classified
                raise RuntimeError(f"[{code}] {message}")

            detail_strategy = _safe_str(result.get("detailStrategy")) or "extension_note_detail_map"
            state = result.get("state")
            note_map = (
                state.get("note", {}).get("noteDetailMap", {})
                if isinstance(state, dict)
                else {}
            )
            detail = note_map.get(note_id) if isinstance(note_map, dict) else None
            note_obj = detail.get("note") if isinstance(detail, dict) else None
            if not isinstance(note_obj, dict) or not note_obj:
                dom_note = await bridge.call(
                    "evaluate",
                    {"expression": _build_extension_dom_note_expression(note_id)},
                    timeout=20.0,
                )
                if isinstance(dom_note, dict) and dom_note:
                    result["state"] = {"note": {"noteDetailMap": {note_id: {"note": dom_note}}}}
                    detail_strategy = "extension_dom_fallback"
            result["detailStrategy"] = detail_strategy
            result["mediaStrategy"] = (
                "plugin_state_urls"
                if detail_strategy != "extension_dom_fallback"
                else "plugin_dom_urls"
            )
            return result

        async def human_pause(min_seconds: float = 0.6, max_seconds: float = 1.4) -> None:
            await asyncio.sleep(random.uniform(min_seconds, max_seconds))

        current_url = _safe_str(await bridge.call("get_url", {}, timeout=10.0))
        result: dict[str, Any] | None = None
        if note_id and note_id in current_url:
            result = await read_page()
        else:
            snapshot = await bridge.call(
                "get_xhs_page_snapshot",
                {"kind": "any", "noteId": note_id, "textLimit": 1200},
                timeout=10.0,
            )
            _raise_for_xhs_snapshot(snapshot)

            selector = f'a[href*="/explore/{note_id}"]'
            has_link = False
            if not dedicated_window_mode:
                try:
                    has_link = bool(await bridge.call("has_element", {"selector": selector}, timeout=10.0))
                except Exception:
                    has_link = False
            if has_link:
                await human_pause()
                await bridge.call("click_element", {"selector": selector}, timeout=15.0)
                await bridge.call(
                    "wait_for_load",
                    {"timeout": int(page_timeout * 1000), "background": navigate_background},
                    timeout=page_timeout,
                )
            else:
                await human_pause(1.0, 2.0)
                await bridge.call(
                    "navigate",
                    {"url": url, "background": navigate_background},
                    timeout=page_timeout,
                )
                await bridge.call(
                    "wait_for_load",
                    {"timeout": int(page_timeout * 1000), "background": navigate_background},
                    timeout=page_timeout,
                )
            result = await read_page()

    if not isinstance(result, dict):
        raise RuntimeError("扩展未返回有效页面状态")

    state = result.get("state")
    if not isinstance(state, dict) or not state:
        href = _safe_str(result.get("href"))
        title = _safe_str(result.get("title"))
        raise RuntimeError(f"扩展未读取到 noteDetailMap，当前页面: {href or url} / {title}")
    return {
        "state": state,
        "detail_strategy": _safe_str(result.get("detailStrategy")) or "extension_note_detail_map",
        "media_strategy": _safe_str(result.get("mediaStrategy")) or "plugin_state_urls",
        "used_extension": True,
    }


async def _fetch_state_via_extension(
    url: str,
    port: int = 9334,
    connect_timeout: float = 20.0,
    page_timeout: float = 45.0,
    dedicated_window_mode: bool = False,
) -> dict[str, Any]:
    payload = await _fetch_note_payload_via_extension(
        url,
        port=port,
        connect_timeout=connect_timeout,
        page_timeout=page_timeout,
        dedicated_window_mode=dedicated_window_mode,
    )
    state = payload.get("state")
    if not isinstance(state, dict) or not state:
        raise RuntimeError("扩展未返回有效页面状态")
    return state


async def _get_cookies_via_extension(port: int = 9334, domain: str = "xiaohongshu.com") -> str:
    async with XHSExtensionBridge(port=port) as bridge:
        await bridge.wait_until_ready(timeout=15.0)
        cookies = await bridge.call("get_cookies", {"domain": domain}, timeout=15.0)
    return _cookie_to_header(json.dumps(cookies, ensure_ascii=False)) if cookies else ""


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
        text = value.strip()
        if not text:
            return None
        if text.isdigit():
            value = int(text)
        else:
            for fmt in [
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%dT%H:%M:%S.%fZ",
                "%Y-%m-%d",
            ]:
                try:
                    parsed = datetime.strptime(text, fmt)
                    if parsed.tzinfo is None:
                        parsed = parsed.replace(tzinfo=timezone.utc).astimezone()
                    return parsed
                except ValueError:
                    continue
            return None
    if isinstance(value, (int, float)):
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp /= 1000
        if timestamp <= 0 or timestamp < 1_262_304_000:
            return None
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
        author=_safe_str(user.get("nickname") or user.get("nickName") or user.get("name") or user.get("userName")) or "未知",
        author_id=_safe_str(user.get("userId") or user.get("user_id") or user.get("uid") or user.get("id")),
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


def _note_root_validation_issues(
    note_root: dict[str, Any],
    *,
    url: str,
    expected_note_id: str = "",
    source: str = "",
) -> list[str]:
    note = _note_from_root(note_root, url)
    issues: list[str] = []
    default_title = note.title.strip() in {"", "无标题"}
    default_desc = note.desc.strip() in {"", "暂无简介"}
    suspicious_author = note.author.strip() in {"", "未知", "我"}
    total_interactions = note.liked_count + note.collected_count + note.comment_count + note.share_count
    avatar_like_images = sum(
        1
        for item in note.images
        if "sns-avatar" in _safe_str(item.get("remote_default")).lower()
    )

    if expected_note_id and note.id and note.id != expected_note_id:
        issues.append("note_id 与目标链接不一致")
    if not note.id:
        issues.append("缺少 note_id")
    if note.published_at is None:
        issues.append("缺少可信发布时间")
    if note.published_at and note.published_at.year < 2013:
        issues.append("发布时间异常过早")
    if default_title and default_desc:
        issues.append("标题和正文同时缺失")
    if suspicious_author and not note.tags:
        issues.append("作者字段异常")
    if (
        note.liked_count == 0
        and note.comment_count == 0
        and (note.collected_count >= 1_000_000 or note.share_count >= 1_000_000)
    ):
        issues.append("互动字段疑似混入页面备案号/页脚数字")
    if avatar_like_images >= max(3, len(note.images) // 2) and len(note.images) >= 6:
        issues.append("图片集合疑似混入头像/页面装饰图")
    if source == "extension_dom_fallback":
        if suspicious_author:
            issues.append("DOM fallback 作者不可信")
        if default_title:
            issues.append("DOM fallback 标题缺失")
        if total_interactions == 0:
            issues.append("DOM fallback 未提取到可信互动数据")

    unique_issues: list[str] = []
    for item in issues:
        if item not in unique_issues:
            unique_issues.append(item)
    return unique_issues


def _merge_seed_metadata(note: XHSCrawledNote, seed_data: dict[str, Any] | None) -> XHSCrawledNote:
    if not isinstance(seed_data, dict):
        return note
    if not note.title or note.title == "无标题":
        seed_title = _safe_str(seed_data.get("title"))
        if seed_title:
            note.title = seed_title
    if not note.author or note.author == "未知":
        seed_author = _safe_str(seed_data.get("author"))
        if seed_author:
            note.author = seed_author
    if not note.author_id:
        seed_author_id = _safe_str(seed_data.get("author_id"))
        if seed_author_id:
            note.author_id = seed_author_id
    if note.liked_count <= 0:
        note.liked_count = _parse_count(seed_data.get("likes"))
    if not note.published_at:
        note.published_at = _extract_datetime(seed_data.get("time"))
    return note


def _seed_images_to_media(seed_data: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(seed_data, dict):
        return []
    raw_urls: list[str] = []
    cover = _safe_str(seed_data.get("cover_image"))
    if cover:
        raw_urls.append(cover)
    for item in seed_data.get("images") or []:
        url = _safe_str(item)
        if url and url not in raw_urls:
            raw_urls.append(url)
    media: list[dict[str, Any]] = []
    for index, url in enumerate(raw_urls):
        media.append(
            {
                "index": index,
                "urls": {"seed": url},
                "remote_default": url,
            }
        )
    return media


def _note_from_seed_data(seed_data: dict[str, Any]) -> XHSCrawledNote:
    normalized_url = normalize_note_url(_safe_str(seed_data.get("url")) or _safe_str(seed_data.get("id")))
    content = _safe_str(seed_data.get("content")) or "搜索结果未提供更多正文，已先按当前卡片信息保存。"
    return XHSCrawledNote(
        id=_extract_note_id(normalized_url) or _safe_str(seed_data.get("id")) or uuid.uuid4().hex[:8],
        title=_safe_str(seed_data.get("title")) or "小红书笔记",
        desc=content,
        author=_safe_str(seed_data.get("author")) or "未知",
        author_id=_safe_str(seed_data.get("author_id")),
        url=normalized_url,
        note_type=_safe_str(seed_data.get("note_type")) or "normal",
        published_at=_extract_datetime(
            seed_data.get("published_at")
            or seed_data.get("published")
            or seed_data.get("time")
        ),
        liked_count=_parse_count(seed_data.get("likes")),
        collected_count=_parse_count(seed_data.get("collects")),
        comment_count=_parse_count(seed_data.get("comments_count")),
        images=_seed_images_to_media(seed_data),
        video_url=_safe_str(seed_data.get("video_url")),
        warnings=["详情抓取未完成，当前文件按搜索/监控卡片摘要保存。"],
    )


def _vault_root_dir(vault_path: str | Path | None) -> Path:
    return Path(vault_path).expanduser() if vault_path else DEFAULT_VAULT


def _vault_xhs_dir(vault_path: str | Path | None) -> Path:
    return _vault_root_dir(vault_path) / "xhs"


def _vault_active_save_dir(vault_path: str | Path | None) -> Path:
    return _vault_xhs_dir(vault_path) / "主动保存"


def _vault_album_dir(vault_path: str | Path | None) -> Path:
    return _vault_xhs_dir(vault_path) / "专辑"


def _legacy_vault_album_dir(vault_path: str | Path | None) -> Path:
    return _vault_root_dir(vault_path) / "专辑"


def _saved_xhs_source_dirs(vault_path: str | Path | None) -> list[Path]:
    xhs_root = _vault_xhs_dir(vault_path)
    legacy_album_root = _legacy_vault_album_dir(vault_path)
    paths = [xhs_root]
    if legacy_album_root != xhs_root:
        paths.append(legacy_album_root)
    return paths


def _vault_relative_obsidian_path(path: Path, vault_path: str | Path | None) -> str:
    vault_root = _vault_root_dir(vault_path)
    try:
        return path.relative_to(vault_root).as_posix()
    except Exception:
        return path.as_posix()


def _read_json_from_paths(paths: list[Path]) -> Any:
    for path in paths:
        if not path.exists():
            continue
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
    return None


def _build_xhs_unified_entry(
    note: XHSCrawledNote,
    *,
    obsidian_path: str,
    source_module: str = "xhs-crawler",
) -> UnifiedVaultEntry:
    published = note.published_at.isoformat() if note.published_at else ""
    summary = (note.desc.strip().splitlines()[0][:160] if note.desc else "") or "已保存这条小红书笔记。"
    return UnifiedVaultEntry(
        entry_id=note.id,
        entry_type="social-note",
        title=note.title.strip() or "小红书笔记",
        summary=summary,
        source_url=note.url,
        source_platform="xiaohongshu",
        source_module=source_module,
        author=note.author,
        author_id=note.author_id,
        published=published,
        tags=note.tags,
        obsidian_path=obsidian_path,
        metadata={
            "abo-type": "xiaohongshu-note",
            "platform": "xiaohongshu",
            "note-id": note.id,
            "note-type": note.note_type,
            "likes": note.liked_count,
            "collects": note.collected_count,
            "comments-count": note.comment_count,
            "shares": note.share_count,
            "ip-location": note.ip_location,
            "images": note.images,
            "video-url": note.video_url,
            "live-urls": note.live_urls,
            "local-resources": [
                {
                    "label": item.label,
                    "type": item.type,
                    "relative_path": item.relative_path,
                    "remote_url": item.remote_url,
                    "size": item.size,
                }
                for item in note.local_resources
            ],
            "warnings": note.warnings,
        },
    )


def _extract_md_field(text: str, label: str) -> str:
    pattern = rf"- \*\*{re.escape(label)}\*\*: (.+)"
    match = re.search(pattern, text)
    return match.group(1).strip() if match else ""


def _split_saved_xhs_tags(raw: str) -> list[str]:
    value = str(raw or "").strip()
    if not value or value == "无":
        return []

    parts = re.split(r"\s*[、，,|/／#]+(?:\s*|$)", value)
    cleaned: list[str] = []
    seen: set[str] = set()
    for part in parts:
        tag = str(part or "").strip().strip("#").strip()
        if not tag:
            continue
        lowered = tag.casefold()
        if lowered in seen:
            continue
        seen.add(lowered)
        cleaned.append(tag)
    return cleaned


def _extract_saved_xhs_inline_tags(text: str) -> list[str]:
    if not text:
        return []

    cleaned: list[str] = []
    seen: set[str] = set()
    for match in re.finditer(r"#([^#\n]{1,48}?)(?:\[(?:话题|超话)\])?#", text):
        tag = str(match.group(1) or "").strip().strip("#").strip()
        if not tag:
            continue
        lowered = tag.casefold()
        if lowered in seen:
            continue
        seen.add(lowered)
        cleaned.append(tag)
    return cleaned


def _extract_saved_xhs_excerpt(text: str) -> str:
    lines: list[str] = []
    capture = False
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith("> 原帖标题："):
            capture = True
            continue
        if not capture:
            continue
        if line.startswith("> [!quote]") or line.startswith("> [!info]"):
            break
        if line.startswith("> ![") or line in {">", ""}:
            continue
        clean = line.lstrip("> ").strip()
        if clean:
            lines.append(clean)
        if len(lines) >= 4:
            break
    return " ".join(lines)[:240]


def _parse_saved_xhs_note(path: Path) -> dict[str, Any] | None:
    meta, content = safe_load_frontmatter(path)
    if first_non_empty(meta.get("source-platform"), meta.get("platform")).lower() == "xiaohongshu":
        url = first_non_empty(meta.get("source-url"), meta.get("url"))
        note_id = first_non_empty(meta.get("note-id"), _extract_note_id(url), meta.get("entry-id"))
        title = first_non_empty(meta.get("title")) or path.stem
        author = first_non_empty(meta.get("author"))
        if not author:
            title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
            title = title_match.group(1).strip() if title_match else title
            return None
        return {
            "title": title,
            "author": author,
            "author_id": first_non_empty(meta.get("author-id"), meta.get("author_id")),
            "url": url,
            "note_id": note_id,
            "date": first_non_empty(meta.get("published"), meta.get("date"))[:10],
            "tags": normalize_string_list(meta.get("tags")),
            "likes": _parse_count(meta.get("likes")),
            "collects": _parse_count(meta.get("collects")),
            "comments": _parse_count(meta.get("comments-count")),
            "albums": normalize_string_list(meta.get("albums")),
            "content_excerpt": "",
            "path": str(path),
        }

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
        "tags": normalize_string_list(
            [
                *_split_saved_xhs_tags(_extract_md_field(text, "标签")),
                *_extract_saved_xhs_inline_tags(text),
            ]
        ),
        "albums": normalize_string_list(_extract_md_field(text, "收藏专辑")),
        "likes": likes,
        "collects": collects,
        "comments": comments,
        "path": str(path),
        "content_excerpt": _extract_saved_xhs_excerpt(text),
    }


async def analyze_saved_xhs_authors(
    *,
    vault_path: str | Path | None = None,
    cookie: str | None = None,
    resolve_author_ids: bool = True,
    resolve_limit: int = 12,
) -> dict[str, Any]:
    xhs_dirs = [path for path in _saved_xhs_source_dirs(vault_path) if path.exists()]
    if not xhs_dirs:
        return {
            "success": True,
            "xhs_dir": str(_vault_xhs_dir(vault_path)),
            "source_dirs": [str(path) for path in _saved_xhs_source_dirs(vault_path)],
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

    for source_dir in xhs_dirs:
        for path in sorted(source_dir.rglob("*.md")):
            if path.name.startswith("."):
                continue
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
            for album_name in note.get("albums", []):
                if album_name and album_name not in candidate.sample_albums and len(candidate.sample_albums) < 4:
                    candidate.sample_albums.append(album_name)
            try:
                relative_parts = path.relative_to(source_dir).parts
            except Exception:
                relative_parts = path.parts
            folder_album = ""
            if len(relative_parts) >= 3 and str(relative_parts[0] or "").strip() == "专辑":
                folder_album = str(relative_parts[1] or "").strip()
            elif len(relative_parts) >= 2:
                folder_album = str(relative_parts[0] or "").strip()
            if folder_album and folder_album not in {"", ".", "xhs", "专辑"}:
                if folder_album not in candidate.sample_albums and len(candidate.sample_albums) < 4:
                    candidate.sample_albums.append(folder_album)
            for album_name in note_albums_by_id.get(note_id, []):
                if album_name and album_name not in candidate.sample_albums and len(candidate.sample_albums) < 4:
                    candidate.sample_albums.append(album_name)
            for tag in note.get("tags", []):
                if tag and tag not in candidate.sample_tags and len(candidate.sample_tags) < 6:
                    candidate.sample_tags.append(tag)
            for signal in extract_signal_tokens(note.get("title"), note.get("content_excerpt")):
                if signal and signal not in candidate.content_signals and len(candidate.content_signals) < 8:
                    candidate.content_signals.append(signal)
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
            candidates_to_resolve = ordered if int(resolve_limit or 0) <= 0 else ordered[:resolve_limit]
            for candidate in candidates_to_resolve:
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
        "xhs_dir": str(_vault_xhs_dir(vault_path)),
        "source_dirs": [str(path) for path in xhs_dirs],
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
                "content_signals": candidate.content_signals,
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


def _resolve_xhs_target_dir(
    root_xhs_dir: Path,
    subfolder: str | None,
    *,
    fallback: str,
) -> Path:
    if not subfolder:
        return root_xhs_dir

    raw_parts = [str(part).strip() for part in re.split(r"[\\/]+", str(subfolder)) if str(part).strip()]
    if not raw_parts:
        return root_xhs_dir / _safe_folder_name(fallback, fallback)

    target = root_xhs_dir
    for index, part in enumerate(raw_parts):
        part_fallback = fallback if index == len(raw_parts) - 1 else "未命名分组"
        target = target / _safe_folder_name(part, part_fallback)
    return target


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
        if note.comments:
            comment_lines = []
            for index, item in enumerate(note.comments[: max(1, comments_limit)], 1):
                author = _safe_str(item.get("author")) or "未知"
                content = _safe_str(item.get("content"))
                likes = _parse_count(item.get("likes"))
                reply_to = _safe_str(item.get("reply_to"))
                flags: list[str] = []
                if item.get("is_top"):
                    flags.append("置顶")
                if likes > 0:
                    flags.append(f"{likes}赞")
                if reply_to:
                    flags.append(f"回复 {reply_to}")
                suffix = f"（{' / '.join(flags)}）" if flags else ""
                comment_lines.append(f"{index}. {author}{suffix}")
                if content:
                    comment_lines.append(content)
                comment_lines.append("")
        else:
            comment_lines = [
                "评论状态机已执行，但当前页面未提取到评论正文。",
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
        "**与我的关联：** 作为小红书情报样本保存，后续可在情报库里继续整理。",
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
    target_root_dir: str | Path | None = None,
    include_images: bool = False,
    include_video: bool = False,
    include_live_photo: bool = False,
    include_comments: bool = False,
    include_sub_comments: bool = False,
    comments_limit: int = 20,
    comments_sort_by: str = "likes",
    use_extension: bool = True,
    extension_port: int = 9334,
    dedicated_window_mode: bool = False,
    use_cdp: bool = True,
    cdp_port: int = 9222,
    subfolder: str | None = None,
    seed_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """抓取单条小红书笔记并保存到情报库目录。"""
    normalized_url = normalize_note_url(url)
    note_id = _extract_note_id(normalized_url)
    warnings: list[str] = []
    used_cdp = False
    used_extension = False
    detail_strategy = ""
    media_strategy = ""
    comment_strategy = ""

    note_root = None

    extension_stop_error: Exception | None = None
    cdp_stop_error: Exception | None = None

    if use_extension:
        try:
            extension_payload = await _fetch_note_payload_via_extension(
                normalized_url,
                port=extension_port,
                dedicated_window_mode=dedicated_window_mode,
            )
            state = extension_payload.get("state")
            if not isinstance(state, dict):
                raise RuntimeError("扩展未返回有效页面状态")
            extension_note_root = _extract_note_root(state, note_id)
            if extension_note_root:
                candidate_detail_strategy = _safe_str(extension_payload.get("detail_strategy")) or "extension_note_detail_map"
                candidate_media_strategy = _safe_str(extension_payload.get("media_strategy")) or "plugin_state_urls"
                validation_issues = _note_root_validation_issues(
                    extension_note_root,
                    url=normalized_url,
                    expected_note_id=note_id,
                    source=candidate_detail_strategy,
                )
                if validation_issues:
                    warnings.append(
                        "扩展 bridge 已读取到页面，但详情属性疑似异常，已改走兜底链路: "
                        + "；".join(validation_issues[:4])
                    )
                else:
                    note_root = extension_note_root
                    used_extension = True
                    detail_strategy = candidate_detail_strategy
                    media_strategy = candidate_media_strategy
            else:
                warnings.append("扩展 bridge 已打开详情页，但没有定位到完整 note 数据")
        except Exception as exc:
            warnings.append(f"扩展 bridge 读取失败: {exc}")
            if _should_stop_xhs_task(exc):
                extension_stop_error = exc

    if not note_root and use_cdp:
        try:
            state = await _fetch_state_via_cdp(normalized_url, cdp_port)
            cdp_note_root = _extract_note_root(state, note_id)
            if cdp_note_root:
                validation_issues = _note_root_validation_issues(
                    cdp_note_root,
                    url=normalized_url,
                    expected_note_id=note_id,
                    source="cdp_initial_state",
                )
                if validation_issues:
                    warnings.append(
                        "CDP 已读取到页面，但详情属性疑似异常，继续回退 HTML 链路: "
                        + "；".join(validation_issues[:4])
                    )
                else:
                    note_root = cdp_note_root
                    used_cdp = True
                    detail_strategy = "cdp_initial_state"
                    media_strategy = "cdp_state_urls"
            else:
                warnings.append("CDP 已打开详情页，但没有定位到完整 note 数据")
        except Exception as exc:
            warnings.append(f"CDP 兜底失败: {exc}")
            if _should_stop_xhs_task(exc):
                cdp_stop_error = exc

    if not note_root and not extension_stop_error and not cdp_stop_error:
        try:
            state = await _fetch_state_backend(normalized_url, cookie)
            backend_note_root = _extract_note_root(state, note_id)
            if backend_note_root:
                validation_issues = _note_root_validation_issues(
                    backend_note_root,
                    url=normalized_url,
                    expected_note_id=note_id,
                    source="html_initial_state",
                )
                if validation_issues:
                    warnings.append(
                        "后端 Initial State 已返回，但详情属性仍异常，已停止保存: "
                        + "；".join(validation_issues[:4])
                    )
                else:
                    note_root = backend_note_root
                    detail_strategy = "html_initial_state"
                    media_strategy = "html_state_urls"
            else:
                warnings.append("后端详情已返回 Initial State，但没有定位到完整 note 数据")
        except Exception as exc:
            warnings.append(f"后端详情请求失败: {exc}")
            if _should_stop_xhs_task(exc):
                detail = "；".join(warnings)
                raise RuntimeError(detail) from exc

    if not note_root:
        if cdp_stop_error is not None:
            detail = "；".join(warnings)
            raise RuntimeError(detail) from cdp_stop_error
        if extension_stop_error is not None:
            detail = "；".join(warnings)
            raise RuntimeError(detail) from extension_stop_error
        detail = "；".join(warnings) if warnings else "无更多错误信息"
        raise RuntimeError(f"没有提取到笔记详情数据：{detail}")

    note = _note_from_root(note_root, normalized_url, used_cdp=used_cdp)
    note = _merge_seed_metadata(note, seed_data)
    note.warnings.extend(warnings)
    if used_extension:
        note.warnings.insert(0, "详情通过扩展 bridge 读取")

    if include_comments:
        try:
            from abo.tools.xiaohongshu import xiaohongshu_fetch_comments

            comments_result = await xiaohongshu_fetch_comments(
                note_id=note.id,
                note_url=normalized_url,
                max_comments=max(1, comments_limit),
                sort_by=comments_sort_by,
                cookie=cookie,
                use_extension=use_extension,
                extension_port=extension_port,
                dedicated_window_mode=dedicated_window_mode,
                load_all_comments=True,
                click_more_replies=include_sub_comments,
                max_replies_threshold=10,
            )
            comments = comments_result.get("comments") if isinstance(comments_result, dict) else None
            note.comments = comments if isinstance(comments, list) else []
            comment_strategy = _safe_str(comments_result.get("strategy")) if isinstance(comments_result, dict) else ""
            if note.comments:
                if comment_strategy == "extension_state_machine":
                    note.warnings.insert(0, f"评论通过扩展状态机读取 {len(note.comments)} 条")
                else:
                    note.warnings.insert(0, f"评论通过后端状态读取 {len(note.comments)} 条")
            else:
                note.warnings.append("评论状态机执行完成，但未提取到评论正文")
        except Exception as exc:
            note.warnings.append(f"评论抓取失败: {exc}")
            if _should_stop_xhs_task(exc):
                raise RuntimeError(str(exc)) from exc

    root_xhs_dir = Path(target_root_dir).expanduser() if target_root_dir else _vault_active_save_dir(vault_path)
    xhs_dir = _resolve_xhs_target_dir(root_xhs_dir, subfolder, fallback="未命名专辑")
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
    obsidian_path = _vault_relative_obsidian_path(md_path, vault_path)
    write_unified_note(
        md_path,
        _build_xhs_unified_entry(note, obsidian_path=obsidian_path),
        _render_markdown(
            note,
            include_comments=include_comments,
            include_sub_comments=include_sub_comments,
            comments_limit=comments_limit,
        ),
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
        "target_root_dir": str(root_xhs_dir),
        "used_extension": used_extension,
        "used_cdp": note.used_cdp,
        "detail_strategy": detail_strategy or ("cdp_initial_state" if note.used_cdp else "html_initial_state"),
        "media_strategy": media_strategy or ("cdp_state_urls" if note.used_cdp else "html_state_urls"),
        "comment_strategy": comment_strategy or None,
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


async def save_xhs_seed_note_to_vault(
    *,
    seed_data: dict[str, Any],
    vault_path: str | Path | None = None,
    include_images: bool = False,
    include_video: bool = False,
    subfolder: str | None = None,
) -> dict[str, Any]:
    """使用已有搜索/关注卡片数据，按统一 Markdown 格式直接落盘。"""
    note = _note_from_seed_data(seed_data)

    root_xhs_dir = _vault_active_save_dir(vault_path)
    xhs_dir = _resolve_xhs_target_dir(root_xhs_dir, subfolder, fallback="未命名专题")
    xhs_dir.mkdir(parents=True, exist_ok=True)
    (xhs_dir / "img").mkdir(exist_ok=True)
    (xhs_dir / "video").mkdir(exist_ok=True)

    await _download_media(
        note,
        xhs_dir,
        include_images=include_images,
        include_video=include_video,
        include_live_photo=False,
    )

    date = note.published_at.strftime("%Y-%m-%d") if note.published_at else datetime.now().strftime("%Y-%m-%d")
    md_name = f"{date} {_slug(note.title, note.id[:8])}.md"
    md_path = xhs_dir / md_name
    obsidian_path = _vault_relative_obsidian_path(md_path, vault_path)
    write_unified_note(
        md_path,
        _build_xhs_unified_entry(note, obsidian_path=obsidian_path),
        _render_markdown(
            note,
            include_comments=False,
            include_sub_comments=False,
            comments_limit=0,
        ),
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
        "used_extension": False,
        "used_cdp": False,
        "detail_strategy": "seed_preview",
        "media_strategy": "seed_urls",
        "comment_strategy": None,
        "warnings": note.warnings,
        "remote_resources": {
            "images": [image.get("remote_default") for image in note.images if image.get("remote_default")],
            "video": note.video_url or None,
            "live": [],
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


def build_xhs_seed_obsidian_path(
    seed_data: dict[str, Any],
    *,
    subfolder: str | None = None,
    vault_path: str | Path | None = None,
) -> str:
    """Return the same relative markdown path used by preview/manual XHS saves."""
    note = _note_from_seed_data(seed_data)
    root_xhs_dir = _vault_active_save_dir(vault_path)
    xhs_dir = _resolve_xhs_target_dir(root_xhs_dir, subfolder, fallback="未命名专题")
    date = note.published_at.strftime("%Y-%m-%d") if note.published_at else datetime.now().strftime("%Y-%m-%d")
    md_name = f"{date} {_slug(note.title, note.id[:8])}.md"
    return _vault_relative_obsidian_path(xhs_dir / md_name, vault_path)


def _albums_progress_path(vault_path: str | Path | None) -> Path:
    return _vault_xhs_dir(vault_path) / ".xhs-albums-progress.json"


def _albums_cache_path(vault_path: str | Path | None) -> Path:
    return _vault_xhs_dir(vault_path) / ".xhs-albums-cache.json"


def _legacy_albums_progress_path(vault_path: str | Path | None) -> Path:
    return _legacy_vault_album_dir(vault_path) / ".xhs-albums-progress.json"


def _legacy_albums_cache_path(vault_path: str | Path | None) -> Path:
    return _legacy_vault_album_dir(vault_path) / ".xhs-albums-cache.json"


def _nested_album_progress_path(vault_path: str | Path | None) -> Path:
    return _vault_album_dir(vault_path) / ".xhs-albums-progress.json"


def _nested_album_cache_path(vault_path: str | Path | None) -> Path:
    return _vault_album_dir(vault_path) / ".xhs-albums-cache.json"


def _load_album_cache(vault_path: str | Path | None) -> list[dict[str, Any]]:
    data = _read_json_from_paths([
        _albums_cache_path(vault_path),
        _nested_album_cache_path(vault_path),
        _legacy_albums_cache_path(vault_path),
    ])
    albums = data.get("albums") if isinstance(data, dict) else data
    return albums if isinstance(albums, list) else []


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
    data = _read_json_from_paths([
        _albums_progress_path(vault_path),
        _nested_album_progress_path(vault_path),
        _legacy_albums_progress_path(vault_path),
    ])
    if isinstance(data, dict):
        data.setdefault("albums", {})
        data.setdefault("notes", {})
        return data
    return {"last_run_at": "", "albums": {}, "notes": {}}


def _save_album_progress(vault_path: str | Path | None, progress: dict[str, Any]) -> None:
    path = _albums_progress_path(vault_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    progress["last_run_at"] = datetime.now().astimezone().isoformat()
    path.write_text(json.dumps(progress, ensure_ascii=False, indent=2), encoding="utf-8")


def _resolve_album_seen_ids(progress: dict[str, Any], album_state: dict[str, Any]) -> tuple[list[str], list[str]]:
    note_states = progress.get("notes", {}) if isinstance(progress.get("notes"), dict) else {}
    raw_seen_ids = album_state.get("seen_note_ids", [])
    if not isinstance(raw_seen_ids, list):
        raw_seen_ids = []

    valid: list[str] = []
    pruned: list[str] = []
    seen: set[str] = set()
    for item in raw_seen_ids:
        note_id = _safe_str(item)
        if not note_id or note_id in seen:
            continue
        seen.add(note_id)
        note_state = note_states.get(note_id)
        file_path = ""
        if isinstance(note_state, dict):
            file_path = _safe_str(note_state.get("file"))
        if file_path and Path(file_path).expanduser().exists():
            valid.append(note_id)
        else:
            pruned.append(note_id)
    return sorted(valid), pruned


ALBUM_EXTRACT_JS = r"""
() => {
  const normalizePreviewImage = (value) => {
    const raw = String(value || '').trim();
    if (!raw || raw === '?' || raw === '#' || raw === 'about:blank') return '';
    if (raw.startsWith('data:image/')) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;
    try {
      const url = new URL(raw, location.href);
      const href = url.toString();
      const sameDocument = href === location.href || href === `${location.origin}${location.pathname}` || href === `${location.origin}${location.pathname}?`;
      if (sameDocument) return '';
      if (/xiaohongshu\.com$/.test(url.hostname) && /\/(?:explore|board|user\/profile)(?:\/|$)/.test(url.pathname)) return '';
      if (!/^https?:$/.test(url.protocol)) return '';
      return href;
    } catch {
      return '';
    }
  };

  const firstSrcsetUrl = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    const candidate = text.split(',').map((item) => item.trim().split(/\s+/)[0]).find(Boolean);
    return candidate || '';
  };

  const backgroundImageUrl = (node) => {
    if (!node) return '';
    const style = window.getComputedStyle(node);
    const value = style?.backgroundImage || '';
    const match = value.match(/url\((['"]?)(.*?)\1\)/);
    return match?.[2] || '';
  };

  const pickPreviewImage = (root) => {
    const img = root.querySelector('img');
    const candidates = [
      img?.currentSrc,
      img?.getAttribute('src'),
      img?.src,
      img?.getAttribute('data-src'),
      img?.getAttribute('data-lazy-src'),
      img?.getAttribute('data-original'),
      img?.getAttribute('data-xhs-img'),
      firstSrcsetUrl(img?.getAttribute('srcset')),
      firstSrcsetUrl(img?.getAttribute('data-srcset')),
      backgroundImageUrl(root),
      backgroundImageUrl(img?.parentElement),
    ];
    for (const candidate of candidates) {
      const normalized = normalizePreviewImage(candidate);
      if (normalized) return normalized;
    }
    return '';
  };

  const out = [];
  const seen = new Set();
  for (const a of document.querySelectorAll('a[href*="/board/"]')) {
    const m = a.href.match(/\/board\/([0-9a-f]{24})/);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const lines = (a.innerText || '').trim().split(/\n+/).map(s => s.trim()).filter(Boolean);
    const countLine = lines.find(x => x.includes('笔记・') || x.includes('笔记·')) || '';
    const cm = countLine.match(/笔记[・·](\d+)/);
    out.push({
      board_id: m[1],
      name: lines[0] || '未命名专辑',
      count: cm ? Number(cm[1]) : null,
      url: a.href,
      preview_image: pickPreviewImage(a),
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


async def _list_albums_via_extension(
    *,
    extension_port: int = 9334,
    progress_callback: Any | None = None,
    dedicated_window_mode: bool = False,
) -> list[dict[str, Any]]:
    def report(stage: str, current_step: int = 0, total_steps: int = 6) -> None:
        if progress_callback:
            progress_callback({"stage": stage, "current_step": current_step, "total_steps": total_steps})

    extract_expression = f"({ALBUM_EXTRACT_JS})()"

    async with XHSExtensionBridge(port=extension_port) as bridge:
        await bridge.wait_until_ready(timeout=20.0)
        navigate_background = _extension_should_navigate_background(dedicated_window_mode)

        if dedicated_window_mode:
            try:
                state = await bridge.call(
                    "ensure_dedicated_xhs_tab",
                    {"url": "https://www.xiaohongshu.com/explore"},
                    timeout=60.0,
                )
                report("绑定小红书专用窗口", 0, 6)
                if progress_callback and isinstance(state, dict):
                    progress_callback({"stage": "专用窗口已绑定", **state})
            except Exception:
                # 兼容尚未重新加载的新扩展版本；旧扩展仍可走普通 navigate。
                pass

        report("进入小红书首页", 1)
        await bridge.call(
            "navigate",
            {"url": "https://www.xiaohongshu.com/explore", "background": navigate_background},
            timeout=45.0,
        )
        await bridge.call(
            "wait_for_load",
            {"timeout": 45000, "background": navigate_background},
            timeout=45.0,
        )
        await bridge.call("wait_dom_stable", {"timeout": 12000, "interval": 500}, timeout=15.0)

        async def click_text(text: str) -> bool:
            expression = (
                "(() => {"
                f"const targetText = {json.dumps(text)};"
                "const nodes = [...document.querySelectorAll('a,button,[role=\"button\"],div,span')];"
                "const score = (el) => {"
                "  const text = ((el.innerText || el.textContent || '').trim());"
                "  if (text !== targetText) return -1;"
                "  if (el.matches('a[href],button,[role=\"button\"]')) return 3;"
                "  if (el.closest('a[href],button,[role=\"button\"]')) return 2;"
                "  return 1;"
                "};"
                "const hit = nodes.map((el) => [score(el), el]).filter(([value]) => value > 0).sort((a, b) => b[0] - a[0])[0]?.[1];"
                "if (!hit) return false;"
                "const clickable = hit.closest('a[href],button,[role=\"button\"],.reds-tab-item,.tab,.tabs-item') || hit;"
                "clickable.scrollIntoView({block:'center', inline:'center'});"
                "if (clickable.href) { clickable.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window})); return true; }"
                "clickable.click();"
                "return true;"
                "})()"
            )
            try:
                return bool(await bridge.call("evaluate", {"expression": expression}, timeout=12.0))
            except Exception:
                return False

        async def open_me_profile() -> bool:
            profile_expr = (
                "(() => {"
                "const links = [...document.querySelectorAll('a[href*=\"/user/profile/\"]')];"
                "const me = links.find((a) => ((a.innerText || a.textContent || '').trim() === '我')) || links[0];"
                "if (!me) return false;"
                "me.scrollIntoView({block:'center'});"
                "me.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));"
                "return true;"
                "})()"
            )
            try:
                opened = bool(await bridge.call("evaluate", {"expression": profile_expr}, timeout=12.0))
            except Exception:
                opened = False
            if not opened:
                return False
            await asyncio.sleep(3.0)
            try:
                await bridge.call("wait_dom_stable", {"timeout": 12000, "interval": 500}, timeout=15.0)
            except Exception:
                pass
            return True

        report("打开个人主页", 2)
        current_url = _safe_str(await bridge.call("get_url", {}, timeout=10.0))
        if "/user/profile/" not in current_url:
            opened_profile = await open_me_profile()
            if not opened_profile:
                opened_profile = await click_text("我")
            if not opened_profile:
                return []

        report("打开收藏页", 3)
        if not await click_text("收藏"):
            return []
        await asyncio.sleep(2.0)
        await bridge.call("wait_dom_stable", {"timeout": 10000, "interval": 500}, timeout=12.0)

        report("打开专辑页", 4)
        opened_albums = await click_text("专辑")
        if not opened_albums:
            albums_expr = (
                "(() => {"
                "const hit = [...document.querySelectorAll('a,button,div,span')].find((el) => {"
                "  const text = (el.innerText || el.textContent || '').trim();"
                "  return /^专辑[・·]\\d+$/.test(text) || text === '专辑';"
                "});"
                "if (!hit) return false;"
                "const clickable = hit.closest('a,button,[role=\"button\"],.reds-tab-item,.tab,.tabs-item') || hit;"
                "clickable.scrollIntoView({block:'center'});"
                "clickable.click();"
                "return true;"
                "})()"
            )
            opened_albums = bool(await bridge.call("evaluate", {"expression": albums_expr}, timeout=12.0))
        if not opened_albums:
            return []
        await asyncio.sleep(3.0)
        await bridge.call("wait_dom_stable", {"timeout": 12000, "interval": 500}, timeout=15.0)

        report("读取专辑列表", 5)
        albums = await bridge.call("evaluate", {"expression": extract_expression}, timeout=20.0)
        report("专辑列表读取完成", 6)
        return albums if isinstance(albums, list) else []


async def list_xhs_album_previews(
    *,
    cookie: str | None = None,
    vault_path: str | Path | None = None,
    cdp_port: int = 9222,
    background: bool = True,
    allow_cdp_fallback: bool = False,
    progress_callback: Any | None = None,
    use_extension: bool = True,
    extension_port: int = 9334,
    dedicated_window_mode: bool = False,
) -> dict[str, Any]:
    """从已打开的小红书收藏/专辑页面提取专辑预览。"""
    expression = f"({ALBUM_EXTRACT_JS})()"

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

    extension_error = ""
    albums: list[dict[str, Any]] = []
    if use_extension:
        try:
            albums = await _list_albums_via_extension(
                extension_port=extension_port,
                progress_callback=progress_callback,
                dedicated_window_mode=dedicated_window_mode,
            )
        except Exception as exc:
            extension_error = str(exc)

    headless_error = ""
    try:
        if not albums and (not use_extension or allow_cdp_fallback):
            albums = await _list_albums_headless(cookie, progress_callback=progress_callback)
    except Exception as exc:
        if not albums:
            albums = []
        headless_error = str(exc)
    auto_message = "headless"

    if not albums and not allow_cdp_fallback:
        cached = _load_album_cache(vault_path)
        if cached:
            progress = _load_album_progress(vault_path)
            for album in cached:
                state = progress.get("albums", {}).get(str(album.get("board_id") or ""), {})
                valid_seen_ids, _ = _resolve_album_seen_ids(progress, state if isinstance(state, dict) else {})
                album["seen_count"] = len(valid_seen_ids)
                album["new_estimate"] = None
                if isinstance(album.get("count"), int):
                    album["new_estimate"] = max(int(album["count"]) - album["seen_count"], 0)
            return {
                "success": True,
                "albums": cached,
                "total": len(cached),
                "progress_path": str(_albums_progress_path(vault_path)),
                "message": f"插件链路未读取到专辑，已恢复本地缓存的 {len(cached)} 个专辑",
                "from_cache": True,
                "warning": extension_error or headless_error,
            }
        return {
            "success": True,
            "albums": [],
            "total": 0,
            "progress_path": str(_albums_progress_path(vault_path)),
            "message": "插件链路没有读取到收藏专辑。请确认扩展已重载、Edge 保持登录，且当前小红书窗口可访问收藏专辑页。",
            "warning": extension_error or headless_error,
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
            const normalizePreviewImage = (value) => {
              const raw = String(value || '').trim();
              if (!raw || raw === '?' || raw === '#' || raw === 'about:blank') return '';
              if (raw.startsWith('data:image/')) return raw;
              if (raw.startsWith('//')) return `https:${raw}`;
              try {
                const url = new URL(raw, location.href);
                const href = url.toString();
                const sameDocument = href === location.href || href === `${location.origin}${location.pathname}` || href === `${location.origin}${location.pathname}?`;
                if (sameDocument) return '';
                if (/xiaohongshu\.com$/.test(url.hostname) && /\/(?:explore|board|user\/profile)(?:\/|$)/.test(url.pathname)) return '';
                if (!/^https?:$/.test(url.protocol)) return '';
                return href;
              } catch {
                return '';
              }
            };
            const firstSrcsetUrl = (value) => {
              const text = String(value || '').trim();
              if (!text) return '';
              const candidate = text.split(',').map((item) => item.trim().split(/\s+/)[0]).find(Boolean);
              return candidate || '';
            };
            const backgroundImageUrl = (node) => {
              if (!node) return '';
              const style = window.getComputedStyle(node);
              const value = style?.backgroundImage || '';
              const match = value.match(/url\((['"]?)(.*?)\1\)/);
              return match?.[2] || '';
            };
            const pickPreviewImage = (root) => {
              const img = root.querySelector('img');
              const candidates = [
                img?.currentSrc,
                img?.getAttribute('src'),
                img?.src,
                img?.getAttribute('data-src'),
                img?.getAttribute('data-lazy-src'),
                img?.getAttribute('data-original'),
                img?.getAttribute('data-xhs-img'),
                firstSrcsetUrl(img?.getAttribute('srcset')),
                firstSrcsetUrl(img?.getAttribute('data-srcset')),
                backgroundImageUrl(root),
                backgroundImageUrl(img?.parentElement),
              ];
              for (const candidate of candidates) {
                const normalized = normalizePreviewImage(candidate);
                if (normalized) return normalized;
              }
              return '';
            };
            const out = [];
            const seen = new Set();
            for (const a of document.querySelectorAll('a[href*="/board/"]')) {
              const m = a.href.match(/\/board\/([0-9a-f]{24})/);
              if (!m || seen.has(m[1])) continue;
              seen.add(m[1]);
              const lines = (a.innerText || '').trim().split(/\n+/).map(s => s.trim()).filter(Boolean);
              const countLine = lines.find(x => x.includes('笔记・') || x.includes('笔记·')) || '';
              const cm = countLine.match(/笔记[・·](\d+)/);
              out.push({
                board_id: m[1],
                name: lines[0] || '未命名专辑',
                count: cm ? Number(cm[1]) : null,
                url: a.href,
                preview_image: pickPreviewImage(a),
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
        valid_seen_ids, _ = _resolve_album_seen_ids(progress, state if isinstance(state, dict) else {})
        album["seen_count"] = len(valid_seen_ids)
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


def _board_notes_extract_object_expression(board_id: str) -> str:
    return (
        "(() => {"
        "const state = window.__INITIAL_STATE__ || {};"
        "const unwrap = (value) => {"
        "  let current = value;"
        "  const seen = new Set();"
        "  while (current && typeof current === 'object' && !seen.has(current)) {"
        "    seen.add(current);"
        "    if (Array.isArray(current)) return current;"
        "    if ('_value' in current) { current = current._value; continue; }"
        "    if ('value' in current) { current = current.value; continue; }"
        "    break;"
        "  }"
        "  return current;"
        "};"
        "const boardId = " + json.dumps(board_id) + ";"
        "const feedMapRaw = state.board?.boardFeedsMap || {};"
        "const feedMap = unwrap(feedMapRaw) || {};"
        "const notes = feedMap?.[boardId]?.notes || [];"
        "const out = new Map();"
        "for (const n of (Array.isArray(notes) ? notes : [])) {"
        "  const id = n.noteId || n.note_id || n.id || '';"
        "  if (!id) continue;"
        "  out.set(String(id), {"
        "    note_id: id,"
        "    xsec_token: n.xsecToken || n.xsec_token || '',"
        "    title: n.displayTitle || n.title || '',"
        "    type: n.type || '',"
        "    time: n.time || n.publishTime || n.publish_time || 0,"
        "    cover: n.cover?.url || n.cover?.urlPre || n.cover?.urlDefault || n.image || '',"
        "    author: n.user?.nickName || n.user?.nickname || '',"
        "    likes: n.interactInfo?.likedCount || n.interact_info?.liked_count || 0"
        "  });"
        "}"
        "for (const a of document.querySelectorAll('a[href*=\"/explore/\"]')) {"
        "  const href = a.getAttribute('href') || '';"
        "  const match = href.match(/\\/explore\\/([^?/#]+)/);"
        "  if (!match) continue;"
        "  const noteId = match[1];"
        "  const xsec = (href.match(/[?&]xsec_token=([^&#]+)/) || [null, ''])[1];"
        "  const card = a.closest('section, article, div') || a;"
        "  const title = (a.getAttribute('title') || a.innerText || card.innerText || '').trim().split(/\\n+/)[0] || '';"
        "  const img = a.querySelector('img') || card.querySelector('img');"
        "  const cover = img?.getAttribute('src') || img?.getAttribute('data-src') || '';"
        "  const existing = out.get(noteId) || {};"
        "  out.set(noteId, {"
        "    note_id: noteId,"
        "    xsec_token: existing.xsec_token || decodeURIComponent(xsec || ''),"
        "    title: existing.title || title,"
        "    type: existing.type || '',"
        "    time: existing.time || 0,"
        "    cover: existing.cover || cover,"
        "    author: existing.author || '',"
        "    likes: existing.likes || 0"
        "  });"
        "}"
        "return {"
        "  href: location.href,"
        "  title: document.title || '',"
        "  total: out.size,"
        "  notes: Array.from(out.values())"
        "};"
        "})()"
    )


def _board_notes_status_expression(board_id: str) -> str:
    return (
        "(() => {"
        "const classify = (text) => {"
        "  const rules = ["
        "    ['risk_limited','访问频繁','命中小红书访问频繁限制'],"
        "    ['risk_limited','安全限制','命中小红书安全限制'],"
        "    ['risk_limited','安全访问','命中小红书安全访问限制'],"
        "    ['risk_limited','请稍后再试','小红书要求稍后重试'],"
        "    ['manual_required','扫码','页面要求扫码验证'],"
        "    ['auth_invalid','请先登录','当前浏览器未登录小红书'],"
        "    ['auth_invalid','登录后查看更多内容','当前页面要求登录后查看'],"
        "    ['not_found','300031','当前页面暂时无法浏览'],"
        "    ['not_found','页面不见了','页面已不可访问'],"
        "    ['not_found','内容无法展示','页面内容不可展示'],"
        "    ['not_found','笔记不存在','笔记不存在或已删除']"
        "  ];"
        "  for (const [code, marker, message] of rules) if (String(text || '').includes(marker)) return {code, marker, message};"
        "  return null;"
        "};"
        "const state = window.__INITIAL_STATE__ || {};"
        "const unwrap = (value) => {"
        "  let current = value;"
        "  const seen = new Set();"
        "  while (current && typeof current === 'object' && !seen.has(current)) {"
        "    seen.add(current);"
        "    if (Array.isArray(current)) return current;"
        "    if ('_value' in current) { current = current._value; continue; }"
        "    if ('value' in current) { current = current.value; continue; }"
        "    break;"
        "  }"
        "  return current;"
        "};"
        "const boardId = " + json.dumps(board_id) + ";"
        "const feedMap = unwrap(state.board?.boardFeedsMap || {}) || {};"
        "const notes = feedMap?.[boardId]?.notes || [];"
        "const noteAnchors = Array.from(document.querySelectorAll('a[href*=\"/explore/\"]')).length;"
        "const textPool = Array.from(document.querySelectorAll('button,div,span,p')).map((el) => (el.innerText || el.textContent || '').trim()).filter(Boolean);"
        "const loadingTexts = textPool.filter((text) => /加载中|正在加载|稍后再试|查看更多|展开更多/.test(text)).slice(0, 20);"
        "const bodyText = document.body?.innerText || '';"
        "const risk = classify(`${document.title || ''}\\n${location.href}\\n${bodyText.slice(0, 2500)}`);"
        "const scroller = document.scrollingElement || document.documentElement;"
        "const scrollTop = scroller ? scroller.scrollTop : 0;"
        "const scrollHeight = scroller ? scroller.scrollHeight : 0;"
        "const viewportHeight = window.innerHeight || 0;"
        "const atBottom = scrollHeight > 0 && viewportHeight > 0 && scrollTop + viewportHeight >= scrollHeight - 260;"
        "return {"
        "  href: location.href,"
        "  title: document.title || '',"
        "  note_count: Array.isArray(notes) ? notes.length : 0,"
        "  anchor_count: noteAnchors,"
        "  scroll_top: scrollTop,"
        "  scroll_height: scrollHeight,"
        "  viewport_height: viewportHeight,"
        "  at_bottom: atBottom,"
        "  loading_texts: loadingTexts,"
        "  risk"
        "};"
        "})()"
    )


async def _fetch_board_notes_headless(
    board_id: str,
    url: str,
    cookie: str | None,
    expected_total: int | None = None,
    progress_callback: Any | None = None,
    page: Any | None = None,
) -> list[dict[str, Any]]:
    if not cookie:
        return []
    stop_no_growth_threshold = 3

    board_url = url or f"https://www.xiaohongshu.com/board/{board_id}?source=web_user_page"
    expression = _board_notes_extract_expression(board_id)
    if page is None:
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            return []
        cookies = _cookie_to_playwright(cookie)
        if not cookies:
            return []
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
                isolated_page = await context.new_page()
                return await _fetch_board_notes_headless(
                    board_id,
                    url,
                    cookie,
                    expected_total=expected_total,
                    progress_callback=progress_callback,
                    page=isolated_page,
                )
            finally:
                await browser.close()

    seen: dict[str, dict[str, Any]] = {}

    def merge_notes(items: Any) -> int:
        before = len(seen)
        if isinstance(items, list):
            for index, item in enumerate(items):
                if isinstance(item, dict):
                    seen[str(item.get("note_id") or item.get("noteId") or item.get("id") or f"item-{index}")] = item
        return len(seen) - before

    async def try_capture_response(response: Any) -> None:
        try:
            url_text = str(response.url or "")
            if "/api/sns/web/v1/board/note" not in url_text:
                return
            payload = await response.json()
            notes = payload.get("data", {}).get("notes", []) if isinstance(payload, dict) else []
            if isinstance(notes, list):
                normalized = []
                for item in notes:
                    if not isinstance(item, dict):
                        continue
                    normalized.append(
                        {
                            "note_id": item.get("noteId") or item.get("note_id") or item.get("id"),
                            "xsec_token": item.get("xsecToken") or item.get("xsec_token") or "",
                            "title": item.get("displayTitle") or item.get("title") or "",
                            "type": item.get("type") or "",
                            "time": item.get("time") or item.get("publishTime") or item.get("publish_time") or 0,
                            "cover": (
                                (item.get("cover") or {}).get("url")
                                if isinstance(item.get("cover"), dict)
                                else item.get("cover") or ""
                            ),
                            "author": (
                                (item.get("user") or {}).get("nickName")
                                if isinstance(item.get("user"), dict)
                                else ""
                            ) or ((item.get("user") or {}).get("nickname") if isinstance(item.get("user"), dict) else ""),
                            "likes": (
                                (item.get("interactInfo") or {}).get("likedCount")
                                if isinstance(item.get("interactInfo"), dict)
                                else 0
                            ),
                        }
                    )
                merge_notes(normalized)
        except Exception:
            return

    page.on("response", lambda response: asyncio.create_task(try_capture_response(response)))
    await page.goto(board_url, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(5000)
    if progress_callback:
        progress_callback({"stage": "读取专辑笔记列表", "pages_loaded": 1, "total_notes": 0})
    data = await page.evaluate(expression)
    notes = json.loads(data) if isinstance(data, str) else data
    notes = notes if isinstance(notes, list) else []
    merge_notes(notes)
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
    if target_total:
        max_scroll_rounds = max(12, math.ceil(target_total / 30) * 3)
    else:
        max_scroll_rounds = 100
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
            merge_notes(page_notes)
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
        if no_growth_rounds >= stop_no_growth_threshold:
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


async def _fetch_board_notes_via_extension(
    board_id: str,
    url: str,
    expected_total: int | None = None,
    extension_port: int = 9334,
    progress_callback: Any | None = None,
    dedicated_window_mode: bool = False,
    allow_foreground_assist: bool = False,
) -> list[dict[str, Any]]:
    board_url = url or f"https://www.xiaohongshu.com/board/{board_id}?source=web_user_page"
    stop_no_growth_threshold = 3
    expression = _board_notes_extract_object_expression(board_id)
    fallback_expression = _board_notes_extract_expression(board_id)
    status_expression = _board_notes_status_expression(board_id)
    seen: dict[str, dict[str, Any]] = {}

    def report(stage: str, **extra: Any) -> None:
        if progress_callback:
            progress_callback({"stage": stage, **extra})

    async with XHSExtensionBridge(port=extension_port) as bridge:
        await bridge.wait_until_ready(timeout=20.0)
        tab_pulse_used = False
        foreground_assist_used = False
        foreground_restore_app = ""

        if dedicated_window_mode:
            try:
                state = await bridge.call(
                    "ensure_dedicated_xhs_tab",
                    {"url": board_url},
                    timeout=60.0,
                )
                report("专用窗口已绑定", **state if isinstance(state, dict) else {})
            except Exception:
                pass

        def is_transient_frame_error(error: Exception) -> bool:
            text = _safe_str(error)
            markers = [
                "Frame with ID 0 was removed",
                "No frame with given id found",
                "Cannot access contents of url",
                "The frame was removed",
                "Extension context invalidated",
                "扩展命令超时",
            ]
            return any(marker in text for marker in markers)

        async def bridge_call_retry(
            method: str,
            params: dict[str, Any] | None = None,
            *,
            timeout: float = 10.0,
            retries: int = 2,
        ) -> Any:
            for attempt in range(retries + 1):
                try:
                    return await bridge.call(method, params or {}, timeout=timeout)
                except Exception as exc:
                    if attempt >= retries or not is_transient_frame_error(exc):
                        raise
                    await asyncio.sleep(1.0 + attempt * 0.8)
                    try:
                        await bridge.call(
                            "wait_for_load",
                            {
                                "timeout": 45000,
                                "background": _extension_should_navigate_background(dedicated_window_mode),
                            },
                            timeout=45.0,
                        )
                    except Exception:
                        pass
                    try:
                        await bridge.call(
                            "wait_dom_stable",
                            {"timeout": 12000, "interval": 500},
                            timeout=15.0,
                        )
                    except Exception:
                        pass

        async def dismiss_page_hints() -> None:
            try:
                await bridge_call_retry(
                    "evaluate",
                    {
                        "expression": (
                            "(() => {"
                            "const hit = [...document.querySelectorAll('button,span,div')].find((el) => ((el.innerText || el.textContent || '').trim() === '我知道了'));"
                            "if (hit) { hit.click(); return true; }"
                            "return false;"
                            "})()"
                        )
                    },
                    timeout=8.0,
                )
            except Exception:
                pass

        async def human_pause(min_seconds: float = 0.8, max_seconds: float = 1.8) -> None:
            await asyncio.sleep(random.uniform(min_seconds, max_seconds))

        async def pulse_tab() -> None:
            bridge_state: dict[str, Any] = {}
            try:
                result = await bridge_call_retry("pulse_tab", {}, timeout=10.0)
                if isinstance(result, dict):
                    bridge_state = result
                await asyncio.sleep(random.uniform(0.6, 1.2))
            except Exception:
                bridge_state = {}
            os_pulse = await _macos_real_browser_tab_pulse()
            report("标签脉冲", bridge=bridge_state, os_pulse=os_pulse)

        async def enable_foreground_assist(reason: str) -> None:
            nonlocal foreground_assist_used, foreground_restore_app
            if foreground_assist_used:
                return
            foreground_assist_used = True
            foreground_restore_app = await _macos_frontmost_app_name()
            await bridge_call_retry("activate_tab", {}, timeout=10.0)
            await asyncio.sleep(random.uniform(0.6, 1.0))
            await pulse_tab()
            try:
                await bridge.call(
                    "navigate",
                    {"url": board_url, "background": False},
                    timeout=45.0,
                )
                await bridge.call(
                    "wait_for_load",
                    {"timeout": 45000, "background": False},
                    timeout=45.0,
                )
                await bridge.call(
                    "wait_dom_stable",
                    {"timeout": 12000, "interval": 500},
                    timeout=15.0,
                )
            except Exception:
                pass
            report("前台辅助: 独立窗口滚动解锁", reason=reason, restore_app=foreground_restore_app)

        async def restore_foreground_assist() -> None:
            if foreground_restore_app and foreground_restore_app != "Microsoft Edge":
                restore_result = await _macos_activate_app(foreground_restore_app)
                report("恢复前台应用", app=foreground_restore_app, restore=restore_result)

        # 2026-04-14 shared-tab experiment, see docs/xhs/xhs-update.md §11.3/§11.4.
        # 这段旧 helper 对应“共享当前浏览器标签页模式”下的泛化激活逻辑，
        # 后续改动中已被更明确的 `activate_board_tab_once()` 取代，当前主链路不再调用。
        #
        # async def settle_active_xhs_tab(reason: str, *, pulse: bool = False, heavy: bool = False) -> None:
        #     nonlocal tab_pulse_used
        #     should_pulse = pulse and not tab_pulse_used
        #     if should_pulse:
        #         await bridge.call("activate_tab", {}, timeout=10.0)
        #         await asyncio.sleep(random.uniform(0.4, 0.9))
        #         await pulse_tab()
        #         tab_pulse_used = True
        #     await human_pause(0.8, 1.6 if should_pulse and heavy else 1.2)
        #     if should_pulse:
        #         report(f"标签激活: {reason}")

        async def activate_board_tab_once() -> None:
            nonlocal tab_pulse_used
            if tab_pulse_used:
                return
            board_page_pattern = re.compile(r"/board/[^/?#]+\?source=web_user_page(?:[&#].*)?$")
            matched_url = ""
            for _ in range(30):
                current_url = _safe_str(await bridge.call("get_url", {}, timeout=10.0))
                if board_page_pattern.search(current_url):
                    matched_url = current_url
                    break
                await asyncio.sleep(0.35)

            if matched_url:
                try:
                    await bridge_call_retry("wait_for_load", {"timeout": 45000}, timeout=45.0)
                except Exception:
                    pass
                try:
                    await bridge_call_retry("wait_dom_stable", {"timeout": 12000, "interval": 500}, timeout=15.0)
                except Exception:
                    pass

            previous_app = ""
            if dedicated_window_mode:
                previous_app = await _macos_frontmost_app_name()

            await bridge_call_retry("activate_tab", {}, timeout=10.0)
            await asyncio.sleep(random.uniform(0.6, 1.0))
            await pulse_tab()
            if dedicated_window_mode and previous_app and previous_app != "Microsoft Edge":
                await asyncio.sleep(0.25)
                restore_result = await _macos_activate_app(previous_app)
                report("恢复前台应用", app=previous_app, restore=restore_result)
            tab_pulse_used = True
            await human_pause(1.0, 1.6)
            report("标签激活: 进入具体专辑", url=matched_url, dedicated_window=dedicated_window_mode)

        async def click_text_target(text: str, timeout: float = 12.0) -> bool:
            expression = (
                "(() => {"
                f"const targetText = {json.dumps(text)};"
                "const nodes = [...document.querySelectorAll('a,button,[role=\"button\"],div,span')];"
                "const score = (el) => {"
                "  const text = ((el.innerText || el.textContent || '').trim());"
                "  if (text !== targetText) return -1;"
                "  if (el.matches('a[href],button,[role=\"button\"]')) return 3;"
                "  if (el.closest('a[href],button,[role=\"button\"]')) return 2;"
                "  return 1;"
                "};"
                "const hit = nodes.map((el) => [score(el), el]).filter(([value]) => value > 0).sort((a, b) => b[0] - a[0])[0]?.[1];"
                "if (!hit) return false;"
                "const clickable = hit.closest('a[href],button,[role=\"button\"],.reds-tab-item,.tab,.tabs-item') || hit;"
                "clickable.scrollIntoView({block:'center', inline:'center'});"
                "if (clickable.href) { clickable.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window})); return true; }"
                "clickable.click();"
                "return true;"
                "})()"
            )
            try:
                return bool(await bridge.call("evaluate", {"expression": expression}, timeout=timeout))
            except Exception:
                return False

        async def open_me_profile() -> bool:
            profile_expr = (
                "(() => {"
                "const links = [...document.querySelectorAll('a[href*=\"/user/profile/\"]')];"
                "const me = links.find((a) => ((a.innerText || a.textContent || '').trim() === '我')) || links[0];"
                "if (!me) return false;"
                "me.scrollIntoView({block:'center'});"
                "me.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));"
                "return true;"
                "})()"
            )
            try:
                opened = bool(await bridge.call("evaluate", {"expression": profile_expr}, timeout=12.0))
            except Exception:
                opened = False
            if not opened:
                return False
            await human_pause(2.0, 3.5)
            try:
                await bridge.call("wait_dom_stable", {"timeout": 12000, "interval": 500}, timeout=15.0)
            except Exception:
                pass
            return True

        async def click_album_card() -> bool:
            expression = (
                "(() => {"
                f"const boardId = {json.dumps(board_id)};"
                "const anchors = [...document.querySelectorAll('a[href*=\"/board/\"]')];"
                "const hit = anchors.find((a) => (a.getAttribute('href') || '').includes(`/board/${boardId}`));"
                "if (!hit) return false;"
                "hit.scrollIntoView({block:'center', inline:'center'});"
                "hit.click();"
                "return true;"
                "})()"
            )
            try:
                return bool(await bridge.call("evaluate", {"expression": expression}, timeout=12.0))
            except Exception:
                return False

        async def open_board_via_ui() -> bool:
            # 先回到发现页，尽量从稳定入口开始。
            navigate_background = _extension_should_navigate_background(dedicated_window_mode)
            await bridge_call_retry(
                "navigate",
                {"url": "https://www.xiaohongshu.com/explore", "background": navigate_background},
                timeout=45.0,
            )
            await bridge_call_retry(
                "wait_for_load",
                {"timeout": 45000, "background": navigate_background},
                timeout=45.0,
            )
            await bridge_call_retry("wait_dom_stable", {"timeout": 12000, "interval": 500}, timeout=15.0)
            await dismiss_page_hints()

            current_url = _safe_str(await bridge_call_retry("get_url", {}, timeout=10.0))
            if "/user/profile/" not in current_url:
                opened_profile = await open_me_profile()
                if not opened_profile:
                    opened_profile = await click_text_target("我")
                if not opened_profile:
                    return False

            opened_favorites = await click_text_target("收藏")
            if not opened_favorites:
                return False
            await human_pause(1.6, 3.0)
            await bridge_call_retry("wait_dom_stable", {"timeout": 10000, "interval": 500}, timeout=12.0)

            opened_albums = False
            for label in ["专辑", f"专辑・{expected_total}" if expected_total else "专辑"]:
                opened_albums = await click_text_target(label)
                if opened_albums:
                    break
            if not opened_albums:
                albums_expr = (
                    "(() => {"
                    "const hit = [...document.querySelectorAll('a,button,div,span')].find((el) => {"
                    "  const text = (el.innerText || el.textContent || '').trim();"
                    "  return /^专辑[・·]\\d+$/.test(text) || text === '专辑';"
                    "});"
                    "if (!hit) return false;"
                    "const clickable = hit.closest('a,button,[role=\"button\"],.reds-tab-item,.tab,.tabs-item') || hit;"
                    "clickable.scrollIntoView({block:'center'});"
                    "clickable.click();"
                    "return true;"
                    "})()"
                )
                opened_albums = bool(await bridge.call("evaluate", {"expression": albums_expr}, timeout=12.0))
            if not opened_albums:
                return False
            await human_pause(2.0, 3.5)
            await bridge_call_retry("wait_dom_stable", {"timeout": 12000, "interval": 500}, timeout=15.0)
            await dismiss_page_hints()

            # 专辑卡片可能不在首屏，先小步滚几次再找。
            for _ in range(6):
                if await click_album_card():
                    await activate_board_tab_once()
                    await human_pause(2.0, 3.2)
                    await bridge.call("wait_dom_stable", {"timeout": 12000, "interval": 500}, timeout=15.0)
                    return True
                await bridge_call_retry("scroll_by", {"x": 0, "y": 900}, timeout=10.0)
                await human_pause(1.0, 1.8)

            return False

        async def fetch_payload() -> dict[str, Any]:
            try:
                payload = await bridge_call_retry("evaluate", {"expression": expression}, timeout=20.0)
                if isinstance(payload, dict):
                    return payload
            except Exception:
                pass

            fallback_payload = await bridge_call_retry("evaluate", {"expression": fallback_expression}, timeout=12.0)
            if isinstance(fallback_payload, str):
                try:
                    notes = json.loads(fallback_payload)
                except Exception:
                    notes = []
                if isinstance(notes, list):
                    return {"notes": notes, "total": len(notes)}
            if isinstance(fallback_payload, list):
                return {"notes": fallback_payload, "total": len(fallback_payload)}
            return {"notes": [], "total": 0}

        async def fetch_status() -> dict[str, Any]:
            try:
                status = await bridge_call_retry("evaluate", {"expression": status_expression}, timeout=20.0)
            except Exception:
                return {}
            if not isinstance(status, dict):
                return {}
            _raise_for_xhs_snapshot(status)
            return status

        async def merge_from_page() -> tuple[int, dict[str, Any]]:
            payload = await fetch_payload()
            notes = payload.get("notes", []) if isinstance(payload, dict) else []
            before = len(seen)
            if isinstance(notes, list):
                for idx, item in enumerate(notes):
                    if isinstance(item, dict):
                        seen[str(item.get("note_id") or f"seed-{idx}")] = item
            growth = len(seen) - before
            status = await fetch_status()
            return growth, status

        async def human_scroll_pattern(round_index: int, status: dict[str, Any]) -> None:
            scroll_height = int(status.get("scroll_height") or 0)
            viewport_height = int(status.get("viewport_height") or 0)
            scroll_top = int(status.get("scroll_top") or 0)
            near_bottom = scroll_height > 0 and viewport_height > 0 and scroll_top + viewport_height >= scroll_height - 160

            # 交替使用几种滚动方式，避免固定模式。
            pattern = round_index % 4
            if pattern == 0:
                await bridge_call_retry("scroll_by", {"x": 0, "y": 720}, timeout=10.0)
                await asyncio.sleep(random.uniform(1.0, 1.8))
                await bridge_call_retry("dispatch_wheel_event", {"deltaY": 900}, timeout=10.0)
            elif pattern == 1:
                await bridge_call_retry("dispatch_wheel_event", {"deltaY": 1400}, timeout=10.0)
                await asyncio.sleep(random.uniform(0.8, 1.5))
                await bridge_call_retry("scroll_by", {"x": 0, "y": 480}, timeout=10.0)
            elif pattern == 2:
                await bridge_call_retry("scroll_to_bottom", {}, timeout=10.0)
                await asyncio.sleep(random.uniform(1.0, 1.8))
                await bridge_call_retry("scroll_by", {"x": 0, "y": -480}, timeout=10.0)
                await asyncio.sleep(random.uniform(0.6, 1.2))
                await bridge_call_retry("dispatch_wheel_event", {"deltaY": 1200}, timeout=10.0)
            else:
                target_y = scroll_top + max(600, int(viewport_height * 0.8) if viewport_height else 800)
                await bridge_call_retry("scroll_to", {"x": 0, "y": target_y}, timeout=10.0)
                await asyncio.sleep(random.uniform(0.9, 1.6))
                await bridge_call_retry("dispatch_wheel_event", {"deltaY": 1000}, timeout=10.0)

            if near_bottom:
                await asyncio.sleep(random.uniform(1.0, 2.0))
                await bridge_call_retry("scroll_by", {"x": 0, "y": -320}, timeout=10.0)
                await asyncio.sleep(random.uniform(0.8, 1.4))
                await bridge_call_retry("dispatch_wheel_event", {"deltaY": 1100}, timeout=10.0)

        async def wait_for_growth(previous_count: int, max_wait_rounds: int = 4) -> tuple[int, dict[str, Any]]:
            growth = 0
            last_status: dict[str, Any] = {}
            for _ in range(max_wait_rounds):
                await asyncio.sleep(random.uniform(1.2, 2.4))
                try:
                    growth, last_status = await merge_from_page()
                except Exception as exc:
                    report("页面状态重试", error=_safe_str(exc), total_notes=len(seen))
                    last_status = {}
                    continue
                if len(seen) > previous_count:
                    return growth, last_status
                loading_texts = last_status.get("loading_texts") or []
                if loading_texts:
                    continue
            return growth, last_status

        opened_via_ui = False if dedicated_window_mode else await open_board_via_ui()
        if not opened_via_ui:
            current_url = _safe_str(await bridge_call_retry("get_url", {}, timeout=10.0))
            if current_url.startswith(board_url):
                navigate_background = _extension_should_navigate_background(dedicated_window_mode)
                await bridge_call_retry(
                    "navigate",
                    {"url": "https://www.xiaohongshu.com/explore", "background": navigate_background},
                    timeout=45.0,
                )
                await bridge_call_retry(
                    "wait_for_load",
                    {"timeout": 45000, "background": navigate_background},
                    timeout=45.0,
                )
                await asyncio.sleep(random.uniform(1.0, 2.0))
            navigate_background = _extension_should_navigate_background(dedicated_window_mode)
            await bridge_call_retry(
                "navigate",
                {"url": board_url, "background": navigate_background},
                timeout=45.0,
            )
            await bridge_call_retry(
                "wait_for_load",
                {"timeout": 45000, "background": navigate_background},
                timeout=45.0,
            )
            await bridge_call_retry("wait_dom_stable", {"timeout": 12000, "interval": 500}, timeout=15.0)
            # 观察页面状态 -> 确认专辑 notes state 出现 -> 再开始滚动。
            # 这是 bridge 方案的核心：在 MAIN world 等页面已渲染状态，而不是抓接口。
            await _wait_xhs_state_via_bridge(
                bridge,
                kind="board",
                board_id=board_id,
                timeout_ms=18000,
                interval_ms=500,
                command_timeout=22.0,
            )
            await dismiss_page_hints()

        target_total = max(int(expected_total or 0), 0)
        no_growth_rounds = 0
        hard_stall_rounds = 0
        consecutive_no_new_pages = 0

        initial_growth, initial_status = await merge_from_page()
        report(
            "扩展读取专辑笔记列表",
            pages_loaded=1,
            total_notes=len(seen),
            expected_total=expected_total,
            no_growth_rounds=no_growth_rounds,
            scroll_top=initial_status.get("scroll_top"),
            scroll_height=initial_status.get("scroll_height"),
            anchor_count=initial_status.get("anchor_count"),
        )

        round_index = 0
        while True:
            round_index += 1
            status = await fetch_status()
            report(
                "扩展读取专辑笔记列表",
                pages_loaded=round_index,
                total_notes=len(seen),
                expected_total=expected_total,
                no_growth_rounds=no_growth_rounds,
                scroll_top=status.get("scroll_top"),
                scroll_height=status.get("scroll_height"),
                anchor_count=status.get("anchor_count"),
            )

            await dismiss_page_hints()
            previous_count = len(seen)
            await human_scroll_pattern(round_index, status)
            growth, after_status = await wait_for_growth(previous_count)

            if len(seen) > previous_count:
                no_growth_rounds = 0
                hard_stall_rounds = 0
                consecutive_no_new_pages = 0
            else:
                no_growth_rounds += 1
                consecutive_no_new_pages += 1
                loading_texts = after_status.get("loading_texts") or []
                if not loading_texts:
                    hard_stall_rounds += 1
                else:
                    hard_stall_rounds = 0

            if (
                dedicated_window_mode
                and allow_foreground_assist
                and no_growth_rounds >= 2
                and not foreground_assist_used
            ):
                await enable_foreground_assist("后台滚动连续无增长")
                no_growth_rounds = 0
                hard_stall_rounds = 0
                continue

            if (
                dedicated_window_mode
                and foreground_assist_used
                and no_growth_rounds >= 2
            ):
                raise RuntimeError(
                    "[browser_visibility] 独立窗口后台滚动受浏览器可见性限制，前台辅助后仍未继续加载；"
                    "已停止扩展链路并准备交给 CDP 兜底"
                )

            if consecutive_no_new_pages >= stop_no_growth_threshold:
                report(
                    "连续翻页无新增，停止翻页并开始抓取已加载笔记",
                    pages_loaded=round_index,
                    total_notes=len(seen),
                    expected_total=expected_total,
                    no_growth_rounds=consecutive_no_new_pages,
                    hard_stall_rounds=hard_stall_rounds,
                )
                break

            # 卡住时额外做一次“回拉 -> 再触底”组合，给页面第二次机会。
            # 只在还未达到停止阈值时尝试，避免已经连续无新增很多轮还继续拖延。
            if (
                no_growth_rounds >= 2
                and consecutive_no_new_pages < stop_no_growth_threshold
                and hard_stall_rounds < stop_no_growth_threshold
            ):
                await bridge_call_retry("scroll_by", {"x": 0, "y": -900}, timeout=10.0)
                await asyncio.sleep(random.uniform(1.0, 1.8))
                await bridge_call_retry("scroll_to_bottom", {}, timeout=10.0)
                retry_previous_count = len(seen)
                _, _after_retry_status = await wait_for_growth(retry_previous_count, max_wait_rounds=3)
                if len(seen) > retry_previous_count:
                    no_growth_rounds = 0
                    hard_stall_rounds = 0
                    consecutive_no_new_pages = 0

            if (
                consecutive_no_new_pages >= stop_no_growth_threshold
                or hard_stall_rounds >= stop_no_growth_threshold
            ):
                report(
                    "连续翻页无新增，停止翻页并开始抓取已加载笔记",
                    pages_loaded=round_index,
                    total_notes=len(seen),
                    expected_total=expected_total,
                    no_growth_rounds=consecutive_no_new_pages,
                    hard_stall_rounds=hard_stall_rounds,
                )
                break

        await restore_foreground_assist()

    return list(seen.values())


async def _fetch_board_notes(
    board_id: str,
    url: str,
    cdp_port: int,
    cookie: str | None = None,
    expected_total: int | None = None,
    progress_callback: Any | None = None,
    page: Any | None = None,
    use_extension: bool = True,
    extension_port: int = 9334,
    dedicated_window_mode: bool = False,
) -> list[dict[str, Any]]:
    board_url = url or f"https://www.xiaohongshu.com/board/{board_id}?source=web_user_page"
    expression = _board_notes_extract_expression(board_id)
    extension_error: Exception | None = None
    extension_attempted = False
    if use_extension:
        extension_attempted = True
        try:
            notes = await _fetch_board_notes_via_extension(
                board_id,
                board_url,
                expected_total=expected_total,
                extension_port=extension_port,
                progress_callback=progress_callback,
                dedicated_window_mode=dedicated_window_mode,
                allow_foreground_assist=False,
            )
            if notes:
                return notes
            extension_error = RuntimeError("扩展 bridge 未读取到专辑笔记列表")
        except Exception as exc:
            extension_error = exc

    headless_error: Exception | None = None
    if not (extension_attempted and dedicated_window_mode):
        try:
            notes = await _fetch_board_notes_headless(
                board_id,
                url,
                cookie,
                expected_total=expected_total,
                progress_callback=progress_callback,
                page=page,
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
        if extension_error:
            raise extension_error
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
    crawl_delay_seconds: float = 12.0,
    batch_size: int | None = None,
    batch_pause_seconds: float = 0.0,
    progress_callback: Any | None = None,
    target_total_notes_per_album: int | None = None,
    use_extension: bool = True,
    extension_port: int = 9334,
    dedicated_window_mode: bool = False,
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
    try:
        batch_size_value = max(0, int(batch_size or 0))
    except Exception:
        batch_size_value = 0
    try:
        batch_pause_value = max(0.0, float(batch_pause_seconds or 0.0))
    except Exception:
        batch_pause_value = 0.0

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

    shared_page = None

    try:
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
            raw_seen_ids = album_state.get("seen_note_ids", [])
            raw_seen_count = len(raw_seen_ids) if isinstance(raw_seen_ids, list) else 0
            resolved_seen_ids, pruned_seen_ids = _resolve_album_seen_ids(progress, album_state)
            if pruned_seen_ids:
                album_state["seen_note_ids"] = resolved_seen_ids
                report(
                    "专辑进度已修正",
                    current_album=name,
                    current_album_index=album_index,
                    pruned_seen_count=len(pruned_seen_ids),
                    seen_count=len(resolved_seen_ids),
                )
                _save_album_progress(vault_path, progress)
            seen_ids = set(resolved_seen_ids)
            album_mode = mode
            if mode == "incremental" and not seen_ids:
                album_mode = "full"
                report(
                    "专辑自动切换为全量",
                    current_album=name,
                    current_album_index=album_index,
                    reason="本地已抓笔记数为 0",
                )
            try:
                def report_board_progress(payload: dict[str, Any]) -> None:
                    stage = str(payload.pop("stage", "读取专辑笔记列表"))
                    report(stage, current_album=name, current_album_index=album_index, **payload)

                notes = await _fetch_board_notes(
                    board_id,
                    url,
                    cdp_port,
                    cookie=cookie,
                    expected_total=target_total_notes_per_album or album.get("count"),
                    progress_callback=report_board_progress,
                    page=shared_page,
                    use_extension=use_extension,
                    extension_port=extension_port,
                    dedicated_window_mode=dedicated_window_mode,
                )
            except Exception as exc:
                failed += 1
                results.append({"success": False, "album": name, "board_id": board_id, "error": str(exc)})
                if _is_xhs_risk_error(exc) or _should_stop_xhs_task(exc):
                    report("风控中断", current_album=name, current_album_index=album_index)
                    raise RuntimeError(f"小红书触发风控，任务已停止：{exc}") from exc
                report("专辑失败", current_album=name, current_album_index=album_index)
                continue

            album_saved = 0
            album_skipped = 0
            skipped_existing_in_loaded = 0
            skipped_older_in_loaded = 0
            skipped_newer_in_loaded = 0
            skipped_invalid_in_loaded = 0
            candidate_notes = notes
            if album_mode == "incremental":
                candidate_notes = [
                    item
                    for item in notes
                    if str(item.get("note_id") or "") and str(item.get("note_id") or "") not in seen_ids
                ]
                skipped_existing_in_loaded = len(notes) - len(candidate_notes)
                if skipped_existing_in_loaded > 0:
                    report(
                        "已过滤已抓笔记",
                        current_album=name,
                        current_album_index=album_index,
                        loaded_notes=len(notes),
                        skipped_existing=skipped_existing_in_loaded,
                        remaining_notes=len(candidate_notes),
                    )
            filtered_notes: list[dict[str, Any]] = []
            for item in candidate_notes:
                note_id = str(item.get("note_id") or "")
                if not note_id:
                    skipped_invalid_in_loaded += 1
                    continue
                note_date = _extract_datetime(item.get("time"))
                if since_dt and note_date and note_date.date() < since_dt:
                    skipped_older_in_loaded += 1
                    continue
                if cutoff_dt and note_date and note_date.date() > cutoff_dt:
                    skipped_newer_in_loaded += 1
                    continue
                filtered_notes.append(item)

            skipped_this_album = (
                skipped_existing_in_loaded
                + skipped_older_in_loaded
                + skipped_newer_in_loaded
                + skipped_invalid_in_loaded
            )
            if skipped_this_album > 0:
                album_skipped += skipped_this_album
                skipped += skipped_this_album
                report(
                    "专辑候选过滤完成",
                    current_album=name,
                    current_album_index=album_index,
                    skipped_existing=skipped_existing_in_loaded,
                    skipped_older=skipped_older_in_loaded,
                    skipped_newer=skipped_newer_in_loaded,
                    skipped_invalid=skipped_invalid_in_loaded,
                    skip_breakdown={
                        "already_seen": skipped_existing_in_loaded,
                        "older_than_recent_days": skipped_older_in_loaded,
                        "newer_than_before_date": skipped_newer_in_loaded,
                        "invalid_note": skipped_invalid_in_loaded,
                    },
                    remaining_notes=len(filtered_notes),
                )

            notes_to_process = (
                filtered_notes
                if max_notes_per_album is None
                else filtered_notes[: max(1, int(max_notes_per_album))]
            )
            processed_note_count = len(notes_to_process)
            diagnostics = {
                "loaded_notes": len(notes),
                "raw_seen_count": raw_seen_count,
                "valid_seen_count": len(seen_ids),
                "pruned_seen_count": len(pruned_seen_ids),
                "candidate_notes": len(candidate_notes),
                "processable_notes": processed_note_count,
                "recent_days": recent_days if mode != "full" else None,
                "before_date": before_date if mode != "full" else None,
                "skip_breakdown": {
                    "already_seen": skipped_existing_in_loaded,
                    "older_than_recent_days": skipped_older_in_loaded,
                    "newer_than_before_date": skipped_newer_in_loaded,
                    "invalid_note": skipped_invalid_in_loaded,
                },
            }
            if processed_note_count == 0:
                if album_mode == "incremental" and skipped_existing_in_loaded > 0 and skipped_existing_in_loaded == len(notes):
                    report(
                        "当前已加载笔记均已抓取，专辑无需更新",
                        current_album=name,
                        current_album_index=album_index,
                        **diagnostics,
                    )
                elif len(filtered_notes) == 0 and skipped_older_in_loaded > 0 and skipped_older_in_loaded == len(candidate_notes):
                    report(
                        "当前已加载笔记均早于增量时间范围",
                        current_album=name,
                        current_album_index=album_index,
                        **diagnostics,
                    )
                else:
                    report(
                        "当前专辑没有可处理的新笔记",
                        current_album=name,
                        current_album_index=album_index,
                        **diagnostics,
                    )
            for note_index, item in enumerate(notes_to_process, 1):
                if target_total_notes_per_album is not None and len(seen_ids) >= int(target_total_notes_per_album):
                    report(
                        "达到专辑目标数量",
                        current_album=name,
                        current_album_index=album_index,
                        current_note_index=note_index,
                        total_notes=processed_note_count,
                        target_total_notes_per_album=int(target_total_notes_per_album),
                    )
                    break
                note_id = str(item.get("note_id") or "")
                if not note_id:
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
                        target_root_dir=_vault_album_dir(vault_path),
                        include_images=include_images,
                        include_video=include_video,
                        include_live_photo=include_live_photo,
                        include_comments=include_comments,
                        include_sub_comments=include_sub_comments,
                        comments_limit=comments_limit,
                        use_extension=use_extension,
                        extension_port=extension_port,
                        dedicated_window_mode=dedicated_window_mode,
                        use_cdp=True,
                        cdp_port=cdp_port,
                        subfolder=name,
                        seed_data=item,
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
                    if _is_xhs_risk_error(exc) or _should_stop_xhs_task(exc):
                        report(
                            "风控中断",
                            current_album=name,
                            current_album_index=album_index,
                            current_note_index=note_index,
                            total_notes=processed_note_count,
                        )
                        raise RuntimeError(f"小红书触发风控，任务已停止：{exc}") from exc
                    report(
                        "单条失败",
                        current_album=name,
                        current_album_index=album_index,
                        current_note_index=note_index,
                        total_notes=processed_note_count,
                    )
                finally:
                    if batch_size_value > 0 and batch_pause_value > 0 and note_index < processed_note_count and note_index % batch_size_value == 0:
                        report(
                            "批次冷却",
                            current_album=name,
                            current_album_index=album_index,
                            current_note_index=note_index,
                            total_notes=processed_note_count,
                            batch_size=batch_size_value,
                            delay_seconds=round(batch_pause_value, 1),
                        )
                        await asyncio.sleep(batch_pause_value)
                    if crawl_delay_seconds > 0 and note_index < processed_note_count:
                        max_delay = min(max(8.0, float(crawl_delay_seconds)), 30.0)
                        if max_delay >= 20.0:
                            min_delay = max(14.0, max_delay - 8.0)
                        elif max_delay >= 14.0:
                            min_delay = max(10.0, max_delay - 5.0)
                        else:
                            min_delay = max(8.0, max_delay - 4.0)
                        delay = random.uniform(min_delay, max_delay)
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
                    "mode": album_mode,
                    "found": len(notes),
                    "saved": album_saved,
                    "skipped": album_skipped,
                    "diagnostics": diagnostics,
                }
            )
            report("专辑完成", current_album=name, current_album_index=album_index)
    finally:
        if shared_page is not None:
            await shared_page.close()

    return {
        "success": True,
        "saved": saved,
        "skipped": skipped,
        "failed": failed,
        "crawl_mode": mode,
        "progress_path": str(_albums_progress_path(vault_path)),
        "results": results,
    }
