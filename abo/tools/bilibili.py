"""
哔哩哔哩主动爬取工具

功能：
1. 获取关注列表动态（视频/图文/文字/专栏）
2. 关键词过滤
3. 视频详情获取
4. 使用 SESSDATA Cookie 访问

依赖：bilibili-tracker 模块的 API 调用逻辑
"""

import asyncio
import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Optional

import httpx

from abo.default_modules.bilibili.wbi import enc_wbi, get_wbi_keys
from abo.tools.social_runtime_retry import run_social_runtime_with_retry
from abo.tools.bilibili_video_meta import (
    extract_bvid,
    fetch_bilibili_video_metadata,
    merge_tags,
)

MAX_FOLLOWED_DYNAMIC_KEEP_LIMIT = 1000
MAX_FOLLOWED_DYNAMIC_COLLECT_LIMIT = 50000
MAX_FOLLOWED_DYNAMIC_PAGE_LIMIT = 1000
FOLLOWED_DYNAMIC_PAGE_SIZE = 20
SPACE_DYNAMIC_PAGE_SIZE = 12
TARGETED_AUTHOR_OVERSCAN_MULTIPLIER = 4
TARGETED_AUTHOR_DEFAULT_SCAN_PAGES = 3
GLOBAL_FOLLOWED_OVERSCAN_MULTIPLIER = 4
GLOBAL_FOLLOWED_MIN_SCAN_PAGES_SHORT = 9
GLOBAL_FOLLOWED_MIN_SCAN_PAGES_MID = 18
GLOBAL_FOLLOWED_MIN_SCAN_PAGES_LONG = 30
MANUAL_LINK_IMPORT_SUBFOLDER = "主动链接导入"


def _normalize_text_list(values: list[str] | None) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        text = str(value or "").strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(text)
    return normalized


def _normalize_search_text(value: Any) -> str:
    return str(value or "").replace("\u3000", " ").replace("\xa0", " ").strip().casefold()


def _compact_search_text(value: Any) -> str:
    normalized = _normalize_search_text(value)
    return re.sub(r"[\s\-_/\\|·•・,，。:：;；!！?？#【】\[\]()（）]+", "", normalized)


def _match_terms_against_text_parts(
    terms: list[str] | None,
    *,
    text_parts: list[Any] | None = None,
    tags: list[str] | None = None,
    allow_reverse_tag_contains: bool = False,
) -> list[str]:
    normalized_terms = _normalize_text_list(terms)
    if not normalized_terms:
        return []

    normalized_text_parts = [
        _normalize_search_text(part)
        for part in (text_parts or [])
        if _normalize_search_text(part)
    ]
    compact_text_parts = [
        _compact_search_text(part)
        for part in (text_parts or [])
        if _compact_search_text(part)
    ]
    haystack = " ".join(normalized_text_parts)
    compact_haystack = "".join(compact_text_parts)
    normalized_tags = [
        str(tag or "").strip()
        for tag in (tags or [])
        if str(tag or "").strip()
    ]
    normalized_tag_texts = [_normalize_search_text(tag) for tag in normalized_tags]
    compact_tag_texts = [_compact_search_text(tag) for tag in normalized_tags]

    matched_terms: list[str] = []
    for term in normalized_terms:
        normalized_term = _normalize_search_text(term)
        compact_term = _compact_search_text(term)
        if not normalized_term:
            continue

        matched = False
        if normalized_term in haystack:
            matched = True
        elif compact_term and compact_term in compact_haystack:
            matched = True
        else:
            for normalized_tag, compact_tag in zip(normalized_tag_texts, compact_tag_texts):
                if normalized_term in normalized_tag:
                    matched = True
                    break
                if compact_term and compact_term in compact_tag:
                    matched = True
                    break
                if allow_reverse_tag_contains and normalized_tag in normalized_term:
                    matched = True
                    break
                if allow_reverse_tag_contains and compact_term and compact_tag and compact_tag in compact_term:
                    matched = True
                    break

        if matched:
            matched_terms.append(term)

    return list(dict.fromkeys(matched_terms))


