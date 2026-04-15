"""
小红书 (Xiaohongshu) 笔记追踪模块

由于小红书有反爬机制，此模块需要用户登录 Cookie 才能获取内容。

配置方法:
1. 访问 xiaohongshu.com 并登录
2. 使用浏览器开发者工具或 EditThisCookie 扩展导出 Cookie
3. 将 Cookie JSON 粘贴到模块配置的 Cookie 输入框

Cookie 格式示例:
[
    {
        "name": "web_session",
        "value": "040069b05e586b57b240d72e833b4b9cd16a46",
        "domain": ".xiaohongshu.com"
    },
    {
        "name": "id_token",
        "value": "VjEAALliLV2OS874D54VGvzyYfv9rxvHnBJjuLWo...",
        "domain": ".xiaohongshu.com"
    }
]

简化格式（仅 web_session 值）:
040069b05e586b57b240d72e833b4b9cd16a46
"""
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

import httpx

from abo.sdk import Module, Item, Card, agent_json
from abo.tools.xiaohongshu import XiaohongshuAPI


class XiaohongshuTracker(Module):
    """Track Xiaohongshu (Little Red Book) notes for research content."""

    id = "xiaohongshu-tracker"
    name = "小红书"
    schedule = "0 10 * * *"  # Daily at 10 AM
    icon = "book-open"
    output = ["obsidian", "ui"]
    subscription_types = [
        {"type": "user_id", "label": "小红书用户ID", "placeholder": "输入用户主页链接或ID"},
    ]

    # RSSHub endpoint for Xiaohongshu (if available)
    # Alternative: use searx or other aggregators
    RSSHUB_BASE = "https://rsshub.app"

    def _parse_cookie(self, cookie_value: str) -> str:
        """Parse cookie from various formats.

        Supports:
        1. JSON array format: [{"name": "web_session", "value": "..."}, ...]
        2. Simple string: just the web_session value
        3. Netscape format: name=value; name2=value2

        Returns a simple cookie string suitable for HTTP headers.
        """
        if not cookie_value:
            return ""

        cookie_value = cookie_value.strip()

        # Try JSON array format
        if cookie_value.startswith("["):
            try:
                cookies = json.loads(cookie_value)
                if isinstance(cookies, list):
                    # Extract name=value pairs
                    pairs = []
                    for c in cookies:
                        if isinstance(c, dict) and "name" in c and "value" in c:
                            pairs.append(f"{c['name']}={c['value']}")
                    return "; ".join(pairs)
            except json.JSONDecodeError:
                pass

        # Try JSON object format {name: value}
        if cookie_value.startswith("{"):
            try:
                cookies = json.loads(cookie_value)
                if isinstance(cookies, dict):
                    # Could be {name: value} or {name: {value: ...}}
                    pairs = []
                    for name, val in cookies.items():
                        if isinstance(val, str):
                            pairs.append(f"{name}={val}")
                        elif isinstance(val, dict) and "value" in val:
                            pairs.append(f"{name}={val['value']}")
                    return "; ".join(pairs)
            except json.JSONDecodeError:
                pass

        # If it's a simple string without spaces or special chars,
        # treat it as just the web_session value
        if cookie_value and not any(c in cookie_value for c in [" ", "=", ";", "{"]):
            return f"web_session={cookie_value}"

        # Return as-is (assume it's already in cookie header format)
        return cookie_value

    def _load_config(self) -> dict:
        prefs_path = Path.home() / ".abo" / "preferences.json"
        if not prefs_path.exists():
            return {}
        try:
            data = json.loads(prefs_path.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
        return data.get("modules", {}).get(self.id, {})

    def _build_cookie_from_config(self, config: dict) -> str:
        web_session = config.get("web_session", "").strip()
        id_token = config.get("id_token", "").strip()
        if web_session:
            parts = [f"web_session={web_session}"]
            if id_token:
                parts.append(f"id_token={id_token}")
            return "; ".join(parts)
        return self._parse_cookie(config.get("cookie", ""))

    async def fetch(
        self,
        user_ids: list[str] = None,
        keywords: list[str] = None,
        max_results: int = 20,
    ) -> list[Item]:
        """
        Fetch Xiaohongshu notes by user IDs or keywords.

        Args:
            user_ids: List of Xiaohongshu user profile URLs or IDs
            keywords: List of keywords to search for
            max_results: Maximum number of results
        """
        config = self._load_config()
        max_results = max(1, int(config.get("max_results", max_results) or max_results))
        config_keywords = config.get("keywords", [])
        config_users = config.get("user_ids", [])
        creator_push_enabled = bool(config.get("creator_push_enabled", True))
        disabled_creator_ids = set(str(item) for item in config.get("disabled_creator_ids", []))
        creator_groups = config.get("creator_groups", [])
        creator_profiles = config.get("creator_profiles", {})
        cookie = self._build_cookie_from_config(config)

        keywords = keywords or config_keywords or ["科研", "读博", "学术"]
        user_ids = user_ids or config_users
        if not creator_push_enabled:
            user_ids = []
        if disabled_creator_ids:
            user_ids = [user_id for user_id in user_ids if str(user_id) not in disabled_creator_ids]
        if creator_groups:
            filtered_user_ids = []
            for user_id in user_ids:
                profile = creator_profiles.get(user_id, {})
                smart_groups = profile.get("smart_groups", [])
                if any(group in smart_groups for group in creator_groups):
                    filtered_user_ids.append(user_id)
            user_ids = filtered_user_ids

        enable_keyword_search = config.get("enable_keyword_search", True)
        keyword_min_likes = int(config.get("keyword_min_likes", 500) or 0)
        keyword_per_keyword_limit = int(config.get("keyword_search_limit", 10) or 10)
        follow_feed = bool(config.get("follow_feed", False))
        fetch_follow_limit = int(config.get("fetch_follow_limit", 20) or 20)

        items: list[Item] = []
        seen_ids: set[str] = set()

        async def append_unique(new_items: list[Item]) -> None:
            for item in new_items:
                note_id = str(item.raw.get("note_id") or item.id)
                if note_id in seen_ids:
                    continue
                seen_ids.add(note_id)
                items.append(item)
                if len(items) >= max_results:
                    return

        if user_ids:
            per_user_limit = max(1, min(10, max_results // max(len(user_ids), 1)))
            for user_id in user_ids[:5]:
                await append_unique(await self._fetch_user_notes(user_id, cookie, per_user_limit))
                if len(items) >= max_results:
                    return items[:max_results]

        if follow_feed and cookie and len(items) < max_results:
            await append_unique(
                await self._fetch_following_notes(
                    cookie=cookie,
                    keywords=keywords,
                    limit=min(fetch_follow_limit, max_results - len(items)),
                )
            )
            if len(items) >= max_results:
                return items[:max_results]

        if enable_keyword_search and keywords and cookie and len(items) < max_results:
            await append_unique(
                await self._search_by_keywords(
                    keywords=keywords,
                    cookie=cookie,
                    limit=max_results - len(items),
                    per_keyword_limit=keyword_per_keyword_limit,
                    min_likes=keyword_min_likes,
                )
            )

        return items[:max_results]

    def _note_to_item(
        self,
        note: object,
        *,
        source: str,
        matched_keywords: list[str] | None = None,
        user_id: str = "",
    ) -> Item:
        published_at = getattr(note, "published_at", None)
        published = published_at.isoformat() if published_at else ""
        note_id = getattr(note, "id", "") or self._extract_note_id(getattr(note, "url", "")) or source
        return Item(
            id=f"xhs-{source}-{note_id}",
            raw={
                "note_id": note_id,
                "title": getattr(note, "title", "") or "无标题",
                "content": getattr(note, "content", "") or "",
                "url": getattr(note, "url", ""),
                "user_id": user_id or getattr(note, "author_id", ""),
                "author": getattr(note, "author", ""),
                "published": published,
                "platform": "xiaohongshu",
                "likes": getattr(note, "likes", 0),
                "collects": getattr(note, "collects", 0),
                "comments_count": getattr(note, "comments_count", 0),
                "tags": getattr(note, "tags", []),
                "note_type": getattr(note, "note_type", "normal"),
                "crawl_source": source,
                "matched_keywords": matched_keywords or list(getattr(note, "matched_keywords", []) or []),
            },
        )

    async def _fetch_user_notes(self, user_id: str, cookie: str, limit: int) -> list[Item]:
        items = []
        clean_id = self._extract_user_id(user_id)
        url = f"{self.RSSHUB_BASE}/xiaohongshu/user/{clean_id}"

        headers = {"User-Agent": "ABO-Tracker/1.0"}
        if cookie:
            headers["Cookie"] = cookie

        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(resp.text)
                ns = {"content": "http://purl.org/rss/1.0/modules/content/"}
                for entry in root.findall(".//item")[:limit]:
                    title_elem = entry.find("title")
                    link_elem = entry.find("link")
                    desc_elem = entry.find("description")
                    pub_date_elem = entry.find("pubDate")
                    if title_elem is None:
                        continue
                    title = title_elem.text or "无标题"
                    link = link_elem.text if link_elem is not None else ""
                    desc = desc_elem.text if desc_elem is not None else ""
                    pub_date = pub_date_elem.text if pub_date_elem is not None else ""
                    note_id = self._extract_note_id(link) or ""
                    items.append(
                        Item(
                            id=f"xhs-{clean_id}-{note_id}",
                            raw={
                                "title": title,
                                "content": desc,
                                "url": link,
                                "note_id": note_id,
                                "user_id": clean_id,
                                "author": clean_id,
                                "published": pub_date,
                                "platform": "xiaohongshu",
                                "crawl_source": "user_id",
                                "matched_keywords": [],
                            },
                        )
                    )
            else:
                print(f"[xiaohongshu] RSSHub returned {resp.status_code}; falling back to demo")
        except Exception as e:
            print(f"[xiaohongshu] Failed to fetch user {clean_id}: {e}")
        return items

    async def _fetch_following_notes(self, cookie: str, keywords: list[str], limit: int) -> list[Item]:
        api = XiaohongshuAPI()
        try:
            notes = await api.get_following_feed_with_cookie(
                cookie=cookie,
                keywords=keywords or [""],
                max_notes=max(limit, 1),
            )
            return [
                self._note_to_item(
                    note,
                    source="following",
                    matched_keywords=list(getattr(note, "matched_keywords", []) or []),
                )
                for note in notes[:limit]
            ]
        except Exception as e:
            print(f"[xiaohongshu] Failed to fetch following feed: {e}")
            return []
        finally:
            await api.close()

    async def _search_by_keywords(
        self,
        keywords: list[str],
        cookie: str,
        limit: int,
        per_keyword_limit: int,
        min_likes: int,
    ) -> list[Item]:
        """Search notes by keywords using the verified Playwright-based tool flow."""
        api = XiaohongshuAPI()
        items: list[Item] = []
        seen_ids: set[str] = set()
        try:
            for keyword in keywords:
                if len(items) >= limit:
                    break
                try:
                    notes = await api.search_by_keyword(
                        keyword=keyword,
                        sort_by="likes",
                        max_results=min(per_keyword_limit, limit),
                        min_likes=min_likes,
                        cookie=cookie,
                    )
                except Exception as e:
                    print(f"[xiaohongshu] Failed to search keyword '{keyword}': {e}")
                    continue

                for note in notes:
                    note_id = getattr(note, "id", "") or self._extract_note_id(getattr(note, "url", ""))
                    if note_id in seen_ids:
                        continue
                    seen_ids.add(note_id)
                    items.append(self._note_to_item(note, source=f"keyword:{keyword}", matched_keywords=[keyword]))
                    if len(items) >= limit:
                        break
            return items[:limit]
        finally:
            await api.close()

    def _extract_user_id(self, user_input: str) -> str:
        """Extract user ID from URL or return as-is."""
        # Pattern: https://www.xiaohongshu.com/user/profile/xxx
        match = re.search(r"/user/profile/(\w+)", user_input)
        if match:
            return match.group(1)
        return user_input.strip()

    def _extract_note_id(self, url: str) -> str | None:
        """Extract note ID from URL."""
        # Pattern: https://www.xiaohongshu.com/explore/xxx
        match = re.search(r"/explore/(\w+)", url)
        if match:
            return match.group(1)
        return None

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        """Process Xiaohongshu notes into cards."""
        cards = []
        cutoff = datetime.utcnow() - timedelta(days=30)  # Last 30 days

        for item in items:
            p = item.raw

            # Parse date
            published_str = p.get("published", "")
            try:
                if published_str:
                    try:
                        pub_date = datetime.fromisoformat(published_str.replace("Z", "+00:00"))
                    except ValueError:
                        pub_date = datetime.strptime(published_str, "%a, %d %b %Y %H:%M:%S %Z")
                    if pub_date.replace(tzinfo=None) < cutoff:
                        continue
            except Exception:
                pass  # Include if date parsing fails

            # Skip if no content
            content = p.get("content", "")
            if not content or len(content) < 20:
                continue

            prompt = (
                f'分析以下小红书笔记，返回 JSON（不要有其他文字）：\n'
                f'{{"score":<1-10整数>,"summary":"<50字以内中文摘要>",'
                f'"tags":["<tag1>","<tag2>","<tag3>"],"category":"<分类：科研/学习/生活/其他>"}}\n\n'
                f"标题：{p['title']}\n内容：{content[:800]}"
            )

            try:
                result = await agent_json(prompt, prefs=prefs)
            except Exception:
                result = {}

            # Clean title for filename
            safe_title = (
                p["title"][:30].replace(" ", "-").replace("/", "-").replace(":", "-")
            )

            cards.append(
                Card(
                    id=item.id,
                    title=p["title"],
                    summary=result.get("summary", content[:100]),
                    score=min(result.get("score", 5), 10) / 10,
                    tags=result.get("tags", []) + ["小红书", result.get("category", "笔记")],
                    source_url=p["url"],
                    obsidian_path=f"xhs/{safe_title}.md",
                    metadata={
                        "abo-type": "xiaohongshu-note",
                        "platform": "xiaohongshu",
                        "user_id": p.get("user_id"),
                        "author": p.get("author"),
                        "published": p.get("published"),
                        "category": result.get("category", "笔记"),
                        "likes": p.get("likes", 0),
                        "collects": p.get("collects", 0),
                        "comments_count": p.get("comments_count", 0),
                        "crawl_source": p.get("crawl_source", ""),
                        "matched_keywords": p.get("matched_keywords", []),
                        "content": content[:2000],  # Truncate for metadata
                    },
                )
            )

        return cards
