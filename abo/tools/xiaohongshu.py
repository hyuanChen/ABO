"""
小红书主动分析工具

核心策略：
1. 复用用户 Cookie，不做自动登录
2. 优先通过本地 bridge + 浏览器扩展读取真实页面 MAIN world 状态
3. bridge 不可用时再回退 HTML / 旧路径
"""

import asyncio
import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from html import unescape
from typing import Any, Optional
from urllib.parse import parse_qs, quote, urlencode, urlsplit, urlunsplit

import httpx

from abo.tools.xhs_extension_bridge import XHSExtensionBridge

COMMENTS_CONTAINER_SELECTOR = ".comments-container"
COMMENT_PARENT_SELECTOR = ".parent-comment"
COMMENT_ITEM_SELECTOR = ".parent-comment, .comment-item, .comment"
NO_COMMENTS_SELECTOR = ".no-comments-text"
END_CONTAINER_SELECTOR = ".end-container"
SHOW_MORE_SELECTOR = ".show-more"
TOTAL_COMMENT_SELECTOR = ".comments-container .total"


def _classify_xhs_page_text(text: str) -> tuple[str, str] | None:
    normalized = str(text or "").strip()
    if not normalized:
        return None

    rules = [
        ("risk_limited", "访问频繁", "命中小红书访问频繁限制，任务已停止"),
        ("risk_limited", "安全限制", "命中小红书安全限制，任务已停止"),
        ("risk_limited", "安全访问", "命中小红书安全访问限制，任务已停止"),
        ("risk_limited", "请稍后再试", "小红书要求稍后重试，任务已停止"),
        ("manual_required", "扫码", "页面要求扫码验证，任务已停止"),
        ("auth_invalid", "请先登录", "当前浏览器未登录小红书，任务已停止"),
        ("auth_invalid", "登录后查看更多内容", "当前页面要求登录后查看，任务已停止"),
        ("not_found", "300031", "当前页面暂时无法浏览，任务已停止"),
        ("not_found", "页面不见了", "页面已不可访问，任务已停止"),
        ("not_found", "内容无法展示", "页面内容不可展示，任务已停止"),
        ("not_found", "笔记不存在", "笔记不存在或已删除，任务已停止"),
        ("not_found", "内容已无法查看", "内容已无法查看，任务已停止"),
    ]
    for code, marker, message in rules:
        if marker in normalized:
            return code, message
    return None


def _raise_for_xhs_snapshot(snapshot: Any) -> None:
    if not isinstance(snapshot, dict):
        return
    risk = snapshot.get("risk")
    if isinstance(risk, dict) and risk.get("code"):
        code = str(risk.get("code") or "").strip()
        message = str(risk.get("message") or "").strip() or "页面状态异常"
        raise RuntimeError(f"[{code}] {message}")


def _should_stop_extension_error(error: Any) -> bool:
    text = str(error or "")
    stop_markers = [
        "[risk_limited]",
        "[manual_required]",
        "[auth_invalid]",
        "[not_found]",
        "访问频繁",
        "安全限制",
        "扫码",
        "请先登录",
        "300031",
        "任务已停止",
    ]
    lowered = text.lower()
    return any(marker.lower() in lowered for marker in stop_markers)


@dataclass
class XHSComment:
    """小红书评论数据结构"""

    id: str
    author: str
    content: str
    likes: int
    is_top: bool = False
    reply_to: Optional[str] = None


@dataclass
class XHSNote:
    """小红书笔记数据结构"""

    id: str
    title: str
    content: str
    author: str
    author_id: str
    likes: int
    collects: int
    comments_count: int
    url: str
    published_at: Optional[datetime] = None
    cover_image: Optional[str] = None
    tags: list[str] = field(default_factory=list)
    note_type: str = "normal"
    images: list[str] = field(default_factory=list)
    video_url: Optional[str] = None
    comments_preview: list[XHSComment] = field(default_factory=list)
    xsec_token: str = ""
    xsec_source: str = ""


@dataclass
class XHSTrendsAnalysis:
    """Trends 分析结果"""

    hot_topics: list[str]
    trending_tags: list[dict]
    content_patterns: list[str]
    audience_insights: list[str]
    engagement_factors: list[str]
    summary: str


