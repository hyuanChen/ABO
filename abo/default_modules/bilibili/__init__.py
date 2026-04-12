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

获取 SESSDATA (推荐方式):
1. 安装 Cookie-Editor 浏览器扩展 (Chrome/Edge 商店)
2. 登录 bilibili.com
3. 点击 Cookie-Editor 图标 → 导出 Cookie
4. 粘贴完整 JSON 数组到配置框

备选方式:
1. 登录 bilibili.com
2. 按 F12 打开开发者工具
3. Application/Storage > Cookies > bilibili.com
4. 找到 SESSDATA 字段并复制值

支持的 Cookie 格式:
1. Cookie-Editor JSON: [{"name": "SESSDATA", "value": "..."}, ...]
2. 仅 SESSDATA 值: a1b2c3d4e5f6...
3. 标准 Cookie 字符串: SESSDATA=...; bili_jct=...

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
from abo.default_modules.bilibili.wbi import enc_wbi, get_wbi_keys


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
    "followed_up_groups": [],      # Followed UP group filters
    "followed_up_original_groups": [],  # Native Bilibili followed group tag IDs
    "sessdata": None,              # Bilibili SESSDATA cookie
}

FOLLOWED_UP_GROUP_KEYWORDS = {
    "ai-tech": ["ai", "人工智能", "大模型", "算法", "程序", "编程", "开发", "科技", "机器人", "芯片", "科普", "computer", "code"],
    "study": ["教程", "学习", "知识", "考研", "读书", "数学", "英语", "教育", "课堂", "论文", "学术", "老师"],
    "digital": ["数码", "手机", "相机", "耳机", "电脑", "测评", "评测", "影音", "摄影", "设备", "镜头"],
    "game": ["游戏", "电竞", "主机", "steam", "switch", "moba", "fps", "实况", "攻略"],
    "finance": ["财经", "商业", "投资", "股票", "基金", "创业", "营销", "副业", "理财", "经济"],
    "creative": ["设计", "插画", "绘画", "ui", "产品", "建筑", "摄影后期", "创作", "剪辑", "3d", "建模"],
    "entertainment": ["vlog", "生活", "旅行", "美食", "音乐", "舞蹈", "综艺", "动画", "影视", "电影", "追番", "二次元", "搞笑"],
}


