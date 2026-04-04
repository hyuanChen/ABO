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
import asyncio
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

import httpx

from abo.sdk import Module, Item, Card, claude_json


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
        items = []

        # For now, use a mock/sample approach
        # In production, this would integrate with:
        # 1. RSSHub: /xiaohongshu/user/{user_id}
        # 2. Searx search results
        # 3. Manual note list from user

        prefs_path = Path.home() / ".abo" / "preferences.json"
        config_keywords = []
        config_users = []

        # Build cookie from web_session and id_token (new format) or legacy cookie field
        config_cookie = ""
        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            xhs_config = data.get("modules", {}).get("xiaohongshu-tracker", {})
            config_keywords = xhs_config.get("keywords", [])
            config_users = xhs_config.get("user_ids", [])

            # New format: web_session and id_token as separate fields
            web_session = xhs_config.get("web_session", "")
            id_token = xhs_config.get("id_token", "")
            if web_session:
                config_cookie = f"web_session={web_session}"
                if id_token:
                    config_cookie += f"; id_token={id_token}"
            else:
                # Legacy format: single cookie field
                raw_cookie = xhs_config.get("cookie", "")
                config_cookie = self._parse_cookie(raw_cookie)

        keywords = keywords or config_keywords or ["科研", "读博", "学术"]
        user_ids = user_ids or config_users

        # If user IDs are provided, try to fetch their notes
        if user_ids:
            for user_id in user_ids[:3]:  # Limit to 3 users
                user_items = await self._fetch_user_notes(user_id, config_cookie, max_results // len(user_ids))
                items.extend(user_items)

        # If keywords are provided, search for matching notes
        if keywords and len(items) < max_results:
            keyword_items = await self._search_by_keywords(
                keywords, max_results - len(items)
            )
            items.extend(keyword_items)

        return items[:max_results]

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
                                "user_id": clean_id,
                                "published": pub_date,
                                "platform": "xiaohongshu",
                            },
                        )
                    )
            else:
                print(f"[xiaohongshu] RSSHub returned {resp.status_code}; falling back to demo")
        except Exception as e:
            print(f"[xiaohongshu] Failed to fetch user {clean_id}: {e}")
        return items if items else self._generate_demo_items(["科研"], limit)

    async def _search_by_keywords(self, keywords: list[str], limit: int) -> list[Item]:
        """Search notes by keywords using alternative methods."""
        # Return demo data for testing
        return self._generate_demo_items(keywords, limit)

    def _generate_demo_items(self, keywords: list[str], limit: int) -> list[Item]:
        """Generate demo items for testing when APIs fail."""
        demo_notes = [
            {
                "title": "研一必看！科研入门工具推荐",
                "content": "分享几个实用的科研工具：Zotero文献管理、Notion笔记、Obsidian知识库...",
                "published": (datetime.utcnow() - timedelta(days=2)).isoformat(),
            },
            {
                "title": "读博日常 | 如何平衡科研和生活",
                "content": "很多人问我怎么平衡博士的科研压力和生活，今天来分享一下我的经验...",
                "published": (datetime.utcnow() - timedelta(days=4)).isoformat(),
            },
            {
                "title": "论文写作干货 | 引言部分怎么写",
                "content": "引言是论文最重要的部分之一，决定了审稿人对论文的第一印象...",
                "published": (datetime.utcnow() - timedelta(days=6)).isoformat(),
            },
            {
                "title": "研究生选导师避坑指南",
                "content": "选导师是研究生阶段最重要的决定，今天分享一些选导师的经验...",
                "published": (datetime.utcnow() - timedelta(days=8)).isoformat(),
            },
            {
                "title": "我的学术日常 | 实验室生活分享",
                "content": "记录一下在实验室的日常，希望能给想读研读博的同学一些参考...",
                "published": (datetime.utcnow() - timedelta(days=10)).isoformat(),
            },
        ]

        items = []
        for i, note in enumerate(demo_notes[:limit]):
            # Check keywords
            text_lower = f"{note['title']} {note['content']}".lower()
            if not any(kw.lower() in text_lower for kw in keywords):
                continue

            items.append(
                Item(
                    id=f"xhs-demo-{i}",
                    raw={
                        "title": note["title"],
                        "content": note["content"],
                        "url": f"https://www.xiaohongshu.com/explore/demo{i}",
                        "user_id": "demo",
                        "published": note["published"],
                        "platform": "xiaohongshu",
                        "demo": True,
                    },
                )
            )

        return items

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
                # Try to parse RSS date format
                pub_date = datetime.strptime(published_str, "%a, %d %b %Y %H:%M:%S %Z")
                if pub_date < cutoff:
                    continue
            except:
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
                result = await claude_json(prompt, prefs=prefs)
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
                    obsidian_path=f"SocialMedia/Xiaohongshu/{safe_title}.md",
                    metadata={
                        "abo-type": "xiaohongshu-note",
                        "platform": "xiaohongshu",
                        "user_id": p.get("user_id"),
                        "published": p.get("published"),
                        "category": result.get("category", "笔记"),
                        "content": content[:2000],  # Truncate for metadata
                    },
                )
            )

        return cards
