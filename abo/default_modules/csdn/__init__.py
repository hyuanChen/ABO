"""
CSDN 博客追踪模块

追踪特定博主或技术标签的新文章。
适合跟踪技术教程、编程经验、工具分享等内容。
"""
import asyncio
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

import httpx

from abo.sdk import Module, Item, Card, claude_json


class CSDNTracker(Module):
    """Track CSDN blog posts from specific users or tags."""

    id = "csdn-tracker"
    name = "CSDN博客追踪"
    schedule = "0 13 * * *"  # Daily at 1 PM
    icon = "code"
    output = ["obsidian", "ui"]

    # RSSHub endpoint for CSDN
    RSSHUB_BASE = "https://rsshub.app"

    async def fetch(
        self,
        user_ids: list[str] = None,
        keywords: list[str] = None,
        max_results: int = 20,
    ) -> list[Item]:
        """
        Fetch CSDN blog posts.

        Args:
            user_ids: List of CSDN user IDs
            keywords: List of keywords to filter posts
            max_results: Maximum number of results
        """
        items = []

        prefs_path = Path.home() / ".abo" / "preferences.json"
        config_keywords = []
        config_users = []

        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            csdn_config = data.get("modules", {}).get("csdn-tracker", {})
            config_keywords = csdn_config.get("keywords", [])
            config_users = csdn_config.get("user_ids", [])

        keywords = keywords or config_keywords or [
            "Python",
            "机器学习",
            "深度学习",
            "论文",
            "科研",
        ]
        user_ids = user_ids or config_users

        # Fetch from specific users
        if user_ids:
            for user_id in user_ids[:5]:
                user_items = await self._fetch_user_posts(
                    user_id, keywords, max_results // len(user_ids)
                )
                items.extend(user_items)

        return items[:max_results]

    async def _fetch_user_posts(
        self, user_id: str, keywords: list[str], limit: int
    ) -> list[Item]:
        """Fetch posts from a specific user."""
        items = []
        clean_id = self._extract_user_id(user_id)

        # Try RSSHub endpoint
        url = f"{self.RSSHUB_BASE}/csdn/blog/{clean_id}"

        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "ABO-Tracker/1.0"})

            if resp.status_code == 200:
                items = self._parse_rss_feed(resp.text, clean_id, keywords, limit)

        except Exception as e:
            print(f"Failed to fetch CSDN user {clean_id}: {e}")

        return items

    def _parse_rss_feed(
        self, xml_content: str, user_id: str, keywords: list[str], limit: int
    ) -> list[Item]:
        """Parse RSS feed and filter by keywords."""
        items = []
        cutoff = datetime.utcnow() - timedelta(days=14)

        try:
            import xml.etree.ElementTree as ET

            root = ET.fromstring(xml_content)

            for entry in root.findall(".//item")[:limit * 2]:
                title_elem = entry.find("title")
                link_elem = entry.find("link")
                desc_elem = entry.find("description")
                pub_date_elem = entry.find("pubDate")
                category_elems = entry.findall("category")

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
                categories = [c.text for c in category_elems if c.text]

                # Parse date
                try:
                    pub_dt = datetime.strptime(pub_date, "%a, %d %b %Y %H:%M:%S %Z")
                    if pub_dt < cutoff:
                        continue
                except:
                    pass

                items.append(
                    Item(
                        id=f"csdn-{user_id}-{hash(title) % 1000000}",
                        raw={
                            "title": title,
                            "content": desc,
                            "url": link,
                            "user_id": user_id,
                            "published": pub_date,
                            "categories": categories,
                            "platform": "csdn",
                        },
                    )
                )

                if len(items) >= limit:
                    break

        except Exception as e:
            print(f"Failed to parse RSS feed: {e}")

        return items[:limit]

    def _extract_user_id(self, user_input: str) -> str:
        """Extract user ID from URL or return as-is."""
        # Pattern: https://blog.csdn.net/xxx
        match = re.search(r"blog\.csdn\.net/(\w+)", user_input)
        if match:
            return match.group(1)
        return user_input.strip()

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        """Process CSDN posts into cards."""
        cards = []

        for item in items:
            p = item.raw

            content = f"{p.get('title', '')}\n{p.get('content', '')}"
            if not content.strip():
                continue

            prompt = (
                f'分析以下CSDN博客文章，返回 JSON（不要有其他文字）：\n'
                f'{{"score":<1-10整数>,"summary":"<50字以内中文摘要>",'
                f'"tags":["<tag1>","<tag2>","<tag3>"],"tech_stack":"<技术栈>"}}\n\n'
                f"标题：{p['title']}\n分类：{', '.join(p.get('categories', []))}\n\n"
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
                    + ["CSDN", result.get("tech_stack", "技术")],
                    source_url=p["url"],
                    obsidian_path=f"SocialMedia/CSDN/{safe_title}.md",
                    metadata={
                        "abo-type": "csdn-post",
                        "platform": "csdn",
                        "user_id": p.get("user_id"),
                        "published": p.get("published"),
                        "categories": p.get("categories", []),
                        "tech_stack": result.get("tech_stack", ""),
                        "content": p.get("content", "")[:2000],
                    },
                )
            )

        return cards