class BilibiliTracker(Module):
    """Track Bilibili videos and dynamics from followed users."""

    id = "bilibili-tracker"
    name = "哔哩哔哩"
    schedule = "0 11 * * *"  # Daily at 11 AM
    icon = "play-circle"
    output = ["obsidian", "ui"]
    subscription_types = [
        {"type": "up_uid", "label": "UP主 UID", "placeholder": "输入UP主UID或空间链接"},
    ]

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

    def _parse_sessdata(self, cookie_value: str) -> str:
        """Parse SESSDATA from various formats.

        Supports:
        1. Cookie-Editor JSON: [{"name": "SESSDATA", "value": "..."}, ...]
        2. Simple string: just the SESSDATA value
        3. Netscape format: name=value; name2=value2

        Returns the SESSDATA value suitable for HTTP Cookie header.
        """
        if not cookie_value:
            return ""

        cookie_value = cookie_value.strip()

        # Try JSON array format (Cookie-Editor/EditThisCookie export)
        if cookie_value.startswith("["):
            try:
                cookies = json.loads(cookie_value)
                if isinstance(cookies, list):
                    # Look for SESSDATA in the array
                    for c in cookies:
                        if isinstance(c, dict) and c.get("name") == "SESSDATA":
                            return c.get("value", "")
                    # If no SESSDATA found, try to construct from all cookies
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
                    # Could be {SESSDATA: value} format
                    if "SESSDATA" in cookies:
                        return cookies["SESSDATA"]
                    # Or {name: {value: ...}} format
                    for name, val in cookies.items():
                        if name == "SESSDATA":
                            if isinstance(val, str):
                                return val
                            elif isinstance(val, dict) and "value" in val:
                                return val["value"]
            except json.JSONDecodeError:
                pass

        # If it's a simple string without spaces or special chars,
        # treat it as just the SESSDATA value (usually starts with a number)
        if cookie_value and not any(c in cookie_value for c in [" ", "=", ";", "{", "["]):
            return cookie_value

        # Return as-is (assume it's already in cookie header format)
        return cookie_value

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
        followed_up_groups = config.get("followed_up_groups", []) or []
        followed_up_original_groups = config.get("followed_up_original_groups", []) or []

        # Parse SESSDATA from various formats (Cookie-Editor JSON, simple string, etc.)
        raw_sessdata = config.get("sessdata", "")
        parsed_sessdata = self._parse_sessdata(raw_sessdata)

        selected_follow_uids: set[str] | None = None

        # Method 1: Followed users feed (if enabled and has SESSDATA)
        if use_follow_feed and parsed_sessdata:
            selected_follow_uids = await self._resolve_followed_uid_filters(
                sessdata=parsed_sessdata,
                explicit_uids=up_uids,
                followed_up_groups=followed_up_groups,
                followed_up_original_groups=followed_up_original_groups,
            )
            follow_items = await self._fetch_follow_feed(
                sessdata=parsed_sessdata,
                dynamic_types=dynamic_types,
                keywords=keywords if config.get("keyword_filter", True) else [],
                limit=min(max_results, config.get("fetch_follow_limit", 20)),
                seen=seen,
                allowed_up_uids=selected_follow_uids,
            )
            items.extend(follow_items)

        # Method 2: Specific UP主s (fallback when follow feed is unavailable)
        if up_uids and (not use_follow_feed or not parsed_sessdata):
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
        allowed_up_uids: set[str] | None = None,
    ) -> list[Item]:
        """Fetch followed users' dynamics from Bilibili API.

        Note: Bilibili API doesn't support combined type_list, must fetch each type separately.
        """
        items = []
        VALID_TYPES = {1, 2, 4, 8, 64}

        valid_types = [t for t in dynamic_types if t in VALID_TYPES] if dynamic_types else [8, 2, 4, 64]

        url = "https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/dynamic_new"

        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Cookie": f"SESSDATA={sessdata}",
            "Referer": "https://t.bilibili.com/",
        }

        # Fetch each type separately (API doesn't support combined type_list)
        for type_val in valid_types:
            try:
                async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                    resp = await client.get(url, params={"type_list": type_val}, headers=headers)

                if resp.status_code != 200:
                    print(f"[bilibili] Follow feed API error for type={type_val}: {resp.status_code}")
                    continue

                data = resp.json()
                if data.get("code") != 0:
                    print(f"[bilibili] API error for type={type_val}: {data.get('message')}")
                    continue

                cards = data.get("data", {}).get("cards", [])

                for card in cards[:limit // len(valid_types) + 2]:
                    item = self._parse_dynamic_card(card, keywords, seen)
                    if item:
                        if allowed_up_uids and str(item.raw.get("up_uid", "")) not in allowed_up_uids:
                            continue
                        items.append(item)
                        seen.add(item.id)

            except Exception as e:
                print(f"[bilibili] Failed to fetch type={type_val}: {e}")

        return items

    async def _resolve_followed_uid_filters(
        self,
        sessdata: str,
        explicit_uids: list[str] | None,
        followed_up_groups: list[str] | None,
        followed_up_original_groups: list[str | int] | None,
    ) -> set[str] | None:
        """Resolve allowed followed UPs from explicit UIDs and configured groups."""
        normalized_uids = {
            self._extract_uid(uid)
            for uid in (explicit_uids or [])
            if str(uid).strip()
        }
        normalized_groups = {
            str(group).strip()
            for group in (followed_up_groups or [])
            if str(group).strip() and str(group).strip() != "all"
        }
        normalized_original_groups = {
            int(str(group).strip())
            for group in (followed_up_original_groups or [])
            if str(group).strip() and str(group).strip() != "all"
        }

        if not normalized_uids and not normalized_groups and not normalized_original_groups:
            return None

        allowed_uids = set(normalized_uids)
        if not normalized_groups and not normalized_original_groups:
            return allowed_uids

        try:
            followed_ups = await self._fetch_followed_ups(sessdata=sessdata)
        except Exception as e:
            print(f"[bilibili] Failed to load followed UPs for group filters: {e}")
            return allowed_uids or None

        for up in followed_ups:
            up_group_hit = self._classify_followed_up(up) in normalized_groups if normalized_groups else False
            up_original_tags = {
                int(tag_id)
                for tag_id in (up.get("tag") or [])
                if str(tag_id).lstrip("-").isdigit()
            }
            up_original_hit = bool(up_original_tags & normalized_original_groups) if normalized_original_groups else False

            if up_group_hit or up_original_hit:
                mid = str(up.get("mid", "")).strip()
                if mid:
                    allowed_uids.add(mid)

        return allowed_uids or None

    async def _fetch_followed_ups(self, sessdata: str, max_count: int = 5000) -> list[dict]:
        """Fetch followed UP list for group-based filtering."""
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Cookie": f"SESSDATA={sessdata}",
            "Referer": "https://www.bilibili.com/",
        }

        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            nav_resp = await client.get(f"{self.API_BASE}/x/web-interface/nav", headers=headers)
            nav_resp.raise_for_status()
            nav_data = nav_resp.json()
            if nav_data.get("code") != 0:
                raise ValueError(nav_data.get("message", "获取 Bilibili 登录信息失败"))
            vmid = str(nav_data.get("data", {}).get("mid") or "")
            if not vmid:
                raise ValueError("未能从 Bilibili 登录信息中获取 mid")

            followings_api = f"{self.API_BASE}/x/relation/followings"
            page = 1
            page_size = 20
            results: list[dict] = []

            while len(results) < max_count:
                data = None
                for attempt in range(4):
                    resp = await client.get(
                        followings_api,
                        params={
                            "vmid": vmid,
                            "pn": page,
                            "ps": page_size,
                            "order_type": "attention",
                        },
                        headers={
                            **headers,
                            "Referer": f"https://space.bilibili.com/{vmid}/fans/follow",
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    if data.get("code") == 0:
                        break
                    if data.get("code") == -352 and attempt < 3:
                        await asyncio.sleep(1.5 * (attempt + 1))
                        continue
                    raise ValueError(data.get("message", "获取关注列表失败"))
                items = data.get("data", {}).get("list", []) or []
                if not items:
                    break
                results.extend(items)
                if len(items) < page_size:
                    break
                await asyncio.sleep(0.8)
                page += 1

            return results[:max_count]

    def _classify_followed_up(self, up: dict) -> str:
        """Match the Bilibili tool's followed-UP grouping heuristic."""
        official = up.get("official_desc")
        if not official and isinstance(up.get("official_verify"), dict):
            official = up.get("official_verify", {}).get("desc", "")
        haystack = " ".join(
            str(part or "")
            for part in (
                up.get("uname"),
                up.get("sign"),
                official,
            )
        ).lower()

        for group, keywords in FOLLOWED_UP_GROUP_KEYWORDS.items():
            if any(keyword in haystack for keyword in keywords):
                return group
        return "other"

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
        item_content = card.get("item") or {}
        description = item_content.get("description", "")

        # Keyword filtering
        if keywords:
            if not any(kw.lower() in description.lower() for kw in keywords):
                return None

        up_uid = str(desc.get("user_profile", {}).get("uid", ""))
        up_name = desc.get("user_profile", {}).get("uname", "UP主")
        timestamp = desc.get("timestamp", 0)

        # Get images
        pictures = item_content.get("pictures") or []
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
        item_content = card.get("item") or {}
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
