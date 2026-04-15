"""Helpers for fetching fuller Bilibili video metadata."""

from __future__ import annotations

import asyncio
import re
from typing import Any

import httpx


USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
)

VIDEO_VIEW_API = "https://api.bilibili.com/x/web-interface/view"
VIDEO_TAGS_API = "https://api.bilibili.com/x/tag/archive/tags"
_BVID_RE = re.compile(r"(BV[0-9A-Za-z]{10,})")


def extract_bvid(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    match = _BVID_RE.search(text)
    return match.group(1) if match else ""


def merge_tags(*groups: list[str] | tuple[str, ...] | None) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for group in groups:
        for item in group or []:
            tag = str(item or "").strip()
            if not tag or tag in seen:
                continue
            seen.add(tag)
            merged.append(tag)
    return merged


def extract_video_description(data: dict[str, Any]) -> str:
    desc = str(data.get("desc") or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if desc:
        return desc

    desc_v2 = data.get("desc_v2") or []
    if not isinstance(desc_v2, list):
        return ""

    parts: list[str] = []
    for item in desc_v2:
        if not isinstance(item, dict):
            continue
        raw = item.get("raw_text")
        if raw is None:
            raw = item.get("text")
        if raw is None:
            continue
        parts.append(str(raw))
    return "".join(parts).replace("\r\n", "\n").replace("\r", "\n").strip()


def _build_headers(headers: dict[str, str] | None, referer: str | None) -> dict[str, str]:
    merged = dict(headers or {})
    merged.setdefault("User-Agent", USER_AGENT)
    merged.setdefault("Referer", referer or "https://www.bilibili.com/")
    return merged


def _safe_json(resp: httpx.Response) -> dict[str, Any]:
    try:
        data = resp.json()
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _parse_tag_names(payload: dict[str, Any]) -> list[str]:
    data = payload.get("data")
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = data.get("list") or data.get("tags") or []
    else:
        items = []

    tags: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = item.get("tag_name") or item.get("name")
        if name:
            tags.append(str(name).strip())
    return merge_tags(tags)


async def fetch_bilibili_video_metadata(
    client: httpx.AsyncClient,
    *,
    bvid: str,
    headers: dict[str, str] | None = None,
    referer: str | None = None,
) -> dict[str, Any]:
    """Fetch a video's full description and tags.

    Returns a partial dict on failure instead of raising; callers can safely
    fall back to list-card metadata.
    """

    bvid = extract_bvid(bvid)
    if not bvid:
        return {}

    request_headers = _build_headers(headers, referer or f"https://www.bilibili.com/video/{bvid}")

    view_resp, tag_resp = await asyncio.gather(
        client.get(VIDEO_VIEW_API, params={"bvid": bvid}, headers=request_headers),
        client.get(VIDEO_TAGS_API, params={"bvid": bvid}, headers=request_headers),
    )
    view_payload = _safe_json(view_resp)
    tag_payload = _safe_json(tag_resp)

    view_data = {}
    if view_resp.status_code == 200 and view_payload.get("code") == 0:
        maybe_view = view_payload.get("data") or {}
        if isinstance(maybe_view, dict):
            view_data = maybe_view

    tags = _parse_tag_names(tag_payload) if tag_resp.status_code == 200 and tag_payload.get("code") == 0 else []
    aid = view_data.get("aid")
    if not tags and aid:
        retry_resp = await client.get(VIDEO_TAGS_API, params={"aid": aid}, headers=request_headers)
        retry_payload = _safe_json(retry_resp)
        if retry_resp.status_code == 200 and retry_payload.get("code") == 0:
            tags = _parse_tag_names(retry_payload)

    category = str(view_data.get("tname") or "").strip()
    if category:
        tags = merge_tags(tags, [category])

    return {
        "bvid": bvid,
        "title": str(view_data.get("title") or "").strip(),
        "description": extract_video_description(view_data),
        "cover": str(view_data.get("pic") or "").strip(),
        "author": str((view_data.get("owner") or {}).get("name") or "").strip(),
        "published_at_ts": int(view_data.get("pubdate") or 0) or None,
        "url": f"https://www.bilibili.com/video/{bvid}",
        "tags": tags,
        "category": category,
    }
