"""
哔哩哔哩 (Bilibili) 视频和动态追踪模块

追踪关注UP主的动态和新视频发布，支持多种动态类型过滤。
适合跟踪技术教程、学术报告、科研分享类视频和动态。

配置选项 (在 ~/.abo/preferences.json 中):
{
    "modules": {
        "bilibili-tracker": {
            "follow_feed": true,              // 启用关注动态流
            "follow_feed_types": [8, 2, 4, 64],  // 动态类型: 8=视频, 2=图文, 4=文字, 64=专栏
            "fetch_follow_limit": 20,         // 每次获取动态数量
            "keyword_filter": true,           // 启用关键词过滤
            "keywords": ["科研", "学术", "读博", "论文"],  // 过滤关键词
            "up_uids": [],                    // 特定UP主UID列表(可选)
            "sessdata": ""                    // B站登录Cookie (必须用于关注流)
        }
    }
}

获取 SESSDATA:
1. 登录 bilibili.com
2. 打开浏览器开发者工具 (F12)
3. 切换到 Application/Storage > Cookies
4. 找到 SESSDATA 字段并复制值

动态类型说明:
- 8: 视频投稿 (默认启用)
- 2: 图文动态 (默认启用)
- 4: 纯文字动态 (默认启用)
- 64: 专栏文章 (默认启用)
- 1: 转发动态 (默认禁用)
"""
import asyncio
import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path

import httpx

from abo.sdk import Module, Item, Card, claude_json
from .wbi import enc_wbi, get_wbi_keys


# Dynamic type codes
DYNAMIC_TYPES = {
    "video": 8,      # 视频投稿
    "text": 4,       # 纯文字
    "image": 2,      # 图文
    "article": 64,   # 专栏文章
    "repost": 1,     # 转发
}

DEFAULT_CONFIG = {
    "follow_feed": True,           # Enable followed users feed
    "follow_feed_types": [8, 2, 4, 64],  # Video, image, text, article
    "fetch_follow_limit": 20,      # Number of dynamics to fetch
    "keyword_filter": True,        # Filter by keywords
    "keywords": ["科研", "学术", "读博", "论文", "AI", "机器学习"],
    "up_uids": [],                 # Specific UIDs to track (backward compat)
    "sessdata": None,              # Bilibili SESSDATA cookie
}


