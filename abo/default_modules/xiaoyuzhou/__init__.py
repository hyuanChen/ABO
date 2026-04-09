"""
小宇宙 (Xiaoyuzhou) 播客追踪模块

追踪订阅播客的新单集，支持关键词筛选。
小宇宙是国内流行的播客平台，有很多高质量的学术、科技类节目。
"""
import asyncio
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

import httpx

from abo.sdk import Module, Item, Card, claude_json


class XiaoyuzhouTracker(Module):
    """Track Xiaoyuzhou (Podcast Universe) episodes."""

    id = "xiaoyuzhou-tracker"
    name = "小宇宙"
    schedule = "0 10 * * *"  # Daily at 10 AM
    icon = "headphones"
    output = ["obsidian", "ui"]
    subscription_types = [
        {"type": "podcast_id", "label": "播客节目", "placeholder": "输入播客ID或链接"},
    ]

    # RSSHub endpoint for Xiaoyuzhou
    RSSHUB_BASE = "https://rsshub.app"

    async def fetch(
        self,
        podcast_ids: list[str] = None,
        keywords: list[str] = None,
        max_results: int = 20,
    ) -> list[Item]:
        """
        Fetch Xiaoyuzhou podcast episodes.

        Args:
            podcast_ids: List of podcast IDs/show IDs
            keywords: List of keywords to filter episodes
            max_results: Maximum number of results
        """
        items = []

        prefs_path = Path.home() / ".abo" / "preferences.json"
        config_keywords = []
        config_podcasts = []

        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            xyz_config = data.get("modules", {}).get("xiaoyuzhou-tracker", {})
            config_keywords = xyz_config.get("keywords", [])
            config_podcasts = xyz_config.get("podcast_ids", [])

        keywords = keywords or config_keywords or [
            "科研",
            "学术",
            "科技",
            "AI",
            "创业",
        ]
        podcast_ids = podcast_ids or config_podcasts

        # Fetch from specific podcasts
        if podcast_ids:
            for podcast_id in podcast_ids[:5]:
                podcast_items = await self._fetch_podcast_episodes(
                    podcast_id, keywords, max_results // len(podcast_ids)
                )
                items.extend(podcast_items)

        return items[:max_results]

    async def _fetch_podcast_episodes(
        self, podcast_id: str, keywords: list[str], limit: int
    ) -> list[Item]:
        """Fetch episodes from a specific podcast."""
        items = []
        clean_id = self._extract_podcast_id(podcast_id)

        # Try RSSHub endpoint
        url = f"{self.RSSHUB_BASE}/xiaoyuzhou/podcast/{clean_id}"

        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "ABO-Tracker/1.0"})

            if resp.status_code == 200:
                items = self._parse_rss_feed(resp.text, clean_id, keywords, limit)

        except Exception as e:
            print(f"Failed to fetch Xiaoyuzhou podcast {clean_id}: {e}")

        return items

    def _parse_rss_feed(
        self, xml_content: str, podcast_id: str, keywords: list[str], limit: int
    ) -> list[Item]:
        """Parse RSS feed and filter by keywords."""
        items = []
        cutoff = datetime.utcnow() - timedelta(days=14)

        try:
            import xml.etree.ElementTree as ET

            root = ET.fromstring(xml_content)

            # Get podcast title from channel
            channel = root.find("channel")
            podcast_name = "未知播客"
            if channel is not None:
                title_elem = channel.find("title")
                if title_elem is not None:
                    podcast_name = title_elem.text or podcast_name

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

                # Extract episode ID
                ep_id = self._extract_episode_id(link) or ""

                items.append(
                    Item(
                        id=f"xyz-{podcast_id}-{ep_id}",
                        raw={
                            "title": title,
                            "description": desc,
                            "url": link,
                            "episode_id": ep_id,
                            "podcast_id": podcast_id,
                            "podcast_name": podcast_name,
                            "published": pub_date,
                            "platform": "xiaoyuzhou",
                        },
                    )
                )

                if len(items) >= limit:
                    break

        except Exception as e:
            print(f"Failed to parse RSS feed: {e}")

        return items[:limit]

    def _extract_podcast_id(self, user_input: str) -> str:
        """Extract podcast ID from URL or return as-is."""
        # Pattern: https://www.xiaoyuzhoufm.com/podcast/xxx
        match = re.search(r"/podcast/(\w+)", user_input)
        if match:
            return match.group(1)
        return user_input.strip()

    def _extract_episode_id(self, url: str) -> str | None:
        """Extract episode ID from URL."""
        # Pattern: https://www.xiaoyuzhoufm.com/episode/xxx
        match = re.search(r"/episode/(\w+)", url)
        if match:
            return match.group(1)
        return None

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        """Process podcast episodes into cards."""
        cards = []

        for item in items:
            p = item.raw

            content = f"{p.get('title', '')}\n{p.get('description', '')}"
            if not content.strip():
                continue

            prompt = (
                f'分析以下播客单集，返回 JSON（不要有其他文字）：\n'
                f'{{"score":<1-10整数>,"summary":"<50字以内中文摘要>",'
                f'"tags":["<tag1>","<tag2>","<tag3>"],"category":"<分类：学术/科技/商业/文化/其他>"}}\n\n'
                f"标题：{p['title']}\n播客：{p.get('podcast_name', '')}\n\n"
                f"简介：{p.get('description', '')[:600]}"
            )

            try:
                result = await claude_json(prompt, prefs=prefs)
            except Exception:
                result = {}

            # Clean title for filename
            safe_title = (
                p["title"][:30].replace(" ", "-").replace("/", "-").replace(":", "-")
            )
            podcast_name = p.get("podcast_name", "播客")
            safe_podcast = podcast_name[:20].replace(" ", "-").replace("/", "-")

            cards.append(
                Card(
                    id=item.id,
                    title=p["title"],
                    summary=result.get("summary", p.get("description", "")[:100]),
                    score=min(result.get("score", 5), 10) / 10,
                    tags=result.get("tags", [])
                    + ["播客", result.get("category", "音频")],
                    source_url=p["url"],
                    obsidian_path=f"SocialMedia/Podcasts/{safe_podcast}/{safe_title}.md",
                    metadata={
                        "abo-type": "xiaoyuzhou-episode",
                        "platform": "xiaoyuzhou",
                        "podcast_id": p.get("podcast_id"),
                        "podcast_name": podcast_name,
                        "episode_id": p.get("episode_id"),
                        "published": p.get("published"),
                        "category": result.get("category", "播客"),
                        "description": p.get("description", ""),
                    },
                )
            )

        return cards
