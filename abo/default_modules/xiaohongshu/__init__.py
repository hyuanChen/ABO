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
import asyncio
import random
import re
from datetime import datetime, timedelta
from pathlib import Path

from abo.config import load as load_config
from abo.creator_smart_groups import match_smart_groups_from_content_tags, unique_strings
from abo.sdk import Module, Item, Card, agent_json
from abo.store.cards import CardStore
from abo.tools.xhs_crawler import build_xhs_seed_obsidian_path
from abo.tools.xhs_creator_safety import (
    DEFAULT_BATCH_LIMIT,
    DEFAULT_BETWEEN_CREATOR_SECONDS_RANGE,
    check_creator_allowed,
)
from abo.tools.xhs_runtime import (
    fetch_xhs_keyword_search_result,
    fetch_xhs_creator_recent_result,
    fetch_xhs_following_feed_result,
)
from abo.tools.xhs_task_queue import xhs_serial_task
from abo.tools.xiaohongshu import XiaohongshuAPI
from abo.xhs_tracker_config import DEFAULT_XHS_RECENT_DAYS
from abo.xhs_tracker_config import normalize_string_list, normalize_xhs_tracker_config


class XiaohongshuTracker(Module):
    """Track Xiaohongshu (Little Red Book) notes for research content."""

    id = "xiaohongshu-tracker"
    name = "小红书"
    schedule = "30 8 * * *"  # Daily at 8:30 AM, 30 minutes before the default push time
    icon = "book-open"
    output = ["obsidian", "ui"]
    subscription_types = [
        {"type": "user_id", "label": "小红书用户ID", "placeholder": "输入用户主页链接或ID"},
    ]

    # RSSHub endpoint for Xiaohongshu (if available)
    # Alternative: use searx or other aggregators
    RSSHUB_BASE = "https://rsshub.app"

    def _safe_obsidian_part(self, value: object, fallback: str) -> str:
        clean = re.sub(r'[\\/:*?"<>|#\n\r\t]+', "-", str(value or "").strip())
        clean = re.sub(r"\s+", " ", clean).strip(" .-_")
        return (clean[:48].strip() or fallback)

    def _filter_notes_by_recent_days(self, items: list[Item], recent_days: int | None, *, sort_by: str = "time") -> list[Item]:
        try:
            days = max(1, min(int(recent_days or DEFAULT_XHS_RECENT_DAYS), 365))
        except (TypeError, ValueError):
            days = DEFAULT_XHS_RECENT_DAYS
        cutoff = datetime.now() - timedelta(days=days)

        def published_at(item: Item) -> datetime | None:
            raw_value = item.raw.get("published_at") or item.raw.get("published")
            if not raw_value:
                return None
            try:
                parsed = datetime.fromisoformat(str(raw_value).replace("Z", "+00:00"))
                return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
            except ValueError:
                return None

        filtered = [item for item in items if (published_at(item) or datetime.max) >= cutoff]
        if str(sort_by or "time").strip().lower() == "time":
            filtered.sort(key=lambda item: published_at(item) or datetime.max, reverse=True)
        return filtered

    def _build_obsidian_path(self, payload: dict, _safe_title: str) -> str:
        source = str(payload.get("crawl_source") or "").strip()
        matched_keywords = normalize_string_list(payload.get("matched_keywords"))
        author = str(payload.get("author") or "").strip()
        user_id = str(payload.get("user_id") or "").strip()

        subfolder_parts: list[str] = []
        if source == "following":
            subfolder_parts.append("关注流扫描")
            if matched_keywords:
                subfolder_parts.append(self._safe_obsidian_part("，".join(matched_keywords[:3]), "关键词"))
        elif source.startswith("keyword:"):
            subfolder_parts.append("关键词扫描")
            keyword = source.split(":", 1)[1].strip() if ":" in source else ""
            keyword = keyword or "，".join(matched_keywords[:3])
            if keyword:
                subfolder_parts.append(self._safe_obsidian_part(keyword, "关键词"))
        elif source in {"user_id", "creator-recent"}:
            subfolder_parts.append("指定用户扫描")
            label = author or user_id
            if label:
                subfolder_parts.append(self._safe_obsidian_part(label, "未命名用户"))
        else:
            subfolder_parts.append("其他来源")

        return build_xhs_seed_obsidian_path(
            payload,
            subfolder="/".join(subfolder_parts) if subfolder_parts else None,
        )

    def _get_history_store(self) -> CardStore | None:
        try:
            return CardStore()
        except Exception as exc:
            print(f"[xiaohongshu] Failed to load crawl history store: {exc}")
            return None

    def _has_seen_note(self, history_store: CardStore | None, *, note_id: str, url: str) -> bool:
        clean_note_id = str(note_id or "").strip()
        clean_url = str(url or "").strip()
        if history_store is None or (not clean_note_id and not clean_url):
            return False
        return history_store.has_processed_crawl_record(
            module_ids=self.id,
            content_id=clean_note_id,
            source_url=clean_url,
        )

    def _merge_creator_monitors_with_smart_groups(
        self,
        creator_monitors: list[dict],
        *,
        creator_profiles: dict,
        selected_groups: list[str],
    ) -> list[dict]:
        normalized_selected_groups = set(normalize_string_list(selected_groups))
        normalized_profiles = dict(creator_profiles or {})

        merged_monitors: list[dict] = []
        seen_user_ids: set[str] = set()

        for monitor in creator_monitors:
            if not isinstance(monitor, dict):
                continue
            next_monitor = dict(monitor)
            user_id = str(next_monitor.get("user_id") or "").strip()
            if not user_id:
                merged_monitors.append(next_monitor)
                continue

            profile = dict(normalized_profiles.get(user_id) or {})
            next_groups = unique_strings([
                *normalize_string_list(next_monitor.get("smart_groups")),
                *normalize_string_list(profile.get("smart_groups")),
            ])
            next_group_labels = unique_strings([
                *normalize_string_list(next_monitor.get("smart_group_labels")),
                *normalize_string_list(profile.get("smart_group_labels")),
            ])
            if profile.get("author") and not str(next_monitor.get("author") or "").strip():
                next_monitor["author"] = profile.get("author")
            if next_groups:
                next_monitor["smart_groups"] = next_groups
            if next_group_labels:
                next_monitor["smart_group_labels"] = next_group_labels

            merged_monitors.append(next_monitor)
            seen_user_ids.add(user_id)

        if not normalized_selected_groups:
            return merged_monitors

        for profile_key, raw_profile in normalized_profiles.items():
            profile = dict(raw_profile or {})
            if bool(profile.get("pending_author_id")):
                continue
            user_id = str(profile.get("author_id") or profile_key or "").strip()
            if not user_id or user_id in seen_user_ids:
                continue

            profile_groups = normalize_string_list(profile.get("smart_groups"))
            if not normalized_selected_groups.intersection(profile_groups):
                continue

            merged_monitors.append(
                {
                    "id": f"xhs-cm-smart-{user_id}",
                    "user_id": user_id,
                    "label": str(profile.get("author") or user_id).strip() or user_id,
                    "author": str(profile.get("author") or user_id).strip() or user_id,
                    "enabled": True,
                    "per_user_limit": 3,
                    "recent_days": DEFAULT_XHS_RECENT_DAYS,
                    "sort_by": "time",
                    "include_comments": False,
                    "comments_limit": 20,
                    "comments_sort_by": "likes",
                    "smart_groups": profile_groups,
                    "smart_group_labels": normalize_string_list(profile.get("smart_group_labels")),
                }
            )
            seen_user_ids.add(user_id)

        return merged_monitors

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
        config: dict = {}
        if prefs_path.exists():
            try:
                data = json.loads(prefs_path.read_text())
            except (json.JSONDecodeError, OSError):
                data = {}
            config = dict((data.get("modules", {}) or {}).get(self.id, {}) or {})

        if not str(config.get("cookie") or "").strip():
            config["cookie"] = str(load_config().get("xiaohongshu_cookie") or "").strip()

        return config

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
        async with xhs_serial_task("定时小红书追踪"):
            return await self._fetch_serial(user_ids=user_ids, keywords=keywords, max_results=max_results)

    async def _fetch_serial(
        self,
        user_ids: list[str] = None,
        keywords: list[str] = None,
        max_results: int = 20,
    ) -> list[Item]:
        config = self._load_config()
        max_results = max(1, int(config.get("max_results", max_results) or max_results))
        creator_push_enabled = bool(config.get("creator_push_enabled", False))
        creator_groups = config.get("creator_groups", [])
        cookie = self._build_cookie_from_config(config)
        normalized = normalize_xhs_tracker_config(config)
        keyword_monitors = list(normalized["keyword_monitors"])
        following_scan = dict(normalized["following_scan"])
        following_scan_monitors = list(normalized.get("following_scan_monitors") or [])
        creator_monitors = list(normalized["creator_monitors"])
        has_explicit_empty_keyword_monitors = isinstance(config.get("keyword_monitors"), list) and not config.get("keyword_monitors")

        if keywords:
            keyword_monitors = [
                {
                    "id": "xhs-km-ad-hoc",
                    "label": "临时情报推送",
                    "keywords": normalize_string_list(keywords),
                    "enabled": True,
                    "min_likes": int(config.get("keyword_min_likes", 500) or 0),
                    "per_keyword_limit": int(config.get("keyword_search_limit", 10) or 10),
                    "include_comments": False,
                    "comments_limit": 20,
                    "comments_sort_by": "likes",
                }
            ]
            following_scan["keywords"] = normalize_string_list(keywords)
            following_scan_monitors = [
                {
                    "id": "xhs-fm-ad-hoc",
                    "label": "临时关注流扫描",
                    "keywords": normalize_string_list(keywords),
                    "enabled": True,
                    "fetch_limit": int(config.get("fetch_follow_limit", 20) or 20),
                    "recent_days": DEFAULT_XHS_RECENT_DAYS,
                    "sort_by": "time",
                    "keyword_filter": True,
                    "include_comments": False,
                    "comments_limit": 20,
                    "comments_sort_by": "likes",
                }
            ]
        elif not keyword_monitors and not has_explicit_empty_keyword_monitors and bool(config.get("enable_keyword_search", True)):
            keyword_monitors = [
                {
                    "id": "xhs-km-default",
                    "label": "默认情报推送",
                    "keywords": ["科研", "读博", "学术"],
                    "enabled": True,
                    "min_likes": int(config.get("keyword_min_likes", 500) or 0),
                    "per_keyword_limit": int(config.get("keyword_search_limit", 10) or 10),
                    "include_comments": False,
                    "comments_limit": 20,
                    "comments_sort_by": "likes",
                }
            ]

        if user_ids is not None:
            creator_monitors = [
                {
                    "id": f"xhs-cm-ad-hoc-{index}",
                    "user_id": str(user_id).strip(),
                    "label": str(user_id).strip(),
                    "author": str(user_id).strip(),
                    "enabled": True,
                    "per_user_limit": 3,
                    "include_comments": False,
                    "comments_limit": 20,
                    "comments_sort_by": "likes",
                    "smart_groups": [],
                    "smart_group_labels": [],
                }
                for index, user_id in enumerate(user_ids)
                if str(user_id).strip()
            ]

        if not creator_push_enabled:
            creator_monitors = []
        else:
            creator_monitors = self._merge_creator_monitors_with_smart_groups(
                creator_monitors,
                creator_profiles=dict(config.get("creator_profiles") or {}),
                selected_groups=creator_groups,
            )

        if creator_groups:
            selected_creator_groups = set(normalize_string_list(creator_groups))
            creator_monitors = [
                monitor
                for monitor in creator_monitors
                if selected_creator_groups.intersection(normalize_string_list(monitor.get("smart_groups")))
            ]

        items: list[Item] = []
        seen_ids: set[str] = set()
        history_store = self._get_history_store()
        result_cap = max(1, int(max_results or 1))

        structured_requested_total = 0
        structured_requested_total += sum(
            max(1, int(monitor.get("per_user_limit", 3) or 3))
            for monitor in creator_monitors
            if isinstance(monitor, dict) and monitor.get("enabled", True)
        )
        structured_requested_total += sum(
            max(1, int(monitor.get("fetch_limit", 20) or 20))
            for monitor in following_scan_monitors
            if isinstance(monitor, dict) and monitor.get("enabled", True)
        )
        if not following_scan_monitors and following_scan.get("enabled"):
            structured_requested_total += max(1, int(following_scan.get("fetch_limit", 20) or 20))
        structured_requested_total += sum(
            max(1, int(monitor.get("per_keyword_limit", 10) or 10))
            * max(1, len(normalize_string_list(monitor.get("keywords"))))
            for monitor in keyword_monitors
            if isinstance(monitor, dict)
            and monitor.get("enabled", True)
            and normalize_string_list(monitor.get("keywords"))
        )
        if structured_requested_total > 0:
            result_cap = max(result_cap, structured_requested_total)

        async def append_unique(new_items: list[Item]) -> None:
            for item in new_items:
                note_id = str(item.raw.get("note_id") or item.id)
                note_url = str(item.raw.get("url") or "").strip()
                if note_id in seen_ids:
                    continue
                if self._has_seen_note(history_store, note_id=note_id, url=note_url):
                    continue
                seen_ids.add(note_id)
                items.append(item)
                if len(items) >= result_cap:
                    return

        active_creator_monitors = [monitor for monitor in creator_monitors if monitor.get("enabled", True)]
        if active_creator_monitors:
            fallback_per_user_limit = 3
            creator_fetch_count = 0
            for monitor in active_creator_monitors:
                if creator_fetch_count >= DEFAULT_BATCH_LIMIT:
                    break
                user_id = str(monitor.get("user_id") or "").strip()
                if not user_id:
                    continue
                safety_decision = check_creator_allowed(user_id)
                if not safety_decision.allowed:
                    print(f"[xiaohongshu] Skip creator {user_id}: {safety_decision.reason} {safety_decision.cooldown_until}".strip())
                    continue
                if creator_fetch_count > 0:
                    await asyncio.sleep(random.randint(*DEFAULT_BETWEEN_CREATOR_SECONDS_RANGE))
                creator_fetch_count += 1
                per_user_limit = max(1, min(20, int(monitor.get("per_user_limit", fallback_per_user_limit) or fallback_per_user_limit)))
                recent_days = max(1, min(365, int(monitor.get("recent_days", DEFAULT_XHS_RECENT_DAYS) or DEFAULT_XHS_RECENT_DAYS)))
                candidate_limit = max(per_user_limit, 5)
                author_label = str(monitor.get("author") or monitor.get("label") or "").strip()
                user_items = await self._fetch_user_notes(user_id, cookie, candidate_limit, fallback_author=author_label)
                await append_unique(self._filter_notes_by_recent_days(user_items, recent_days, sort_by=monitor.get("sort_by", "time"))[:per_user_limit])
                if len(items) >= result_cap:
                    self._runtime_max_cards = result_cap
                    return items[:result_cap]

        active_following_monitors = [monitor for monitor in following_scan_monitors if monitor.get("enabled", True)]
        if not active_following_monitors and following_scan.get("enabled"):
            active_following_monitors = [following_scan]
        active_keyword_monitors = [
            monitor
            for monitor in keyword_monitors
            if monitor.get("enabled", True) and normalize_string_list(monitor.get("keywords"))
        ]

        if cookie and len(items) < result_cap:
            for monitor in active_following_monitors:
                follow_keywords = normalize_string_list(monitor.get("keywords"))
                if not follow_keywords and monitor.get("keyword_filter", True):
                    continue
                follow_limit = max(1, int(monitor.get("fetch_limit", 20) or 20))
                follow_items = await self._fetch_following_notes(
                    cookie=cookie,
                    keywords=follow_keywords if monitor.get("keyword_filter", True) and follow_keywords else [""],
                    limit=follow_limit,
                    recent_days=int(monitor.get("recent_days", DEFAULT_XHS_RECENT_DAYS) or DEFAULT_XHS_RECENT_DAYS),
                    sort_by=str(monitor.get("sort_by", "time") or "time"),
                    extension_port=max(1, int(config.get("extension_port", 9334) or 9334)),
                    dedicated_window_mode=bool(config.get("dedicated_window_mode", True)),
                )
                await append_unique(
                    list(follow_items or [])[:follow_limit]
                )
                if len(items) >= result_cap:
                    self._runtime_max_cards = result_cap
                    return items[:result_cap]

        if cookie and len(items) < result_cap:
            for monitor in active_keyword_monitors:
                monitor_keywords = normalize_string_list(monitor.get("keywords"))
                keyword_limit = max(1, int(monitor.get("per_keyword_limit", 10) or 10))
                monitor_total_limit = max(keyword_limit, keyword_limit * max(1, len(monitor_keywords)))
                keyword_items = await self._search_by_keywords(
                    keywords=monitor_keywords,
                    cookie=cookie,
                    limit=monitor_total_limit,
                    per_keyword_limit=int(monitor.get("per_keyword_limit", 10) or 10),
                    min_likes=int(monitor.get("min_likes", 500) or 0),
                    recent_days=int(monitor.get("recent_days", DEFAULT_XHS_RECENT_DAYS) or DEFAULT_XHS_RECENT_DAYS),
                    sort_by="comprehensive",
                    extension_port=max(1, int(config.get("extension_port", 9334) or 9334)),
                    dedicated_window_mode=bool(config.get("dedicated_window_mode", True)),
                )
                await append_unique(
                    list(keyword_items or [])[:monitor_total_limit]
                )
                if len(items) >= result_cap:
                    break

        self._runtime_max_cards = result_cap
        return items[:result_cap]

    def _note_to_item(
        self,
        note: object,
        *,
        source: str,
        matched_keywords: list[str] | None = None,
        user_id: str = "",
        fallback_author: str = "",
    ) -> Item:
        published_at = getattr(note, "published_at", None)
        published = published_at.isoformat() if published_at else ""
        note_id = getattr(note, "id", "") or self._extract_note_id(getattr(note, "url", "")) or source
        comments_preview = []
        for comment in list(getattr(note, "comments_preview", []) or []):
            comments_preview.append({
                "id": str(getattr(comment, "id", "") or ""),
                "author": str(getattr(comment, "author", "") or ""),
                "content": str(getattr(comment, "content", "") or ""),
                "likes": int(getattr(comment, "likes", 0) or 0),
                "is_top": bool(getattr(comment, "is_top", False)),
            })
        return Item(
            id=f"xhs-{source}-{note_id}",
            raw={
                "note_id": note_id,
                "title": getattr(note, "title", "") or "无标题",
                "content": getattr(note, "content", "") or "",
                "url": getattr(note, "url", ""),
                "user_id": user_id or getattr(note, "author_id", ""),
                "author_id": getattr(note, "author_id", "") or user_id,
                "author": getattr(note, "author", "") or fallback_author,
                "published": published,
                "published_at": published,
                "platform": "xiaohongshu",
                "likes": getattr(note, "likes", 0),
                "collects": getattr(note, "collects", 0),
                "comments_count": getattr(note, "comments_count", 0),
                "tags": getattr(note, "tags", []),
                "note_type": getattr(note, "note_type", "normal"),
                "cover_image": getattr(note, "cover_image", None),
                "images": list(getattr(note, "images", []) or []),
                "video_url": getattr(note, "video_url", None),
                "comments_preview": comments_preview,
                "xsec_token": getattr(note, "xsec_token", "") or "",
                "xsec_source": getattr(note, "xsec_source", "") or "",
                "crawl_source": source,
                "matched_keywords": matched_keywords or list(getattr(note, "matched_keywords", []) or []),
            },
        )

    def _serialized_note_to_item(
        self,
        note: dict,
        *,
        source: str,
        matched_keywords: list[str] | None = None,
        user_id: str = "",
        fallback_author: str = "",
    ) -> Item:
        published = str(note.get("published_at") or "") if isinstance(note, dict) else ""
        note_id = str(note.get("id") or self._extract_note_id(str(note.get("url") or "")) or source)
        comments_preview = []
        for comment in list(note.get("comments_preview", []) or []):
            comments_preview.append(
                {
                    "id": str(comment.get("id") or ""),
                    "author": str(comment.get("author") or ""),
                    "content": str(comment.get("content") or ""),
                    "likes": int(comment.get("likes", 0) or 0),
                    "is_top": bool(comment.get("is_top", False)),
                }
            )
        return Item(
            id=f"xhs-{source}-{note_id}",
            raw={
                "note_id": note_id,
                "title": str(note.get("title") or "无标题"),
                "content": str(note.get("content") or ""),
                "url": str(note.get("url") or ""),
                "user_id": user_id or str(note.get("author_id") or ""),
                "author_id": str(note.get("author_id") or user_id),
                "author": str(note.get("author") or fallback_author),
                "published": published,
                "published_at": published,
                "platform": "xiaohongshu",
                "likes": int(note.get("likes", 0) or 0),
                "collects": int(note.get("collects", 0) or 0),
                "comments_count": int(note.get("comments_count", 0) or 0),
                "tags": list(note.get("tags", []) or []),
                "note_type": str(note.get("note_type") or "normal"),
                "cover_image": note.get("cover_image"),
                "images": list(note.get("images", []) or []),
                "video_url": note.get("video_url"),
                "comments_preview": comments_preview,
                "xsec_token": str(note.get("xsec_token") or ""),
                "xsec_source": str(note.get("xsec_source") or ""),
                "crawl_source": source,
                "matched_keywords": matched_keywords or list(note.get("matched_keywords", []) or []),
            },
        )

    async def _fetch_user_notes(self, user_id: str, cookie: str, limit: int, *, fallback_author: str = "") -> list[Item]:
        clean_id = self._extract_user_id(user_id)
        config = self._load_config()
        extension_port = max(1, int(config.get("extension_port", 9334) or 9334))
        dedicated_window_mode = bool(config.get("dedicated_window_mode", True))

        # 作者主页抓取只走插件 bridge 主链路；失败后不再用 HTTP/RSSHub 兜底，
        # 避免风险页出现后继续请求主页相关资源。
        if cookie:
            try:
                result = await fetch_xhs_creator_recent_result(
                    creator_query=clean_id,
                    cookie=cookie,
                    recent_days=365,
                    max_notes=max(limit, 1),
                    use_extension=True,
                    extension_port=extension_port,
                    dedicated_window_mode=dedicated_window_mode,
                    require_extension_success=True,
                    enforce_safety=False,
                    record_creator_metrics=True,
                )
                notes = list(result.get("notes", []) or [])
                if notes:
                    return [
                        self._serialized_note_to_item(
                            note,
                            source="user_id",
                            user_id=clean_id,
                            fallback_author=fallback_author,
                        )
                        for note in notes[:limit]
                    ]
            except Exception as e:
                print(f"[xiaohongshu] Plugin-priority user fetch failed for {clean_id}: {e}")
        return []

    async def _fetch_following_notes(
        self,
        cookie: str,
        keywords: list[str],
        limit: int,
        *,
        recent_days: int = DEFAULT_XHS_RECENT_DAYS,
        sort_by: str = "time",
        extension_port: int = 9334,
        dedicated_window_mode: bool = True,
    ) -> list[Item]:
        try:
            result = await fetch_xhs_following_feed_result(
                cookie=cookie,
                keywords=keywords or [""],
                max_notes=max(limit, 5),
                recent_days=recent_days,
                sort_by=sort_by,
                use_extension=True,
                extension_port=extension_port,
                dedicated_window_mode=dedicated_window_mode,
            )
            return [
                self._serialized_note_to_item(
                    note,
                    source="following",
                    matched_keywords=list(note.get("matched_keywords", []) or []),
                )
                for note in list(result.get("notes", []) or [])[:limit]
            ]
        except Exception as e:
            print(f"[xiaohongshu] Failed to fetch following feed: {e}")
            return []

    async def _search_by_keywords(
        self,
        keywords: list[str],
        cookie: str,
        limit: int,
        per_keyword_limit: int,
        min_likes: int,
        recent_days: int = DEFAULT_XHS_RECENT_DAYS,
        sort_by: str = "time",
        extension_port: int = 9334,
        dedicated_window_mode: bool = True,
    ) -> list[Item]:
        """Search notes by keywords using the verified Playwright-based tool flow."""
        items: list[Item] = []
        seen_ids: set[str] = set()
        for keyword in keywords:
            remaining_limit = max(0, limit - len(items))
            if remaining_limit <= 0:
                break
            request_limit = max(1, min(per_keyword_limit, remaining_limit))
            try:
                result = await fetch_xhs_keyword_search_result(
                    keyword=keyword,
                    sort_by=sort_by,
                    max_results=request_limit,
                    min_likes=min_likes,
                    recent_days=recent_days,
                    cookie=cookie,
                    use_extension=True,
                    extension_port=extension_port,
                    dedicated_window_mode=dedicated_window_mode,
                )
            except Exception as e:
                print(f"[xiaohongshu] Failed to search keyword '{keyword}': {e}")
                continue

            for note in list(result.get("notes", []) or []):
                note_id = str(note.get("id") or self._extract_note_id(str(note.get("url") or "")) or "")
                if note_id in seen_ids:
                    continue
                seen_ids.add(note_id)
                items.append(self._serialized_note_to_item(note, source=f"keyword:{keyword}", matched_keywords=[keyword]))
                if len(items) >= limit:
                    break
        return self._filter_notes_by_recent_days(items, recent_days, sort_by=sort_by)[:limit]

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
        cutoff = datetime.now() - timedelta(days=30)  # Last 30 days
        config = self._load_config()
        creator_profiles = config.get("creator_profiles", {}) or {}
        group_options = config.get("creator_group_options", []) or []
        group_label_map = {
            str(option.get("value", "")).strip(): str(option.get("label", "")).strip()
            for option in group_options
            if isinstance(option, dict)
        }

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
            user_id = str(p.get("user_id") or "")
            creator_profile = creator_profiles.get(user_id, {}) if user_id else {}
            creator_smart_groups = [
                str(group).strip()
                for group in (creator_profile.get("smart_groups") or [])
                if str(group).strip()
            ]
            creator_smart_group_labels = [
                group_label_map.get(group, group)
                for group in creator_smart_groups
            ]
            content_smart_groups, content_smart_group_labels = match_smart_groups_from_content_tags(
                [*(p.get("tags") or []), *(result.get("tags") or []), *(p.get("matched_keywords") or [])],
                group_options,
            )
            creator_smart_groups = unique_strings([*creator_smart_groups, *content_smart_groups])
            creator_smart_group_labels = unique_strings([*creator_smart_group_labels, *content_smart_group_labels])

            cards.append(
                Card(
                    id=item.id,
                    title=p["title"],
                    summary=result.get("summary", content[:100]),
                    score=min(result.get("score", 5), 10) / 10,
                    tags=result.get("tags", []) + ["小红书", result.get("category", "笔记")],
                    source_url=p["url"],
                    obsidian_path=self._build_obsidian_path(p, safe_title),
                    metadata={
                        "abo-type": "xiaohongshu-note",
                        "platform": "xiaohongshu",
                        "user_id": p.get("user_id"),
                        "author_id": p.get("author_id") or p.get("user_id"),
                        "author": p.get("author"),
                        "published": p.get("published"),
                        "published_at": p.get("published_at") or p.get("published"),
                        "category": result.get("category", "笔记"),
                        "likes": p.get("likes", 0),
                        "collects": p.get("collects", 0),
                        "comments_count": p.get("comments_count", 0),
                        "note_type": p.get("note_type", "normal"),
                        "cover_image": p.get("cover_image"),
                        "images": p.get("images", []),
                        "video_url": p.get("video_url"),
                        "comments_preview": p.get("comments_preview", []),
                        "xsec_token": p.get("xsec_token", ""),
                        "xsec_source": p.get("xsec_source", ""),
                        "crawl_source": p.get("crawl_source", ""),
                        "matched_keywords": p.get("matched_keywords", []),
                        "creator_smart_groups": creator_smart_groups,
                        "creator_smart_group_labels": creator_smart_group_labels,
                        "content": content,
                    },
                )
            )

        return cards
