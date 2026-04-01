"""
抖音 (Douyin) 视频追踪模块

追踪特定创作者的新视频，基于关键词筛选相关内容。
适合跟踪知识分享、科普、技能教学类短视频。

Note: 抖音的反爬机制较强，此模块主要依赖 RSSHub 或手动配置。
"""
import asyncio
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

import httpx

from abo.sdk import Module, Item, Card, claude_json


class DouyinTracker(Module):
    """Track Douyin videos from specific creators."""

    id = "douyin-tracker"
    name = "抖音视频追踪"
    schedule = "0 14 * * *"  # Daily at 2 PM
    icon = "video"
    output = ["obsidian", "ui"]

    # RSSHub endpoint for Douyin
    RSSHUB_BASE = "https://rsshub.app"

    async def fetch(
        self,
        user_ids: list[str] = None,
        keywords: list[str] = None,
        max_results: int = 20,
    ) -> list[Item]:
        """
        Fetch Douyin videos.

        Args:
            user_ids: List of Douyin user IDs (sec_uid)
            keywords: List of keywords to filter videos
            max_results: Maximum number of results
        """
        items = []

        prefs_path = Path.home() / ".abo" / "preferences.json"
        config_keywords = []
        config_users = []

        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            douyin_config = data.get("modules", {}).get("douyin-tracker", {})
            config_keywords = douyin_config.get("keywords", [])
            config_users = douyin_config.get("user_ids", [])

        keywords = keywords or config_keywords or [
            "知识",
            "科普",
            "学习",
            "读书",
            "科技",
        ]
        user_ids = user_ids or config_users

        # Fetch from specific users
        if user_ids:
            for user_id in user_ids[:3]:
                user_items = await self._fetch_user_videos(
                    user_id, keywords, max_results // len(user_ids)
                )
                items.extend(user_items)

        return items[:max_results]

    async def _fetch_user_videos(
        self, user_id: str, keywords: list[str], limit: int
    ) -> list[Item]:
        """Fetch videos from a specific user."""
        items = []
        clean_id = self._extract_user_id(user_id)

        # Try RSSHub endpoint
        url = f"{self.RSSHUB_BASE}/douyin/user/{clean_id}"

        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "ABO-Tracker/1.0"})

            if resp.status_code == 200:
                items = self._parse_rss_feed(resp.text, clean_id, keywords, limit)

        except Exception as e:
            print(f"Failed to fetch Douyin user {clean_id}: {e}")

        return items

    def _parse_rss_feed(
        self, xml_content: str, user_id: str, keywords: list[str], limit: int
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

                # Parse date
                try:
                    pub_dt = datetime.strptime(pub_date, "%a, %d %b %Y %H:%M:%S %Z")
                    if pub_dt < cutoff:
                        continue
                except:
                    pass

                items.append(
                    Item(
                        id=f"douyin-{user_id}-{hash(title) % 1000000}",
                        raw={
                            "title": title,
                            "description": desc,
                            "url": link,
                            "user_id": user_id,
                            "published": pub_date,
                            "platform": "douyin",
                        },
                    )
                )

                if len(items) >= limit:
                    break

        except Exception as e:
            print(f"Failed to parse RSS feed: {e}")

        return items[:limit]

    def _extract_user_id(self, user_input: str) -> str:
        """Extract user ID (sec_uid) from URL or return as-is."""
        # Pattern: https://www.douyin.com/user/xxx
        match = re.search(r"/user/(\w+)", user_input)
        if match:
            return match.group(1)
        return user_input.strip()

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        """Process Douyin videos into cards."""
        cards = []

        for item in items:
            p = item.raw

            content = f"{p.get('title', '')}\n{p.get('description', '')}"
            if not content.strip():
                continue

            prompt = (
                f'分析以下抖音视频，返回 JSON（不要有其他文字）：\n'
                f'{{"score":<1-10整数>,"summary":"<50字以内中文摘要>",'
                f'"tags":["<tag1>","<tag2>","<tag3>"],"content_type":"<类型：知识/科普/教程/其他>"}}\n\n'
                f"标题：{p['title']}\n描述：{p.get('description', '')[:500]}"
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
                    summary=result.get("summary", p.get("description", "")[:100]),
                    score=min(result.get("score", 5), 10) / 10,
                    tags=result.get("tags", [])
                    + ["抖音", result.get("content_type", "视频")],
                    source_url=p["url"],
                    obsidian_path=f"SocialMedia/Douyin/{safe_title}.md",
                    metadata={
                        "abo-type": "douyin-video",
                        "platform": "douyin",
                        "user_id": p.get("user_id"),
                        "published": p.get("published"),
                        "content_type": result.get("content_type", "视频"),
                        "description": p.get("description", ""),
                    },
                )
            )

        return cards
