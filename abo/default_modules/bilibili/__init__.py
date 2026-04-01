"""
哔哩哔哩 (Bilibili) 视频追踪模块

追踪特定 UP 主的新视频，基于关键词筛选相关内容。
适合跟踪技术教程、学术报告、科研分享类视频。
"""
import asyncio
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

import httpx

from abo.sdk import Module, Item, Card, claude_json


class BilibiliTracker(Module):
    """Track Bilibili videos from specific UP masters."""

    id = "bilibili-tracker"
    name = "哔哩哔哩视频追踪"
    schedule = "0 11 * * *"  # Daily at 11 AM
    icon = "play-circle"
    output = ["obsidian", "ui"]

    # Bilibili API endpoints
    API_BASE = "https://api.bilibili.com"
    RSSHUB_BASE = "https://rsshub.app"

    async def fetch(
        self,
        up_uids: list[str] = None,
        keywords: list[str] = None,
        max_results: int = 20,
    ) -> list[Item]:
        """
        Fetch Bilibili videos by UP主 UIDs or keywords.

        Args:
            up_uids: List of Bilibili UP主 UIDs
            keywords: List of keywords to filter videos
            max_results: Maximum number of results
        """
        items = []

        prefs_path = Path.home() / ".abo" / "preferences.json"
        config_keywords = []
        config_uids = []

        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            bilibili_config = data.get("modules", {}).get("bilibili-tracker", {})
            config_keywords = bilibili_config.get("keywords", [])
            config_uids = bilibili_config.get("up_uids", [])

        keywords = keywords or config_keywords or ["科研", "学术", "读博", "论文"]
        up_uids = up_uids or config_uids

        # Fetch from specific UP主s
        if up_uids:
            for uid in up_uids[:5]:  # Limit to 5 UP主s
                up_items = await self._fetch_up_videos(uid, keywords, max_results // len(up_uids))
                items.extend(up_items)

        return items[:max_results]

    async def _fetch_up_videos(
        self, uid: str, keywords: list[str], limit: int
    ) -> list[Item]:
        """Fetch videos from a specific UP主."""
        items = []
        clean_uid = self._extract_uid(uid)

        # Try RSSHub endpoint first (more reliable)
        url = f"{self.RSSHUB_BASE}/bilibili/user/video/{clean_uid}"

        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "ABO-Tracker/1.0"})

            if resp.status_code == 200:
                items = self._parse_rss_feed(resp.text, clean_uid, keywords, limit)

        except Exception as e:
            print(f"RSSHub failed for Bilibili UID {clean_uid}: {e}")
            # Fallback to Bilibili API
            items = await self._fetch_via_api(clean_uid, keywords, limit)

        return items

    def _parse_rss_feed(
        self, xml_content: str, uid: str, keywords: list[str], limit: int
    ) -> list[Item]:
        """Parse RSS feed and filter by keywords."""
        items = []
        cutoff = datetime.utcnow() - timedelta(days=14)  # Last 14 days

        try:
            import xml.etree.ElementTree as ET

            root = ET.fromstring(xml_content)

            for entry in root.findall(".//item")[:limit * 2]:  # Fetch more for filtering
                title_elem = entry.find("title")
                link_elem = entry.find("link")
                desc_elem = entry.find("description")
                pub_date_elem = entry.find("pubDate")

                if title_elem is None:
                    continue

                title = title_elem.text or "无标题"

                # Keyword filtering
                title_lower = title.lower()
                if not any(kw.lower() in title_lower for kw in keywords):
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

                # Extract BV号 from link
                bvid = self._extract_bvid(link) or ""

                items.append(
                    Item(
                        id=f"bili-{uid}-{bvid}",
                        raw={
                            "title": title,
                            "description": desc,
                            "url": link,
                            "bvid": bvid,
                            "up_uid": uid,
                            "published": pub_date,
                            "platform": "bilibili",
                        },
                    )
                )

                if len(items) >= limit:
                    break

        except Exception as e:
            print(f"Failed to parse RSS feed: {e}")

        return items[:limit]

    async def _fetch_via_api(
        self, uid: str, keywords: list[str], limit: int
    ) -> list[Item]:
        """Fallback: Fetch videos using Bilibili API."""
        items = []
        url = f"{self.API_BASE}/x/space/arc/search"

        params = {
            "mid": uid,
            "ps": limit * 2,  # Fetch more for filtering
            "pn": 1,
            "order": "pubdate",  # Sort by publish date
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    url,
                    params=params,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        "Referer": f"https://space.bilibili.com/{uid}",
                    },
                )

            if resp.status_code == 200:
                data = resp.json()
                if data.get("data", {}).get("list", {}).get("vlist"):
                    vlist = data["data"]["list"]["vlist"]
                    cutoff = datetime.utcnow() - timedelta(days=14)

                    for video in vlist:
                        title = video.get("title", "")

                        # Keyword filtering
                        title_lower = title.lower()
                        if not any(kw.lower() in title_lower for kw in keywords):
                            continue

                        # Check date
                        created_timestamp = video.get("created", 0)
                        if created_timestamp:
                            created_dt = datetime.fromtimestamp(created_timestamp)
                            if created_dt < cutoff:
                                continue

                        bvid = video.get("bvid", "")
                        items.append(
                            Item(
                                id=f"bili-{uid}-{bvid}",
                                raw={
                                    "title": title,
                                    "description": video.get("description", ""),
                                    "url": f"https://www.bilibili.com/video/{bvid}",
                                    "bvid": bvid,
                                    "up_uid": uid,
                                    "published": created_dt.isoformat() if created_timestamp else "",
                                    "platform": "bilibili",
                                    "duration": video.get("length", ""),
                                    "pic": video.get("pic", ""),  # Thumbnail
                                },
                            )
                        )

                        if len(items) >= limit:
                            break

        except Exception as e:
            print(f"Bilibili API failed for UID {uid}: {e}")

        return items[:limit]

    def _extract_uid(self, user_input: str) -> str:
        """Extract UID from URL or return as-is."""
        # Pattern: https://space.bilibili.com/xxx
        match = re.search(r"space\.bilibili\.com/(\d+)", user_input)
        if match:
            return match.group(1)
        return user_input.strip()

    def _extract_bvid(self, url: str) -> str | None:
        """Extract BV号 from URL."""
        # Pattern: https://www.bilibili.com/video/BVxxx
        match = re.search(r"/video/(BV\w+)", url)
        if match:
            return match.group(1)
        return None

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        """Process Bilibili videos into cards."""
        cards = []

        for item in items:
            p = item.raw

            content = f"{p.get('title', '')}\n{p.get('description', '')}"
            if not content.strip():
                continue

            prompt = (
                f'分析以下B站视频，返回 JSON（不要有其他文字）：\n'
                f'{{"score":<1-10整数>,"summary":"<50字以内中文摘要>",'
                f'"tags":["<tag1>","<tag2>","<tag3>"],"category":"<分类：教程/学术/科普/其他>"}}\n\n'
                f"标题：{p['title']}\n简介：{p.get('description', '')[:500]}"
            )

            try:
                result = await claude_json(prompt, prefs=prefs)
            except Exception:
                result = {}

            # Clean title for filename
            safe_title = (
                p["title"][:30].replace(" ", "-").replace("/", "-").replace(":", "-")
            )

            # Get UP主 name if available (would need separate API call)
            up_name = "UP主"

            cards.append(
                Card(
                    id=item.id,
                    title=p["title"],
                    summary=result.get("summary", p.get("description", "")[:100]),
                    score=min(result.get("score", 5), 10) / 10,
                    tags=result.get("tags", []) + ["B站", result.get("category", "视频")],
                    source_url=p["url"],
                    obsidian_path=f"SocialMedia/Bilibili/{safe_title}.md",
                    metadata={
                        "abo-type": "bilibili-video",
                        "platform": "bilibili",
                        "up_uid": p.get("up_uid"),
                        "bvid": p.get("bvid"),
                        "published": p.get("published"),
                        "duration": p.get("duration"),
                        "thumbnail": p.get("pic"),
                        "category": result.get("category", "视频"),
                        "description": p.get("description", ""),
                    },
                )
            )

        return cards
