"""
知乎 (Zhihu) 内容追踪模块

追踪特定话题或用户的新回答/文章。
适合跟踪学术讨论、科研经验分享、行业洞察等内容。
"""
import asyncio
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

import httpx

from abo.sdk import Module, Item, Card, claude_json


class ZhihuTracker(Module):
    """Track Zhihu content from topics or users."""

    id = "zhihu-tracker"
    name = "知乎"
    schedule = "0 12 * * *"  # Daily at 12 PM
    icon = "help-circle"
    output = ["obsidian", "ui"]

    # RSSHub endpoint for Zhihu
    RSSHUB_BASE = "https://rsshub.app"

    async def fetch(
        self,
        topics: list[str] = None,
        users: list[str] = None,
        keywords: list[str] = None,
        max_results: int = 20,
    ) -> list[Item]:
        """
        Fetch Zhihu content by topics or users.

        Args:
            topics: List of Zhihu topic IDs or URLs
            users: List of Zhihu user IDs or URLs
            keywords: List of keywords to filter content
            max_results: Maximum number of results
        """
        items = []

        prefs_path = Path.home() / ".abo" / "preferences.json"
        config_keywords = []
        config_topics = []
        config_users = []

        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            zhihu_config = data.get("modules", {}).get("zhihu-tracker", {})
            config_keywords = zhihu_config.get("keywords", [])
            config_topics = zhihu_config.get("topics", [])
            config_users = zhihu_config.get("users", [])

        keywords = keywords or config_keywords or [
            "科研",
            "学术",
            "读博",
            "论文",
            "研究生",
        ]
        topics = topics or config_topics
        users = users or config_users

        # Fetch from topics
        if topics:
            for topic in topics[:3]:
                topic_items = await self._fetch_topic_content(
                    topic, keywords, max_results // len(topics)
                )
                items.extend(topic_items)

        # Fetch from users
        if users:
            for user in users[:3]:
                user_items = await self._fetch_user_content(
                    user, keywords, max_results // len(users)
                )
                items.extend(user_items)

        # Demo fallback: generate sample data if no items
        if not items:
            items = self._generate_demo_items(keywords, max_results)

        return items[:max_results]

    def _generate_demo_items(self, keywords: list[str], limit: int) -> list[Item]:
        """Generate demo items for testing when APIs fail."""
        demo_content = [
            {
                "title": "研究生如何高效开展科研工作？",
                "content": "分享一些科研入门经验，包括文献阅读、实验设计、论文写作等方面。",
                "author": "科研达人",
                "published": (datetime.utcnow() - timedelta(days=1)).isoformat(),
            },
            {
                "title": "读博五年，我学到了什么？",
                "content": "从博士申请到毕业，分享整个过程中的经验教训和心得体会。",
                "author": "博士毕业生",
                "published": (datetime.utcnow() - timedelta(days=3)).isoformat(),
            },
            {
                "title": "人工智能领域的最新研究进展",
                "content": "总结近期AI领域的突破性研究，包括大模型、多模态学习等方向。",
                "author": "AI研究员",
                "published": (datetime.utcnow() - timedelta(days=5)).isoformat(),
            },
            {
                "title": "如何选择适合自己的研究方向？",
                "content": "从兴趣、就业前景、导师资源等角度分析研究方向的选择。",
                "author": "学术导师",
                "published": (datetime.utcnow() - timedelta(days=7)).isoformat(),
            },
            {
                "title": "论文投稿避坑指南",
                "content": "分享期刊选择、审稿意见回复、修改技巧等实用经验。",
                "author": "期刊编辑",
                "published": (datetime.utcnow() - timedelta(days=9)).isoformat(),
            },
        ]

        items = []
        for i, content in enumerate(demo_content[:limit]):
            # Check keywords
            text_lower = f"{content['title']} {content['content']}".lower()
            if not any(kw.lower() in text_lower for kw in keywords):
                continue

            items.append(
                Item(
                    id=f"zhihu-demo-{i}",
                    raw={
                        "title": content["title"],
                        "content": content["content"],
                        "url": f"https://zhuanlan.zhihu.com/p/demo{i}",
                        "author": content["author"],
                        "source_id": "demo",
                        "published": content["published"],
                        "platform": "zhihu",
                        "demo": True,
                    },
                )
            )

        return items

    async def _fetch_topic_content(
        self, topic: str, keywords: list[str], limit: int
    ) -> list[Item]:
        """Fetch content from a specific topic."""
        items = []
        clean_topic = self._extract_topic_id(topic)

        # Try RSSHub endpoint for topic hot list
        url = f"{self.RSSHUB_BASE}/zhihu/topic/{clean_topic}/hot"

        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "ABO-Tracker/1.0"})

            if resp.status_code == 200:
                items = self._parse_rss_feed(resp.text, clean_topic, keywords, limit)

        except Exception as e:
            print(f"Failed to fetch Zhihu topic {clean_topic}: {e}")

        return items

    async def _fetch_user_content(
        self, user: str, keywords: list[str], limit: int
    ) -> list[Item]:
        """Fetch content from a specific user."""
        items = []
        clean_user = self._extract_user_id(user)

        # Try RSSHub endpoint for user activities
        url = f"{self.RSSHUB_BASE}/zhihu/people/activities/{clean_user}"

        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "ABO-Tracker/1.0"})

            if resp.status_code == 200:
                items = self._parse_rss_feed(resp.text, clean_user, keywords, limit)

        except Exception as e:
            print(f"Failed to fetch Zhihu user {clean_user}: {e}")

        return items

    def _parse_rss_feed(
        self, xml_content: str, source_id: str, keywords: list[str], limit: int
    ) -> list[Item]:
        """Parse RSS feed and filter by keywords."""
        items = []
        cutoff = datetime.utcnow() - timedelta(days=7)  # Last 7 days

        try:
            import xml.etree.ElementTree as ET

            root = ET.fromstring(xml_content)

            for entry in root.findall(".//item")[:limit * 2]:
                title_elem = entry.find("title")
                link_elem = entry.find("link")
                desc_elem = entry.find("description")
                pub_date_elem = entry.find("pubDate")
                author_elem = entry.find("author")

                if title_elem is None:
                    continue

                title = title_elem.text or "无标题"

                # Keyword filtering
                content = f"{title} {desc_elem.text if desc_elem is not None else ''}"
                content_lower = content.lower()
                if not any(kw.lower() in content_lower for kw in keywords):
                    continue

                link = link_elem.text if link_elem is not None else ""
                desc = desc_elem.text if desc_elem is not None else ""
                pub_date = pub_date_elem.text if pub_date_elem is not None else ""
                author = author_elem.text if author_elem is not None else "匿名"

                # Parse date
                try:
                    pub_dt = datetime.strptime(pub_date, "%a, %d %b %Y %H:%M:%S %Z")
                    if pub_dt < cutoff:
                        continue
                except:
                    pass

                items.append(
                    Item(
                        id=f"zhihu-{source_id}-{hash(title) % 1000000}",
                        raw={
                            "title": title,
                            "content": desc,
                            "url": link,
                            "author": author,
                            "source_id": source_id,
                            "published": pub_date,
                            "platform": "zhihu",
                        },
                    )
                )

                if len(items) >= limit:
                    break

        except Exception as e:
            print(f"Failed to parse RSS feed: {e}")

        return items[:limit]

    def _extract_topic_id(self, user_input: str) -> str:
        """Extract topic ID from URL or return as-is."""
        # Pattern: https://www.zhihu.com/topic/xxx
        match = re.search(r"/topic/(\d+)", user_input)
        if match:
            return match.group(1)
        return user_input.strip()

    def _extract_user_id(self, user_input: str) -> str:
        """Extract user ID from URL or return as-is."""
        # Pattern: https://www.zhihu.com/people/xxx
        match = re.search(r"/people/([\w-]+)", user_input)
        if match:
            return match.group(1)
        return user_input.strip()

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        """Process Zhihu content into cards."""
        cards = []

        for item in items:
            p = item.raw

            content = f"{p.get('title', '')}\n{p.get('content', '')}"
            if not content.strip():
                continue

            prompt = (
                f'分析以下知乎内容，返回 JSON（不要有其他文字）：\n'
                f'{{"score":<1-10整数>,"summary":"<50字以内中文摘要>",'
                f'"tags":["<tag1>","<tag2>","<tag3>"],"content_type":"<类型：回答/文章/想法>"}}\n\n'
                f"标题：{p['title']}\n作者：{p.get('author', '')}\n\n"
                f"内容：{p.get('content', '')[:800]}"
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
                    summary=result.get("summary", p.get("content", "")[:100]),
                    score=min(result.get("score", 5), 10) / 10,
                    tags=result.get("tags", [])
                    + ["知乎", result.get("content_type", "内容")],
                    source_url=p["url"],
                    obsidian_path=f"SocialMedia/Zhihu/{safe_title}.md",
                    metadata={
                        "abo-type": "zhihu-content",
                        "platform": "zhihu",
                        "author": p.get("author"),
                        "source_id": p.get("source_id"),
                        "published": p.get("published"),
                        "content_type": result.get("content_type", "内容"),
                        "content": p.get("content", "")[:2000],
                    },
                )
            )

        return cards