class XiaohongshuAPI:
    """小红书页面抓取工具。"""

    BASE_URL = "https://www.xiaohongshu.com"

    def __init__(self, timeout: int = 30):
        self.timeout = timeout
        self.client = httpx.AsyncClient(timeout=timeout, follow_redirects=True)

    async def get_following_feed_with_cookie(
        self,
        cookie: str,
        keywords: list[str],
        max_notes: int = 50,
        use_extension: bool = True,
        extension_port: int = 9334,
        dedicated_window_mode: bool = False,
    ) -> list[XHSNote]:
        """从关注流直接抓取卡片内容。"""
        if not cookie:
            raise ValueError("未配置小红书 Cookie，请先配置 web_session")
        feed_url = f"{self.BASE_URL}/explore?tab=following"
        notes = await self._extract_cards_with_plugin_priority(
            url=feed_url,
            page_kind="feed",
            max_results=max_notes * 2,
            cookie=cookie,
            use_extension=use_extension,
            extension_port=extension_port,
            dedicated_window_mode=dedicated_window_mode,
        )
        matched_notes: list[XHSNote] = []
        for note in notes:
            full_text = f"{note.title} {note.content}".lower()
            matched_keywords = [kw for kw in keywords if kw.lower() in full_text]
            if matched_keywords:
                setattr(note, "matched_keywords", matched_keywords)
                matched_notes.append(note)
            if len(matched_notes) >= max_notes:
                break
        return matched_notes[:max_notes]

    async def search_by_keyword(
        self,
        keyword: str,
        sort_by: str = "likes",
        max_results: int = 20,
        min_likes: int = 100,
        cookie: str | None = None,
        use_extension: bool = True,
        extension_port: int = 9334,
        dedicated_window_mode: bool = False,
    ) -> list[XHSNote]:
        """
        根据关键词搜索小红书笔记。
        需要 Cookie 才能稳定访问。
        """
        if not cookie:
            raise ValueError("未配置小红书 Cookie，请先配置 web_session")

        search_url = f"{self.BASE_URL}/search_result?keyword={quote(keyword)}"
        notes = await self._extract_cards_with_plugin_priority(
            url=search_url,
            page_kind="search",
            max_results=max_results * 2,
            cookie=cookie,
            use_extension=use_extension,
            extension_port=extension_port,
            dedicated_window_mode=dedicated_window_mode,
        )
        notes = [note for note in notes if not min_likes or note.likes >= min_likes]

        if sort_by == "likes":
            notes.sort(key=lambda x: x.likes, reverse=True)
        elif sort_by == "time":
            notes.sort(key=lambda x: x.published_at or datetime.min, reverse=True)
        return notes[:max_results]

    async def fetch_comments(
        self,
        note_id: str,
        sort_by: str = "likes",
        max_comments: int = 50,
        note_url: Optional[str] = None,
        cookie: Optional[str] = None,
    ) -> list[XHSComment]:
        """通过笔记详情页 Initial State 提取评论。"""
        if not cookie:
            raise ValueError("获取评论需要有效的小红书 Cookie")

        target_url = note_url or self._normalize_note_url(note_id)
        html = await self._fetch_html(target_url, cookie)
        state = self._extract_initial_state(html)
        comments = self._extract_comments_from_state(state)

        unique: dict[str, XHSComment] = {}
        for comment in comments:
            if not comment.content.strip():
                continue
            unique[comment.id] = comment

        result = list(unique.values())
        if sort_by == "likes":
            result.sort(key=lambda x: x.likes, reverse=True)
        return result[:max_comments]

    async def _extract_cards_with_plugin_priority(
        self,
        *,
        url: str,
        page_kind: str,
        max_results: int,
        cookie: str,
        use_extension: bool = True,
        extension_port: int = 9334,
        dedicated_window_mode: bool = False,
    ) -> list[XHSNote]:
        """统一列表页抓取入口。

        对齐专辑抓取主链路：优先 bridge + 扩展读取真实页面 state，
        失败时再回退到 Playwright。
        """
        if use_extension:
            try:
                notes = await self._extract_cards_via_extension(
                    url=url,
                    max_results=max_results,
                    extension_port=extension_port,
                    dedicated_window_mode=dedicated_window_mode,
                    page_kind=page_kind,
                )
                if notes:
                    return notes
            except Exception as exc:
                if _should_stop_extension_error(exc):
                    raise

        return await self._extract_cards_via_playwright(
            url=url,
            cookie=cookie,
            max_results=max_results,
            page_kind=page_kind,
        )

    async def fetch_note_detail(self, note_url: str, cookie: str) -> Optional[XHSNote]:
        """抓取单条笔记详情。"""
        try:
            html = await self._fetch_html(note_url, cookie)
            state = self._extract_initial_state(html)
            note = self._extract_note_from_state(state, note_url)
            if note:
                return note
            return self._extract_note_from_html_fallback(html, note_url)
        except Exception as e:
            print(f"抓取笔记详情失败 {note_url}: {e}")
            return None

    async def _fetch_html(self, url: str, cookie: str) -> str:
        headers = self._build_headers(cookie)
        resp = await self.client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.text

    def _build_headers(self, cookie: str) -> dict[str, str]:
        return {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": f"{self.BASE_URL}/",
            "Cookie": cookie,
        }

    def _normalize_note_url(self, note_id_or_url: str) -> str:
        if note_id_or_url.startswith("http://") or note_id_or_url.startswith("https://"):
            return note_id_or_url
        clean = note_id_or_url.strip().split("?")[0].split("/")[-1]
        return f"{self.BASE_URL}/explore/{clean}"

    def _with_xsec_params(self, url: str, token: str = "", source: str = "") -> str:
        if not token and not source:
            return url
        parts = urlsplit(url)
        query = parse_qs(parts.query)
        if token and not query.get("xsec_token"):
            query["xsec_token"] = [token]
        if source and not query.get("xsec_source"):
            query["xsec_source"] = [source]
        return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query, doseq=True), parts.fragment))

    def _parse_cookie_string(self, cookie_str: str) -> list[dict]:
        """解析 cookie 字符串为 Playwright 格式。"""
        cookies: list[dict] = []
        cookie_str = cookie_str.strip()
        if not cookie_str:
            return cookies

        if cookie_str.startswith("[") or cookie_str.startswith("{"):
            try:
                data = json.loads(cookie_str)
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and "name" in item and "value" in item:
                            cookies.append(
                                {
                                    "name": item["name"],
                                    "value": item["value"],
                                    "domain": item.get("domain") or ".xiaohongshu.com",
                                    "path": item.get("path") or "/",
                                }
                            )
                    return cookies
            except Exception:
                pass

        for pair in cookie_str.split(";"):
            pair = pair.strip()
            if "=" not in pair:
                continue
            name, value = pair.split("=", 1)
            cookies.append(
                {
                    "name": name.strip(),
                    "value": value.strip(),
                    "domain": ".xiaohongshu.com",
                    "path": "/",
                }
            )
        return cookies

    def _extract_initial_state(self, html: str) -> dict[str, Any]:
        marker = "window.__INITIAL_STATE__"
        idx = html.find(marker)
        if idx == -1:
            raise ValueError("页面中未找到 Initial State")

        start = html.find("{", idx)
        if start == -1:
            raise ValueError("Initial State JSON 起始位置缺失")

        end = html.find("</script>", start)
        payload = html[start:end] if end != -1 else html[start:]
        payload = self._sanitize_js_object_literal(payload)

        decoder = json.JSONDecoder()
        obj, _ = decoder.raw_decode(payload)
        return obj

    def _sanitize_js_object_literal(self, text: str) -> str:
        """把接近 JSON 的 JS 对象字面量清洗成可解析 JSON。"""
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

        # 更稳一些：处理对象或数组里的 undefined
        sanitized = re.sub(r'(?<=[:\[,])\s*undefined(?=\s*[,}\]])', " null", sanitized)
        sanitized = re.sub(r'(?<=[:\[,])\s*NaN(?=\s*[,}\]])', " null", sanitized)
        sanitized = re.sub(r'(?<=[:\[,])\s*-?Infinity(?=\s*[,}\]])', " null", sanitized)
        return sanitized

    def _walk(self, obj: Any):
        if isinstance(obj, dict):
            yield obj
            for value in obj.values():
                yield from self._walk(value)
        elif isinstance(obj, list):
            for item in obj:
                yield from self._walk(item)

    def _extract_note_from_state(self, state: dict[str, Any], note_url: str) -> Optional[XHSNote]:
        note_root = self._extract_note_root(state)
        if not note_root:
            return None

        note_id = (
            self._safe_str(note_root.get("noteId"))
            or self._safe_str(note_root.get("id"))
            or self._extract_note_id(note_url)
        )
        title = self._safe_str(note_root.get("title")) or "无标题"
        content = (
            self._safe_str(note_root.get("desc"))
            or self._safe_str(note_root.get("content"))
            or self._safe_str(note_root.get("noteDesc"))
        )
        user = note_root.get("user") or note_root.get("userInfo") or {}
        interact = note_root.get("interactInfo") or {}

        images = self._extract_image_urls(note_root)
        video_url = self._extract_video_url(note_root)
        comments_preview = self._extract_comments_from_state(state)[:8]

        published_at = self._extract_datetime(
            note_root.get("time")
            or note_root.get("publishTime")
            or note_root.get("lastUpdateTime")
        )

        note_type = self._safe_str(note_root.get("type")) or ("video" if video_url else "normal")
        author = (
            self._safe_str(user.get("nickname"))
            or self._safe_str(user.get("name"))
            or self._safe_str(user.get("userName"))
            or "未知"
        )
        author_id = (
            self._safe_str(user.get("userId"))
            or self._safe_str(user.get("uid"))
            or self._safe_str(user.get("id"))
        )

        likes = self._parse_count(interact.get("likedCount") or interact.get("likes") or note_root.get("likedCount"))
        collects = self._parse_count(interact.get("collectedCount") or note_root.get("collectedCount"))
        comments_count = self._parse_count(interact.get("commentCount") or note_root.get("commentCount"))

        cover_image = images[0] if images else None
        return XHSNote(
            id=note_id,
            title=title,
            content=content,
            author=author,
            author_id=author_id,
            likes=likes,
            collects=collects,
            comments_count=comments_count,
            url=self._normalize_note_url(note_url),
            published_at=published_at,
            cover_image=cover_image,
            note_type=note_type,
            images=images,
            video_url=video_url,
            comments_preview=comments_preview,
        )

    def _extract_note_root(self, state: dict[str, Any]) -> Optional[dict[str, Any]]:
        note_section = state.get("note")
        if isinstance(note_section, dict):
            detail_map = note_section.get("noteDetailMap")
            if isinstance(detail_map, dict) and detail_map:
                for item in detail_map.values():
                    if not isinstance(item, dict):
                        continue
                    if isinstance(item.get("note"), dict):
                        return item["note"]
                    return item

        for node in self._walk(state):
            if (
                ("noteId" in node or "id" in node)
                and ("title" in node or "desc" in node or "interactInfo" in node)
                and ("user" in node or "userInfo" in node or "imageList" in node or "video" in node)
            ):
                return node
        return None

    def _extract_comments_from_state(self, state: dict[str, Any]) -> list[XHSComment]:
        comments: list[XHSComment] = []
        seen: set[str] = set()
        for node in self._walk(state):
            content = self._safe_str(node.get("content")) or self._safe_str(node.get("comment"))
            user = node.get("userInfo") or node.get("user") or {}
            author = (
                self._safe_str(user.get("nickname"))
                or self._safe_str(user.get("name"))
                or self._safe_str(node.get("nickname"))
            )
            if not content or not author:
                continue
            if len(content) < 2 or len(content) > 3000:
                continue
            comment_id = (
                self._safe_str(node.get("commentId"))
                or self._safe_str(node.get("id"))
                or f"comment-{hash((author, content))}"
            )
            if comment_id in seen:
                continue
            seen.add(comment_id)
            comments.append(
                XHSComment(
                    id=comment_id,
                    author=author,
                    content=content,
                    likes=self._parse_count(
                        node.get("likeCount")
                        or node.get("likedCount")
                        or node.get("likes")
                    ),
                    is_top=bool(node.get("isTop") or node.get("top")),
                    reply_to=self._safe_str(node.get("targetUserNickname") or node.get("replyTo")),
                )
            )
        comments.sort(key=lambda x: (x.is_top, x.likes), reverse=True)
        return comments

    def _extract_comments_from_dom_records(self, records: list[dict[str, Any]]) -> list[XHSComment]:
        comments: list[XHSComment] = []
        seen: set[str] = set()
        for item in records:
            if not isinstance(item, dict):
                continue
            author = self._safe_str(item.get("author"))
            content = self._safe_str(item.get("content"))
            if not author or not content:
                continue
            comment_id = (
                self._safe_str(item.get("comment_id"))
                or self._safe_str(item.get("id"))
                or f"comment-{hash((author, content))}"
            )
            if comment_id in seen:
                continue
            seen.add(comment_id)
            comments.append(
                XHSComment(
                    id=comment_id,
                    author=author,
                    content=content,
                    likes=self._parse_count(item.get("likes")),
                    is_top=bool(item.get("is_top")),
                    reply_to=self._safe_str(item.get("reply_to")),
                )
            )
        comments.sort(key=lambda x: (x.is_top, x.likes), reverse=True)
        return comments

    def _dedupe_comments(self, comments: list[XHSComment]) -> list[XHSComment]:
        ordered: list[XHSComment] = []
        seen_ids: set[str] = set()
        seen_signatures: set[str] = set()

        def normalize_text(value: str) -> str:
            return re.sub(r"\s+", " ", self._safe_str(value)).strip()

        for item in comments:
            item_id = self._safe_str(item.id)
            signature = "|".join(
                [
                    normalize_text(item.author),
                    normalize_text(item.reply_to),
                    normalize_text(item.content),
                ]
            )
            if item_id and item_id in seen_ids:
                continue
            if signature and signature in seen_signatures:
                continue
            if item_id:
                seen_ids.add(item_id)
            if signature:
                seen_signatures.add(signature)
            ordered.append(item)
        ordered.sort(key=lambda x: (x.is_top, x.likes), reverse=True)
        return ordered

    def _build_extension_comment_status_expression(self) -> str:
        return (
            "(() => {"
            "const textOf = (selector) => {"
            "  const el = document.querySelector(selector);"
            "  return (el?.innerText || el?.textContent || '').trim();"
            "};"
            "const parseCount = (value) => {"
            "  const text = String(value || '').replace(/[,，\\s]/g, '').trim();"
            "  if (!text) return 0;"
            "  const m = text.match(/([0-9]+(?:\\.[0-9]+)?)(万)?/);"
            "  if (!m) return 0;"
            "  const num = Number(m[1]);"
            "  return Number.isFinite(num) ? Math.round(m[2] ? num * 10000 : num) : 0;"
            "};"
            f"const commentsContainer = document.querySelector({json.dumps(COMMENTS_CONTAINER_SELECTOR)});"
            f"const commentNodes = Array.from(document.querySelectorAll({json.dumps(COMMENT_ITEM_SELECTOR)}));"
            f"const totalText = textOf({json.dumps(TOTAL_COMMENT_SELECTOR)});"
            f"const noCommentsText = textOf({json.dumps(NO_COMMENTS_SELECTOR)});"
            f"const endText = textOf({json.dumps(END_CONTAINER_SELECTOR)});"
            "const showMoreButtons = Array.from(document.querySelectorAll("
            + json.dumps(SHOW_MORE_SELECTOR)
            + ")).slice(0, 30).map((el, index) => ({"
            "  index,"
            "  text: ((el.innerText || el.textContent || '').trim()),"
            "  hidden: !!(el.offsetParent === null),"
            "}));"
            "const scroller = document.scrollingElement || document.documentElement;"
            "const scrollTop = scroller ? scroller.scrollTop : 0;"
            "const scrollHeight = scroller ? scroller.scrollHeight : 0;"
            "const viewportHeight = window.innerHeight || 0;"
            "return {"
            "  has_comments_container: !!commentsContainer,"
            "  comment_count: commentNodes.length,"
            "  total_count: parseCount(totalText),"
            "  no_comments: /荒地|暂无评论|还没有评论/.test(noCommentsText),"
            "  no_comments_text: noCommentsText,"
            "  end_reached: /THE\\s*END/i.test(endText),"
            "  end_text: endText,"
            "  show_more_buttons: showMoreButtons,"
            "  visible_show_more_count: showMoreButtons.filter((item) => !item.hidden).length,"
            "  scroll_top: scrollTop,"
            "  scroll_height: scrollHeight,"
            "  viewport_height: viewportHeight,"
            "  at_bottom: scrollHeight > 0 && viewportHeight > 0 && scrollTop + viewportHeight >= scrollHeight - 220,"
            "};"
            "})()"
        )

    def _build_extension_comment_click_more_expression(self, max_replies_threshold: int, max_click: int = 8) -> str:
        return (
            "(() => {"
            f"const threshold = {int(max_replies_threshold)};"
            f"const maxClick = {int(max_click)};"
            f"const buttons = Array.from(document.querySelectorAll({json.dumps(SHOW_MORE_SELECTOR)}));"
            "let clicked = 0;"
            "let skipped = 0;"
            "for (const button of buttons) {"
            "  if (clicked >= maxClick) break;"
            "  if (!button || button.offsetParent === null) continue;"
            "  const text = ((button.innerText || button.textContent || '').trim());"
            "  if (!text) continue;"
            "  const match = text.match(/展开\\s*(\\d+)\\s*条回复/);"
            "  if (threshold > 0 && match) {"
            "    const replyCount = Number(match[1] || 0);"
            "    if (replyCount > threshold) { skipped += 1; continue; }"
            "  }"
            "  button.scrollIntoView({ block: 'center', inline: 'center' });"
            "  button.click();"
            "  clicked += 1;"
            "}"
            "return { clicked, skipped };"
            "})()"
        )

    def _build_extension_scroll_last_comment_expression(self) -> str:
        return (
            "(() => {"
            f"const nodes = Array.from(document.querySelectorAll({json.dumps(COMMENT_ITEM_SELECTOR)}));"
            "const last = nodes[nodes.length - 1];"
            "if (!last) return false;"
            "last.scrollIntoView({ block: 'center', inline: 'nearest' });"
            "return true;"
            "})()"
        )

    def _build_extension_comment_state_expression(self, note_id: str) -> str:
        note_id_js = json.dumps(note_id)
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
            "    if ('_rawValue' in current) { current = current._rawValue; continue; }"
            "    break;"
            "  }"
            "  return current;"
            "};"
            "const state = window.__INITIAL_STATE__ || {};"
            "const noteState = unwrap(state.note) || {};"
            "const noteDetailMap = unwrap(noteState.noteDetailMap) || {};"
            "const values = noteDetailMap && typeof noteDetailMap === 'object' ? Object.values(noteDetailMap) : [];"
            "const detail = noteDetailMap[noteId] || values.find((item) => {"
            "  if (!item || typeof item !== 'object') return false;"
            "  const note = item.note && typeof item.note === 'object' ? item.note : item;"
            "  const candidateId = note.noteId || note.note_id || note.id || '';"
            "  return String(candidateId) === String(noteId);"
            "}) || null;"
            "if (!detail) return {};"
            "return { note: { noteDetailMap: { [noteId || 'note']: detail } } };"
            "})()"
        )

    def _build_extension_comment_dom_extract_expression(self, limit: int) -> str:
        return (
            "(() => {"
            f"const limit = {int(limit)};"
            "const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();"
            "const parseCount = (value) => {"
            "  const text = String(value || '').replace(/[,，\\s]/g, '').trim();"
            "  if (!text) return 0;"
            "  const m = text.match(/([0-9]+(?:\\.[0-9]+)?)(万)?/);"
            "  if (!m) return 0;"
            "  const num = Number(m[1]);"
            "  return Number.isFinite(num) ? Math.round(m[2] ? num * 10000 : num) : 0;"
            "};"
            "const pickText = (root, selectors) => {"
            "  for (const selector of selectors) {"
            "    const el = root.querySelector(selector);"
            "    const text = normalize(el?.innerText || el?.textContent || '');"
            "    if (text) return text;"
            "  }"
            "  return '';"
            "};"
            f"const nodes = Array.from(document.querySelectorAll({json.dumps(COMMENT_ITEM_SELECTOR + ', .sub-comment, .reply-item')}));"
            "return nodes.slice(0, limit).map((node, index) => {"
            "  const authorLink = node.querySelector('a[href*=\"/user/profile/\"]');"
            "  const author = normalize("
            "    authorLink?.innerText || authorLink?.textContent ||"
            "    pickText(node, ['.author', '.name', '.user-name', '.nickname', '.username'])"
            "  );"
            "  let content = normalize(pickText(node, ['.content', '.comment-content', '.comment-text', '.desc', '.note-text', 'p.content', 'p', 'span.content']));"
            "  if (!content) {"
            "    const textPool = Array.from(node.querySelectorAll('div,span,p')).map((el) => normalize(el.innerText || el.textContent || '')).filter(Boolean);"
            "    content = textPool.filter((text) => !/回复|赞|展开\\s*\\d+\\s*条回复|查看更多|THE\\s*END/i.test(text)).sort((a, b) => b.length - a.length)[0] || '';"
            "  }"
            "  const likeText = pickText(node, ['.like-wrapper', '.like', '.interactions', '.right']);"
            "  const replyTo = normalize(pickText(node, ['.reply-user', '.target-user', '.reply-to']));"
            "  const commentId = normalize("
            "    node.id || node.getAttribute('data-comment-id') || node.getAttribute('comment-id') || `comment-dom-${index}`"
            "  ).replace(/^comment-/, '');"
            "  const wholeText = normalize(node.innerText || node.textContent || '');"
            "  return {"
            "    comment_id: commentId,"
            "    author,"
            "    content,"
            "    likes: parseCount(likeText),"
            "    is_top: /置顶/.test(wholeText),"
            "    reply_to: replyTo,"
            "  };"
            "}).filter((item) => item.author && item.content);"
            "})()"
        )

    async def _fetch_comment_status_via_extension(
        self,
        bridge: XHSExtensionBridge,
        note_id: str,
    ) -> dict[str, Any]:
        snapshot = await bridge.call(
            "get_xhs_page_snapshot",
            {"kind": "note", "noteId": note_id, "textLimit": 1200},
            timeout=12.0,
        )
        _raise_for_xhs_snapshot(snapshot)
        status = await bridge.call(
            "evaluate",
            {"expression": self._build_extension_comment_status_expression()},
            timeout=20.0,
        )
        if not isinstance(status, dict):
            return {}
        return status

    async def _scroll_to_comments_area_via_extension(self, bridge: XHSExtensionBridge) -> None:
        await bridge.call(
            "scroll_element_into_view",
            {"selector": COMMENTS_CONTAINER_SELECTOR},
            timeout=10.0,
        )
        await asyncio.sleep(0.6)
        await bridge.call("dispatch_wheel_event", {"deltaY": 120}, timeout=10.0)
        await asyncio.sleep(0.8)

    async def _scroll_to_last_comment_via_extension(self, bridge: XHSExtensionBridge) -> None:
        await bridge.call(
            "evaluate",
            {"expression": self._build_extension_scroll_last_comment_expression()},
            timeout=12.0,
        )

    async def _click_show_more_buttons_via_extension(
        self,
        bridge: XHSExtensionBridge,
        max_replies_threshold: int,
    ) -> tuple[int, int]:
        result = await bridge.call(
            "evaluate",
            {
                "expression": self._build_extension_comment_click_more_expression(
                    max_replies_threshold=max_replies_threshold,
                    max_click=8,
                )
            },
            timeout=20.0,
        )
        if not isinstance(result, dict):
            return 0, 0
        return int(result.get("clicked") or 0), int(result.get("skipped") or 0)

    async def _human_scroll_comments_via_extension(
        self,
        bridge: XHSExtensionBridge,
        status: dict[str, Any],
        *,
        large_mode: bool = False,
    ) -> None:
        at_bottom = bool(status.get("at_bottom"))
        if large_mode:
            await bridge.call("dispatch_wheel_event", {"deltaY": 1600}, timeout=10.0)
            await asyncio.sleep(0.7)
            await bridge.call("scroll_by", {"x": 0, "y": 1200}, timeout=10.0)
        else:
            await bridge.call("dispatch_wheel_event", {"deltaY": 900}, timeout=10.0)
            await asyncio.sleep(0.5)
            await bridge.call("scroll_by", {"x": 0, "y": 560}, timeout=10.0)
        if at_bottom:
            await asyncio.sleep(0.5)
            await bridge.call("scroll_to_bottom", {}, timeout=10.0)

    async def _fetch_comments_via_extension(
        self,
        *,
        note_id: str,
        note_url: Optional[str],
        max_comments: int,
        extension_port: int,
        dedicated_window_mode: bool,
        load_all_comments: bool = True,
        click_more_replies: bool = True,
        max_replies_threshold: int = 10,
    ) -> list[XHSComment]:
        target_url = note_url or self._normalize_note_url(note_id)
        async with XHSExtensionBridge(port=extension_port) as bridge:
            await bridge.wait_until_ready(timeout=20.0)
            background = bool(dedicated_window_mode)
            if dedicated_window_mode:
                await bridge.call("ensure_dedicated_xhs_tab", {"url": target_url}, timeout=60.0)
            else:
                await bridge.call("navigate", {"url": target_url, "background": background}, timeout=45.0)
            await bridge.call("wait_for_load", {"timeout": 45000, "background": background}, timeout=45.0)
            await bridge.call("wait_dom_stable", {"timeout": 12000, "interval": 500}, timeout=15.0)
            snapshot = await bridge.call(
                "wait_for_xhs_state",
                {"kind": "note", "noteId": note_id, "timeout": 15000, "interval": 500},
                timeout=20.0,
            )
            _raise_for_xhs_snapshot(snapshot)
            await self._scroll_to_comments_area_via_extension(bridge)

            status = await self._fetch_comment_status_via_extension(bridge, note_id)
            if status.get("no_comments"):
                return []

            if load_all_comments:
                max_attempts = max(max_comments * 3, 18) if max_comments > 0 else 48
                no_growth_rounds = 0
                stagnant_checks = 0
                for attempt in range(max_attempts):
                    status = await self._fetch_comment_status_via_extension(bridge, note_id)
                    current_count = int(status.get("comment_count") or 0)
                    if status.get("no_comments"):
                        break
                    if status.get("end_reached"):
                        break
                    if max_comments > 0 and current_count >= max_comments:
                        break

                    if click_more_replies and attempt % 2 == 0:
                        clicked, skipped = await self._click_show_more_buttons_via_extension(
                            bridge,
                            max_replies_threshold=max_replies_threshold,
                        )
                        if clicked > 0 or skipped > 0:
                            await asyncio.sleep(1.0)
                            status = await self._fetch_comment_status_via_extension(bridge, note_id)
                            current_count = int(status.get("comment_count") or 0)
                            if status.get("end_reached") or (max_comments > 0 and current_count >= max_comments):
                                break

                    if current_count > 0:
                        await self._scroll_to_last_comment_via_extension(bridge)
                        await asyncio.sleep(0.5)

                    before_scroll_top = int(status.get("scroll_top") or 0)
                    await self._human_scroll_comments_via_extension(
                        bridge,
                        status,
                        large_mode=stagnant_checks >= 3,
                    )
                    await asyncio.sleep(1.0)

                    after_status = await self._fetch_comment_status_via_extension(bridge, note_id)
                    after_count = int(after_status.get("comment_count") or 0)
                    after_scroll_top = int(after_status.get("scroll_top") or 0)

                    if after_count > current_count:
                        no_growth_rounds = 0
                        stagnant_checks = 0
                    else:
                        no_growth_rounds += 1
                        if after_status.get("at_bottom") or after_scroll_top <= before_scroll_top + 8:
                            stagnant_checks += 1
                        else:
                            stagnant_checks = max(stagnant_checks - 1, 0)

                    if after_status.get("end_reached"):
                        break
                    if max_comments > 0 and after_count >= max_comments:
                        break
                    if no_growth_rounds >= 3:
                        break

            state_payload = await bridge.call(
                "evaluate",
                {"expression": self._build_extension_comment_state_expression(note_id)},
                timeout=20.0,
            )
            dom_records = await bridge.call(
                "evaluate",
                {"expression": self._build_extension_comment_dom_extract_expression(max(max_comments * 3, 160) if max_comments > 0 else 240)},
                timeout=20.0,
            )

        comments = self._extract_comments_from_state(state_payload if isinstance(state_payload, dict) else {})
        comments.extend(
            self._extract_comments_from_dom_records(dom_records if isinstance(dom_records, list) else [])
        )
        comments = self._dedupe_comments(comments)
        return comments[:max_comments] if max_comments > 0 else comments

    def _extract_image_urls(self, note_root: dict[str, Any]) -> list[str]:
        urls: list[str] = []
        image_lists = []
        for key in ["imageList", "imagesList", "imageInfoList"]:
            value = note_root.get(key)
            if isinstance(value, list):
                image_lists.extend(value)

        for item in image_lists:
            if not isinstance(item, dict):
                continue
            candidates = self._extract_url_candidates(item)
            if candidates:
                urls.append(candidates[0])

        unique: list[str] = []
        for url in urls:
            if url not in unique:
                unique.append(url)
        return unique

    def _extract_video_url(self, note_root: dict[str, Any]) -> Optional[str]:
        video = note_root.get("video") or note_root.get("videoInfoV2") or {}
        candidates = self._extract_url_candidates(video)
        preferred = [url for url in candidates if any(codec in url.lower() for codec in ["h264", "master", ".mp4"])]
        return preferred[0] if preferred else (candidates[0] if candidates else None)

    def _extract_url_candidates(self, obj: Any) -> list[str]:
        urls: list[str] = []
        if isinstance(obj, dict):
            for key, value in obj.items():
                if isinstance(value, str) and value.startswith("http"):
                    if any(token in key.lower() for token in ["url", "stream", "origin", "master", "link"]):
                        urls.append(value)
                else:
                    urls.extend(self._extract_url_candidates(value))
        elif isinstance(obj, list):
            for item in obj:
                urls.extend(self._extract_url_candidates(item))

        ordered: list[str] = []
        for url in urls:
            if url not in ordered:
                ordered.append(url)
        return ordered

    def _extract_note_from_html_fallback(self, html: str, note_url: str) -> Optional[XHSNote]:
        title_match = re.search(r"<title>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
        title = unescape(title_match.group(1)).strip() if title_match else "无标题"
        title = title.replace(" - 小红书", "").strip()
        if not title:
            return None
        image_urls = re.findall(r'https://[^"\']+\.(?:jpg|jpeg|png|webp)', html, re.IGNORECASE)
        return XHSNote(
            id=self._extract_note_id(note_url),
            title=title,
            content="",
            author="未知",
            author_id="",
            likes=0,
            collects=0,
            comments_count=0,
            url=self._normalize_note_url(note_url),
            cover_image=image_urls[0] if image_urls else None,
            images=image_urls[:9],
        )

    async def _discover_search_note_urls(self, keyword: str, cookie: str, max_results: int) -> list[str]:
        search_url = f"{self.BASE_URL}/search_result?keyword={quote(keyword)}"
        html = await self._fetch_html(search_url, cookie)
        urls = self._extract_note_urls_from_html(html)
        if urls:
            return urls[:max_results]
        return await self._discover_search_note_urls_with_playwright(search_url, cookie, max_results)

    def _default_xsec_source(self, page_kind: str) -> str:
        return "pc_feed" if page_kind == "feed" else "pc_search"

    def _build_card_extract_expression(self, page_kind: str) -> str:
        normalized_kind = "feed" if page_kind == "feed" else "search"
        default_xsec_source = self._default_xsec_source(normalized_kind)
        if normalized_kind == "feed":
            roots = [
                "unwrap(state.feed?.feeds)",
                "unwrap(state.feed?.items)",
                "unwrap(state.search?.feeds)",
                "unwrap(state.search?.notes)",
                "unwrap(state.search?.noteList)",
                "unwrap(state.note?.noteDetailMap)",
            ]
        else:
            roots = [
                "unwrap(state.search?.feeds)",
                "unwrap(state.search?.notes)",
                "unwrap(state.search?.noteList)",
                "unwrap(state.feed?.feeds)",
                "unwrap(state.feed?.items)",
                "unwrap(state.note?.noteDetailMap)",
            ]
        roots_js = ",\n            ".join(roots)
        return f"""
        (() => {{
          const unwrap = (value) => {{
            let current = value;
            const seen = new Set();
            while (current && typeof current === 'object' && !seen.has(current)) {{
              seen.add(current);
              if (Array.isArray(current)) return current;
              if ('_value' in current) {{ current = current._value; continue; }}
              if ('value' in current) {{ current = current.value; continue; }}
              if ('_rawValue' in current) {{ current = current._rawValue; continue; }}
              break;
            }}
            return current;
          }};
          const byId = {{}};
          const addToken = (value) => {{
            if (!value || typeof value !== 'object') return;
            const noteId = value.noteId || value.note_id || value.id;
            const token = value.xsecToken || value.xsec_token;
            if (noteId && token && !byId[noteId]) byId[noteId] = String(token);
          }};
          const state = window.__INITIAL_STATE__ || {{}};
          const roots = [
            {roots_js}
          ].filter(Boolean);
          const queue = roots.map(value => ({{ value, depth: 0 }}));
          const seenObjects = new WeakSet();
          let visited = 0;
          while (queue.length && visited < 2500) {{
            const {{ value, depth }} = queue.shift();
            if (!value || typeof value !== 'object' || seenObjects.has(value) || depth > 5) continue;
            seenObjects.add(value);
            visited += 1;
            addToken(value);
            const children = Array.isArray(value)
              ? value.slice(0, 120)
              : Object.keys(value).slice(0, 120).map(key => {{
                  try {{ return value[key]; }} catch (_) {{ return null; }}
                }});
            for (const child of children) {{
              if (child && typeof child === 'object') queue.push({{ value: child, depth: depth + 1 }});
            }}
          }}
          const anchors = Array.from(document.querySelectorAll('a[href*="/explore/"]'));
          return anchors.map((a) => {{
            const rawHref = a.href || a.getAttribute('href') || '';
            const absoluteHref = rawHref.startsWith('http') ? rawHref : new URL(rawHref, location.origin).href;
            const url = new URL(absoluteHref);
            const noteId = (url.pathname.match(/\\/explore\\/([^/?#]+)/) || [])[1] || '';
            const tokenNode = a.closest('[data-xsec-token],[xsec-token]');
            const card =
              a.closest('section') ||
              a.closest('article') ||
              a.closest('div[class*="note"]') ||
              a.closest('div[class*="feed"]') ||
              a.parentElement;
            const text = (card?.innerText || a.innerText || '').trim();
            const lines = text.split('\\n').map(s => s.trim()).filter(Boolean);
            const imgs = Array.from((card || a).querySelectorAll('img'))
              .map(img => img.src || img.getAttribute('data-src') || '')
              .filter(Boolean)
              .filter(src => !src.includes('avatar'));
            return {{
              href: rawHref,
              xsec_token:
                url.searchParams.get('xsec_token') ||
                byId[noteId] ||
                a.dataset.xsecToken ||
                tokenNode?.dataset?.xsecToken ||
                tokenNode?.getAttribute?.('xsec-token') ||
                '',
              xsec_source: url.searchParams.get('xsec_source') || {json.dumps(default_xsec_source)},
              title: lines[0] || '',
              text,
              lines,
              images: imgs.slice(0, 9)
            }};
          }});
        }})()
        """

    def _cards_to_notes(
        self,
        cards: list[dict[str, Any]],
        *,
        max_results: int,
        page_kind: str,
    ) -> list[XHSNote]:
        default_xsec_source = self._default_xsec_source(page_kind)
        notes: list[XHSNote] = []
        seen: set[str] = set()
        for card in cards:
            href = self._safe_str(card.get("href"))
            if not href:
                continue
            full_url = href if href.startswith("http") else f"{self.BASE_URL}{href}"
            xsec_token = self._safe_str(card.get("xsec_token"))
            xsec_source = self._safe_str(card.get("xsec_source")) or default_xsec_source
            full_url = self._with_xsec_params(full_url, token=xsec_token, source=xsec_source)
            if full_url in seen:
                continue
            seen.add(full_url)

            title = self._safe_str(card.get("title"))
            lines = card.get("lines") or []
            body_lines = [line for line in lines[1:] if line and line != title]
            text = self._safe_str(card.get("text"))
            author = body_lines[0] if body_lines else "未知"
            likes = 0
            published_label = ""
            if body_lines:
                last = body_lines[-1]
                likes = self._parse_count(last)
                published_label = body_lines[-2] if len(body_lines) >= 2 else ""

            images = [img for img in (card.get("images") or []) if isinstance(img, str)]
            notes.append(
                XHSNote(
                    id=self._extract_note_id(full_url),
                    title=title or "无标题",
                    content=text[:800],
                    author=author,
                    author_id="",
                    likes=likes,
                    collects=0,
                    comments_count=0,
                    url=full_url,
                    published_at=self._extract_datetime(published_label),
                    cover_image=images[0] if images else None,
                    images=images,
                    comments_preview=[],
                    xsec_token=xsec_token,
                    xsec_source=xsec_source,
                )
            )
            if len(notes) >= max_results:
                break
        return notes

    async def _extract_cards_via_playwright(
        self,
        url: str,
        cookie: str,
        max_results: int,
        page_kind: str = "search",
    ) -> list[XHSNote]:
        from playwright.async_api import async_playwright

        js = self._build_card_extract_expression(page_kind)
        cards: list[dict[str, Any]] = []

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled"],
            )
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1440, "height": 900},
                locale="zh-CN",
                timezone_id="Asia/Shanghai",
            )
            await context.add_init_script(
                """
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
                window.chrome = { runtime: {} };
                """
            )
            cookies = self._parse_cookie_string(cookie)
            if cookies:
                await context.add_cookies(cookies)

            page = await context.new_page()
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(4)
                seen_hrefs: set[str] = set()
                stale_rounds = 0
                scroll_rounds = max(3, min(30, (max_results // 8) + 4))
                for _ in range(scroll_rounds):
                    page_cards = await page.evaluate(js)
                    before = len(seen_hrefs)
                    if isinstance(page_cards, list):
                        for card in page_cards:
                            href = self._safe_str(card.get("href") if isinstance(card, dict) else "")
                            if not href or href in seen_hrefs:
                                continue
                            seen_hrefs.add(href)
                            cards.append(card)
                    if len(seen_hrefs) >= max_results:
                        break
                    if len(seen_hrefs) == before:
                        stale_rounds += 1
                    else:
                        stale_rounds = 0
                    if stale_rounds >= 3:
                        break
                    await page.evaluate("window.scrollBy(0, Math.max(window.innerHeight * 0.9, 900))")
                    await asyncio.sleep(1.2)
            finally:
                await browser.close()

        return self._cards_to_notes(cards, max_results=max_results, page_kind="feed" if page_kind == "feed" else "search")

    async def _extract_cards_via_extension(
        self,
        url: str,
        max_results: int,
        extension_port: int = 9334,
        dedicated_window_mode: bool = False,
        page_kind: str = "search",
    ) -> list[XHSNote]:
        """通过真实浏览器扩展读取搜索/Feed 卡片。

        这条链路对齐 xiaohongshu-skills 的实践：
        Python -> bridge server -> 扩展 -> 真实浏览器 tab -> MAIN world。
        优先读取 `window.__INITIAL_STATE__.search.feeds` / `feed.feeds`，再结合 DOM 卡片补齐标题、封面和 token。
        """
        normalized_kind = "feed" if page_kind == "feed" else "search"
        js = self._build_card_extract_expression(normalized_kind)

        async with XHSExtensionBridge(port=extension_port) as bridge:
            await bridge.wait_until_ready(timeout=20.0)
            background = bool(dedicated_window_mode)
            if dedicated_window_mode:
                await bridge.call("ensure_dedicated_xhs_tab", {"url": url}, timeout=60.0)
            else:
                await bridge.call("navigate", {"url": url, "background": background}, timeout=45.0)
            await bridge.call("wait_for_load", {"timeout": 45000, "background": background}, timeout=45.0)
            await bridge.call("wait_dom_stable", {"timeout": 12000, "interval": 500}, timeout=15.0)
            snapshot = await bridge.call(
                "wait_for_xhs_state",
                {"kind": normalized_kind, "timeout": 15000, "interval": 500},
                timeout=20.0,
            )
            risk = snapshot.get("risk") if isinstance(snapshot, dict) else None
            if isinstance(risk, dict) and risk.get("code"):
                raise RuntimeError(f"[{risk.get('code')}] {risk.get('message') or '页面状态异常'}")

            cards: list[dict[str, Any]] = []
            seen_hrefs: set[str] = set()
            stale_rounds = 0
            scroll_rounds = max(4, min(36, (max_results // 8) + 6))
            for round_index in range(scroll_rounds):
                page_cards = await bridge.call("evaluate", {"expression": js}, timeout=20.0)
                before = len(seen_hrefs)
                if isinstance(page_cards, list):
                    for card in page_cards:
                        href = self._safe_str(card.get("href") if isinstance(card, dict) else "")
                        if not href or href in seen_hrefs:
                            continue
                        seen_hrefs.add(href)
                        cards.append(card)
                if len(seen_hrefs) >= max_results:
                    break
                stale_rounds = stale_rounds + 1 if len(seen_hrefs) == before else 0
                if stale_rounds >= 6:
                    break
                if round_index % 3 == 0:
                    await bridge.call("scroll_by", {"x": 0, "y": 850}, timeout=10.0)
                    await bridge.call("dispatch_wheel_event", {"deltaY": 900}, timeout=10.0)
                elif round_index % 3 == 1:
                    await bridge.call("scroll_by", {"x": 0, "y": 1200}, timeout=10.0)
                else:
                    await bridge.call("scroll_to_bottom", {}, timeout=10.0)
                    await bridge.call("scroll_by", {"x": 0, "y": -420}, timeout=10.0)
                    await bridge.call("dispatch_wheel_event", {"deltaY": 1100}, timeout=10.0)
                await asyncio.sleep(1.2)

        return self._cards_to_notes(cards, max_results=max_results, page_kind=normalized_kind)

    async def _discover_search_note_urls_with_playwright(
        self,
        search_url: str,
        cookie: str,
        max_results: int,
    ) -> list[str]:
        from playwright.async_api import async_playwright

        note_urls: list[str] = []
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled"],
            )
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                ),
                locale="zh-CN",
                timezone_id="Asia/Shanghai",
            )
            await context.add_init_script(
                """
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
                window.chrome = { runtime: {} };
                """
            )
            cookies = self._parse_cookie_string(cookie)
            if cookies:
                await context.add_cookies(cookies)
            page = await context.new_page()
            try:
                await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(3)
                stale_rounds = 0
                scroll_rounds = max(3, min(30, (max_results // 8) + 4))
                for _ in range(scroll_rounds):
                    before = len(note_urls)
                    hrefs = await page.eval_on_selector_all(
                        'a[href*="/explore/"]',
                        "els => els.map(el => el.getAttribute('href')).filter(Boolean)",
                    )
                    for href in hrefs:
                        full = href if str(href).startswith("http") else f"{self.BASE_URL}{href}"
                        if full not in note_urls:
                            note_urls.append(full)
                    if len(note_urls) >= max_results:
                        break
                    if len(note_urls) == before:
                        stale_rounds += 1
                    else:
                        stale_rounds = 0
                    if stale_rounds >= 3:
                        break
                    await page.evaluate("window.scrollBy(0, Math.max(window.innerHeight * 0.9, 900))")
                    await asyncio.sleep(1.2)
            finally:
                await browser.close()
        return note_urls[:max_results]

    async def _discover_following_note_urls(self, cookie: str, max_notes: int) -> list[str]:
        from playwright.async_api import async_playwright

        note_urls: list[str] = []
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled"],
            )
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 800},
                locale="zh-CN",
                timezone_id="Asia/Shanghai",
            )
            await context.add_init_script(
                """
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
                window.chrome = { runtime: {} };
                """
            )
            cookies = self._parse_cookie_string(cookie)
            if cookies:
                await context.add_cookies(cookies)

            page = await context.new_page()
            try:
                await page.goto(f"{self.BASE_URL}/explore?tab=following", wait_until="domcontentloaded", timeout=30000)
                for _ in range(6):
                    hrefs = await page.eval_on_selector_all(
                        'a[href*="/explore/"]',
                        "els => els.map(el => el.getAttribute('href')).filter(Boolean)",
                    )
                    for href in hrefs:
                        full = href if str(href).startswith("http") else f"{self.BASE_URL}{href}"
                        if full not in note_urls:
                            note_urls.append(full)
                    if len(note_urls) >= max_notes:
                        break
                    await page.evaluate("window.scrollBy(0, 1000)")
                    await asyncio.sleep(2)
            finally:
                await browser.close()

        return note_urls[:max_notes]

    def _extract_note_urls_from_html(self, html: str) -> list[str]:
        patterns = [
            r'https://www\.xiaohongshu\.com/explore/[A-Za-z0-9]+',
            r'"/explore/([A-Za-z0-9]+)',
        ]
        urls: list[str] = []
        for pattern in patterns:
            for match in re.findall(pattern, html):
                url = match if str(match).startswith("http") else f"{self.BASE_URL}/explore/{match}"
                if url not in urls:
                    urls.append(url)
        return urls

    def _extract_note_id(self, url: str) -> str:
        match = re.search(r"/explore/([A-Za-z0-9]+)", url)
        if match:
            return match.group(1)
        return url.split("/")[-1]

    def _extract_datetime(self, value: Any) -> Optional[datetime]:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            ts = float(value)
            if ts > 10_000_000_000:
                ts /= 1000
            try:
                return datetime.fromtimestamp(ts)
            except Exception:
                return None
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return None
            if text.isdigit():
                return self._extract_datetime(int(text))
            for fmt in [
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%dT%H:%M:%S.%fZ",
            ]:
                try:
                    return datetime.strptime(text, fmt)
                except ValueError:
                    continue
        return None

    def _safe_str(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, (int, float)):
            return str(value)
        return ""

    def _parse_count(self, value: Any) -> int:
        if value is None:
            return 0
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        text = str(value).strip()
        if not text:
            return 0
        text = text.replace(",", "").replace("赞", "").replace("评论", "").replace("收藏", "")
        if "万" in text:
            try:
                return int(float(text.replace("万", "")) * 10000)
            except Exception:
                return 0
        if "k" in text.lower():
            try:
                return int(float(text.lower().replace("k", "")) * 1000)
            except Exception:
                return 0
        digits = re.findall(r"\d+", text)
        if digits:
            return int(digits[0])
        return 0

    async def close(self):
        await self.client.aclose()


async def xiaohongshu_search(
    keyword: str,
    max_results: int = 20,
    min_likes: int = 100,
    sort_by: str = "likes",
    cookie: str | None = None,
    use_extension: bool = True,
    extension_port: int = 9334,
    dedicated_window_mode: bool = False,
) -> dict:
    """搜索小红书高赞内容，并返回详情、媒体与评论预览。"""
    api = XiaohongshuAPI()
    try:
        notes = await api.search_by_keyword(
            keyword=keyword,
            sort_by=sort_by,
            max_results=max_results,
            min_likes=min_likes,
            cookie=cookie,
            use_extension=use_extension,
            extension_port=extension_port,
            dedicated_window_mode=dedicated_window_mode,
        )
        return {
            "keyword": keyword,
            "total_found": len(notes),
            "notes": [
                {
                    "id": n.id,
                    "title": n.title,
                    "content": n.content[:5000] if n.content else "",
                    "author": n.author,
                    "likes": n.likes,
                    "collects": n.collects,
                    "comments_count": n.comments_count,
                    "url": n.url,
                    "published_at": n.published_at.isoformat() if n.published_at else None,
                    "cover_image": n.cover_image,
                    "note_type": n.note_type,
                    "images": n.images,
                    "video_url": n.video_url,
                    "xsec_token": n.xsec_token,
                    "xsec_source": n.xsec_source,
                    "comments_preview": [
                        {
                            "id": c.id,
                            "author": c.author,
                            "content": c.content,
                            "likes": c.likes,
                            "is_top": c.is_top,
                        }
                        for c in n.comments_preview
                    ],
                }
                for n in notes
            ],
        }
    finally:
        await api.close()


async def xiaohongshu_fetch_comments(
    note_id: str,
    note_url: Optional[str] = None,
    max_comments: int = 50,
    sort_by: str = "likes",
    cookie: Optional[str] = None,
    use_extension: bool = True,
    extension_port: int = 9334,
    dedicated_window_mode: bool = False,
    load_all_comments: bool = True,
    click_more_replies: bool = True,
    max_replies_threshold: int = 10,
) -> dict:
    """获取小红书笔记评论。"""
    api = XiaohongshuAPI()
    try:
        comments: list[XHSComment] = []
        strategy = "html_initial_state"
        if use_extension:
            try:
                comments = await api._fetch_comments_via_extension(
                    note_id=note_id,
                    note_url=note_url,
                    max_comments=max_comments,
                    extension_port=extension_port,
                    dedicated_window_mode=dedicated_window_mode,
                    load_all_comments=load_all_comments,
                    click_more_replies=click_more_replies,
                    max_replies_threshold=max_replies_threshold,
                )
                strategy = "extension_state_machine"
            except Exception as exc:
                if _should_stop_extension_error(exc):
                    raise
                comments = []

        if not comments:
            comments = await api.fetch_comments(
                note_id=note_id,
                note_url=note_url,
                max_comments=max_comments,
                sort_by=sort_by,
                cookie=cookie,
            )
        if sort_by == "likes":
            comments.sort(key=lambda x: x.likes, reverse=True)
        comments = comments[:max_comments]
        return {
            "note_id": note_id,
            "total_comments": len(comments),
            "sort_by": sort_by,
            "strategy": strategy,
            "comments": [
                {
                    "id": c.id,
                    "author": c.author,
                    "content": c.content,
                    "likes": c.likes,
                    "is_top": c.is_top,
                }
                for c in comments
            ],
        }
    finally:
        await api.close()


async def xiaohongshu_analyze_trends(
    keyword: str,
    notes_data: Optional[list] = None,
    prefs: Optional[dict] = None,
    cookie: Optional[str] = None,
) -> dict:
    """分析小红书 Trends。"""
    if notes_data is None:
        search_result = await xiaohongshu_search(keyword, max_results=30, min_likes=0, cookie=cookie)
        notes_data = search_result["notes"]

    notes_summary = "\n\n".join(
        [
            f"[{i + 1}] {n['title']}\n点赞: {n['likes']} | 收藏: {n['collects']}\n内容: {n['content'][:300]}..."
            for i, n in enumerate(notes_data[:20])
        ]
    )

    prompt = f"""分析以下关于"{keyword}"的小红书热门笔记，总结 trends：

{notes_summary}

请返回 JSON 格式（不要其他文字）：
{{
    "hot_topics": ["热门话题1", "热门话题2", "..."],
    "trending_tags": [{{"tag": "标签名", "frequency": 3}}],
    "content_patterns": ["内容模式1", "内容模式2"],
    "audience_insights": ["受众洞察1", "受众洞察2"],
    "engagement_factors": ["高互动因素1", "高互动因素2"],
    "summary": "总体趋势总结（100字以内）"
}}
"""

    from abo.sdk.tools import agent_json

    try:
        result = await agent_json(prompt, prefs=prefs)
    except Exception as e:
        print(f"Agent 分析失败: {e}")
        result = {
            "hot_topics": [],
            "trending_tags": [],
            "content_patterns": [],
            "audience_insights": [],
            "engagement_factors": [],
            "summary": f"分析失败: {str(e)}",
        }

    return {
        "keyword": keyword,
        "analysis": result,
        "based_on_notes": len(notes_data),
    }


async def xiaohongshu_verify_cookie(web_session: str, id_token: str = None) -> dict:
    """验证小红书 Cookie 是否有效。"""
    api = XiaohongshuAPI()
    try:
        cookie_parts = [f"web_session={web_session}"]
        if id_token:
            cookie_parts.append(f"id_token={id_token}")
        cookie_str = "; ".join(cookie_parts)

        resp = await api.client.get(
            f"{api.BASE_URL}/explore",
            headers=api._build_headers(cookie_str),
            follow_redirects=True,
        )

        if resp.status_code != 200:
            return {"valid": False, "message": f"请求失败，状态码: {resp.status_code}"}

        content = resp.text
        if "window.__INITIAL_STATE__" not in content:
            return {"valid": False, "message": "页面未返回有效初始数据，Cookie 可能已过期"}

        if any(token in content for token in ["请使用小红书APP", "安全验证", "扫码"]):
            return {"valid": False, "message": "Cookie 当前触发风控或登录验证"}

        return {"valid": True, "message": "Cookie 验证成功，可访问小红书页面"}
    except Exception as e:
        return {"valid": False, "message": f"验证过程出错: {str(e)}"}
    finally:
        await api.close()
