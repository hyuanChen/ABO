"""
小红书 (Xiaohongshu) 笔记追踪模块

由于小红书有反爬机制，此模块使用 RSSHub 或第三方 API 获取公开笔记。
用户需要提供关注的博主主页链接或关键词。
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
    icon = "book-heart"
    output = ["obsidian", "ui"]

    # RSSHub endpoint for Xiaohongshu (if available)
    # Alternative: use searx or other aggregators
    RSSHUB_BASE = "https://rsshub.app"

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

        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            xhs_config = data.get("modules", {}).get("xiaohongshu-tracker", {})
            config_keywords = xhs_config.get("keywords", [])
            config_users = xhs_config.get("user_ids", [])

        keywords = keywords or config_keywords or ["科研", "读博", "学术"]
        user_ids = user_ids or config_users

        # If user IDs are provided, try to fetch their notes
        if user_ids:
            for user_id in user_ids[:3]:  # Limit to 3 users
                user_items = await self._fetch_user_notes(user_id, max_results // len(user_ids))
                items.extend(user_items)

        # If keywords are provided, search for matching notes
        if keywords and len(items) < max_results:
            keyword_items = await self._search_by_keywords(
                keywords, max_results - len(items)
            )
            items.extend(keyword_items)

        return items[:max_results]

    async def _fetch_user_notes(self, user_id: str, limit: int) -> list[Item]:
        """Fetch notes from a specific user."""
        items = []

        # Clean user_id (extract from URL if needed)
        clean_id = self._extract_user_id(user_id)

        # Try RSSHub endpoint
        url = f"{self.RSSHUB_BASE}/xiaohongshu/user/{clean_id}"

        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "ABO-Tracker/1.0"})

            if resp.status_code == 200:
                # Parse RSS feed
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

                    # Extract note ID from link
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

        except Exception as e:
            print(f"Failed to fetch Xiaohongshu user {clean_id}: {e}")

        return items

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