def _parse_serialized_published_at(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed


def _parse_reference_time(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.replace(tzinfo=None) if value.tzinfo else value
    return _parse_serialized_published_at(value)


def _normalize_monitor_subfolder_segment(value: Any, fallback: str) -> str:
    normalized = re.sub(r"\s+", " ", re.sub(r"[\\/]+", " ", str(value or ""))).strip()
    return normalized or fallback


def build_fixed_up_monitor_subfolder(author_label: Any) -> str:
    return "/".join(
        [
            "每日监视UP",
            "固定UP监督",
            _normalize_monitor_subfolder_segment(author_label, "未命名UP"),
        ]
    )


def resolve_bilibili_dynamic_monitor_subfolder(
    *,
    author: Any,
    monitor_subfolder: Any = "",
    monitor_label: Any = "",
    crawl_source: Any = "",
) -> str:
    normalized_subfolder = str(monitor_subfolder or "").strip()
    normalized_label = str(monitor_label or "").strip()
    normalized_source = str(crawl_source or "").strip()
    if (
        normalized_source == "manual-up"
        or normalized_label == "固定UP监督"
        or normalized_label.startswith("每日监视UP")
        or normalized_label.startswith("每日监视 UP")
        or normalized_subfolder.startswith("每日监视UP")
    ):
        return build_fixed_up_monitor_subfolder(author or "UP主")
    return normalized_subfolder


def _resolve_serialized_dynamic_match_metadata(
    dynamic: dict[str, Any],
    keywords: list[str] | None,
    tag_filters: list[str] | None,
) -> tuple[list[str], list[str]]:
    text_parts = [
        dynamic.get("title"),
        dynamic.get("content"),
        dynamic.get("author"),
        dynamic.get("description"),
        dynamic.get("summary"),
    ]
    tags = [str(tag or "").strip() for tag in (dynamic.get("tags") or []) if str(tag or "").strip()]
    matched_keywords = _match_terms_against_text_parts(
        keywords,
        text_parts=text_parts,
        tags=tags,
    )
    matched_tags = _match_terms_against_text_parts(
        tag_filters,
        text_parts=text_parts,
        tags=tags,
        allow_reverse_tag_contains=True,
    )
    return matched_keywords, matched_tags


@dataclass
class BiliDynamic:
    """哔哩哔哩动态数据结构"""
    id: str
    dynamic_id: str
    title: str
    content: str
    author: str
    author_id: str
    url: str
    published_at: Optional[datetime] = None
    dynamic_type: str = "text"  # video, image, text, article
    images: list = None
    pic: str = ""  # 视频封面
    bvid: str = ""
    tags: list[str] = None
    matched_keywords: list[str] = None
    matched_tags: list[str] = None
    monitor_label: str = ""
    monitor_subfolder: str = ""
    crawl_source: str = ""
    crawl_source_label: str = ""

    def __post_init__(self):
        if self.images is None:
            self.images = []
        if self.tags is None:
            self.tags = []
        if self.matched_keywords is None:
            self.matched_keywords = []
        if self.matched_tags is None:
            self.matched_tags = []


@dataclass
class BiliFollowedUp:
    """哔哩哔哩关注 UP 数据结构"""
    mid: str
    uname: str
    face: str = ""
    sign: str = ""
    official_desc: str = ""
    special: int = 0
    tag_ids: list[int] = None

    def __post_init__(self):
        if self.tag_ids is None:
            self.tag_ids = []


class BilibiliToolAPI:
    """哔哩哔哩工具 API 封装"""

    API_BASE = "https://api.bilibili.com"
    DYNAMIC_API = "https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/dynamic_new"
    POLYMER_DYNAMIC_API = "https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all"
    DYNAMIC_DETAIL_API = "https://api.bilibili.com/x/polymer/web-dynamic/v1/detail"
    SPACE_DYNAMIC_API = "https://api.bilibili.com/x/polymer/web-dynamic/desktop/v1/feed/space"
    ARTICLE_VIEWINFO_API = "https://api.bilibili.com/x/article/viewinfo"
    POLYMER_DYNAMIC_FEATURES = (
        "itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,"
        "decorationCard,forwardListHidden,ugcDelete,onlyfansQaCard"
    )
    NAV_API = "https://api.bilibili.com/x/web-interface/nav"
    FOLLOWINGS_API = "https://api.bilibili.com/x/relation/followings"
    TAGS_API = "https://api.bilibili.com/x/relation/tags"

    def __init__(self, sessdata: str = None, timeout: int = 30):
        self.sessdata = sessdata
        self.timeout = timeout
        self.client = httpx.AsyncClient(timeout=timeout, follow_redirects=True)
        self._video_meta_cache: dict[str, dict] = {}
        self._last_fetch_stats: dict[str, Any] = {}
        self._space_fetch_stats_cache: dict[str, dict[str, Any]] = {}
        self._targeted_shared_stop_state: dict[str, Any] | None = None
        self._fetch_reference_time: datetime | None = None

    def _build_headers(self, referer: str = "https://t.bilibili.com/") -> dict[str, str]:
        return {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Cookie": f"SESSDATA={self.sessdata}",
            "Referer": referer,
        }

    def _normalize_url(self, url: str) -> str:
        if not url:
            return ""
        if url.startswith("//"):
            return f"https:{url}"
        if url.startswith("http://"):
            return f"https://{url[7:]}"
        return url

    def _normalize_input_url(self, url: str) -> str:
        raw = str(url or "").strip()
        if not raw:
            return ""
        if raw.startswith("BV"):
            raw = f"https://www.bilibili.com/video/{raw}"
        elif raw.startswith("cv") and raw[2:].isdigit():
            raw = f"https://www.bilibili.com/read/{raw}"
        elif raw.isdigit():
            raw = f"https://www.bilibili.com/opus/{raw}"
        elif not re.match(r"^https?://", raw, flags=re.IGNORECASE):
            raw = f"https://{raw.lstrip('/')}"
        normalized = self._normalize_url(raw)
        return normalized.split("#", 1)[0].strip()

    def _extract_dynamic_id_from_url(self, url: str) -> str:
        text = self._normalize_input_url(url)
        if not text:
            return ""
        for pattern in (
            r"(?:t|h)\.bilibili\.com/(\d+)",
            r"bilibili\.com/opus/(\d+)",
        ):
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        return ""

    def _extract_cvid(self, url: str) -> str:
        text = self._normalize_input_url(url)
        if not text:
            return ""
        match = re.search(r"/read/cv(\d+)", text)
        return match.group(1) if match else ""

    def _normalize_keep_limit(self, value: Any, fallback: int = 20) -> int:
        try:
            normalized = int(value)
        except Exception:
            normalized = int(fallback)
        return max(1, min(normalized, MAX_FOLLOWED_DYNAMIC_KEEP_LIMIT))

    def _resolve_targeted_author_scan_limit(
        self,
        *,
        author_count: int,
        result_limit: int,
        days_back: int,
    ) -> int:
        per_author_keep_share = max(1, math.ceil(result_limit / max(author_count, 1)))
        baseline_scan_limit = SPACE_DYNAMIC_PAGE_SIZE * TARGETED_AUTHOR_DEFAULT_SCAN_PAGES
        return min(
            MAX_FOLLOWED_DYNAMIC_KEEP_LIMIT,
            max(
                baseline_scan_limit,
                per_author_keep_share * TARGETED_AUTHOR_OVERSCAN_MULTIPLIER,
            ),
        )

    def _normalize_page_limit(self, value: Any, fallback: int) -> int:
        try:
            normalized = int(value)
        except Exception:
            normalized = int(fallback)
        return max(1, min(normalized, MAX_FOLLOWED_DYNAMIC_PAGE_LIMIT))

    def _resolve_runtime_page_budget(self, page_limit: int | None) -> int:
        if page_limit is None:
            return MAX_FOLLOWED_DYNAMIC_PAGE_LIMIT
        return self._normalize_page_limit(page_limit, MAX_FOLLOWED_DYNAMIC_PAGE_LIMIT)

    def _resolve_collect_limit(
        self,
        *,
        page_limit: int | None,
        page_size: int,
        author_count: int = 1,
    ) -> int:
        page_budget = self._resolve_runtime_page_budget(page_limit)
        estimated = max(1, page_budget) * max(1, page_size) * max(1, author_count)
        return max(page_size, min(estimated, MAX_FOLLOWED_DYNAMIC_COLLECT_LIMIT))

    def _resolve_global_scan_limit(
        self,
        *,
        result_limit: int,
        days_back: int,
    ) -> int:
        if days_back <= 7:
            min_pages = GLOBAL_FOLLOWED_MIN_SCAN_PAGES_SHORT
        elif days_back <= 30:
            min_pages = GLOBAL_FOLLOWED_MIN_SCAN_PAGES_MID
        else:
            min_pages = GLOBAL_FOLLOWED_MIN_SCAN_PAGES_LONG

        return min(
            MAX_FOLLOWED_DYNAMIC_KEEP_LIMIT,
            max(
                FOLLOWED_DYNAMIC_PAGE_SIZE * min_pages,
                result_limit * GLOBAL_FOLLOWED_OVERSCAN_MULTIPLIER,
            ),
        )

    def _resolve_scan_days_back(
        self,
        *,
        days_back: int,
        keywords: list[str] | None,
        tag_filters: list[str] | None,
        scan_cutoff_days: int | None = None,
    ) -> int:
        effective_days_back = max(1, int(days_back or 1))
        if scan_cutoff_days is not None:
            try:
                normalized_scan_cutoff = max(1, int(scan_cutoff_days))
            except Exception:
                normalized_scan_cutoff = effective_days_back
            return min(effective_days_back, normalized_scan_cutoff)
        return effective_days_back

    def _targeted_shared_stop_reached(self) -> bool:
        state = self._targeted_shared_stop_state
        if not isinstance(state, dict):
            return False
        return int(state.get("matched_count") or 0) >= int(state.get("stop_limit") or 0)

    def _record_targeted_shared_match(self) -> None:
        state = self._targeted_shared_stop_state
        if not isinstance(state, dict):
            return
        state["matched_count"] = int(state.get("matched_count") or 0) + 1

    def _space_dynamic_referer(self, author_id: str) -> str:
        clean_author_id = str(author_id or "").strip()
        if not clean_author_id:
            return "https://space.bilibili.com/"
        return f"https://space.bilibili.com/{clean_author_id}/dynamic"

    def _keyword_matches(self, text_parts: list[str], keywords: list[str] | None) -> bool:
        if not keywords:
            return True
        haystack = " ".join(part for part in text_parts if part).lower()
        return any(kw.lower() in haystack for kw in keywords if kw)

    def _extract_inline_tags(self, *text_parts: str) -> list[str]:
        tags: list[str] = []
        seen: set[str] = set()
        for part in text_parts:
            text = str(part or "")
            if not text:
                continue
            for raw in re.findall(r"#([^#\n]{1,24})#", text):
                tag = str(raw or "").strip(" #")
                key = tag.casefold()
                if not tag or key in seen:
                    continue
                seen.add(key)
                tags.append(tag)
        return tags

    def _resolve_match_metadata(
        self,
        dynamic: BiliDynamic,
        keywords: list[str] | None,
        tag_filters: list[str] | None,
    ) -> tuple[list[str], list[str]]:
        text_parts = [
            dynamic.title,
            dynamic.content,
            dynamic.author,
            dynamic.url,
        ]
        normalized_tags = [str(tag or "").strip() for tag in (dynamic.tags or []) if str(tag or "").strip()]
        matched_keywords = _match_terms_against_text_parts(
            keywords,
            text_parts=text_parts,
            tags=normalized_tags,
        )
        matched_tags = _match_terms_against_text_parts(
            tag_filters,
            text_parts=text_parts,
            tags=normalized_tags,
            allow_reverse_tag_contains=True,
        )
        return matched_keywords, matched_tags

    async def _fetch_polymer_page(self, offset: str | None = None) -> dict:
        params = {
            "type": "all",
            "features": self.POLYMER_DYNAMIC_FEATURES,
        }
        if offset:
            params["offset"] = offset
        else:
            params["page"] = 1

        last_error: Exception | None = None
        for attempt in range(3):
            try:
                resp = await self.client.get(
                    self.POLYMER_DYNAMIC_API,
                    params=params,
                    headers=self._build_headers(),
                )

                if resp.status_code != 200:
                    raise ValueError(f"HTTP {resp.status_code}")

                data = resp.json()

                if data.get("code") != 0:
                    raise ValueError(data.get("message") or "获取动态失败")
                return data.get("data", {}) or {}
            except Exception as exc:
                last_error = exc
                if attempt < 2:
                    await asyncio.sleep(0.4 * (attempt + 1))
                    continue

        print(f"[bilibili-tool] Failed to fetch polymer dynamics: {last_error}")
        if last_error:
            raise last_error
        raise ValueError("获取动态失败")

    async def _fetch_dynamic_detail(self, dynamic_id: str, *, source_url: str = "") -> BiliDynamic:
        clean_dynamic_id = str(dynamic_id or "").strip()
        if not clean_dynamic_id:
            raise ValueError("缺少动态 ID")

        referer = source_url or f"https://www.bilibili.com/opus/{clean_dynamic_id}"
        resp = await self.client.get(
            self.DYNAMIC_DETAIL_API,
            params={"id": clean_dynamic_id},
            headers=self._build_headers(referer=referer),
        )
        if resp.status_code != 200:
            raise ValueError(f"动态详情请求失败: HTTP {resp.status_code}")

        data = resp.json()
        if data.get("code") != 0:
            raise ValueError(data.get("message") or "动态详情获取失败")

        payload = (
            ((data.get("data") or {}).get("item"))
            or (((data.get("data") or {}).get("items") or [None])[0])
            or {}
        )
        if not isinstance(payload, dict):
            raise ValueError("动态详情返回为空")

        dynamic = self._parse_polymer_item(payload)
        if dynamic is None:
            dynamic = self._parse_space_dynamic_item(
                payload,
                override_dynamic_id=clean_dynamic_id,
                override_url=source_url or None,
            )
        if dynamic is None:
            raise ValueError("无法解析这条动态详情")

        dynamic.dynamic_id = dynamic.dynamic_id or clean_dynamic_id
        dynamic.id = dynamic.id or f"bili-dyn-{dynamic.dynamic_id}"
        if dynamic.dynamic_type == "video":
            dynamic = await self._enrich_video_dynamic(dynamic)
        if not str(dynamic.url or "").strip():
            dynamic.url = source_url or f"https://www.bilibili.com/opus/{clean_dynamic_id}"
        return dynamic

    async def _fetch_article_detail(self, cvid: str, *, source_url: str = "") -> BiliDynamic:
        clean_cvid = str(cvid or "").strip()
        if not clean_cvid:
            raise ValueError("缺少专栏 ID")

        referer = source_url or f"https://www.bilibili.com/read/cv{clean_cvid}"
        resp = await self.client.get(
            self.ARTICLE_VIEWINFO_API,
            params={"id": clean_cvid, "mobi_app": "pc", "from": "web"},
            headers=self._build_headers(referer=referer),
        )
        if resp.status_code != 200:
            raise ValueError(f"专栏详情请求失败: HTTP {resp.status_code}")

        data = resp.json()
        if data.get("code") != 0:
            raise ValueError(data.get("message") or "专栏详情获取失败")

        payload = data.get("data") or {}
        if not isinstance(payload, dict):
            raise ValueError("专栏详情返回为空")

        title = str(payload.get("title") or "").strip() or f"B站专栏 cv{clean_cvid}"
        summary = str(
            payload.get("summary")
            or payload.get("desc")
            or payload.get("subtitle")
            or ""
        ).strip()
        author_payload = payload.get("author") or {}
        author = str(
            payload.get("author_name")
            or author_payload.get("name")
            or "UP主"
        ).strip() or "UP主"
        author_id = str(
            payload.get("mid")
            or payload.get("author_mid")
            or author_payload.get("mid")
            or ""
        ).strip()
        banner = self._normalize_url(
            payload.get("banner_url")
            or payload.get("image_url")
            or ""
        )
        raw_images = []
        for key in ("origin_image_urls", "image_urls"):
            values = payload.get(key) or []
            if isinstance(values, list):
                raw_images.extend(values)
        images = [
            self._normalize_url(image)
            for image in raw_images
            if self._normalize_url(image)
        ]
        if banner and banner not in images:
            images = [banner, *images]

        published_at = None
        for key in ("publish_time", "ctime", "ptime"):
            value = payload.get(key)
            if not value:
                continue
            try:
                published_at = datetime.fromtimestamp(int(value))
                break
            except Exception:
                continue

        return BiliDynamic(
            id=f"bili-dyn-cv{clean_cvid}",
            dynamic_id=f"cv{clean_cvid}",
            title=title,
            content=summary,
            author=author,
            author_id=author_id,
            url=referer,
            published_at=published_at,
            dynamic_type="article",
            images=images,
            pic=images[0] if images else "",
            tags=self._extract_inline_tags(title, summary),
        )

    async def _fetch_video_dynamic_by_bvid(self, bvid: str, *, source_url: str = "") -> BiliDynamic:
        clean_bvid = extract_bvid(bvid)
        if not clean_bvid:
            raise ValueError("缺少视频 BV 号")

        referer = source_url or f"https://www.bilibili.com/video/{clean_bvid}"
        metadata = await fetch_bilibili_video_metadata(
            self.client,
            bvid=clean_bvid,
            headers=self._build_headers(referer=referer),
            referer=referer,
        )
        if not metadata:
            raise ValueError("视频详情获取失败")

        published_at = None
        published_at_ts = metadata.get("published_at_ts")
        if published_at_ts:
            try:
                published_at = datetime.fromtimestamp(int(published_at_ts))
            except Exception:
                published_at = None

        title = str(metadata.get("title") or "").strip() or f"B站视频 {clean_bvid}"
        content = str(metadata.get("description") or "").strip()
        tags = merge_tags(
            self._extract_inline_tags(title, content),
            metadata.get("tags") or [],
        )

        return BiliDynamic(
            id=f"bili-dyn-{clean_bvid}",
            dynamic_id=clean_bvid,
            title=title,
            content=content,
            author=str(metadata.get("author") or "UP主").strip() or "UP主",
            author_id=str(metadata.get("author_id") or "").strip(),
            url=str(metadata.get("url") or referer).strip() or referer,
            published_at=published_at,
            dynamic_type="video",
            pic=str(metadata.get("cover") or "").strip(),
            bvid=clean_bvid,
            tags=tags,
        )

    async def fetch_dynamic_by_url(self, url: str) -> BiliDynamic:
        clean_url = self._normalize_input_url(url)
        if not clean_url:
            raise ValueError("链接为空")

        bvid = extract_bvid(clean_url)
        if bvid:
            return await self._fetch_video_dynamic_by_bvid(bvid, source_url=clean_url)

        dynamic_id = self._extract_dynamic_id_from_url(clean_url)
        if dynamic_id:
            return await self._fetch_dynamic_detail(dynamic_id, source_url=clean_url)

        cvid = self._extract_cvid(clean_url)
        if cvid:
            return await self._fetch_article_detail(cvid, source_url=clean_url)

        raise ValueError("暂不支持这个链接格式，请输入视频、动态、opus 或专栏链接")

    async def fetch_dynamics_by_urls(
        self,
        urls: list[str],
        *,
        monitor_subfolder: str = MANUAL_LINK_IMPORT_SUBFOLDER,
        crawl_source: str = "manual-link",
        crawl_source_label: str = "指定链接",
    ) -> tuple[list[BiliDynamic], list[str], int]:
        normalized_urls: list[str] = []
        seen_urls: set[str] = set()
        skipped_count = 0

        for raw_url in urls or []:
            clean_url = self._normalize_input_url(raw_url)
            if not clean_url:
                skipped_count += 1
                continue
            key = clean_url.casefold()
            if key in seen_urls:
                skipped_count += 1
                continue
            seen_urls.add(key)
            normalized_urls.append(clean_url)

        results: list[BiliDynamic] = []
        failures: list[str] = []
        for clean_url in normalized_urls:
            try:
                dynamic = await self.fetch_dynamic_by_url(clean_url)
                dynamic.id = dynamic.id or f"bili-dyn-{dynamic.dynamic_id or extract_bvid(dynamic.url) or hashlib.md5(clean_url.encode('utf-8')).hexdigest()[:12]}"
                dynamic.title = str(dynamic.title or "").strip() or "B站动态"
                dynamic.url = str(dynamic.url or clean_url).strip() or clean_url
                dynamic.monitor_subfolder = str(monitor_subfolder or dynamic.monitor_subfolder or "").strip()
                dynamic.crawl_source = str(crawl_source or dynamic.crawl_source or "").strip()
                dynamic.crawl_source_label = str(crawl_source_label or dynamic.crawl_source_label or "").strip()
                results.append(dynamic)
            except Exception as exc:
                failures.append(f"{clean_url}: {exc}")

        return results, failures, skipped_count

    async def _fetch_space_dynamic_page(self, author_id: str, offset: str | None = None) -> dict:
        params = {
            "host_mid": str(author_id or "").strip(),
        }
        if offset:
            params["offset"] = offset

        last_error: Exception | None = None
        for attempt in range(3):
            try:
                resp = await self.client.get(
                    self.SPACE_DYNAMIC_API,
                    params=params,
                    headers=self._build_headers(referer=self._space_dynamic_referer(author_id)),
                )
                if resp.status_code != 200:
                    raise ValueError(f"HTTP {resp.status_code}")

                data = resp.json()
                if data.get("code") != 0:
                    raise ValueError(data.get("message") or "获取作者空间动态失败")
                return data.get("data", {}) or {}
            except Exception as exc:
                last_error = exc
                if attempt < 2:
                    await asyncio.sleep(0.4 * (attempt + 1))
                    continue

        print(
            f"[bilibili-tool] Failed to fetch author space dynamics: author_id={author_id}, "
            f"offset={offset}, error={last_error}"
        )
        if last_error:
            raise last_error
        raise ValueError("获取作者空间动态失败")

    def _coerce_module_map(self, modules: Any) -> dict[str, Any]:
        if isinstance(modules, dict):
            return modules

        result: dict[str, Any] = {}
        if isinstance(modules, list):
            for entry in modules:
                if not isinstance(entry, dict):
                    continue
                for key, value in entry.items():
                    if key == "module_type" or not str(key).startswith("module_"):
                        continue
                    result[str(key)] = value
        return result

    def _parse_pub_ts(self, pub_ts: Any) -> Optional[datetime]:
        if not pub_ts:
            return None
        try:
            return datetime.fromtimestamp(int(pub_ts))
        except Exception:
            return None

    def _extract_space_dynamic_link(self, author_mod: dict[str, Any], dynamic_id: str) -> str:
        more = author_mod.get("more") or {}
        for item in more.get("three_point_items") or []:
            if item.get("type") != "THREE_POINT_COPY":
                continue
            link = str(((item.get("params") or {}).get("link")) or "").strip()
            if link:
                return self._normalize_url(link.split("?")[0])
        return f"https://t.bilibili.com/{dynamic_id}" if dynamic_id else ""

    def _is_meaningful_forward_comment(self, text: str) -> bool:
        normalized = str(text or "").strip()
        if not normalized:
            return False
        if normalized in {"分享动态", "分享视频", "转发动态"}:
            return False
        return not normalized.startswith("分享")

    def _parse_space_dynamic_item(
        self,
        item: dict[str, Any],
        *,
        override_author_name: str | None = None,
        override_author_id: str | None = None,
        override_desc_text: str | None = None,
        override_dynamic_id: str | None = None,
        override_published_at: Optional[datetime] = None,
        override_url: str | None = None,
    ) -> BiliDynamic | None:
        if not isinstance(item, dict) or not item.get("visible", True):
            return None

        item_type = item.get("type") or ""
        dynamic_id = str(override_dynamic_id or item.get("id_str") or "").strip()
        modules = self._coerce_module_map(item.get("modules") or {})
        author_mod = modules.get("module_author", {}) or {}
        desc_mod = modules.get("module_desc", {}) or {}
        dynamic_mod = modules.get("module_dynamic", {}) or {}
        user = author_mod.get("user", {}) or {}
        author = str(override_author_name or user.get("name") or "UP主").strip() or "UP主"
        author_id = str(override_author_id or user.get("mid") or "").strip()
        desc_text = str(
            override_desc_text if override_desc_text is not None else desc_mod.get("text") or ""
        ).strip()
        published_at = override_published_at or self._parse_pub_ts(author_mod.get("pub_ts"))
        fallback_url = str(
            override_url
            or self._extract_space_dynamic_link(author_mod, dynamic_id)
            or (f"https://t.bilibili.com/{dynamic_id}" if dynamic_id else "")
        ).strip()
        module_dynamic_type = dynamic_mod.get("type") or ""

        if item_type == "DYNAMIC_TYPE_AV" or module_dynamic_type == "MDL_DYN_TYPE_ARCHIVE":
            archive = dynamic_mod.get("dyn_archive", {}) or {}
            title = str(archive.get("title") or desc_text[:100]).strip()
            content = str(archive.get("desc") or desc_text).strip()
            bvid = str(archive.get("bvid") or "").strip()
            return BiliDynamic(
                id=f"bili-dyn-{dynamic_id}",
                dynamic_id=dynamic_id,
                title=title,
                content=content,
                author=author,
                author_id=author_id,
                url=fallback_url,
                published_at=published_at,
                dynamic_type="video",
                pic=self._normalize_url(archive.get("cover") or ""),
                bvid=bvid,
                tags=self._extract_inline_tags(title, content, desc_text),
            )

        if item_type == "DYNAMIC_TYPE_DRAW" or module_dynamic_type == "MDL_DYN_TYPE_DRAW":
            draw = dynamic_mod.get("dyn_draw", {}) or {}
            images = [
                self._normalize_url(pic.get("src") or pic.get("url") or "")
                for pic in (draw.get("items") or [])
                if self._normalize_url(pic.get("src") or pic.get("url") or "")
            ]
            content = desc_text
            return BiliDynamic(
                id=f"bili-dyn-{dynamic_id}",
                dynamic_id=dynamic_id,
                title=content[:100],
                content=content,
                author=author,
                author_id=author_id,
                url=fallback_url,
                published_at=published_at,
                dynamic_type="image",
                images=images,
                pic=images[0] if images else "",
                tags=self._extract_inline_tags(content),
            )

        if item_type == "DYNAMIC_TYPE_ARTICLE" or module_dynamic_type == "MDL_DYN_TYPE_ARTICLE":
            article = (
                dynamic_mod.get("dyn_article")
                or dynamic_mod.get("dyn_opus")
                or dynamic_mod.get("dyn_common_square")
                or {}
            )
            title = str(article.get("title") or desc_text[:100]).strip()
            summary = str(article.get("summary") or article.get("desc") or desc_text).strip()
            pic = self._normalize_url(
                article.get("cover") or article.get("banner_url") or article.get("image_url") or ""
            )
            return BiliDynamic(
                id=f"bili-dyn-{dynamic_id}",
                dynamic_id=dynamic_id,
                title=title,
                content=summary,
                author=author,
                author_id=author_id,
                url=fallback_url,
                published_at=published_at,
                dynamic_type="article",
                pic=pic,
                tags=self._extract_inline_tags(title, summary),
            )

        if item_type == "DYNAMIC_TYPE_FORWARD" or module_dynamic_type == "MDL_DYN_TYPE_FORWARD":
            forward = dynamic_mod.get("dyn_forward", {}) or {}
            original_item = forward.get("item") or {}
            parsed = self._parse_space_dynamic_item(
                original_item,
                override_author_name=author,
                override_author_id=author_id,
                override_dynamic_id=dynamic_id,
                override_published_at=published_at,
                override_url=fallback_url,
            )
            if parsed:
                if self._is_meaningful_forward_comment(desc_text):
                    original_content = str(parsed.content or "").strip()
                    merged_content = (
                        "\n\n".join([desc_text, f"转发内容：\n{original_content}".strip()]).strip()
                        if original_content
                        else desc_text
                    )
                    parsed.content = merged_content or parsed.content
                    parsed.tags = merge_tags(parsed.tags, self._extract_inline_tags(desc_text))
                parsed.id = f"bili-dyn-{dynamic_id}"
                parsed.dynamic_id = dynamic_id
                parsed.author = author
                parsed.author_id = author_id
                parsed.published_at = published_at or parsed.published_at
                parsed.url = fallback_url or parsed.url
                return parsed
            if desc_text:
                return BiliDynamic(
                    id=f"bili-dyn-{dynamic_id}",
                    dynamic_id=dynamic_id,
                    title=desc_text[:100],
                    content=desc_text,
                    author=author,
                    author_id=author_id,
                    url=fallback_url,
                    published_at=published_at,
                    dynamic_type="text",
                    tags=self._extract_inline_tags(desc_text),
                )
            return None

        if item_type == "DYNAMIC_TYPE_WORD" or module_dynamic_type in {"MDL_DYN_TYPE_WORD", "MDL_DYN_TYPE_NONE"}:
            content = desc_text
            if not content:
                return None
            return BiliDynamic(
                id=f"bili-dyn-{dynamic_id}",
                dynamic_id=dynamic_id,
                title=content[:100],
                content=content,
                author=author,
                author_id=author_id,
                url=fallback_url,
                published_at=published_at,
                dynamic_type="text",
                tags=self._extract_inline_tags(content),
            )

        return None

    async def _fetch_space_author_dynamics(
        self,
        author_id: str,
        *,
        allowed_dynamic_types: set[str],
        keywords: list[str] | None,
        tag_filters: list[str] | None,
        scan_result_limit: int,
        stop_result_limit: int | None = None,
        days_back: int,
        page_limit: int | None = None,
        scan_cutoff_days: int | None = None,
        collect_all_until_cutoff: bool = False,
    ) -> list[BiliDynamic]:
        clean_author_id = str(author_id or "").strip()
        if not clean_author_id:
            return []

        reference_time = self._fetch_reference_time or datetime.now()
        effective_days_back = max(1, int(days_back or 1))
        effective_scan_days_back = self._resolve_scan_days_back(
            days_back=effective_days_back,
            keywords=keywords,
            tag_filters=tag_filters,
            scan_cutoff_days=scan_cutoff_days,
        )
        result_cutoff = reference_time - timedelta(days=effective_days_back)
        scan_cutoff = reference_time - timedelta(days=effective_scan_days_back)
        results: list[BiliDynamic] = []
        seen_ids: set[str] = set()
        offset: str | None = None
        effective_scan_limit = (
            self._resolve_collect_limit(
                page_limit=page_limit,
                page_size=SPACE_DYNAMIC_PAGE_SIZE,
            )
            if collect_all_until_cutoff
            else self._normalize_keep_limit(scan_result_limit)
        )
        effective_stop_limit = (
            effective_scan_limit
            if collect_all_until_cutoff
            else (
                min(
                    effective_scan_limit,
                    self._normalize_keep_limit(stop_result_limit, effective_scan_limit),
                )
                if stop_result_limit is not None
                else effective_scan_limit
            )
        )
        pages_scanned = 0
        pages_with_recent_candidates = 0
        max_pages = self._resolve_runtime_page_budget(page_limit)
        partial_error: str | None = None

        for page in range(1, max_pages + 1):
            if self._targeted_shared_stop_reached():
                break
            try:
                page_data = await self._fetch_space_dynamic_page(clean_author_id, offset=offset)
            except Exception as exc:
                partial_error = f"author={clean_author_id} page={page} error={exc}"
                if results:
                    print(
                        f"[bilibili-tool] Stop author-space crawl early with partial results: "
                        f"{partial_error}"
                    )
                    break
                raise
            items = page_data.get("items", []) or []
            if not items:
                break
            pages_scanned += 1

            page_recent_count = 0
            page_new_count = 0
            page_has_recent_candidates = False
            page_type_counts: dict[str, int] = {}

            for item in items:
                if self._targeted_shared_stop_reached():
                    break
                item_type = item.get("type") or ""
                page_type_counts[item_type] = page_type_counts.get(item_type, 0) + 1
                item_modules = self._coerce_module_map(item.get("modules") or {})
                item_author_mod = item_modules.get("module_author", {}) or {}
                item_published_at = self._parse_pub_ts(item_author_mod.get("pub_ts"))
                if item_published_at is None or item_published_at >= scan_cutoff:
                    page_has_recent_candidates = True
                    page_recent_count += 1
                dynamic = self._parse_space_dynamic_item(item)
                if not dynamic:
                    continue
                if dynamic.dynamic_type not in allowed_dynamic_types:
                    continue
                if dynamic.dynamic_type == "video":
                    dynamic = await self._enrich_video_dynamic(dynamic)
                matched_keywords, matched_tags = self._resolve_match_metadata(dynamic, keywords, tag_filters)
                if (keywords or tag_filters) and not (matched_keywords or matched_tags):
                    continue
                if dynamic.published_at and dynamic.published_at < result_cutoff:
                    continue
                if dynamic.dynamic_id in seen_ids:
                    continue

                dynamic.matched_keywords = matched_keywords
                dynamic.matched_tags = matched_tags
                seen_ids.add(dynamic.dynamic_id)
                results.append(dynamic)
                self._record_targeted_shared_match()
                page_new_count += 1

                if len(results) >= effective_stop_limit or self._targeted_shared_stop_reached():
                    break

            print(
                f"[bilibili-tool] Space page author={clean_author_id} page={page}: total_items={len(items)}, "
                f"recent_candidates={page_recent_count}, matched={page_new_count}, "
                f"offset={page_data.get('offset')}, types={page_type_counts}"
            )
            if page_has_recent_candidates:
                pages_with_recent_candidates += 1

            if len(results) >= effective_stop_limit or self._targeted_shared_stop_reached():
                break

            offset = page_data.get("offset")
            if not page_data.get("has_more") or not offset:
                break
            if not page_has_recent_candidates:
                break

            await asyncio.sleep(0.3)

        results.sort(key=lambda x: x.published_at or datetime.min, reverse=True)
        self._space_fetch_stats_cache[clean_author_id] = {
            "pages_scanned": pages_scanned,
            "pages_with_recent_candidates": pages_with_recent_candidates,
            "matched_count_before_keep": len(results),
            "scan_result_limit": effective_scan_limit,
            "stop_result_limit": effective_stop_limit,
            "scan_days_back": effective_scan_days_back,
            "reference_time": reference_time.isoformat(),
            "partial_results": bool(partial_error),
            "partial_error": partial_error or "",
        }
        return results[:effective_stop_limit]

    async def _fetch_targeted_author_dynamics(
        self,
        *,
        author_ids: list[str],
        allowed_dynamic_types: set[str],
        keywords: list[str] | None,
        tag_filters: list[str] | None,
        result_limit: int,
        days_back: int,
        page_limit: int | None = None,
        monitor_label: str | None = None,
        monitor_subfolder: str | None = None,
        scan_cutoff_days: int | None = None,
        collect_all_until_cutoff: bool = False,
    ) -> list[BiliDynamic]:
        clean_author_ids = [
            str(author_id).strip()
            for author_id in author_ids
            if str(author_id).strip()
        ]
        if not clean_author_ids or not allowed_dynamic_types:
            return []

        author_count = len(clean_author_ids)
        effective_result_limit = (
            self._resolve_collect_limit(
                page_limit=page_limit,
                page_size=SPACE_DYNAMIC_PAGE_SIZE,
                author_count=author_count,
            )
            if collect_all_until_cutoff
            else self._normalize_keep_limit(result_limit)
        )
        per_author_scan_limit = (
            self._resolve_collect_limit(
                page_limit=page_limit,
                page_size=SPACE_DYNAMIC_PAGE_SIZE,
            )
            if collect_all_until_cutoff
            else self._resolve_targeted_author_scan_limit(
                author_count=author_count,
                result_limit=effective_result_limit,
                days_back=days_back,
            )
        )
        per_author_stop_limit = (
            per_author_scan_limit
            if collect_all_until_cutoff
            else min(per_author_scan_limit, effective_result_limit)
        )
        concurrency = min(4, max(1, author_count))
        semaphore = asyncio.Semaphore(concurrency)
        errors: list[tuple[str, Exception]] = []
        self._targeted_shared_stop_state = (
            {
                "stop_limit": effective_result_limit,
                "matched_count": 0,
            }
            if author_count > 1 and not collect_all_until_cutoff
            else None
        )

        try:
            async def fetch_one(author_id: str) -> list[BiliDynamic]:
                async with semaphore:
                    try:
                        return await self._fetch_space_author_dynamics(
                            author_id,
                            allowed_dynamic_types=allowed_dynamic_types,
                            keywords=keywords,
                            tag_filters=tag_filters,
                            scan_result_limit=per_author_scan_limit,
                            stop_result_limit=per_author_stop_limit,
                            days_back=days_back,
                            page_limit=page_limit,
                            scan_cutoff_days=scan_cutoff_days,
                            collect_all_until_cutoff=collect_all_until_cutoff,
                        )
                    except Exception as exc:
                        errors.append((author_id, exc))
                        print(f"[bilibili-tool] Failed to crawl author space: author_id={author_id}, error={exc}")
                        return []

            batches = await asyncio.gather(*(fetch_one(author_id) for author_id in clean_author_ids))
        finally:
            self._targeted_shared_stop_state = None

        normalized_batches = [
            sorted(batch, key=lambda x: x.published_at or datetime.min, reverse=True)
            for batch in batches
            if batch
        ]
        normalized_batches.sort(
            key=lambda batch: batch[0].published_at or datetime.min,
            reverse=True,
        )
        candidate_seen_ids: set[str] = set()
        matched_count_before_keep = 0
        for batch in normalized_batches:
            for dynamic in batch:
                if dynamic.dynamic_id in candidate_seen_ids:
                    continue
                candidate_seen_ids.add(dynamic.dynamic_id)
                matched_count_before_keep += 1

        all_dynamics: list[BiliDynamic] = []
        seen_ids: set[str] = set()
        if collect_all_until_cutoff:
            for batch in normalized_batches:
                for dynamic in batch:
                    if dynamic.dynamic_id in seen_ids:
                        continue
                    seen_ids.add(dynamic.dynamic_id)
                    all_dynamics.append(dynamic)
                    if len(all_dynamics) >= effective_result_limit:
                        break
                if len(all_dynamics) >= effective_result_limit:
                    break
        elif author_count > 1 and normalized_batches:
            batch_indexes = [0 for _ in normalized_batches]
            while len(all_dynamics) < effective_result_limit:
                progressed = False
                for batch_index, batch in enumerate(normalized_batches):
                    while batch_indexes[batch_index] < len(batch):
                        dynamic = batch[batch_indexes[batch_index]]
                        batch_indexes[batch_index] += 1
                        if dynamic.dynamic_id in seen_ids:
                            continue
                        seen_ids.add(dynamic.dynamic_id)
                        all_dynamics.append(dynamic)
                        progressed = True
                        break
                    if len(all_dynamics) >= effective_result_limit:
                        break
                if not progressed:
                    break
        else:
            for batch in normalized_batches:
                for dynamic in batch:
                    if dynamic.dynamic_id in seen_ids:
                        continue
                    seen_ids.add(dynamic.dynamic_id)
                    all_dynamics.append(dynamic)
                    if len(all_dynamics) >= effective_result_limit:
                        break
                if len(all_dynamics) >= effective_result_limit:
                    break

        for dynamic in all_dynamics:
            dynamic.monitor_label = str(monitor_label or "").strip()
            dynamic.crawl_source = "daily-monitor" if dynamic.monitor_label else ""
            dynamic.monitor_subfolder = resolve_bilibili_dynamic_monitor_subfolder(
                author=dynamic.author,
                monitor_subfolder=monitor_subfolder,
                monitor_label=dynamic.monitor_label,
                crawl_source=dynamic.crawl_source,
            )
            dynamic.crawl_source_label = dynamic.monitor_label

        all_dynamics.sort(key=lambda x: x.published_at or datetime.min, reverse=True)
        if not all_dynamics and errors and author_count == 1:
            raise errors[0][1]

        aggregated_space_stats = [
            self._space_fetch_stats_cache.get(author_id, {})
            for author_id in clean_author_ids
        ]
        partial_errors = [
            str(stats.get("partial_error") or "").strip()
            for stats in aggregated_space_stats
            if str(stats.get("partial_error") or "").strip()
        ]
        self._last_fetch_stats = {
            "source": "author-space",
            "pages_scanned": sum(int(stats.get("pages_scanned") or 0) for stats in aggregated_space_stats),
            "pages_with_recent_candidates": sum(
                int(stats.get("pages_with_recent_candidates") or 0) for stats in aggregated_space_stats
            ),
            "matched_count_before_keep": matched_count_before_keep,
            "kept_count": min(len(all_dynamics), effective_result_limit),
            "keep_limit": effective_result_limit,
            "scan_result_limit": per_author_scan_limit,
            "stop_result_limit": per_author_stop_limit,
            "scanned_author_count": author_count,
            "authors_with_hits": sum(1 for batch in normalized_batches if batch),
            "scan_days_back": self._resolve_scan_days_back(
                days_back=days_back,
                keywords=keywords,
                tag_filters=tag_filters,
                scan_cutoff_days=scan_cutoff_days,
            ),
            "reference_time": (
                str((aggregated_space_stats[0] or {}).get("reference_time") or "").strip()
                if aggregated_space_stats
                else ""
            ),
            "partial_results": len(partial_errors) > 0,
            "partial_error": " | ".join(partial_errors[:3]),
        }
        print(
            f"[bilibili-tool] Targeted author-space total: {len(all_dynamics)} dynamics "
            f"from {author_count} authors, per_author_scan_limit={per_author_scan_limit}, "
            f"keep_limit={effective_result_limit}, collect_all={collect_all_until_cutoff}, errors={len(errors)}"
        )
        return all_dynamics[:effective_result_limit]

    async def fetch_followed_dynamics(
        self,
        dynamic_types: list[int] = None,
        keywords: list[str] = None,
        tag_filters: list[str] | None = None,
        author_ids: list[str] | None = None,
        limit: int | None = 20,
        days_back: int = 7,
        page_limit: int | None = None,
        monitor_label: str | None = None,
        monitor_subfolder: str | None = None,
        scan_cutoff_days: int | None = None,
        collect_all_until_cutoff: bool = False,
    ) -> list[BiliDynamic]:
        """获取关注列表的动态。"""
        if not self.sessdata:
            raise ValueError("SESSDATA is required to fetch followed dynamics")
        self._last_fetch_stats = {}
        self._space_fetch_stats_cache = {}

        if dynamic_types is None:
            dynamic_types = [8, 2, 4, 64]

        VALID_TYPES = {1, 2, 4, 8, 64}
        valid_types = [t for t in dynamic_types if t in VALID_TYPES]
        type_name_map = {
            1: "forward",
            2: "image",
            4: "text",
            8: "video",
            64: "article",
        }

        effective_days_back = max(1, int(days_back or 1))
        effective_scan_days_back = self._resolve_scan_days_back(
            days_back=effective_days_back,
            keywords=keywords,
            tag_filters=tag_filters,
            scan_cutoff_days=scan_cutoff_days,
        )
        effective_limit = (
            self._resolve_collect_limit(
                page_limit=page_limit,
                page_size=SPACE_DYNAMIC_PAGE_SIZE,
                author_count=max(1, len(author_ids or [])),
            )
            if collect_all_until_cutoff and author_ids
            else (
                self._resolve_collect_limit(
                    page_limit=page_limit,
                    page_size=FOLLOWED_DYNAMIC_PAGE_SIZE,
                )
                if collect_all_until_cutoff
                else self._normalize_keep_limit(limit)
            )
        )
        print(
            f"[bilibili-tool] Fetching types: {valid_types}, keep_limit={effective_limit}, "
            f"days_back={effective_days_back}, scan_days_back={effective_scan_days_back}, "
            f"page_limit={page_limit}, collect_all={collect_all_until_cutoff}"
        )

        if not valid_types:
            return []

        reference_time = datetime.now()
        self._fetch_reference_time = reference_time

        type_map = {
            1: "DYNAMIC_TYPE_FORWARD",
            2: "DYNAMIC_TYPE_DRAW",
            4: "DYNAMIC_TYPE_WORD",
            8: "DYNAMIC_TYPE_AV",
            64: "DYNAMIC_TYPE_ARTICLE",
        }
        allowed_type_names = {type_map[t] for t in valid_types if t in type_map}
        allowed_author_ids = {
            str(author_id).strip()
            for author_id in (author_ids or [])
            if str(author_id).strip()
        }
        try:
            if allowed_author_ids:
                allowed_author_dynamic_types = {
                    type_name_map[t]
                    for t in valid_types
                    if t in type_name_map and type_name_map[t] != "forward"
                }
                if not allowed_author_dynamic_types and 1 in valid_types:
                    allowed_author_dynamic_types = {"video", "image", "text", "article"}
                return await self._fetch_targeted_author_dynamics(
                    author_ids=sorted(allowed_author_ids),
                    allowed_dynamic_types=allowed_author_dynamic_types,
                    keywords=keywords,
                    tag_filters=tag_filters,
                    result_limit=effective_limit,
                    days_back=effective_days_back,
                    page_limit=page_limit,
                    monitor_label=monitor_label,
                    monitor_subfolder=monitor_subfolder,
                    scan_cutoff_days=scan_cutoff_days,
                    collect_all_until_cutoff=collect_all_until_cutoff,
                )

            result_cutoff = reference_time - timedelta(days=effective_days_back)
            scan_cutoff = reference_time - timedelta(days=effective_scan_days_back)

            all_dynamics: list[BiliDynamic] = []
            seen_ids = set()
            offset: str | None = None
            effective_scan_limit = self._resolve_global_scan_limit(
                result_limit=effective_limit,
                days_back=effective_scan_days_back,
            )
            effective_stop_limit = effective_limit
            pages_scanned = 0
            pages_with_recent_candidates = 0
            max_pages = self._resolve_runtime_page_budget(page_limit)
            partial_error: str | None = None

            for page in range(1, max_pages + 1):
                try:
                    page_data = await self._fetch_polymer_page(offset=offset)
                except Exception as exc:
                    partial_error = f"page={page} error={exc}"
                    if all_dynamics:
                        print(
                            f"[bilibili-tool] Stop global-followed crawl early with partial results: "
                            f"{partial_error}"
                        )
                        break
                    raise
                items = page_data.get("items", []) or []
                if not items:
                    break
                pages_scanned += 1

                page_new_count = 0
                page_recent_count = 0
                page_author_hit_count = 0
                page_has_recent_candidates = False
                page_type_counts: dict[str, int] = {}

                for item in items:
                    item_type = item.get("type") or ""
                    page_type_counts[item_type] = page_type_counts.get(item_type, 0) + 1
                    if item_type not in allowed_type_names:
                        continue

                    dynamic = self._parse_polymer_item(item)
                    if not dynamic:
                        continue
                    if dynamic.published_at is None or dynamic.published_at >= scan_cutoff:
                        page_has_recent_candidates = True
                        page_recent_count += 1
                    if allowed_author_ids and str(dynamic.author_id or "").strip() not in allowed_author_ids:
                        continue
                    if allowed_author_ids:
                        page_author_hit_count += 1
                    if dynamic.dynamic_type == "video":
                        dynamic = await self._enrich_video_dynamic(dynamic)
                    matched_keywords, matched_tags = self._resolve_match_metadata(dynamic, keywords, tag_filters)
                    if (keywords or tag_filters) and not (matched_keywords or matched_tags):
                        continue
                    if dynamic.published_at and dynamic.published_at < result_cutoff:
                        continue

                    dynamic.matched_keywords = matched_keywords
                    dynamic.matched_tags = matched_tags
                    dynamic.monitor_label = str(monitor_label or "").strip()
                    dynamic.crawl_source = "daily-monitor" if dynamic.monitor_label else ""
                    dynamic.monitor_subfolder = resolve_bilibili_dynamic_monitor_subfolder(
                        author=dynamic.author,
                        monitor_subfolder=monitor_subfolder,
                        monitor_label=dynamic.monitor_label,
                        crawl_source=dynamic.crawl_source,
                    )
                    dynamic.crawl_source_label = dynamic.monitor_label

                    if dynamic.dynamic_id in seen_ids:
                        continue

                    seen_ids.add(dynamic.dynamic_id)
                    all_dynamics.append(dynamic)
                    page_new_count += 1

                    if len(all_dynamics) >= effective_stop_limit:
                        break

                print(
                    f"[bilibili-tool] Polymer page {page}: total_items={len(items)}, "
                    f"recent_candidates={page_recent_count}, author_hits={page_author_hit_count}, "
                    f"matched={page_new_count}, offset={page_data.get('offset')}, "
                    f"types={page_type_counts}"
                )
                if page_has_recent_candidates:
                    pages_with_recent_candidates += 1

                if len(all_dynamics) >= effective_stop_limit:
                    break

                offset = page_data.get("offset")
                if not page_data.get("has_more") or not offset:
                    break
                if not page_has_recent_candidates:
                    break

                await asyncio.sleep(0.3)

            all_dynamics.sort(key=lambda x: x.published_at or datetime.min, reverse=True)
            print(f"[bilibili-tool] Total: {len(all_dynamics)} dynamics (after pagination)")
            self._last_fetch_stats = {
                "source": "global-followed",
                "pages_scanned": pages_scanned,
                "pages_with_recent_candidates": pages_with_recent_candidates,
                "matched_count_before_keep": len(all_dynamics),
                "kept_count": min(len(all_dynamics), effective_limit),
                "keep_limit": effective_limit,
                "scan_result_limit": effective_scan_limit,
                "stop_result_limit": effective_stop_limit,
                "scanned_author_count": 0,
                "authors_with_hits": 0,
                "scan_days_back": effective_scan_days_back,
                "reference_time": reference_time.isoformat(),
                "partial_results": bool(partial_error),
                "partial_error": partial_error or "",
            }
            return all_dynamics[:effective_limit]
        finally:
            self._fetch_reference_time = None

    async def _enrich_video_dynamic(self, dynamic: BiliDynamic) -> BiliDynamic:
        bvid = dynamic.bvid or extract_bvid(dynamic.url)
        if not bvid:
            return dynamic

        if bvid not in self._video_meta_cache:
            try:
                self._video_meta_cache[bvid] = await fetch_bilibili_video_metadata(
                    self.client,
                    bvid=bvid,
                    headers=self._build_headers(referer=dynamic.url or f"https://www.bilibili.com/video/{bvid}"),
                    referer=dynamic.url or f"https://www.bilibili.com/video/{bvid}",
                )
            except Exception as exc:
                print(f"[bilibili-tool] Failed to enrich video {bvid}: {exc}")
                self._video_meta_cache[bvid] = {}

        metadata = self._video_meta_cache.get(bvid) or {}
        dynamic.bvid = metadata.get("bvid") or dynamic.bvid or bvid
        dynamic.title = metadata.get("title") or dynamic.title
        detail_desc = str(metadata.get("description") or "").strip()
        if detail_desc and len(detail_desc) >= len(dynamic.content or ""):
            dynamic.content = detail_desc
        if not str(dynamic.author or "").strip():
            dynamic.author = metadata.get("author") or dynamic.author
        if not str(dynamic.url or "").strip():
            dynamic.url = metadata.get("url") or dynamic.url
        dynamic.pic = metadata.get("cover") or dynamic.pic
        dynamic.tags = merge_tags(dynamic.tags, metadata.get("tags") or [])

        pub_ts = metadata.get("published_at_ts")
        if pub_ts and not dynamic.published_at:
            try:
                dynamic.published_at = datetime.fromtimestamp(int(pub_ts))
            except Exception:
                pass
        return dynamic

    async def _get_self_mid(self) -> str:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Cookie": f"SESSDATA={self.sessdata}",
            "Referer": "https://www.bilibili.com/",
        }
        resp = await self.client.get(self.NAV_API, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise ValueError(data.get("message", "获取 Bilibili 登录信息失败"))
        mid = data.get("data", {}).get("mid")
        if not mid:
            raise ValueError("未能从 Bilibili 登录信息中获取 mid")
        return str(mid)

    async def fetch_followed_ups(
        self,
        max_count: int = 5000,
        progress_callback=None,
    ) -> list[BiliFollowedUp]:
        """获取关注的 UP 列表"""
        if not self.sessdata:
            raise ValueError("SESSDATA is required to fetch followed users")

        vmid = await self._get_self_mid()
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Cookie": f"SESSDATA={self.sessdata}",
            "Referer": f"https://space.bilibili.com/{vmid}/fans/follow",
        }

        page = 1
        page_size = 50
        results: list[BiliFollowedUp] = []

        if progress_callback:
            progress_callback(
                {
                    "stage": "正在读取关注列表",
                    "current_page": 0,
                    "page_size": page_size,
                    "fetched_count": 0,
                }
            )

        while len(results) < max_count:
            params = {
                "vmid": vmid,
                "pn": page,
                "ps": page_size,
                "order_type": "attention",
            }
            data = None
            for attempt in range(4):
                resp = await self.client.get(self.FOLLOWINGS_API, params=params, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                if data.get("code") == 0:
                    break
                if data.get("code") == -352 and attempt < 3:
                    await asyncio.sleep(1.5 * (attempt + 1))
                    continue
                raise ValueError(data.get("message", "获取关注列表失败"))

            items = (data or {}).get("data", {}).get("list", []) or []
            if not items:
                break

            for item in items:
                results.append(
                    BiliFollowedUp(
                        mid=str(item.get("mid", "")),
                        uname=item.get("uname") or "UP主",
                        face=item.get("face") or "",
                        sign=item.get("sign") or "",
                        official_desc=(item.get("official_verify") or {}).get("desc", "") or "",
                        special=int(item.get("special") or 0),
                        tag_ids=[int(tag_id) for tag_id in (item.get("tag") or []) if str(tag_id).lstrip("-").isdigit()],
                    )
                )
                if len(results) >= max_count:
                    break

            if progress_callback:
                progress_callback(
                    {
                        "stage": f"已抓取第 {page} 页",
                        "current_page": page,
                        "page_size": page_size,
                        "fetched_count": len(results),
                    }
                )

            if len(items) < page_size:
                break
            await asyncio.sleep(0.8)
            page += 1

        return results

    async def fetch_followed_tags(self) -> list[dict]:
        """获取原生关注分组列表"""
        if not self.sessdata:
            raise ValueError("SESSDATA is required to fetch followed tags")

        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Cookie": f"SESSDATA={self.sessdata}",
            "Referer": "https://space.bilibili.com/",
        }
        resp = await self.client.get(self.TAGS_API, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise ValueError(data.get("message", "获取原生关注分组失败"))

        tags = []
        for item in data.get("data", []) or []:
            tag_id = item.get("tagid")
            if tag_id is None:
                continue
            tags.append(
                {
                    "tag_id": int(tag_id),
                    "name": item.get("name") or "未命名分组",
                    "count": int(item.get("count") or 0),
                    "tip": item.get("tip") or "",
                }
            )
        return tags

    async def fetch_up_recent_videos(self, uid: str, limit: int = 3) -> list[dict[str, Any]]:
        """获取指定 UP 最近视频，并尽量补充视频标签。"""
        clean_uid = str(uid or "").strip()
        if not clean_uid:
            return []

        try:
            img_key, sub_key = await get_wbi_keys()
        except Exception as exc:
            print(f"[bilibili-tool] Failed to load WBI keys for uid={clean_uid}: {exc}")
            return []

        params = {
            "mid": clean_uid,
            "ps": max(limit * 2, limit, 6),
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
        api_url = "https://api.bilibili.com/x/space/wbi/arc/search"
        referer = f"https://space.bilibili.com/{clean_uid}/video"

        try:
            resp = await self.client.get(
                api_url,
                params=signed,
                headers=self._build_headers(referer=referer),
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            print(f"[bilibili-tool] Failed to fetch recent videos for uid={clean_uid}: {exc}")
            return []

        if data.get("code") != 0:
            print(f"[bilibili-tool] WBI API error for uid={clean_uid}: {data.get('message')}")
            return []

        videos: list[dict[str, Any]] = []
        vlist = (((data.get("data") or {}).get("list") or {}).get("vlist")) or []
        for video in vlist:
            bvid = str(video.get("bvid") or "").strip()
            if not bvid:
                continue

            if bvid not in self._video_meta_cache:
                try:
                    self._video_meta_cache[bvid] = await fetch_bilibili_video_metadata(
                        self.client,
                        bvid=bvid,
                        headers=self._build_headers(referer=f"https://www.bilibili.com/video/{bvid}"),
                        referer=f"https://www.bilibili.com/video/{bvid}",
                    )
                except Exception as exc:
                    print(f"[bilibili-tool] Failed to fetch metadata for {bvid}: {exc}")
                    self._video_meta_cache[bvid] = {}

            metadata = dict(self._video_meta_cache.get(bvid) or {})
            published_at = ""
            created_ts = video.get("created") or metadata.get("published_at_ts") or 0
            if created_ts:
                try:
                    published_at = datetime.fromtimestamp(int(created_ts)).isoformat()
                except Exception:
                    published_at = ""

            videos.append(
                {
                    "uid": clean_uid,
                    "author": str(metadata.get("author") or video.get("author") or "").strip(),
                    "title": str(metadata.get("title") or video.get("title") or "").strip(),
                    "description": str(metadata.get("description") or video.get("description") or "").strip(),
                    "url": str(metadata.get("url") or f"https://www.bilibili.com/video/{bvid}"),
                    "bvid": bvid,
                    "published_at": published_at,
                    "tags": merge_tags(
                        [str(tag).strip() for tag in metadata.get("tags") or [] if str(tag).strip()],
                        [str(tag).strip() for tag in video.get("tags") or [] if str(tag).strip()],
                    ),
                }
            )
            if len(videos) >= limit:
                break

        return videos

    def _parse_dynamic_card(
        self,
        card: dict,
        keywords: list[str] = None,
    ) -> BiliDynamic | None:
        """解析动态卡片"""
        desc = card.get("desc", {})
        dynamic_id = str(desc.get("dynamic_id", ""))
        dynamic_type = desc.get("type", 0)

        # 解析卡片内容
        try:
            card_content = json.loads(card.get("card", "{}"))
        except json.JSONDecodeError:
            card_content = {}

        # 根据类型解析
        if dynamic_type == 8:  # 视频
            return self._parse_video_card(dynamic_id, desc, card_content, keywords)
        elif dynamic_type == 2:  # 图文
            return self._parse_image_card(dynamic_id, desc, card_content, keywords)
        elif dynamic_type == 4:  # 纯文字
            return self._parse_text_card(dynamic_id, desc, card_content, keywords)
        elif dynamic_type == 64:  # 专栏
            return self._parse_article_card(dynamic_id, desc, card_content, keywords)

        return None

    def _parse_polymer_item(
        self,
        item: dict,
    ) -> BiliDynamic | None:
        item_type = item.get("type") or ""
        dynamic_id = str(item.get("id_str") or "")
        modules = item.get("modules", {}) or {}
        author_mod = modules.get("module_author", {}) or {}
        dynamic_mod = modules.get("module_dynamic", {}) or {}
        major = dynamic_mod.get("major", {}) or {}
        major_type = major.get("type") or ""
        author = author_mod.get("name") or "UP主"
        author_id = str(author_mod.get("mid") or "")
        desc_text = ((dynamic_mod.get("desc") or {}).get("text")) or ""

        published_at = None
        pub_ts = author_mod.get("pub_ts")
        if pub_ts:
            try:
                published_at = datetime.fromtimestamp(int(pub_ts))
            except Exception:
                published_at = None

        if item_type == "DYNAMIC_TYPE_AV":
            archive = major.get("archive", {}) or {}
            title = archive.get("title") or desc_text[:100]
            content = archive.get("desc") or desc_text
            bvid = archive.get("bvid") or ""
            return BiliDynamic(
                id=f"bili-dyn-{dynamic_id}",
                dynamic_id=dynamic_id,
                title=title,
                content=content,
                author=author,
                author_id=author_id,
                url=self._normalize_url(archive.get("jump_url")) or f"https://www.bilibili.com/video/{bvid}",
                published_at=published_at,
                dynamic_type="video",
                pic=archive.get("cover") or "",
                bvid=bvid,
                tags=self._extract_inline_tags(title, content),
            )

        if item_type in {"DYNAMIC_TYPE_DRAW", "DYNAMIC_TYPE_ARTICLE"}:
            opus = major.get("opus", {}) if major_type == "MAJOR_TYPE_OPUS" else {}
            summary = (opus.get("summary") or {}).get("text") or desc_text
            title = opus.get("title") or summary[:100]
            pics = opus.get("pics") or []
            images = [pic.get("url") for pic in pics if pic.get("url")]
            dynamic_type = "article" if item_type == "DYNAMIC_TYPE_ARTICLE" else "image"
            return BiliDynamic(
                id=f"bili-dyn-{dynamic_id}",
                dynamic_id=dynamic_id,
                title=title,
                content=summary,
                author=author,
                author_id=author_id,
                url=self._normalize_url(opus.get("jump_url")) or f"https://www.bilibili.com/opus/{dynamic_id}",
                published_at=published_at,
                dynamic_type=dynamic_type,
                images=images,
                pic=images[0] if images else "",
                tags=self._extract_inline_tags(title, summary),
            )

        if item_type == "DYNAMIC_TYPE_WORD":
            content = desc_text
            return BiliDynamic(
                id=f"bili-dyn-{dynamic_id}",
                dynamic_id=dynamic_id,
                title=content[:100],
                content=content,
                author=author,
                author_id=author_id,
                url=f"https://t.bilibili.com/{dynamic_id}",
                published_at=published_at,
                dynamic_type="text",
                tags=self._extract_inline_tags(content),
            )

        return None

    def _parse_video_card(
        self, dynamic_id: str, desc: dict, card: dict, keywords: list[str]
    ) -> BiliDynamic | None:
        """解析视频动态"""
        title = card.get("title", "")
        desc_text = card.get("desc", "")
        bvid = card.get("bvid", "")

        up_name = desc.get("user_profile", {}).get("uname", "UP主")
        up_uid = str(desc.get("user_profile", {}).get("uid", ""))
        timestamp = desc.get("timestamp", 0)

        return BiliDynamic(
            id=f"bili-dyn-{dynamic_id}",
            dynamic_id=dynamic_id,
            title=title,
            content=desc_text,
            author=up_name,
            author_id=up_uid,
            url=f"https://www.bilibili.com/video/{bvid}",
            published_at=datetime.fromtimestamp(timestamp) if timestamp else None,
            dynamic_type="video",
            pic=card.get("pic", ""),
            bvid=bvid,
            tags=self._extract_inline_tags(title, desc_text),
        )

    def _parse_image_card(
        self, dynamic_id: str, desc: dict, card: dict, keywords: list[str]
    ) -> BiliDynamic | None:
        """解析图文动态"""
        item = card.get("item") or {}
        description = item.get("description", "")

        up_name = desc.get("user_profile", {}).get("uname", "UP主")
        up_uid = str(desc.get("user_profile", {}).get("uid", ""))
        timestamp = desc.get("timestamp", 0)

        pictures = item.get("pictures") or []
        images = [p.get("img_src", "") for p in pictures if p.get("img_src")]

        return BiliDynamic(
            id=f"bili-dyn-{dynamic_id}",
            dynamic_id=dynamic_id,
            title=description[:100],
            content=description,
            author=up_name,
            author_id=up_uid,
            url=f"https://t.bilibili.com/{dynamic_id}",
            published_at=datetime.fromtimestamp(timestamp) if timestamp else None,
            dynamic_type="image",
            images=images,
            tags=self._extract_inline_tags(description),
        )

    def _parse_text_card(
        self, dynamic_id: str, desc: dict, card: dict, keywords: list[str]
    ) -> BiliDynamic | None:
        """解析纯文字动态"""
        item = card.get("item") or {}
        content = item.get("content", "")

        up_name = desc.get("user_profile", {}).get("uname", "UP主")
        up_uid = str(desc.get("user_profile", {}).get("uid", ""))
        timestamp = desc.get("timestamp", 0)

        return BiliDynamic(
            id=f"bili-dyn-{dynamic_id}",
            dynamic_id=dynamic_id,
            title=content[:100],
            content=content,
            author=up_name,
            author_id=up_uid,
            url=f"https://t.bilibili.com/{dynamic_id}",
            published_at=datetime.fromtimestamp(timestamp) if timestamp else None,
            dynamic_type="text",
            tags=self._extract_inline_tags(content),
        )

    def _parse_article_card(
        self, dynamic_id: str, desc: dict, card: dict, keywords: list[str]
    ) -> BiliDynamic | None:
        """解析专栏文章动态"""
        title = card.get("title", "")
        summary = card.get("summary", "")

        up_name = desc.get("user_profile", {}).get("uname", "UP主")
        up_uid = str(desc.get("user_profile", {}).get("uid", ""))
        timestamp = desc.get("timestamp", 0)
        cvid = card.get("id", "")

        return BiliDynamic(
            id=f"bili-dyn-{dynamic_id}",
            dynamic_id=dynamic_id,
            title=title,
            content=summary,
            author=up_name,
            author_id=up_uid,
            url=f"https://www.bilibili.com/read/cv{cvid}",
            published_at=datetime.fromtimestamp(timestamp) if timestamp else None,
            dynamic_type="article",
            pic=card.get("banner_url", ""),
            tags=self._extract_inline_tags(title, summary),
        )

    async def close(self):
        await self.client.aclose()


def _serialize_dynamics(dynamics: list[BiliDynamic]) -> list[dict[str, Any]]:
    return [
        {
            "id": d.id,
            "dynamic_id": d.dynamic_id,
            "title": d.title,
            "content": d.content or "",
            "author": d.author,
            "author_id": d.author_id,
            "url": d.url,
            "published_at": d.published_at.isoformat() if d.published_at else None,
            "dynamic_type": d.dynamic_type,
            "pic": d.pic,
            "images": d.images,
            "bvid": d.bvid,
            "tags": d.tags,
            "matched_keywords": d.matched_keywords,
            "matched_tags": d.matched_tags,
            "monitor_label": d.monitor_label,
            "monitor_subfolder": d.monitor_subfolder,
            "crawl_source": d.crawl_source,
            "crawl_source_label": d.crawl_source_label,
        }
        for d in dynamics
    ]


# === 公开工具函数 ===


async def bilibili_fetch_followed(
    sessdata: str,
    keywords: list[str] = None,
    tag_filters: list[str] | None = None,
    dynamic_types: list[int] = None,
    author_ids: list[str] | None = None,
    limit: int | None = 20,
    days_back: int = 7,
    page_limit: int | None = None,
    monitor_label: str | None = None,
    monitor_subfolder: str | None = None,
    scan_cutoff_days: int | None = None,
    collect_all_until_cutoff: bool = False,
) -> dict:
    """
    获取关注列表的动态（带关键词过滤）
    """
    effective_limit = (
        max(1, int(limit or 1))
        if collect_all_until_cutoff
        else max(1, min(int(limit or 20), MAX_FOLLOWED_DYNAMIC_KEEP_LIMIT))
    )
    print(
        f"[bilibili-tool] Fetch request: keywords={keywords}, tag_filters={tag_filters}, "
        f"author_ids={author_ids}, types={dynamic_types}, keep_limit={effective_limit}, "
        f"days={days_back}, page_limit={page_limit}, scan_cutoff_days={scan_cutoff_days}, "
        f"collect_all={collect_all_until_cutoff}"
    )
    async def _fetch_followed_once() -> dict:
        api = BilibiliToolAPI(sessdata=sessdata)
        try:
            dynamics = await api.fetch_followed_dynamics(
                dynamic_types=dynamic_types,
                keywords=keywords,
                tag_filters=tag_filters,
                author_ids=author_ids,
                limit=effective_limit,
                days_back=days_back,
                page_limit=page_limit,
                monitor_label=monitor_label,
                monitor_subfolder=monitor_subfolder,
                scan_cutoff_days=scan_cutoff_days,
                collect_all_until_cutoff=collect_all_until_cutoff,
            )
            fetch_stats = dict(api._last_fetch_stats or {})
            total_found = int(fetch_stats.get("matched_count_before_keep") or len(dynamics))

            return {
                "total_found": total_found,
                "fetch_stats": fetch_stats,
                "dynamics": _serialize_dynamics(dynamics),
            }
        finally:
            await api.close()

    return await run_social_runtime_with_retry(
        "bilibili followed dynamics",
        _fetch_followed_once,
    )


async def bilibili_fetch_dynamics_by_urls(
    sessdata: str,
    urls: list[str],
) -> dict:
    clean_urls = [str(url or "").strip() for url in (urls or []) if str(url or "").strip()]
    if not clean_urls:
        raise ValueError("请至少提供一个 Bilibili 链接")

    async def _fetch_links_once() -> dict:
        api = BilibiliToolAPI(sessdata=sessdata)
        try:
            dynamics, failures, skipped_count = await api.fetch_dynamics_by_urls(clean_urls)
            if not dynamics and failures:
                raise ValueError(failures[0])

            fetch_stats: dict[str, Any] = {
                "source": "direct-links",
                "matched_count_before_keep": len(dynamics),
                "kept_count": len(dynamics),
                "keep_limit": len(dynamics),
                "input_count": len(clean_urls),
                "failed_count": len(failures),
                "skipped_count": skipped_count,
            }
            if failures:
                fetch_stats["warnings"] = failures[:5]

            return {
                "total_found": len(dynamics),
                "fetch_stats": fetch_stats,
                "dynamics": _serialize_dynamics(dynamics),
            }
        finally:
            await api.close()

    return await run_social_runtime_with_retry(
        "bilibili direct link fetch",
        _fetch_links_once,
    )


async def bilibili_verify_sessdata(sessdata: str) -> dict:
    """
    验证 SESSDATA 是否有效
    """
    api = BilibiliToolAPI(sessdata=sessdata)
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Cookie": f"SESSDATA={sessdata}",
            "Referer": "https://t.bilibili.com/",
        }

        resp = await api.client.get(
            api.DYNAMIC_API,
            params={"type_list": 8},
            headers=headers,
        )

        if resp.status_code != 200:
            return {"valid": False, "message": f"HTTP {resp.status_code}"}

        data = resp.json()
        if data.get("code") == -101:
            return {"valid": False, "message": "SESSDATA 已过期或无效"}
        elif data.get("code") == 0:
            return {"valid": True, "message": "验证成功"}
        else:
            return {"valid": False, "message": data.get("message", "未知错误")}

    except Exception as e:
        return {"valid": False, "message": str(e)}
    finally:
        await api.close()


def bilibili_filter_prefetched_dynamics(
    dynamics: list[dict[str, Any]],
    *,
    keywords: list[str] | None = None,
    tag_filters: list[str] | None = None,
    limit: int = 20,
    days_back: int = 7,
    reference_time: Any | None = None,
    monitor_label: str | None = None,
    monitor_subfolder: str | None = None,
    crawl_source: str | None = "daily-monitor",
    crawl_source_label: str | None = None,
) -> dict[str, Any]:
    """Filter a shared followed-dynamics candidate pool for one monitor.

    This keeps feed-side scheduled monitoring aligned with the proactive Bilibili
    tool: fetch a single recent candidate pool, then fan out to multiple keyword
    monitors locally instead of re-crawling once per keyword definition.
    """
    effective_limit = max(1, min(int(limit or 20), MAX_FOLLOWED_DYNAMIC_KEEP_LIMIT))
    cutoff_reference_time = _parse_reference_time(reference_time) or datetime.now()
    cutoff = cutoff_reference_time - timedelta(days=max(1, int(days_back or 1)))
    filtered: list[dict[str, Any]] = []

    for dynamic in dynamics or []:
        if not isinstance(dynamic, dict):
            continue
        matched_keywords, matched_tags = _resolve_serialized_dynamic_match_metadata(
            dynamic,
            keywords,
            tag_filters,
        )
        if (keywords or tag_filters) and not (matched_keywords or matched_tags):
            continue

        published_at = _parse_serialized_published_at(dynamic.get("published_at"))
        if published_at is not None and published_at < cutoff:
            continue

        normalized = dict(dynamic)
        normalized["matched_keywords"] = matched_keywords
        normalized["matched_tags"] = matched_tags
        normalized["monitor_label"] = str(monitor_label or normalized.get("monitor_label") or "").strip()
        normalized["crawl_source"] = str(crawl_source or normalized.get("crawl_source") or "").strip()
        normalized["monitor_subfolder"] = resolve_bilibili_dynamic_monitor_subfolder(
            author=normalized.get("author"),
            monitor_subfolder=monitor_subfolder or normalized.get("monitor_subfolder") or "",
            monitor_label=normalized["monitor_label"],
            crawl_source=normalized["crawl_source"],
        )
        normalized["crawl_source_label"] = str(
            crawl_source_label
            or normalized.get("crawl_source_label")
            or normalized["monitor_label"]
        ).strip()
        filtered.append(normalized)

    filtered.sort(
        key=lambda dynamic: _parse_serialized_published_at(dynamic.get("published_at")) or datetime.min,
        reverse=True,
    )
    kept = filtered[:effective_limit]
    return {
        "total_found": len(filtered),
        "fetch_stats": {
            "source": "prefetched-filter",
            "matched_count_before_keep": len(filtered),
            "kept_count": len(kept),
            "keep_limit": effective_limit,
            "days_back": max(1, int(days_back or 1)),
            "reference_time": cutoff_reference_time.isoformat(),
        },
        "dynamics": kept,
    }


async def bilibili_fetch_followed_ups(
    sessdata: str,
    max_count: int = 5000,
    progress_callback=None,
) -> dict:
    """获取关注 UP 列表"""
    api = BilibiliToolAPI(sessdata=sessdata)
    try:
        tags = await api.fetch_followed_tags()
        tag_name_map = {tag["tag_id"]: tag["name"] for tag in tags}
        ups = await api.fetch_followed_ups(max_count=max_count, progress_callback=progress_callback)
        return {
            "total": len(ups),
            "groups": tags,
            "ups": [
                {
                    "mid": up.mid,
                    "uname": up.uname,
                    "face": up.face,
                    "sign": up.sign,
                    "official_desc": up.official_desc,
                    "special": up.special,
                    "tag_ids": up.tag_ids,
                    "tag_names": [tag_name_map[tag_id] for tag_id in up.tag_ids if tag_id in tag_name_map],
                }
                for up in ups
            ],
        }
    finally:
        await api.close()