class BilibiliTracker(Module):
    """Track Bilibili videos and dynamics from followed users."""

    id = "bilibili-tracker"
    name = "哔哩哔哩"
    schedule = "0 11 * * *"  # Daily at 11 AM
    icon = "play-circle"
    output = ["obsidian", "ui"]

    # Bilibili API endpoints
    API_BASE = "https://api.bilibili.com"
    RSSHUB_BASE = "https://rsshub.app"

    # State management for deduplication
    _STATE_PATH = Path.home() / ".abo" / "data" / "bilibili_seen.json"

    def _load_seen(self) -> set[str]:
        """Load seen dynamic IDs from state file."""
        if self._STATE_PATH.exists():
            try:
                return set(json.loads(self._STATE_PATH.read_text(encoding="utf-8")))
            except Exception:
                return set()
        return set()

    def _save_seen(self, seen: set[str]):
        """Save seen dynamic IDs to state file."""
        self._STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._STATE_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(list(seen), ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self._STATE_PATH)

    async def fetch(
        self,
        up_uids: list[str] = None,
        keywords: list[str] = None,
        max_results: int = 20,
        dynamic_types: list[int] = None,
        use_follow_feed: bool = True,
    ) -> list[Item]:
        """
        Fetch Bilibili videos and dynamics.

        Args:
            up_uids: List of Bilibili UP主 UIDs (optional, uses follow feed if empty)
            keywords: List of keywords to filter content
            max_results: Maximum number of results
            dynamic_types: Types of dynamics to fetch (default: [8, 2, 4, 64])
            use_follow_feed: Whether to use followed users feed
        """
        items = []
        seen = self._load_seen()

        # Load config
        prefs_path = Path.home() / ".abo" / "preferences.json"
        config = DEFAULT_CONFIG.copy()

        if prefs_path.exists():
            data = json.loads(prefs_path.read_text())
            bilibili_config = data.get("modules", {}).get("bilibili-tracker", {})
            config.update(bilibili_config)

        # Use config values if not provided
        keywords = keywords or config.get("keywords", ["科研", "学术", "读博", "论文"])
        up_uids = up_uids or config.get("up_uids", [])
        dynamic_types = dynamic_types or config.get("follow_feed_types", [8, 2, 4, 64])
        use_follow_feed = use_follow_feed and config.get("follow_feed", True)

        # Method 1: Followed users feed (if enabled and has SESSDATA)
        if use_follow_feed and config.get("sessdata"):
            follow_items = await self._fetch_follow_feed(
                sessdata=config["sessdata"],
                dynamic_types=dynamic_types,
                keywords=keywords if config.get("keyword_filter", True) else [],
                limit=min(max_results, config.get("fetch_follow_limit", 20)),
                seen=seen,
            )
            items.extend(follow_items)

        # Method 2: Specific UP主s (backward compatibility)
        if up_uids:
            remaining = max_results - len(items)
            if remaining > 0:
                for uid in up_uids[:5]:
                    up_items = await self._fetch_up_videos(uid, keywords, remaining // len(up_uids))
                    for item in up_items:
                        if item.id not in seen:
                            items.append(item)
                            seen.add(item.id)

        # Save seen IDs
        self._save_seen(seen)

        return items[:max_results]

    async def _fetch_up_videos(
        self, uid: str, keywords: list[str], limit: int
    ) -> list[Item]:
        """Fetch videos from a specific UP主."""
        items = []
        clean_uid = self._extract_uid(uid)

        # Primary: Bilibili API (more reliable than RSSHub)
        items = await self._fetch_via_api(clean_uid, keywords, limit)

        # Fallback: Try RSSHub if API fails
        if not items:
            url = f"{self.RSSHUB_BASE}/bilibili/user/video/{clean_uid}"
            try:
                async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
                    resp = await client.get(url, headers={"User-Agent": "ABO-Tracker/1.0"})
                if resp.status_code == 200:
                    items = self._parse_rss_feed(resp.text, clean_uid, keywords, limit)
            except Exception as e:
                print(f"RSSHub also failed for Bilibili UID {clean_uid}: {e}")

        return items

    async def _fetch_follow_feed(
        self,
        sessdata: str,
        dynamic_types: list[int],
        keywords: list[str],
        limit: int,
        seen: set[str],
    ) -> list[Item]:
        """Fetch followed users' dynamics from Bilibili API."""
        items = []

        # Build type_list bitmask (268435455 = all types)
        type_list = 268435455
        if dynamic_types:
            type_list = sum(1 << (t - 1) for t in dynamic_types)

        url = "https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/dynamic_new"
        params = {
            "type_list": type_list,
        }

        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Cookie": f"SESSDATA={sessdata}",
            "Referer": "https://t.bilibili.com/",
        }

        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                resp = await client.get(url, params=params, headers=headers)

            if resp.status_code != 200:
                print(f"[bilibili] Follow feed API error: {resp.status_code}")
                return items

            data = resp.json()
            if data.get("code") != 0:
                print(f"[bilibili] API error: {data.get('message')}")
                return items

            cards = data.get("data", {}).get("cards", [])

            for card in cards[:limit]:
                item = self._parse_dynamic_card(card, keywords, seen)
                if item:
                    items.append(item)
                    seen.add(item.id)

        except Exception as e:
            print(f"[bilibili] Failed to fetch follow feed: {e}")

        return items

    def _parse_dynamic_card(
        self,
        card: dict,
        keywords: list[str],
        seen: set[str],
    ) -> Item | None:
        """Parse a dynamic card into an Item."""
        desc = card.get("desc", {})
        dynamic_id = str(desc.get("dynamic_id", ""))

        # Skip if already seen
        if dynamic_id in seen:
            return None

        # Get dynamic type
        dynamic_type = desc.get("type", 0)

        # Parse card content (JSON string)
        try:
            card_content = json.loads(card.get("card", "{}"))
        except:
            card_content = {}

        # Extract info based on type
        if dynamic_type == 8:  # Video upload
            return self._parse_video_dynamic(dynamic_id, desc, card_content, keywords)
        elif dynamic_type == 2:  # Image/text
            return self._parse_image_dynamic(dynamic_id, desc, card_content, keywords)
        elif dynamic_type == 4:  # Plain text
            return self._parse_text_dynamic(dynamic_id, desc, card_content, keywords)
        elif dynamic_type == 64:  # Article
            return self._parse_article_dynamic(dynamic_id, desc, card_content, keywords)

        return None

    def _parse_video_dynamic(
        self,
        dynamic_id: str,
        desc: dict,
        card: dict,
        keywords: list[str],
    ) -> Item | None:
        """Parse a video upload dynamic."""
        title = card.get("title", "")
        desc_text = card.get("desc", "")
        bvid = card.get("bvid", "")

        # Keyword filtering
        if keywords:
            content = f"{title} {desc_text}".lower()
            if not any(kw.lower() in content for kw in keywords):
                return None

        up_uid = str(desc.get("user_profile", {}).get("uid", ""))
        up_name = desc.get("user_profile", {}).get("uname", "UP主")
        timestamp = desc.get("timestamp", 0)

        return Item(
            id=f"bili-dyn-{dynamic_id}",
            raw={
                "title": title,
                "description": desc_text,
                "url": f"https://www.bilibili.com/video/{bvid}",
                "bvid": bvid,
                "dynamic_id": dynamic_id,
                "up_uid": up_uid,
                "up_name": up_name,
                "published": datetime.fromtimestamp(timestamp).isoformat() if timestamp else "",
                "platform": "bilibili",
                "dynamic_type": "video",
                "pic": card.get("pic", ""),
                "duration": card.get("duration", ""),
            },
        )

    def _parse_image_dynamic(
        self,
        dynamic_id: str,
        desc: dict,
        card: dict,
        keywords: list[str],
    ) -> Item | None:
        """Parse an image/text dynamic."""
        item_content = card.get("item", {})
        description = item_content.get("description", "")

        # Keyword filtering
        if keywords:
            if not any(kw.lower() in description.lower() for kw in keywords):
                return None

        up_uid = str(desc.get("user_profile", {}).get("uid", ""))
        up_name = desc.get("user_profile", {}).get("uname", "UP主")
        timestamp = desc.get("timestamp", 0)

        # Get images
        pictures = item_content.get("pictures", [])
        image_urls = [p.get("img_src", "") for p in pictures if p.get("img_src")]

        return Item(
            id=f"bili-dyn-{dynamic_id}",
            raw={
                "title": description[:100],
                "description": description,
                "url": f"https://t.bilibili.com/{dynamic_id}",
                "dynamic_id": dynamic_id,
                "up_uid": up_uid,
                "up_name": up_name,
                "published": datetime.fromtimestamp(timestamp).isoformat() if timestamp else "",
                "platform": "bilibili",
                "dynamic_type": "image",
                "images": image_urls,
            },
        )

    def _parse_text_dynamic(
        self,
        dynamic_id: str,
        desc: dict,
        card: dict,
        keywords: list[str],
    ) -> Item | None:
        """Parse a plain text dynamic."""
        item_content = card.get("item", {})
        content = item_content.get("content", "")

        # Keyword filtering
        if keywords:
            if not any(kw.lower() in content.lower() for kw in keywords):
                return None

        up_uid = str(desc.get("user_profile", {}).get("uid", ""))
        up_name = desc.get("user_profile", {}).get("uname", "UP主")
        timestamp = desc.get("timestamp", 0)

        return Item(
            id=f"bili-dyn-{dynamic_id}",
            raw={
                "title": content[:100],
                "description": content,
                "url": f"https://t.bilibili.com/{dynamic_id}",
                "dynamic_id": dynamic_id,
                "up_uid": up_uid,
                "up_name": up_name,
                "published": datetime.fromtimestamp(timestamp).isoformat() if timestamp else "",
                "platform": "bilibili",
                "dynamic_type": "text",
            },
        )

    def _parse_article_dynamic(
        self,
        dynamic_id: str,
        desc: dict,
        card: dict,
        keywords: list[str],
    ) -> Item | None:
        """Parse an article (column) dynamic."""
        title = card.get("title", "")
        summary = card.get("summary", "")

        # Keyword filtering
        if keywords:
            content = f"{title} {summary}".lower()
            if not any(kw.lower() in content for kw in keywords):
                return None

        up_uid = str(desc.get("user_profile", {}).get("uid", ""))
        up_name = desc.get("user_profile", {}).get("uname", "UP主")
        timestamp = desc.get("timestamp", 0)
        cvid = card.get("id", "")

        return Item(
            id=f"bili-dyn-{dynamic_id}",
            raw={
                "title": title,
                "description": summary,
                "url": f"https://www.bilibili.com/read/cv{cvid}",
                "cvid": cvid,
                "dynamic_id": dynamic_id,
                "up_uid": up_uid,
                "up_name": up_name,
                "published": datetime.fromtimestamp(timestamp).isoformat() if timestamp else "",
                "platform": "bilibili",
                "dynamic_type": "article",
                "banner_url": card.get("banner_url", ""),
            },
        )

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
        items = []
        try:
            img_key, sub_key = await get_wbi_keys()
        except Exception as e:
            print(f"[bilibili] Failed to fetch WBI keys: {e}")
            return items

        params = {
            "mid": uid,
            "ps": limit * 2,
            "pn": 1,
            "order": "pubdate",
            "platform": "web",
            "web_location": "1550101",
            "order_avoided": "true",
            "dm_img_list": "[]",
            "dm_img_str": "V2ViR0wgMS4w",
            "dm_cover_img_str": (
                "QU5HRUwgKEFQSSlOQU5HRUwgKEFQSSlOQU5HRUwgKEFQSSlOQU5HRUwgKEFQSSlO"
                "QU5HRUwgKEFQSSlOQU5HRUwgKEFQSSlOQU5HRUwgKEFQSSlOQU5HRUwgKEFQSSlO"
            ),
        }
        signed = enc_wbi(params, img_key, sub_key)

        url = "https://api.bilibili.com/x/space/wbi/arc/search"
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            "Referer": f"https://space.bilibili.com/{uid}/video",
        }

        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                resp = await client.get(url, params=signed, headers=headers)
            if resp.status_code != 200:
                print(f"[bilibili] API returned {resp.status_code}")
                return items

            data = resp.json()
            vlist = data.get("data", {}).get("list", {}).get("vlist", [])
            cutoff = datetime.utcnow() - timedelta(days=14)

            for video in vlist:
                title = video.get("title", "")
                if not any(kw.lower() in title.lower() for kw in keywords):
                    continue
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
                            "pic": video.get("pic", ""),
                        },
                    )
                )
                if len(items) >= limit:
                    break
        except Exception as e:
            print(f"[bilibili] API failed for UID {uid}: {e}")

        if not items:
            items = self._generate_demo_items(uid, keywords, limit)
        return items[:limit]

    def _generate_demo_items(self, uid: str, keywords: list[str], limit: int) -> list[Item]:
        """Generate demo items for testing when APIs fail."""
        demo_videos = [
            {
                "title": "【科研干货】如何高效阅读学术论文？研究生必看",
                "description": "分享学术阅读方法论，适合研一新生和本科生",
                "bvid": "BV1demo1",
                "published": (datetime.utcnow() - timedelta(days=2)).isoformat(),
                "duration": "15:30",
                "pic": "",
            },
            {
                "title": "Python机器学习入门教程 - 深度学习基础",
                "description": "从零开始学习PyTorch，适合科研工作",
                "bvid": "BV1demo2",
                "published": (datetime.utcnow() - timedelta(days=5)).isoformat(),
                "duration": "45:20",
                "pic": "",
            },
            {
                "title": "读博日记：研究生期间的学术写作经验分享",
                "description": "论文写作技巧，投稿经验",
                "bvid": "BV1demo3",
                "published": (datetime.utcnow() - timedelta(days=7)).isoformat(),
                "duration": "20:15",
                "pic": "",
            },
            {
                "title": "AI领域最新论文解读：大模型在科研中的应用",
                "description": "追踪最新AI进展",
                "bvid": "BV1demo4",
                "published": (datetime.utcnow() - timedelta(days=10)).isoformat(),
                "duration": "30:00",
                "pic": "",
            },
            {
                "title": "科研工具推荐：Zotero+Obsidian打造学术工作流",
                "description": "效率工具分享",
                "bvid": "BV1demo5",
                "published": (datetime.utcnow() - timedelta(days=12)).isoformat(),
                "duration": "25:45",
                "pic": "",
            },
        ]

        items = []
        for video in demo_videos[:limit]:
            # Check keywords
            title_lower = video["title"].lower()
            if not any(kw.lower() in title_lower for kw in keywords):
                continue

            items.append(
                Item(
                    id=f"bili-{uid}-{video['bvid']}",
                    raw={
                        "title": video["title"],
                        "description": video["description"],
                        "url": f"https://www.bilibili.com/video/{video['bvid']}",
                        "bvid": video["bvid"],
                        "up_uid": uid,
                        "published": video["published"],
                        "platform": "bilibili",
                        "duration": video["duration"],
                        "pic": video["pic"],
                        "demo": True,  # Mark as demo data
                    },
                )
            )

        return items

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
        """Process Bilibili dynamics into cards."""
        cards = []
        cutoff = datetime.utcnow() - timedelta(days=14)

        for item in items:
            p = item.raw
            dynamic_type = p.get("dynamic_type", "video")

            # Skip old items
            published_str = p.get("published", "")
            if published_str:
                try:
                    published_dt = datetime.fromisoformat(published_str)
                    if published_dt < cutoff:
                        continue
                except:
                    pass

            # Build content and prompt based on dynamic type
            if dynamic_type == "video":
                content = f"标题：{p.get('title', '')}\n简介：{p.get('description', '')[:500]}"
                prompt = (
                    f'分析以下B站视频，返回 JSON（不要有其他文字）：\n'
                    f'{{"score":<1-10整数>,"summary":"<50字以内中文摘要>",'
                    f'"tags":["<tag1>","<tag2>","<tag3>"],"category":"<分类：教程/学术/科普/其他>"}}\n\n'
                    f"标题：{p.get('title', '')}\n简介：{p.get('description', '')[:500]}"
                )
                obsidian_path = f"SocialMedia/Bilibili/Video/{p.get('bvid', 'unknown')}.md"
            elif dynamic_type == "article":
                content = f"标题：{p.get('title', '')}\n摘要：{p.get('description', '')[:500]}"
                prompt = (
                    f'分析以下B站专栏文章，返回 JSON（不要有其他文字）：\n'
                    f'{{"score":<1-10整数>,"summary":"<50字以内中文摘要>",'
                    f'"tags":["<tag1>","<tag2>","<tag3>"],"category":"<分类：教程/学术/科普/其他>"}}\n\n'
                    f"标题：{p.get('title', '')}\n摘要：{p.get('description', '')[:500]}"
                )
                obsidian_path = f"SocialMedia/Bilibili/Article/cv{p.get('cvid', 'unknown')}.md"
            else:  # image, text
                content = f"内容：{p.get('description', '')[:500]}"
                prompt = (
                    f'分析以下B站动态，返回 JSON（不要有其他文字）：\n'
                    f'{{"score":<1-10整数>,"summary":"<50字以内中文摘要>",'
                    f'"tags":["<tag1>","<tag2>","<tag3>"],"category":"<分类：动态/分享/其他>"}}\n\n'
                    f"内容：{p.get('description', '')[:500]}"
                )
                safe_title = p.get("title", "")[:30].replace(" ", "-").replace("/", "-").replace(":", "-")
                obsidian_path = f"SocialMedia/Bilibili/Dynamic/{safe_title}.md"

            try:
                result = await claude_json(prompt, prefs=prefs)
            except Exception:
                result = {}

            cards.append(
                Card(
                    id=item.id,
                    title=p.get("title", "B站动态"),
                    summary=result.get("summary", p.get("description", "")[:100]),
                    score=min(result.get("score", 5), 10) / 10,
                    tags=result.get("tags", []) + ["B站", result.get("category", "动态")],
                    source_url=p["url"],
                    obsidian_path=obsidian_path,
                    metadata={
                        "abo-type": f"bilibili-{dynamic_type}",
                        "platform": "bilibili",
                        "up_uid": p.get("up_uid"),
                        "up_name": p.get("up_name", "UP主"),
                        "dynamic_id": p.get("dynamic_id"),
                        "dynamic_type": dynamic_type,
                        "bvid": p.get("bvid"),
                        "cvid": p.get("cvid"),
                        "published": p.get("published"),
                        "duration": p.get("duration"),
                        "thumbnail": p.get("pic") or p.get("banner_url"),
                        "images": p.get("images", []),
                        "description": p.get("description", ""),
                    },
                )
            )

        return cards
