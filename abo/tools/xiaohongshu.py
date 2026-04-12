"""
小红书主动分析工具

核心策略：
1. 复用用户 Cookie，不做自动登录
2. 优先请求页面 HTML，解析 window.__INITIAL_STATE__
3. 对搜索/关注流只做“链接发现”，再回抓笔记详情页
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
    ) -> list[XHSNote]:
        """从关注流直接抓取卡片内容。"""
        if not cookie:
            raise ValueError("未配置小红书 Cookie，请先配置 web_session")
        notes = await self._extract_cards_via_playwright(
            url=f"{self.BASE_URL}/explore?tab=following",
            cookie=cookie,
            max_results=max_notes * 2,
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
    ) -> list[XHSNote]:
        """
        根据关键词搜索小红书笔记。
        需要 Cookie 才能稳定访问。
        """
        if not cookie:
            raise ValueError("未配置小红书 Cookie，请先配置 web_session")

        notes = await self._extract_cards_via_playwright(
            url=f"{self.BASE_URL}/search_result?keyword={quote(keyword)}",
            cookie=cookie,
            max_results=max_results * 2,
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
                first = next(iter(detail_map.values()))
                if isinstance(first, dict):
                    if isinstance(first.get("note"), dict):
                        return first["note"]
                    return first

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

    async def _extract_cards_via_playwright(
        self,
        url: str,
        cookie: str,
        max_results: int,
    ) -> list[XHSNote]:
        from playwright.async_api import async_playwright

        notes: list[XHSNote] = []
        js = """
        () => {
          const byId = {};
          const addToken = (value) => {
            if (!value || typeof value !== 'object') return;
            const noteId = value.noteId || value.note_id || value.id;
            const token = value.xsecToken || value.xsec_token;
            if (noteId && token && !byId[noteId]) byId[noteId] = String(token);
          };
          const state = window.__INITIAL_STATE__ || {};
          const roots = [
            state.note?.noteDetailMap,
            state.search?.feeds,
            state.search?.notes,
            state.search?.noteList,
            state.feed?.feeds,
            state.feed?.items
          ].filter(Boolean);
          const queue = roots.map(value => ({ value, depth: 0 }));
          const seenObjects = new WeakSet();
          let visited = 0;
          while (queue.length && visited < 2500) {
            const { value, depth } = queue.shift();
            if (!value || typeof value !== 'object' || seenObjects.has(value) || depth > 5) continue;
            seenObjects.add(value);
            visited += 1;
            addToken(value);
            const children = Array.isArray(value)
              ? value.slice(0, 100)
              : Object.keys(value).slice(0, 100).map(key => {
                  try { return value[key]; } catch (_) { return null; }
                });
            for (const child of children) {
              if (child && typeof child === 'object') queue.push({ value: child, depth: depth + 1 });
            }
          }
          const anchors = Array.from(document.querySelectorAll('a[href*="/explore/"]'));
          return anchors.map((a) => {
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
              .map(img => img.src)
              .filter(Boolean)
              .filter(src => !src.includes('avatar'));
            return {
              href: rawHref,
              xsec_token:
                url.searchParams.get('xsec_token') ||
                byId[noteId] ||
                a.dataset.xsecToken ||
                tokenNode?.dataset?.xsecToken ||
                tokenNode?.getAttribute?.('xsec-token') ||
                '',
              xsec_source: url.searchParams.get('xsec_source') || 'pc_search',
              title: lines[0] || '',
              text,
              lines,
              images: imgs.slice(0, 9)
            };
          });
        }
        """

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
                cards = []
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

        seen: set[str] = set()
        for card in cards:
            href = self._safe_str(card.get("href"))
            if not href:
                continue
            full_url = href if href.startswith("http") else f"{self.BASE_URL}{href}"
            xsec_token = self._safe_str(card.get("xsec_token"))
            xsec_source = self._safe_str(card.get("xsec_source")) or "pc_search"
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
            note = XHSNote(
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
            notes.append(note)
            if len(notes) >= max_results:
                break
        return notes

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
) -> dict:
    """获取小红书笔记评论。"""
    api = XiaohongshuAPI()
    try:
        comments = await api.fetch_comments(
            note_id=note_id,
            note_url=note_url,
            max_comments=max_comments,
            sort_by=sort_by,
            cookie=cookie,
        )
        return {
            "note_id": note_id,
            "total_comments": len(comments),
            "sort_by": sort_by,
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

    from abo.sdk.tools import claude_json

    try:
        result = await claude_json(prompt, prefs=prefs)
    except Exception as e:
        print(f"Claude 分析失败: {e}")
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
