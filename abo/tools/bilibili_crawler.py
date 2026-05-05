"""Bilibili crawler helpers for scripts, API routes, and vault export."""

from __future__ import annotations

import json
import asyncio
import hashlib
import math
import os
import re
import subprocess
import time
import urllib.request
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import frontmatter
import httpx
import websockets

from abo.config import get_vault_path, load as load_config
from abo.creator_smart_groups import extract_signal_tokens, unique_strings
from abo.tools.bilibili_favorite_renamer import rename_favorite_markdown_files
from abo.tools.bilibili_video_meta import (
    extract_bvid,
    fetch_bilibili_video_metadata,
    merge_tags,
)
from abo.vault.unified_entry import UnifiedVaultEntry, first_non_empty, normalize_string_list, safe_load_frontmatter
from abo.vault.writer import write_unified_note


USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
)

DYNAMIC_API = "https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/dynamic_new"
NAV_API = "https://api.bilibili.com/x/web-interface/nav"
FAV_FOLDERS_API = "https://api.bilibili.com/x/v3/fav/folder/created/list-all"
FAV_RESOURCES_API = "https://api.bilibili.com/x/v3/fav/resource/list"
FAV_RESOURCE_IDS_API = "https://api.bilibili.com/x/v3/fav/resource/ids"
FAV_RESOURCE_INFOS_API = "https://api.bilibili.com/x/v3/fav/resource/infos"
WATCH_LATER_API = "https://api.bilibili.com/x/v2/history/toview/web"
FAV_RESOURCE_PAGE_SIZE_MAX = 20
FAV_RESOURCE_REQUEST_DELAY = 1.2
FAV_RESOURCE_RATE_LIMIT_DELAYS = (20, 45, 75)
SMART_GROUP_GENERIC_SIGNALS = {
    "",
    "无",
    "其他",
    "视频",
    "bilibili",
    "收藏",
    "稍后再看",
    "默认收藏夹",
    "未命名",
    "up主",
}
SMART_GROUP_GENERIC_SIGNAL_KEYS = {
    re.sub(r"[()（）\[\]【】]+", "", re.sub(r"[\s\-_·•・]+", "", str(item).strip().lower()))
    for item in SMART_GROUP_GENERIC_SIGNALS
}
BILIBILI_ACTIVE_SAVE_DIRNAME = "主动保存"


@dataclass
class BilibiliNote:
    source_type: str
    title: str
    content: str
    url: str
    author: str = ""
    published_at: str = ""
    dynamic_id: str = ""
    bvid: str = ""
    item_type: str = ""
    images: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    folder_name: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class BilibiliFavoriteAuthorAggregate:
    author: str
    author_id: str = ""
    note_count: int = 0
    latest_date: str = ""
    latest_title: str = ""
    sample_titles: list[str] = field(default_factory=list)
    sample_tags: list[str] = field(default_factory=list)
    sample_folders: list[str] = field(default_factory=list)
    sample_oids: list[str] = field(default_factory=list)
    sample_urls: list[str] = field(default_factory=list)
    sample_content_signals: list[str] = field(default_factory=list)
    signal_weights: Counter = field(default_factory=Counter)
    matched_mid: str = ""
    matched_uname: str = ""
    source_summary: str = ""
    smart_group_value: str = "other"
    smart_group_label: str = "其他"


def _safe_filename(text: str, fallback: str = "untitled", limit: int = 80) -> str:
    value = (text or fallback).strip()
    value = re.sub(r'[\\/:*?"<>|\[\]\n\r\t]+', " ", value)
    value = re.sub(r"\s+", " ", value).strip(" .")
    return (value or fallback)[:limit]


def _format_ts(value: Any) -> str:
    try:
        if not value:
            return ""
        return datetime.fromtimestamp(int(value)).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return ""


def _parse_date_ts(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return int(datetime.strptime(value, "%Y-%m-%d").timestamp())
    except Exception:
        return None


def _parse_int(value: Any) -> int | None:
    try:
        if value in (None, ""):
            return None
        return int(value)
    except Exception:
        return None


def _normalize_image_url(url: str | None) -> str:
    value = str(url or "").strip()
    if value.startswith("//"):
        return f"https:{value}"
    if value.startswith("http://"):
        return "https://" + value[len("http://"):]
    return value


def _resolve_dynamic_folder_name(item: dict[str, Any]) -> str:
    from abo.tools.bilibili import resolve_bilibili_dynamic_monitor_subfolder

    return resolve_bilibili_dynamic_monitor_subfolder(
        author=item.get("author") or item.get("up_name") or "",
        monitor_subfolder=(
            item.get("monitor_subfolder")
            or item.get("subfolder")
            or item.get("folder_name")
            or ""
        ),
        monitor_label=item.get("monitor_label") or "",
        crawl_source=item.get("crawl_source") or "",
    )


def _safe_json_response(resp: httpx.Response) -> dict:
    try:
        data = resp.json()
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _quote(text: str) -> str:
    clean = str(text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    return clean.replace("\n", "\n> ")


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _vault_root(vault_path: str | Path | None = None) -> Path:
    vault = Path(vault_path).expanduser() if vault_path else get_vault_path()
    if not vault:
        vault = Path.home() / "Documents" / "Obsidian Vault"
    return vault


def _favorite_state_path(vault_path: str | Path | None = None) -> Path:
    return _vault_root(vault_path) / "bilibili" / ".crawl_state" / "favorites.json"


def _vault_bilibili_dir(vault_path: str | Path | None = None) -> Path:
    return _vault_root(vault_path) / "bilibili"


def _load_favorite_state(vault_path: str | Path | None = None) -> dict:
    path = _favorite_state_path(vault_path)
    if not path.exists():
        return {"version": 1, "folders": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"version": 1, "folders": {}}
    if not isinstance(data, dict):
        return {"version": 1, "folders": {}}
    data.setdefault("version", 1)
    data.setdefault("folders", {})
    return data


def _save_favorite_state(state: dict, vault_path: str | Path | None = None) -> None:
    path = _favorite_state_path(vault_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = datetime.now().isoformat(timespec="seconds")
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_cookie_header(cookie: str | list[dict] | None) -> str:
    """Accept Cookie-Editor JSON, a raw Cookie header, or a SESSDATA value."""
    if not cookie:
        return ""
    if isinstance(cookie, list):
        return "; ".join(
            f"{c.get('name')}={c.get('value')}"
            for c in cookie
            if c.get("name") and c.get("value")
        )

    raw = str(cookie).strip()
    if not raw:
        return ""
    if raw.startswith("["):
        try:
            return normalize_cookie_header(json.loads(raw))
        except json.JSONDecodeError:
            pass
    if raw.startswith("{"):
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                if all(isinstance(v, str) for v in data.values()):
                    return "; ".join(f"{k}={v}" for k, v in data.items())
                pairs = []
                for key, value in data.items():
                    if isinstance(value, dict) and value.get("value"):
                        pairs.append(f"{key}={value['value']}")
                if pairs:
                    return "; ".join(pairs)
        except json.JSONDecodeError:
            pass
    if "=" in raw or ";" in raw:
        return raw
    return f"SESSDATA={raw}"


async def export_bilibili_cookies_from_cdp(
    port: int = 9222,
    *,
    auto_launch_browser: bool = False,
) -> list[dict]:
    """Read full Bilibili cookies from an Edge/Chrome CDP debugging port."""
    version = _read_cdp_version(port, auto_launch_browser=auto_launch_browser)
    browser_ws = version.get("webSocketDebuggerUrl")
    if not browser_ws:
        raise RuntimeError("CDP 调试端口未返回 webSocketDebuggerUrl")

    async with websockets.connect(browser_ws, max_size=16 * 1024 * 1024) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Storage.getCookies"}))
        while True:
            data = json.loads(await ws.recv())
            if data.get("id") == 1:
                cookies = data.get("result", {}).get("cookies", [])
                break

    return [
        {
            "name": item.get("name"),
            "value": item.get("value"),
            "domain": item.get("domain"),
            "path": item.get("path", "/"),
        }
        for item in cookies
        if "bilibili.com" in str(item.get("domain", ""))
    ]


def export_bilibili_cookies_from_browser_store() -> list[dict]:
    """Read Bilibili cookies from common local browser stores.

    This is the "default browser friendly" fallback: users should not need to know
    whether they are logged in via Chrome, Edge, Firefox, Safari, Brave, etc.
    """
    try:
        import browser_cookie3
    except Exception as exc:
        raise RuntimeError(f"browser_cookie3 不可用: {exc}") from exc

    loader_names = [
        "edge",
        "chrome",
        "chromium",
        "brave",
        "firefox",
        "safari",
        "opera",
        "vivaldi",
    ]
    cookie_list: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    errors: list[str] = []

    for name in loader_names:
        loader = getattr(browser_cookie3, name, None)
        if loader is None:
            continue
        try:
            jar = loader(domain_name="bilibili.com")
        except Exception as exc:
            errors.append(f"{name}: {exc}")
            continue
        for cookie in jar:
            key = (cookie.name, cookie.domain, cookie.path)
            if key in seen:
                continue
            seen.add(key)
            cookie_list.append(
                {
                    "name": cookie.name,
                    "value": cookie.value,
                    "domain": cookie.domain,
                    "path": cookie.path,
                }
            )

    if not cookie_list:
        detail = "; ".join(errors[:5])
        raise RuntimeError(f"未在本机浏览器 Cookie 库找到 Bilibili Cookie: {detail}")
    return cookie_list


async def export_bilibili_cookies_auto(
    port: int = 9222,
    *,
    auto_launch_browser: bool = False,
) -> list[dict]:
    """Try CDP first, then fall back to local browser cookie stores."""
    errors: list[str] = []
    try:
        cookies = await export_bilibili_cookies_from_cdp(
            port,
            auto_launch_browser=auto_launch_browser,
        )
        if cookies:
            return cookies
        errors.append("CDP: no bilibili cookies")
    except Exception as exc:
        errors.append(f"CDP: {exc}")

    try:
        return export_bilibili_cookies_from_browser_store()
    except Exception as exc:
        errors.append(f"browser_store: {exc}")

    raise RuntimeError("；".join(errors))


def _read_cdp_version(port: int, *, auto_launch_browser: bool = False) -> dict:
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            return json.loads(
                urllib.request.urlopen(
                    f"http://127.0.0.1:{port}/json/version",
                    timeout=2,
                )
                .read()
                .decode()
            )
        except Exception as exc:
            last_error = exc
            if attempt == 0 and auto_launch_browser:
                _open_edge_with_cdp(port)
                time.sleep(3)
    raise RuntimeError(f"CDP 调试端口不可用: {last_error}")


def _open_edge_with_cdp(port: int) -> None:
    for app_name in ["Microsoft Edge", "Google Chrome", "Chromium"]:
        result = subprocess.run(
            [
                "open",
                "-na",
                app_name,
                "--args",
                f"--remote-debugging-port={port}",
                "https://www.bilibili.com",
            ],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if result.returncode == 0:
            return

    subprocess.run(
        ["open", "https://www.bilibili.com"],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


async def resolve_cookie_header(
    cookie: str | None = None,
    *,
    use_cdp: bool = True,
    cdp_port: int = 9222,
) -> str:
    """Resolve the best Cookie header from explicit input, saved config, or browser state."""
    if cookie:
        return normalize_cookie_header(cookie)

    config_cookie = load_config().get("bilibili_cookie", "")
    normalized_config_cookie = normalize_cookie_header(config_cookie)
    if "SESSDATA=" in normalized_config_cookie:
        return normalized_config_cookie

    if use_cdp:
        try:
            cookies = await export_bilibili_cookies_auto(
                cdp_port,
                auto_launch_browser=False,
            )
            header = normalize_cookie_header(cookies)
            if "SESSDATA=" in header:
                return header
        except Exception as exc:
            print(f"[bilibili-crawler] CDP cookie export failed: {exc}")

    return normalized_config_cookie


def _headers(cookie_header: str, referer: str) -> dict[str, str]:
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "User-Agent": USER_AGENT,
        "Referer": referer,
        "Origin": "https://www.bilibili.com",
    }
    if cookie_header:
        headers["Cookie"] = cookie_header
    return headers


def _apply_video_metadata_to_note(note: BilibiliNote, metadata: dict[str, Any]) -> None:
    note.bvid = metadata.get("bvid") or note.bvid or extract_bvid(note.url)
    note.title = metadata.get("title") or note.title
    detail_desc = str(metadata.get("description") or "").strip()
    if detail_desc and len(detail_desc) >= len(note.content or ""):
        note.content = detail_desc
    note.author = metadata.get("author") or note.author
    note.url = metadata.get("url") or note.url

    cover = _normalize_image_url(metadata.get("cover"))
    existing_images = [_normalize_image_url(url) for url in note.images if _normalize_image_url(url)]
    if cover and cover not in existing_images:
        existing_images = [cover, *existing_images]
    note.images = existing_images
    note.tags = merge_tags(note.tags, metadata.get("tags") or [])

    published_at_ts = metadata.get("published_at_ts")
    if published_at_ts and not note.published_at:
        note.published_at = _format_ts(published_at_ts)
    if metadata.get("category"):
        note.metadata["category"] = metadata["category"]


async def _enrich_video_notes(
    notes: list[BilibiliNote],
    *,
    client: httpx.AsyncClient,
    cookie_header: str = "",
) -> None:
    video_notes = [note for note in notes if note.item_type == "video"]
    if not video_notes:
        return

    cache: dict[str, dict[str, Any]] = {}
    semaphore = asyncio.Semaphore(4)

    async def enrich(note: BilibiliNote) -> None:
        bvid = note.bvid or extract_bvid(note.url)
        if not bvid:
            return
        if bvid not in cache:
            async with semaphore:
                try:
                    cache[bvid] = await fetch_bilibili_video_metadata(
                        client,
                        bvid=bvid,
                        headers=_headers(cookie_header, note.url or f"https://www.bilibili.com/video/{bvid}"),
                        referer=note.url or f"https://www.bilibili.com/video/{bvid}",
                    )
                except Exception as exc:
                    print(f"[bilibili-crawler] failed to enrich video {bvid}: {exc}")
                    cache[bvid] = {}
        metadata = cache.get(bvid) or {}
        if metadata:
            _apply_video_metadata_to_note(note, metadata)

    await asyncio.gather(*(enrich(note) for note in video_notes))


async def verify_cookie_header(cookie_header: str) -> dict:
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        resp = await client.get(
            NAV_API,
            headers=_headers(cookie_header, "https://www.bilibili.com/"),
        )
    data = resp.json()
    nav = data.get("data") or {}
    return {
        "valid": resp.status_code == 200 and data.get("code") == 0 and bool(nav.get("isLogin")),
        "status_code": resp.status_code,
        "code": data.get("code"),
        "message": data.get("message"),
        "mid": str(nav.get("mid") or ""),
        "uname": nav.get("uname") or "",
    }


def _parse_dynamic_card(card: dict) -> BilibiliNote | None:
    desc = card.get("desc") or {}
    dynamic_id = str(desc.get("dynamic_id") or "")
    dynamic_type = desc.get("type")
    try:
        body = json.loads(card.get("card") or "{}")
    except json.JSONDecodeError:
        body = {}

    user = desc.get("user_profile") or {}
    base = {
        "source_type": "dynamic",
        "author": user.get("uname") or "UP主",
        "published_at": _format_ts(desc.get("timestamp")),
        "dynamic_id": dynamic_id,
    }

    if dynamic_type == 8:
        bvid = body.get("bvid") or ""
        return BilibiliNote(
            **base,
            title=body.get("title") or "B站视频动态",
            content=body.get("desc") or "",
            url=f"https://www.bilibili.com/video/{bvid}" if bvid else f"https://t.bilibili.com/{dynamic_id}",
            bvid=bvid,
            item_type="video",
            images=[body.get("pic")] if body.get("pic") else [],
            metadata={"duration": body.get("duration", "")},
        )

    if dynamic_type == 2:
        item = body.get("item") or {}
        content = item.get("description") or ""
        return BilibiliNote(
            **base,
            title=content[:80] or "B站图文动态",
            content=content,
            url=f"https://t.bilibili.com/{dynamic_id}",
            item_type="image",
            images=[
                p.get("img_src")
                for p in (item.get("pictures") or [])
                if p.get("img_src")
            ],
        )

    if dynamic_type == 4:
        item = body.get("item") or {}
        content = item.get("content") or ""
        return BilibiliNote(
            **base,
            title=content[:80] or "B站文字动态",
            content=content,
            url=f"https://t.bilibili.com/{dynamic_id}",
            item_type="text",
        )

    if dynamic_type == 64:
        cvid = str(body.get("id") or "")
        return BilibiliNote(
            **base,
            title=body.get("title") or "B站专栏",
            content=body.get("summary") or "",
            url=f"https://www.bilibili.com/read/cv{cvid}" if cvid else f"https://t.bilibili.com/{dynamic_id}",
            item_type="article",
            images=[body.get("banner_url")] if body.get("banner_url") else [],
            metadata={"cvid": cvid},
        )

    return None


async def fetch_dynamics(
    cookie_header: str,
    *,
    dynamic_types: list[int] | None = None,
    limit: int = 10,
) -> list[BilibiliNote]:
    """Fetch readable dynamic samples by type."""
    types = dynamic_types or [8, 2, 4, 64]
    notes: list[BilibiliNote] = []
    seen: set[str] = set()
    per_type_limit = max(1, limit // max(len(types), 1) + 2)

    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        for type_value in types:
            resp = await client.get(
                DYNAMIC_API,
                params={"type_list": type_value},
                headers=_headers(cookie_header, "https://t.bilibili.com/"),
            )
            data = resp.json()
            if resp.status_code != 200 or data.get("code") != 0:
                print(
                    "[bilibili-crawler] dynamic fetch failed "
                    f"type={type_value} http={resp.status_code} "
                    f"code={data.get('code')} msg={data.get('message')}"
                )
                continue
            for card in (data.get("data") or {}).get("cards") or []:
                note = _parse_dynamic_card(card)
                if not note or note.dynamic_id in seen:
                    continue
                notes.append(note)
                seen.add(note.dynamic_id)
                if len([n for n in notes if n.item_type == note.item_type]) >= per_type_limit:
                    break
            if len(notes) >= limit:
                break

        await _enrich_video_notes(notes, client=client, cookie_header=cookie_header)

    notes.sort(key=lambda n: n.published_at, reverse=True)
    return notes[:limit]


async def fetch_favorite_folders(cookie_header: str, mid: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        resp = await client.get(
            FAV_FOLDERS_API,
            params={"up_mid": mid, "jsonp": "jsonp"},
            headers=_headers(cookie_header, "https://www.bilibili.com/"),
        )
    data = resp.json()
    if resp.status_code != 200 or data.get("code") != 0:
        raise RuntimeError(f"收藏夹列表失败: http={resp.status_code} code={data.get('code')} {data.get('message')}")
    return (data.get("data") or {}).get("list") or []


def _favorite_media_to_note(media: dict, folder: dict) -> BilibiliNote:
    bvid = media.get("bvid") or ""
    upper = media.get("upper") or {}
    folder_name = folder.get("title") or folder.get("name") or f"folder-{folder.get('id')}"
    author_id = str(upper.get("mid") or upper.get("id") or "")
    oid = str(media.get("id") or media.get("oid") or media.get("aid") or bvid or "")
    return BilibiliNote(
        source_type="favorite",
        title=media.get("title") or "B站收藏视频",
        content=media.get("intro") or "",
        url=f"https://www.bilibili.com/video/{bvid}" if bvid else "",
        author=upper.get("name") or "",
        published_at=_format_ts(media.get("pubtime")),
        bvid=bvid,
        item_type="video",
        images=[_normalize_image_url(media.get("cover"))] if media.get("cover") else [],
        folder_name=folder_name,
        metadata={
            "folder_id": str(folder.get("id") or ""),
            "media_id": str(media.get("id") or media.get("aid") or bvid or ""),
            "oid": oid,
            "author_id": author_id,
            "fav_time_ts": int(media.get("fav_time") or 0),
            "fav_time": _format_ts(media.get("fav_time")),
            "cnt_info": media.get("cnt_info") or {},
        },
    )


def _favorite_note_key(note: BilibiliNote) -> str:
    return note.bvid or str(note.metadata.get("media_id") or note.url or note.title)


def _favorite_folder_media_count(folder: dict) -> int:
    return int(folder.get("media_count") or folder.get("count") or 0)


def _is_favorite_rate_limited(status_code: int, data: dict[str, Any]) -> bool:
    return status_code == 412 or data.get("code") == -412


def _favorite_resource_key(resource_id: Any, resource_type: Any) -> str:
    return f"{resource_id}:{resource_type}"


def _favorite_info_to_media(info: dict[str, Any], resource: dict[str, Any] | None = None) -> dict[str, Any]:
    media = dict(info or {})
    resource = resource or {}
    if not media.get("id"):
        media["id"] = resource.get("id")
    if media.get("type") is None:
        media["type"] = resource.get("type")
    if not media.get("bvid"):
        media["bvid"] = resource.get("bvid") or resource.get("bv_id") or ""
    if not media.get("bv_id"):
        media["bv_id"] = resource.get("bv_id") or resource.get("bvid") or media.get("bvid") or ""
    if not isinstance(media.get("upper"), dict):
        media["upper"] = {}
    media.setdefault("intro", "")
    media.setdefault("cnt_info", {})
    media.setdefault("fav_time", 0)
    return media


async def _fetch_favorite_resource_ids(
    client: httpx.AsyncClient,
    *,
    cookie_header: str,
    folder_id: str,
) -> list[dict[str, Any]]:
    referer = f"https://www.bilibili.com/medialist/detail/ml{folder_id}"
    resp = await client.get(
        FAV_RESOURCE_IDS_API,
        params={"media_id": folder_id, "platform": "web"},
        headers=_headers(cookie_header, referer),
    )
    data = _safe_json_response(resp)
    if resp.status_code != 200 or data.get("code") != 0:
        raise RuntimeError(
            f"收藏夹备用索引读取失败: folder={folder_id} http={resp.status_code} "
            f"code={data.get('code')} {data.get('message')}"
        )
    resource_items = data.get("data") or []
    if not isinstance(resource_items, list):
        return []
    return [item for item in resource_items if isinstance(item, dict)]


async def _fetch_favorite_resource_infos_page(
    client: httpx.AsyncClient,
    *,
    cookie_header: str,
    mid: str,
    folder_id: str,
    page: int,
    page_size: int,
    cached_resources: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], int, list[dict[str, Any]]]:
    resource_items = cached_resources
    if resource_items is None:
        resource_items = await _fetch_favorite_resource_ids(
            client,
            cookie_header=cookie_header,
            folder_id=folder_id,
        )
    safe_page_size = max(1, min(FAV_RESOURCE_PAGE_SIZE_MAX, int(page_size or FAV_RESOURCE_PAGE_SIZE_MAX)))
    start = max(0, (max(1, page) - 1) * safe_page_size)
    page_resources = resource_items[start:start + safe_page_size]
    if not page_resources:
        return [], len(resource_items), resource_items

    referer = f"https://www.bilibili.com/medialist/detail/ml{folder_id}"
    resp = await client.get(
        FAV_RESOURCE_INFOS_API,
        params={
            "resources": ",".join(
                _favorite_resource_key(item.get("id"), item.get("type"))
                for item in page_resources
                if item.get("id") and item.get("type") is not None
            ),
            "platform": "web",
            "folder_mid": mid,
            "folder_id": folder_id,
        },
        headers=_headers(cookie_header, referer),
    )
    data = _safe_json_response(resp)
    if resp.status_code != 200 or data.get("code") != 0:
        raise RuntimeError(
            f"收藏夹备用详情读取失败: folder={folder_id} http={resp.status_code} "
            f"code={data.get('code')} {data.get('message')}"
        )
    infos = data.get("data") or []
    info_map = {
        _favorite_resource_key(item.get("id"), item.get("type")): item
        for item in infos
        if isinstance(item, dict)
    }
    medias = [
        _favorite_info_to_media(
            info_map.get(_favorite_resource_key(resource.get("id"), resource.get("type"))) or {},
            resource,
        )
        for resource in page_resources
    ]
    return medias, len(resource_items), resource_items


async def _fetch_favorite_preview_media(
    client: httpx.AsyncClient,
    *,
    cookie_header: str,
    mid: str,
    folder_id: str,
) -> dict[str, str]:
    if not folder_id:
        return {"cover": "", "title": "", "bvid": ""}

    referer = f"https://www.bilibili.com/medialist/detail/ml{folder_id}"
    ids_resp = await client.get(
        FAV_RESOURCE_IDS_API,
        params={"media_id": folder_id, "platform": "web"},
        headers=_headers(cookie_header, referer),
    )
    ids_payload = _safe_json_response(ids_resp)
    if ids_resp.status_code != 200 or ids_payload.get("code") != 0:
        return {"cover": "", "title": "", "bvid": ""}
    resource_items = ids_payload.get("data") or []
    if not isinstance(resource_items, list) or not resource_items:
        return {"cover": "", "title": "", "bvid": ""}

    first_item = resource_items[0] if isinstance(resource_items[0], dict) else {}
    resource_id = first_item.get("id")
    resource_type = first_item.get("type")
    if not resource_id or resource_type is None:
        return {"cover": "", "title": "", "bvid": extract_bvid(first_item.get("bvid") or first_item.get("bv_id"))}

    infos_resp = await client.get(
        FAV_RESOURCE_INFOS_API,
        params={
            "resources": f"{resource_id}:{resource_type}",
            "platform": "web",
            "folder_mid": mid,
            "folder_id": folder_id,
        },
        headers=_headers(cookie_header, referer),
    )
    infos_payload = _safe_json_response(infos_resp)
    if infos_resp.status_code != 200 or infos_payload.get("code") != 0:
        return {
            "cover": "",
            "title": "",
            "bvid": extract_bvid(first_item.get("bvid") or first_item.get("bv_id")),
        }

    infos_data = infos_payload.get("data") or []
    info = infos_data[0] if isinstance(infos_data, list) and infos_data and isinstance(infos_data[0], dict) else {}
    return {
        "cover": _normalize_image_url(info.get("cover")),
        "title": str(info.get("title") or "").strip(),
        "bvid": extract_bvid(info.get("bvid") or info.get("bv_id") or first_item.get("bvid") or first_item.get("bv_id")),
    }


async def _fetch_favorite_resource_page(
    client: httpx.AsyncClient,
    *,
    cookie_header: str,
    mid: str,
    folder_id: str,
    page: int,
    page_size: int,
    retries: int = 3,
) -> tuple[int, dict]:
    safe_page_size = max(1, min(FAV_RESOURCE_PAGE_SIZE_MAX, int(page_size or FAV_RESOURCE_PAGE_SIZE_MAX)))
    params = {
        "media_id": folder_id,
        "pn": page,
        "ps": safe_page_size,
        "keyword": "",
        "order": "mtime",
        "type": 0,
        "tid": 0,
        "platform": "web",
    }
    total_attempts = max(1, retries)
    for attempt in range(total_attempts):
        resp = await client.get(
            FAV_RESOURCES_API,
            params=params,
            headers=_headers(cookie_header, f"https://space.bilibili.com/{mid}/favlist"),
        )
        data = _safe_json_response(resp)
        is_rate_limited = resp.status_code == 412 or data.get("code") == -412
        if not is_rate_limited:
            return resp.status_code, data
        if attempt < total_attempts - 1:
            delay = FAV_RESOURCE_RATE_LIMIT_DELAYS[min(attempt, len(FAV_RESOURCE_RATE_LIMIT_DELAYS) - 1)]
            await asyncio.sleep(delay)
    return resp.status_code, data


async def fetch_favorite_folder_previews(
    cookie_header: str,
    *,
    mid: str,
    progress_callback=None,
) -> list[dict]:
    folders = await fetch_favorite_folders(cookie_header, mid)
    state = _load_favorite_state()
    folder_state = state.get("folders") or {}
    previews: list[dict] = []

    if progress_callback:
        progress_callback(
            {
                "stage": "正在读取收藏栏预览",
                "total_folders": len(folders) + 1,
                "processed_folders": 0,
                "current_folder": "稍后再看",
            }
        )

    watch_notes, watch_later_total = await fetch_watch_later_items(cookie_header, limit=1)
    watch_preview = watch_notes[0] if watch_notes else None
    previews.append(
        {
            "id": "__watch_later__",
            "title": "稍后再看",
            "media_count": watch_later_total,
            "cover": _normalize_image_url(watch_preview.images[0] if watch_preview and watch_preview.images else ""),
            "first_video_title": watch_preview.title if watch_preview else "",
            "first_video_bvid": watch_preview.bvid if watch_preview else "",
            "crawled_count": 0,
            "last_crawled_at": "",
            "source_type": "watch_later",
        }
    )
    if progress_callback:
        progress_callback(
            {
                "stage": "已读取稍后再看预览",
                "total_folders": len(folders) + 1,
                "processed_folders": 1,
                "current_folder": "",
            }
        )

    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        for index, folder in enumerate(folders, start=1):
            folder_id = str(folder.get("id") or "")
            if progress_callback:
                progress_callback(
                    {
                        "stage": f"正在读取收藏夹封面 {index}/{len(folders)}",
                        "total_folders": len(folders) + 1,
                        "processed_folders": index,
                        "current_folder": folder.get("title") or folder.get("name") or folder_id,
                    }
                )
            preview_media = await _fetch_favorite_preview_media(
                client,
                cookie_header=cookie_header,
                mid=mid,
                folder_id=folder_id,
            )
            await asyncio.sleep(0.08)

            crawled = folder_state.get(folder_id, {})
            crawled_items = crawled.get("items") or {}
            previews.append(
                {
                    "id": folder_id,
                    "title": folder.get("title") or folder.get("name") or f"folder-{folder_id}",
                    "media_count": folder.get("media_count") or folder.get("count") or 0,
                    "cover": preview_media.get("cover") or _normalize_image_url(folder.get("cover")),
                    "first_video_title": preview_media.get("title") or "",
                    "first_video_bvid": preview_media.get("bvid") or "",
                    "crawled_count": len(crawled_items),
                    "last_crawled_at": crawled.get("last_crawled_at") or "",
                    "source_type": "favorite",
                }
            )

    return previews


async def fetch_favorite_items(
    cookie_header: str,
    *,
    mid: str,
    folder_limit: int = 1,
    item_limit: int = 10,
    folder_ids: list[str] | None = None,
    since_days: int | None = None,
    since_date: str | None = None,
) -> tuple[list[BilibiliNote], list[dict]]:
    folders = await fetch_favorite_folders(cookie_header, mid)
    selected_ids = {str(folder_id) for folder_id in folder_ids or []}
    if selected_ids:
        folders = [folder for folder in folders if str(folder.get("id") or "") in selected_ids]
    else:
        folders = folders[:folder_limit]
    notes: list[BilibiliNote] = []

    cutoff_ts = _parse_date_ts(since_date)
    if cutoff_ts is None and since_days:
        cutoff_ts = int(time.time()) - since_days * 86400
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        for folder in folders:
            folder_id = str(folder.get("id") or "")
            folder_name = folder.get("title") or folder.get("name") or f"folder-{folder_id}"
            folder_total = _favorite_folder_media_count(folder)
            max_pages = max(1, math.ceil(folder_total / FAV_RESOURCE_PAGE_SIZE_MAX) + 2) if folder_total else None
            page = 1
            stop_folder = False
            fallback_resources: list[dict[str, Any]] | None = None
            while len([note for note in notes if note.metadata.get("folder_id") == str(folder.get("id") or "")]) < item_limit:
                if max_pages and page > max_pages:
                    break
                page_size = min(FAV_RESOURCE_PAGE_SIZE_MAX, item_limit)
                status_code, data = await _fetch_favorite_resource_page(
                    client,
                    cookie_header=cookie_header,
                    mid=mid,
                    folder_id=folder_id,
                    page=page,
                    page_size=page_size,
                    retries=1,
                )
                using_fallback = False
                if status_code != 200 or data.get("code") != 0:
                    if _is_favorite_rate_limited(status_code, data):
                        medias, folder_total_from_fallback, fallback_resources = await _fetch_favorite_resource_infos_page(
                            client,
                            cookie_header=cookie_header,
                            mid=mid,
                            folder_id=folder_id,
                            page=page,
                            page_size=page_size,
                            cached_resources=fallback_resources,
                        )
                        using_fallback = True
                        if folder_total_from_fallback:
                            folder_total = max(folder_total, folder_total_from_fallback)
                            max_pages = max(1, math.ceil(folder_total_from_fallback / page_size) + 2)
                        print(f"[bilibili-crawler] fallback favorite fetch via ids+infos folder={folder_name} page={page}")
                    else:
                        print(
                            "[bilibili-crawler] favorite fetch failed "
                            f"folder={folder_name} http={status_code} "
                            f"code={data.get('code')} msg={data.get('message')}"
                        )
                        break
                else:
                    medias = ((data.get("data") or {}).get("medias") or [])
                if not medias:
                    break
                for media in medias:
                    fav_time = int(media.get("fav_time") or 0)
                    if cutoff_ts and fav_time and fav_time < cutoff_ts:
                        stop_folder = True
                        break
                    notes.append(_favorite_media_to_note(media, folder))
                    folder_note_count = len([
                        note for note in notes
                        if note.metadata.get("folder_id") == str(folder.get("id") or "")
                    ])
                    if folder_note_count >= item_limit:
                        break
                if stop_folder:
                    break
                if using_fallback and fallback_resources is not None and page * page_size >= len(fallback_resources):
                    break
                if folder_total and page * page_size >= folder_total:
                    break
                if len(medias) < page_size and ((using_fallback and fallback_resources is not None) or not folder_total):
                    break
                page += 1

        await _enrich_video_notes(notes, client=client, cookie_header=cookie_header)

    return notes, folders


async def crawl_selected_favorites_to_vault(
    *,
    cookie: str | None = None,
    vault_path: str | None = None,
    folder_ids: list[str] | None = None,
    crawl_mode: str = "incremental",
    item_limit: int = 20,
    since_days: int | None = None,
    since_date: str | None = None,
    use_cdp: bool = True,
    cdp_port: int = 9222,
    progress_callback=None,
) -> dict:
    selected_ids = [str(folder_id) for folder_id in folder_ids or [] if str(folder_id)]
    if not selected_ids:
        raise RuntimeError("请选择至少一个收藏夹")
    mode = "full" if crawl_mode == "full" else "incremental"

    cookie_header = await resolve_cookie_header(cookie, use_cdp=use_cdp, cdp_port=cdp_port)
    if "SESSDATA=" not in cookie_header:
        raise RuntimeError("未获取到 Bilibili SESSDATA，请先登录浏览器")

    verify = await verify_cookie_header(cookie_header)
    if not verify["valid"]:
        raise RuntimeError(f"Bilibili 登录态无效: {verify}")

    include_watch_later = "__watch_later__" in selected_ids
    favorite_selected_ids = [folder_id for folder_id in selected_ids if folder_id != "__watch_later__"]

    state = _load_favorite_state(vault_path)
    state_folders = state.setdefault("folders", {})
    existing_by_folder: dict[str, set[str]] = {}
    for folder_id in favorite_selected_ids:
        folder_state = state_folders.setdefault(folder_id, {"items": {}})
        existing_by_folder[folder_id] = (
            set((folder_state.get("items") or {}).keys())
            if mode == "incremental"
            else set()
        )
    watch_later_state = state.setdefault("watch_later", {"items": {}})
    watch_later_existing = (
        set((watch_later_state.get("items") or {}).keys())
        if include_watch_later and mode == "incremental"
        else set()
    )

    notes: list[BilibiliNote] = []
    folders: list[dict] = []
    watch_later_total = 0
    fetched_count = 0
    skipped_count = 0

    if progress_callback:
        progress_callback(
            {
                "stage": "正在读取收藏内容",
                "selected_folder_count": len(selected_ids),
                "current_step": "favorites",
                "current_folder": "",
                "current_page": 0,
                "fetched_count": 0,
                "saved_count": 0,
                "skipped_count": 0,
            }
        )

    if favorite_selected_ids:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            folders = await fetch_favorite_folders(cookie_header, verify["mid"])
            folders = [folder for folder in folders if str(folder.get("id") or "") in set(favorite_selected_ids)]
            request_cutoff_ts = _parse_date_ts(since_date)
            if request_cutoff_ts is None and since_days:
                request_cutoff_ts = int(time.time()) - since_days * 86400

            for folder_index, folder in enumerate(folders, start=1):
                folder_id = str(folder.get("id") or "")
                folder_name = folder.get("title") or folder.get("name") or f"folder-{folder_id}"
                folder_total = _favorite_folder_media_count(folder)
                max_pages = max(1, math.ceil(folder_total / FAV_RESOURCE_PAGE_SIZE_MAX) + 2) if folder_total else None
                page = 1
                stop_folder = False
                used_fallback = False
                fallback_resources: list[dict[str, Any]] | None = None
                folder_existing = existing_by_folder.setdefault(folder_id, set())
                folder_seen_in_run: set[str] = set()
                folder_state = state_folders.setdefault(folder_id, {"items": {}})
                state_cutoff_ts = _parse_int(folder_state.get("latest_fav_time"))
                if mode == "incremental" and not state_cutoff_ts:
                    raise RuntimeError(f"收藏夹「{folder_name}」还没有全量爬取基线，请先点击全量爬取")
                cutoff_candidates = [value for value in [request_cutoff_ts, state_cutoff_ts if mode == "incremental" else None] if value]
                cutoff_ts = max(cutoff_candidates) if cutoff_candidates else None
                latest_seen_fav_time = state_cutoff_ts or 0
                while len([
                    note for note in notes
                    if note.metadata.get("folder_id") == folder_id
                ]) < item_limit:
                    if max_pages and page > max_pages:
                        break
                    page_size = min(FAV_RESOURCE_PAGE_SIZE_MAX, item_limit)
                    if progress_callback:
                        progress_callback(
                            {
                                "stage": f"正在读取收藏夹 {folder_index}/{len(folders)} · 第 {page} 页",
                                "selected_folder_count": len(selected_ids),
                                "current_step": "favorites",
                                "current_folder": folder_name,
                                "current_page": page,
                                "fetched_count": fetched_count,
                                "saved_count": len(notes),
                                "skipped_count": skipped_count,
                            }
                        )
                    status_code, data = await _fetch_favorite_resource_page(
                        client,
                        cookie_header=cookie_header,
                        mid=verify["mid"],
                        folder_id=folder_id,
                        page=page,
                        page_size=page_size,
                        retries=1,
                    )
                    using_fallback = False
                    if status_code != 200 or data.get("code") != 0:
                        if _is_favorite_rate_limited(status_code, data):
                            if progress_callback:
                                progress_callback(
                                    {
                                        "stage": f"收藏夹 {folder_index}/{len(folders)} 命中 412，切换备用读取",
                                        "selected_folder_count": len(selected_ids),
                                        "current_step": "favorites",
                                        "current_folder": folder_name,
                                        "current_page": page,
                                        "fetched_count": fetched_count,
                                        "saved_count": len(notes),
                                        "skipped_count": skipped_count,
                                    }
                                )
                            medias, folder_total_from_fallback, fallback_resources = await _fetch_favorite_resource_infos_page(
                                client,
                                cookie_header=cookie_header,
                                mid=verify["mid"],
                                folder_id=folder_id,
                                page=page,
                                page_size=page_size,
                                cached_resources=fallback_resources,
                            )
                            used_fallback = True
                            using_fallback = True
                            if folder_total_from_fallback:
                                folder_total = max(folder_total, folder_total_from_fallback)
                                max_pages = max(1, math.ceil(folder_total_from_fallback / page_size) + 2)
                            print(f"[bilibili-crawler] fallback favorite crawl via ids+infos folder={folder_name} page={page}")
                        else:
                            raise RuntimeError(
                                f"收藏夹读取失败: {folder_name} http={status_code} code={data.get('code')} {data.get('message')}"
                            )
                    else:
                        medias = ((data.get("data") or {}).get("medias") or [])
                    if not medias:
                        break
                    page_new_count = 0
                    for media in medias:
                        fav_time = int(media.get("fav_time") or 0)
                        if fav_time > latest_seen_fav_time:
                            latest_seen_fav_time = fav_time
                        if cutoff_ts and fav_time and (fav_time <= cutoff_ts if mode == "incremental" else fav_time < cutoff_ts):
                            if mode == "incremental":
                                skipped_count += 1
                            stop_folder = True
                            break
                        fetched_count += 1
                        note = _favorite_media_to_note(media, folder)
                        note_key = _favorite_note_key(note)
                        if note_key in folder_seen_in_run:
                            continue
                        if note_key in folder_existing:
                            skipped_count += 1
                            continue
                        notes.append(note)
                        page_new_count += 1
                        folder_seen_in_run.add(note_key)
                        folder_existing.add(note_key)
                        folder_note_count = len([
                            note for note in notes
                            if note.metadata.get("folder_id") == folder_id
                        ])
                        if folder_note_count >= item_limit:
                            break
                    if using_fallback and mode == "incremental" and page_new_count == 0:
                        # resource/infos does not expose a reliable favorite timestamp, so once a
                        # fallback page is fully known we stop the incremental scan conservatively.
                        break
                    if stop_folder:
                        break
                    if using_fallback and fallback_resources is not None and page * page_size >= len(fallback_resources):
                        break
                    if folder_total and page * page_size >= folder_total:
                        break
                    if len(medias) < page_size and ((using_fallback and fallback_resources is not None) or not folder_total):
                        break
                    await asyncio.sleep(FAV_RESOURCE_REQUEST_DELAY)
                    page += 1
                await asyncio.sleep(FAV_RESOURCE_REQUEST_DELAY)
                if used_fallback and mode == "full":
                    # Fallback pages do not provide stable favorite times, so use the full-crawl
                    # moment as the next incremental baseline.
                    latest_seen_fav_time = max(latest_seen_fav_time, int(time.time()))
                if latest_seen_fav_time and (mode == "full" or not used_fallback):
                    folder_state["title"] = folder_name
                    folder_state["latest_fav_time"] = latest_seen_fav_time
                    folder_state["latest_fav_at"] = _format_ts(latest_seen_fav_time)
                folder_state["last_checked_at"] = datetime.now().isoformat(timespec="seconds")

            await _enrich_video_notes(notes, client=client, cookie_header=cookie_header)

    if include_watch_later:
        if mode == "incremental" and not _parse_int(watch_later_state.get("latest_fav_time")):
            raise RuntimeError("稍后再看还没有全量爬取基线，请先点击全量爬取")
        if progress_callback:
            progress_callback(
                {
                    "stage": "正在读取稍后再看",
                    "selected_folder_count": len(selected_ids),
                    "current_step": "watch_later",
                    "current_folder": "稍后再看",
                    "current_page": 1,
                    "fetched_count": fetched_count,
                    "saved_count": len(notes),
                    "skipped_count": skipped_count,
                }
            )
        watch_notes, watch_later_total = await fetch_watch_later_items(
            cookie_header,
            limit=max(1, item_limit),
        )
        latest_watch_fav_time = _parse_int(watch_later_state.get("latest_fav_time")) or 0
        for note in watch_notes:
            fetched_count += 1
            fav_time = _parse_int(note.metadata.get("add_at_ts"))
            if fav_time and fav_time > latest_watch_fav_time:
                latest_watch_fav_time = fav_time
            if mode == "incremental" and fav_time and fav_time <= (_parse_int(watch_later_state.get("latest_fav_time")) or 0):
                skipped_count += 1
                continue
            if _favorite_note_key(note) in watch_later_existing:
                skipped_count += 1
                continue
            notes.append(note)
            watch_later_existing.add(_favorite_note_key(note))
        if latest_watch_fav_time:
            watch_later_state["latest_fav_time"] = latest_watch_fav_time
            watch_later_state["latest_fav_at"] = _format_ts(latest_watch_fav_time)

    if progress_callback:
        progress_callback(
            {
                "stage": "正在写入情报库",
                "selected_folder_count": len(selected_ids),
                "current_step": "writing",
                "current_folder": "",
                "current_page": 0,
                "fetched_count": fetched_count,
                "saved_count": len(notes),
                "skipped_count": skipped_count,
            }
        )

    result = write_notes_to_vault(
        notes,
        vault_path=vault_path,
        summary={
            "mid": verify["mid"],
            "uname": verify["uname"],
            "favorite_folder_count": len(folders),
            "watch_later_total": watch_later_total,
        },
    )

    now = datetime.now().isoformat(timespec="seconds")
    for note in notes:
        folder_id = str(note.metadata.get("folder_id") or "")
        if not folder_id:
            continue
        folder_state = state_folders.setdefault(folder_id, {"items": {}})
        folder_state["title"] = note.folder_name
        folder_state["last_crawled_at"] = now
        items = folder_state.setdefault("items", {})
        items[_favorite_note_key(note)] = {
            "title": note.title,
            "url": note.url,
            "bvid": note.bvid,
            "crawled_at": now,
        }
    for note in [item for item in notes if item.source_type == "watch_later"]:
        items = watch_later_state.setdefault("items", {})
        items[_favorite_note_key(note)] = {
            "title": note.title,
            "url": note.url,
            "bvid": note.bvid,
            "crawled_at": now,
        }
    if include_watch_later:
        watch_later_state["last_crawled_at"] = now
    _save_favorite_state(state, vault_path)

    result.update(
        {
            "login": verify,
            "selected_folder_count": len(selected_ids),
            "matched_folder_count": len(folders),
            "fetched_count": fetched_count,
            "dynamic_count": 0,
            "favorite_count": len([note for note in notes if note.source_type == "favorite"]),
            "watch_later_count": len([note for note in notes if note.source_type == "watch_later"]),
            "skipped_count": skipped_count,
            "state_path": str(_favorite_state_path(vault_path)),
            "crawl_mode": mode,
        }
    )
    return result


async def fetch_watch_later_items(
    cookie_header: str,
    *,
    limit: int = 10,
) -> tuple[list[BilibiliNote], int]:
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        resp = await client.get(
            WATCH_LATER_API,
            params={"jsonp": "jsonp"},
            headers=_headers(cookie_header, "https://www.bilibili.com/watchlater/"),
        )
        data = resp.json()
        if resp.status_code != 200 or data.get("code") != 0:
            raise RuntimeError(f"稍后再看失败: http={resp.status_code} code={data.get('code')} {data.get('message')}")

        items = (data.get("data") or {}).get("list") or []
        notes: list[BilibiliNote] = []
        for item in items[:limit]:
            bvid = item.get("bvid") or ""
            owner = item.get("owner") or {}
            notes.append(
                BilibiliNote(
                    source_type="watch_later",
                    title=item.get("title") or "B站稍后再看视频",
                    content=item.get("desc") or "",
                    url=f"https://www.bilibili.com/video/{bvid}" if bvid else "",
                    author=owner.get("name") or "",
                    published_at=_format_ts(item.get("pubdate")),
                    bvid=bvid,
                    item_type="video",
                    images=[item.get("pic")] if item.get("pic") else [],
                    metadata={
                        "add_at": _format_ts(item.get("add_at")),
                        "add_at_ts": int(item.get("add_at") or 0),
                        "progress": item.get("progress", 0),
                    },
                )
            )
        await _enrich_video_notes(notes, client=client, cookie_header=cookie_header)
        return notes, len(items)


def _render_tags(note: BilibiliNote) -> str:
    if not note.tags:
        return "无"
    return " / ".join(note.tags)


def _render_dynamic(note: BilibiliNote) -> str:
    images = "\n".join(f"> ![图{i + 1}]({url})" for i, url in enumerate(note.images[:8])) or "> 无图片"
    return f"""# {note.title}

这是一条 Bilibili 动态爬取样本，格式参考 xhs 输出：正文、图片、来源信息放在折叠块里。

> [!tip]- 详情
> 原动态标题：{note.title}
>
> {_quote(note.content)}
>
{images}
>
> [!info]- 笔记属性
> - **来源**: Bilibili · {note.author}
> - **动态ID**: {note.dynamic_id}
> - **链接**: {note.url}
> - **日期**: {note.published_at}
> - **类型**: {note.item_type}
> - **BV号**: {note.bvid}
> - **标签**: {_render_tags(note)}
"""


def _render_favorite(note: BilibiliNote) -> str:
    cover = f"![封面]({note.images[0]})" if note.images else "无封面"
    cnt = note.metadata.get("cnt_info") or {}
    return f"""# {note.title}

这是一条 Bilibili 收藏夹爬取样本，来自收藏夹 `{note.folder_name}`。

> [!tip]- 详情
> 原视频标题：{note.title}
>
> {_quote(note.content)}
>
> {cover}
>
> [!info]- 笔记属性
> - **来源**: Bilibili 收藏夹 · {note.folder_name}
> - **UP主**: {note.author}
> - **UP主UID**: {note.metadata.get("author_id", "") or "未知"}
> - **BV号**: {note.bvid}
> - **OID**: {note.metadata.get("oid", "") or note.metadata.get("media_id", "") or "未知"}
> - **链接**: {note.url}
> - **收藏时间**: {note.metadata.get("fav_time", "")}
> - **标签**: {_render_tags(note)}
> - **互动**: {cnt.get("collect", 0)}收藏 / {cnt.get("play", 0)}播放 / {cnt.get("danmaku", 0)}弹幕
"""


def _render_watch_later(note: BilibiliNote) -> str:
    cover = f"![封面]({note.images[0]})" if note.images else "无封面"
    return f"""# {note.title}

这是一条 Bilibili 稍后再看爬取样本。

> [!tip]- 详情
> 原视频标题：{note.title}
>
> {_quote(note.content)}
>
> {cover}
>
> [!info]- 笔记属性
> - **来源**: Bilibili 稍后再看
> - **UP主**: {note.author}
> - **BV号**: {note.bvid}
> - **链接**: {note.url}
> - **发布时间**: {note.published_at}
> - **加入时间**: {note.metadata.get("add_at", "")}
> - **标签**: {_render_tags(note)}
> - **播放进度**: {note.metadata.get("progress", 0)} 秒
"""


def _normalize_match_name(text: str) -> str:
    value = str(text or "").strip().lower()
    value = re.sub(r"[\s\-_·•・]+", "", value)
    value = re.sub(r"[()（）\[\]【】]+", "", value)
    return value


def _clean_group_signal(text: str) -> str:
    value = str(text or "").strip()
    value = re.sub(r"[\\/:*?\"<>|#`~!@$%^&*()_=+{}\[\],.，。！？、；：\n\r\t]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip(" /")
    return value[:24]


def _is_generic_group_signal(text: str) -> bool:
    normalized = _normalize_match_name(text)
    if not normalized:
        return True
    if normalized in SMART_GROUP_GENERIC_SIGNAL_KEYS:
        return True
    if normalized.startswith("folder"):
        return True
    return False


def _split_saved_bilibili_tags(raw: str) -> list[str]:
    value = str(raw or "").strip()
    if not value or value == "无":
        return []
    parts = re.split(r"\s*/\s*|[、，,|]", value)
    cleaned: list[str] = []
    seen: set[str] = set()
    for part in parts:
        signal = _clean_group_signal(part)
        if not signal or signal in seen:
            continue
        seen.add(signal)
        cleaned.append(signal)
    return cleaned


def _extract_saved_bilibili_excerpt(text: str) -> str:
    lines: list[str] = []
    capture = False
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith("> 原视频标题：") or line.startswith("> 原动态标题："):
            capture = True
            continue
        if not capture:
            continue
        if line.startswith("> [!info]") or line.startswith("> - **来源**:"):
            break
        if line.startswith("> ![") or line in {">", ""}:
            continue
        clean = line.lstrip("> ").strip()
        if clean:
            lines.append(clean)
        if len(lines) >= 4:
            break
    return " ".join(lines)[:240]


def _extract_saved_bilibili_signal_chunks(*values: str) -> list[str]:
    return [_clean_group_signal(chunk) for chunk in extract_signal_tokens(*values)]


def _parse_saved_bilibili_entry(path: Path) -> dict[str, Any] | None:
    note = _parse_saved_bilibili_favorite(path)
    if note:
        text = path.read_text(encoding="utf-8", errors="replace")
        title = str(note.get("title") or path.stem)
        excerpt = _extract_saved_bilibili_excerpt(text)
        note["source_type"] = "favorite"
        note["content_excerpt"] = excerpt
        note["content_signals"] = _extract_saved_bilibili_signal_chunks(title, excerpt)
        return note

    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None

    title_match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
    title = (title_match.group(1).strip() if title_match else path.stem) or path.stem
    link_match = re.search(r"\*\*链接\*\*\s*:\s*(https?://\S+)", text)
    tag_match = re.search(r"\*\*标签\*\*\s*:\s*(.+)", text)
    author_match = re.search(r"\*\*UP主\*\*\s*:\s*(.+)", text)
    excerpt = _extract_saved_bilibili_excerpt(text)

    if "Bilibili 稍后再看" in text and author_match:
        published_match = re.search(r"\*\*发布时间\*\*\s*:\s*([0-9:\-\s]+)", text)
        return {
            "source_type": "watch_later",
            "title": title,
            "author": author_match.group(1).strip(),
            "url": link_match.group(1).strip() if link_match else "",
            "favorite_time": published_match.group(1).strip() if published_match else "",
            "favorite_date": (published_match.group(1).strip()[:10] if published_match else ""),
            "folder_name": "稍后再看",
            "author_id": "",
            "oid": "",
            "tags": _split_saved_bilibili_tags(tag_match.group(1) if tag_match else ""),
            "path": str(path),
            "content_excerpt": excerpt,
            "content_signals": _extract_saved_bilibili_signal_chunks(title, excerpt),
        }

    dynamic_author_match = re.search(r"\*\*来源\*\*\s*:\s*Bilibili\s*·\s*(.+)", text)
    if dynamic_author_match:
        date_match = re.search(r"\*\*日期\*\*\s*:\s*([0-9:\-\s]+)", text)
        return {
            "source_type": "dynamic",
            "title": title,
            "author": dynamic_author_match.group(1).strip(),
            "url": link_match.group(1).strip() if link_match else "",
            "favorite_time": date_match.group(1).strip() if date_match else "",
            "favorite_date": (date_match.group(1).strip()[:10] if date_match else ""),
            "folder_name": "动态",
            "author_id": "",
            "oid": "",
            "tags": _split_saved_bilibili_tags(tag_match.group(1) if tag_match else ""),
            "path": str(path),
            "content_excerpt": excerpt,
            "content_signals": _extract_saved_bilibili_signal_chunks(title, excerpt),
        }

    return None


def _parse_saved_bilibili_favorite(path: Path) -> dict[str, Any] | None:
    meta, content = safe_load_frontmatter(path)
    platform = first_non_empty(meta.get("source-platform"), meta.get("platform")).lower()
    entry_type = first_non_empty(meta.get("entry-type")).lower()
    if platform == "bilibili" and entry_type in {"social-favorite", "bilibili-favorite"}:
        favorite_time = first_non_empty(meta.get("fav_time"), meta.get("favorite-time"), meta.get("published"))
        author = first_non_empty(meta.get("author"))
        if not author:
            return None
        return {
            "title": first_non_empty(meta.get("title")) or path.stem,
            "author": author,
            "url": first_non_empty(meta.get("source-url"), meta.get("url")),
            "favorite_time": favorite_time,
            "favorite_date": favorite_time[:10] if favorite_time else "",
            "folder_name": _clean_group_signal(first_non_empty(meta.get("folder-name"), meta.get("folder_name"))) or path.parent.name,
            "author_id": first_non_empty(meta.get("author-id"), meta.get("author_id")),
            "oid": first_non_empty(meta.get("oid"), meta.get("media_id")),
            "bvid": extract_bvid(first_non_empty(meta.get("source-url"), meta.get("url"))),
            "tags": normalize_string_list(meta.get("tags")),
            "path": str(path),
        }

    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None

    if "Bilibili 收藏夹" not in text:
        return None

    title_match = re.search(r"^#\s+(.+)$", content or text, re.MULTILINE)
    author_match = re.search(r"\*\*UP主\*\*\s*:\s*(.+)", text)
    if not author_match:
        return None

    folder_match = re.search(r"\*\*来源\*\*\s*:\s*Bilibili 收藏夹\s*·\s*(.+)", text)
    link_match = re.search(r"\*\*链接\*\*\s*:\s*(https?://\S+)", text)
    favorite_time_match = re.search(r"\*\*收藏时间\*\*\s*:\s*([0-9:\-\s]+)", text)
    tag_match = re.search(r"\*\*标签\*\*\s*:\s*(.+)", text)
    author_id_match = re.search(r"\*\*UP主UID\*\*\s*:\s*(.+)", text)
    oid_match = re.search(r"\*\*(?:OID|媒体ID)\*\*\s*:\s*(.+)", text)
    bvid_match = re.search(r"\*\*BV号\*\*\s*:\s*(BV[0-9A-Za-z]+)", text)

    folder_name = _clean_group_signal(folder_match.group(1) if folder_match else path.parent.name)
    author = author_match.group(1).strip()
    title = (title_match.group(1).strip() if title_match else path.stem) or path.stem
    link_url = link_match.group(1).strip() if link_match else ""
    favorite_time = favorite_time_match.group(1).strip() if favorite_time_match else ""
    favorite_date = favorite_time[:10] if favorite_time else ""
    return {
        "title": title,
        "author": author,
        "url": link_url,
        "favorite_time": favorite_time,
        "favorite_date": favorite_date,
        "folder_name": folder_name or path.parent.name,
        "author_id": (author_id_match.group(1).replace("未知", "").strip() if author_id_match else ""),
        "oid": (oid_match.group(1).replace("未知", "").strip() if oid_match else ""),
        "bvid": extract_bvid(bvid_match.group(1) if bvid_match else link_url),
        "tags": _split_saved_bilibili_tags(tag_match.group(1) if tag_match else ""),
        "path": str(path),
    }


def _build_saved_bilibili_author_lookup_maps(
    *,
    followed_ups: list[dict[str, Any]] | None = None,
    creator_profiles: dict[str, dict[str, Any]] | None = None,
) -> tuple[dict[str, str], dict[str, str], dict[str, str], set[str]]:
    profile_name_map: dict[str, str] = {}
    profile_oid_map: dict[str, str] = {}
    followed_name_map: dict[str, str] = {}
    followed_uid_set: set[str] = set()

    for mid, profile in (creator_profiles or {}).items():
        author_id = str(mid or profile.get("author_id") or "").strip()
        if not author_id:
            continue
        for raw_name in (
            profile.get("matched_author"),
            profile.get("author"),
        ):
            normalized_name = _normalize_match_name(str(raw_name or ""))
            if normalized_name and normalized_name not in profile_name_map:
                profile_name_map[normalized_name] = author_id
        for raw_oid in profile.get("sample_oids") or []:
            oid = str(raw_oid or "").strip()
            if oid and oid not in profile_oid_map:
                profile_oid_map[oid] = author_id

    for item in followed_ups or []:
        author_id = str(item.get("mid") or "").strip()
        if author_id:
            followed_uid_set.add(author_id)
        normalized_name = _normalize_match_name(str(item.get("uname") or ""))
        if author_id and normalized_name and normalized_name not in followed_name_map:
            followed_name_map[normalized_name] = author_id

    return profile_name_map, profile_oid_map, followed_name_map, followed_uid_set


def _resolve_saved_bilibili_author_id(
    note: dict[str, Any],
    *,
    profile_name_map: dict[str, str],
    profile_oid_map: dict[str, str],
    followed_name_map: dict[str, str],
    bvid_author_id_map: dict[str, str] | None = None,
) -> tuple[str, str]:
    author_id = str(note.get("author_id") or "").strip()
    if author_id:
        return author_id, "note"

    oid = str(note.get("oid") or "").strip()
    if oid and oid in profile_oid_map:
        return profile_oid_map[oid], "profile-oid"

    normalized_name = _normalize_match_name(str(note.get("author") or ""))
    if normalized_name:
        if normalized_name in profile_name_map:
            return profile_name_map[normalized_name], "profile-name"
        if normalized_name in followed_name_map:
            return followed_name_map[normalized_name], "followed-name"

    bvid = extract_bvid(note.get("bvid") or note.get("url"))
    if bvid and bvid_author_id_map and bvid in bvid_author_id_map:
        return str(bvid_author_id_map[bvid] or "").strip(), "video-meta"

    return "", ""


def _write_saved_bilibili_author_id(path: Path, author_id: str) -> bool:
    if not author_id:
        return False

    meta, _content = safe_load_frontmatter(path)
    if first_non_empty(meta.get("source-platform"), meta.get("platform")).lower() == "bilibili":
        try:
            post = frontmatter.load(str(path))
            post.metadata["author-id"] = author_id
            post.metadata["author_id"] = author_id
            path.write_text(frontmatter.dumps(post), encoding="utf-8")
            return True
        except Exception:
            pass

    try:
        original = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return False

    if re.search(r"^\s*>?\s*-\s*\*\*UP主UID\*\*:\s*.+$", original, re.MULTILINE):
        updated = re.sub(
            r"(^\s*>?\s*-\s*\*\*UP主UID\*\*:\s*).+$",
            rf"\1{author_id}",
            original,
            count=1,
            flags=re.MULTILINE,
        )
    else:
        updated = re.sub(
            r"(^\s*>?\s*-\s*\*\*UP主\*\*:\s*.+$)",
            rf"\1\n> - **UP主UID**: {author_id}",
            original,
            count=1,
            flags=re.MULTILINE,
        )

    if updated == original:
        return False

    path.write_text(updated, encoding="utf-8")
    return True


def backfill_saved_bilibili_favorite_author_ids(
    *,
    vault_path: str | Path | None = None,
    followed_ups: list[dict[str, Any]] | None = None,
    creator_profiles: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    bilibili_dir = _vault_bilibili_dir(vault_path)
    favorites_dir = bilibili_dir / "favorites"
    if not favorites_dir.exists():
        return {
            "success": True,
            "bilibili_dir": str(bilibili_dir),
            "favorites_dir": str(favorites_dir),
            "scanned_files": 0,
            "missing_author_id_count": 0,
            "updated_count": 0,
            "updated_files": [],
            "unresolved": [],
            "message": "还没有本地 B 站收藏结果，请先执行收藏入库。",
        }

    profile_name_map, profile_oid_map, followed_name_map, _followed_uid_set = (
        _build_saved_bilibili_author_lookup_maps(
            followed_ups=followed_ups,
            creator_profiles=creator_profiles,
        )
    )

    scanned_files = 0
    missing_author_id_count = 0
    updated_files: list[str] = []
    unresolved: list[dict[str, str]] = []

    for path in sorted(favorites_dir.rglob("*.md")):
        note = _parse_saved_bilibili_favorite(path)
        if not note:
            continue
        scanned_files += 1
        if note.get("author_id"):
            continue

        missing_author_id_count += 1
        author = str(note.get("author") or "").strip()
        matched_author_id, _resolved_via = _resolve_saved_bilibili_author_id(
            note,
            profile_name_map=profile_name_map,
            profile_oid_map=profile_oid_map,
            followed_name_map=followed_name_map,
        )
        if not matched_author_id:
            unresolved.append({"author": author, "path": str(path)})
            continue

        if not _write_saved_bilibili_author_id(path, matched_author_id):
            unresolved.append({"author": author, "path": str(path)})
            continue
        updated_files.append(str(path))

    return {
        "success": True,
        "bilibili_dir": str(bilibili_dir),
        "favorites_dir": str(favorites_dir),
        "scanned_files": scanned_files,
        "missing_author_id_count": missing_author_id_count,
        "updated_count": len(updated_files),
        "updated_files": updated_files,
        "unresolved": unresolved[:24],
        "message": f"扫描 {scanned_files} 个收藏文件，回填 {len(updated_files)} 个缺失的 UP主UID。",
    }


async def build_saved_bilibili_favorite_up_pool(
    *,
    vault_path: str | Path | None = None,
    followed_ups: list[dict[str, Any]] | None = None,
    creator_profiles: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    bilibili_dir = _vault_bilibili_dir(vault_path)
    favorites_dir = bilibili_dir / "favorites"
    if not favorites_dir.exists():
        return {
            "success": True,
            "bilibili_dir": str(bilibili_dir),
            "favorites_dir": str(favorites_dir),
            "scanned_files": 0,
            "candidate_author_count": 0,
            "missing_author_id_count": 0,
            "resolved_author_count": 0,
            "already_followed_count": 0,
            "favorite_up_count": 0,
            "favorite_up_uids": [],
            "favorite_up_profiles": {},
            "updated_count": 0,
            "updated_files": [],
            "unresolved": [],
            "message": "还没有本地 B 站收藏夹结果，请先执行收藏入库。",
        }

    notes: list[dict[str, Any]] = []
    for path in sorted(favorites_dir.rglob("*.md")):
        note = _parse_saved_bilibili_favorite(path)
        if not note:
            continue
        note["bvid"] = extract_bvid(note.get("bvid") or note.get("url"))
        notes.append(note)

    if not notes:
        return {
            "success": True,
            "bilibili_dir": str(bilibili_dir),
            "favorites_dir": str(favorites_dir),
            "scanned_files": 0,
            "candidate_author_count": 0,
            "missing_author_id_count": 0,
            "resolved_author_count": 0,
            "already_followed_count": 0,
            "favorite_up_count": 0,
            "favorite_up_uids": [],
            "favorite_up_profiles": {},
            "updated_count": 0,
            "updated_files": [],
            "unresolved": [],
            "message": "收藏夹目录里还没有可识别的收藏文件。",
        }

    profile_name_map, profile_oid_map, followed_name_map, followed_uid_set = (
        _build_saved_bilibili_author_lookup_maps(
            followed_ups=followed_ups,
            creator_profiles=creator_profiles,
        )
    )

    candidate_author_keys = {
        _normalize_match_name(str(note.get("author") or "")) or str(note.get("author") or "").strip()
        for note in notes
        if str(note.get("author") or "").strip()
    }
    missing_author_id_count = sum(1 for note in notes if not str(note.get("author_id") or "").strip())

    unresolved_bvids: list[str] = []
    for note in notes:
        resolved_author_id, resolved_via = _resolve_saved_bilibili_author_id(
            note,
            profile_name_map=profile_name_map,
            profile_oid_map=profile_oid_map,
            followed_name_map=followed_name_map,
        )
        note["resolved_author_id"] = resolved_author_id
        note["resolved_via"] = resolved_via
        if not resolved_author_id:
            bvid = extract_bvid(note.get("bvid") or note.get("url"))
            if bvid:
                unresolved_bvids.append(bvid)

    bvid_author_id_map: dict[str, str] = {}
    unresolved_bvid_list = unique_strings(unresolved_bvids)
    if unresolved_bvid_list:
        async with httpx.AsyncClient(
            timeout=15,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
        ) as client:
            for index, bvid in enumerate(unresolved_bvid_list, start=1):
                try:
                    metadata = await fetch_bilibili_video_metadata(
                        client,
                        bvid=bvid,
                        headers={"User-Agent": USER_AGENT},
                    )
                except Exception:
                    metadata = {}
                author_id = str(metadata.get("author_id") or "").strip()
                author_name = str(metadata.get("author") or "").strip()
                if author_id:
                    bvid_author_id_map[bvid] = author_id
                    normalized_name = _normalize_match_name(author_name)
                    if normalized_name:
                        profile_name_map.setdefault(normalized_name, author_id)
                if index % 12 == 0:
                    await asyncio.sleep(0)

    updated_files: list[str] = []
    unresolved: list[dict[str, str]] = []
    resolved_author_ids: set[str] = set()
    already_followed_uids: set[str] = set()
    favorite_up_profiles: dict[str, dict[str, Any]] = {}

    for note in notes:
        resolved_author_id, resolved_via = _resolve_saved_bilibili_author_id(
            note,
            profile_name_map=profile_name_map,
            profile_oid_map=profile_oid_map,
            followed_name_map=followed_name_map,
            bvid_author_id_map=bvid_author_id_map,
        )
        note["resolved_author_id"] = resolved_author_id
        note["resolved_via"] = resolved_via

        if not resolved_author_id:
            unresolved.append(
                {
                    "author": str(note.get("author") or "").strip(),
                    "path": str(note.get("path") or ""),
                }
            )
            continue

        resolved_author_ids.add(resolved_author_id)
        if not str(note.get("author_id") or "").strip():
            target_path = Path(str(note.get("path") or ""))
            if target_path.exists() and _write_saved_bilibili_author_id(target_path, resolved_author_id):
                updated_files.append(str(target_path))

        if resolved_author_id in followed_uid_set:
            already_followed_uids.add(resolved_author_id)
            continue

        profile = favorite_up_profiles.setdefault(
            resolved_author_id,
            {
                "author": str(note.get("author") or resolved_author_id).strip() or resolved_author_id,
                "author_id": resolved_author_id,
                "pending_author_id": False,
                "favorite_note_count": 0,
                "sample_titles": [],
                "sample_tags": [],
                "sample_folders": [],
                "sample_oids": [],
                "sample_urls": [],
                "source_summary": "",
                "resolved_via": resolved_via,
            },
        )
        if not str(profile.get("author") or "").strip():
            profile["author"] = str(note.get("author") or resolved_author_id).strip() or resolved_author_id
        profile["favorite_note_count"] = int(profile.get("favorite_note_count") or 0) + 1
        profile["sample_titles"] = unique_strings(
            [*(profile.get("sample_titles") or []), str(note.get("title") or "").strip()],
            limit=4,
        )
        profile["sample_tags"] = unique_strings(
            [*(profile.get("sample_tags") or []), *(note.get("tags") or [])],
            limit=8,
        )
        profile["sample_folders"] = unique_strings(
            [*(profile.get("sample_folders") or []), str(note.get("folder_name") or "").strip()],
            limit=4,
        )
        profile["sample_oids"] = unique_strings(
            [*(profile.get("sample_oids") or []), str(note.get("oid") or "").strip()],
            limit=6,
        )
        profile["sample_urls"] = unique_strings(
            [*(profile.get("sample_urls") or []), str(note.get("url") or "").strip()],
            limit=4,
        )
        if not profile.get("resolved_via"):
            profile["resolved_via"] = resolved_via

    ordered_profiles = dict(
        sorted(
            favorite_up_profiles.items(),
            key=lambda item: (
                -int((item[1] or {}).get("favorite_note_count") or 0),
                str((item[1] or {}).get("author") or ""),
            ),
        )
    )
    for profile in ordered_profiles.values():
        folders = profile.get("sample_folders") or []
        tags = profile.get("sample_tags") or []
        titles = profile.get("sample_titles") or []
        if folders:
            profile["source_summary"] = "来自收藏夹：" + "、".join(folders[:3])
        elif tags:
            profile["source_summary"] = "来自标签：" + "、".join(tags[:4])
        elif titles:
            profile["source_summary"] = "来自收藏视频：" + "、".join(titles[:2])
        else:
            profile["source_summary"] = "来自本地收藏"

    unresolved_preview = unresolved[:24]
    message = (
        f"扫描 {len(notes)} 个收藏文件，识别 {len(resolved_author_ids)} 位收藏作者；"
        f"其中 {len(already_followed_uids)} 位已在真实关注里，"
        f"新增 {len(ordered_profiles)} 位进入收藏夹UP。"
    )
    if unresolved:
        message += f" 仍有 {len(unresolved)} 位作者暂未解析到 UID。"

    return {
        "success": True,
        "bilibili_dir": str(bilibili_dir),
        "favorites_dir": str(favorites_dir),
        "scanned_files": len(notes),
        "candidate_author_count": len(candidate_author_keys),
        "missing_author_id_count": missing_author_id_count,
        "resolved_author_count": len(resolved_author_ids),
        "already_followed_count": len(already_followed_uids),
        "favorite_up_count": len(ordered_profiles),
        "favorite_up_uids": list(ordered_profiles.keys()),
        "favorite_up_profiles": ordered_profiles,
        "updated_count": len(updated_files),
        "updated_files": updated_files,
        "unresolved": unresolved_preview,
        "message": message,
    }


def _build_author_source_summary(candidate: BilibiliFavoriteAuthorAggregate) -> str:
    if candidate.sample_folders:
        return "来自收藏夹：" + "、".join(candidate.sample_folders[:3])
    if candidate.sample_tags:
        return "来自标签：" + "、".join(candidate.sample_tags[:4])
    if candidate.sample_titles:
        return "来自收藏视频：" + "、".join(candidate.sample_titles[:2])
    return f"来自本地收藏 {candidate.note_count} 条视频"


def _pick_followed_match(
    candidate: BilibiliFavoriteAuthorAggregate,
    followed_ups: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if candidate.author_id:
        for item in followed_ups:
            if str(item.get("mid") or "").strip() == candidate.author_id:
                return item

    exact_name = candidate.author.strip()
    normalized = _normalize_match_name(exact_name)
    if not normalized:
        return None

    for item in followed_ups:
        uname = str(item.get("uname") or "").strip()
        if uname == exact_name:
            return item

    for item in followed_ups:
        uname = str(item.get("uname") or "").strip()
        if _normalize_match_name(uname) == normalized:
            return item

    for item in followed_ups:
        uname = str(item.get("uname") or "").strip()
        normalized_uname = _normalize_match_name(uname)
        if normalized and normalized_uname and (normalized in normalized_uname or normalized_uname in normalized):
            return item

    return None


def _primary_group_signal(candidate: BilibiliFavoriteAuthorAggregate) -> str:
    for signal, _weight in candidate.signal_weights.most_common(6):
        if not _is_generic_group_signal(signal):
            return signal
    return "other"


def _build_smart_group_value(label: str) -> str:
    if label == "其他":
        return "other"
    return "smart-" + hashlib.md5(label.encode("utf-8")).hexdigest()[:8]


def _build_smart_group_label(primary: str, members: list[BilibiliFavoriteAuthorAggregate]) -> str:
    if primary == "other":
        return "其他"
    secondary = Counter()
    for candidate in members:
        for signal, weight in candidate.signal_weights.most_common(6):
            if signal == primary or _is_generic_group_signal(signal):
                continue
            secondary[signal] += weight
    second = secondary.most_common(1)
    if second and len(members) > 1 and second[0][0] != primary:
        return f"{primary} / {second[0][0]}"
    return primary


def _build_smart_group_options(
    candidates: list[BilibiliFavoriteAuthorAggregate],
) -> list[dict[str, Any]]:
    if not candidates:
        return []

    global_scores = Counter()
    signal_support = Counter()
    for candidate in candidates:
        seen_signals: set[str] = set()
        for signal, weight in candidate.signal_weights.most_common(4):
            if _is_generic_group_signal(signal):
                continue
            global_scores[signal] += weight
            if signal not in seen_signals:
                signal_support[signal] += 1
                seen_signals.add(signal)

    canonical = [
        signal
        for signal, _score in global_scores.most_common(12)
        if signal_support[signal] >= 2
    ]

    grouped: dict[str, list[BilibiliFavoriteAuthorAggregate]] = defaultdict(list)
    for candidate in candidates:
        best_signal = ""
        best_weight = 0.0
        for signal, weight in candidate.signal_weights.most_common(6):
            if signal in canonical and weight > best_weight:
                best_signal = signal
                best_weight = weight
        if not best_signal:
            best_signal = _primary_group_signal(candidate)
            if best_signal != "other" and best_signal not in canonical and len(candidates) > 6:
                best_signal = "other"
        grouped[best_signal or "other"].append(candidate)

    options: list[dict[str, Any]] = []
    for primary_signal, members in grouped.items():
        label = _build_smart_group_label(primary_signal, members)
        value = _build_smart_group_value(label)
        signal_counter = Counter()
        for member in members:
            member.smart_group_value = value
            member.smart_group_label = label
            for signal, weight in member.signal_weights.most_common(5):
                if _is_generic_group_signal(signal):
                    continue
                signal_counter[signal] += weight
        options.append(
            {
                "value": value,
                "label": label,
                "count": len(members),
                "sample_authors": [member.matched_uname or member.author for member in members[:4]],
                "sample_tags": [signal for signal, _score in signal_counter.most_common(4)],
            }
        )

    options.sort(key=lambda item: (-int(item.get("count") or 0), str(item.get("label") or "")))
    return options


async def analyze_saved_bilibili_favorites(
    *,
    vault_path: str | Path | None = None,
    followed_ups: list[dict[str, Any]] | None = None,
    progress_callback=None,
) -> dict[str, Any]:
    bilibili_dir = _vault_bilibili_dir(vault_path)
    content_dirs = [bilibili_dir / "favorites", bilibili_dir / "watch_later", bilibili_dir / "dynamic"]
    if not any(path.exists() for path in content_dirs):
        return {
            "success": True,
            "bilibili_dir": str(bilibili_dir),
            "favorites_dir": str(bilibili_dir / "favorites"),
            "total_files": 0,
            "total_notes": 0,
            "total_authors": 0,
            "matched_followed_count": 0,
            "unmatched_author_count": 0,
            "group_options": [],
            "profiles": {},
            "message": "还没有本地 B 站内容，请先执行收藏 / 稍后再看 / 动态入库。",
        }

    paths: list[Path] = []
    for source_dir in content_dirs:
        if source_dir.exists():
            paths.extend(sorted(source_dir.rglob("*.md")))
    total_files = len(paths)
    aggregates: dict[str, BilibiliFavoriteAuthorAggregate] = {}
    total_notes = 0

    if progress_callback:
        progress_callback(
            {
                "stage": "正在扫描本地收藏",
                "progress": 5,
                "total_files": total_files,
                "processed_files": 0,
                "matched_followed_count": 0,
                "total_groups": 0,
            }
        )

    for index, path in enumerate(paths, start=1):
        note = _parse_saved_bilibili_entry(path)
        if note:
            total_notes += 1
            author = note["author"]
            candidate = aggregates.setdefault(author, BilibiliFavoriteAuthorAggregate(author=author))
            candidate.note_count += 1
            if note.get("author_id") and not candidate.author_id:
                candidate.author_id = str(note.get("author_id") or "").strip()
            if note["favorite_date"] and note["favorite_date"] >= candidate.latest_date:
                candidate.latest_date = note["favorite_date"]
                candidate.latest_title = note["title"]
            if note["title"] and note["title"] not in candidate.sample_titles and len(candidate.sample_titles) < 3:
                candidate.sample_titles.append(note["title"])
            if note["url"] and note["url"] not in candidate.sample_urls and len(candidate.sample_urls) < 3:
                candidate.sample_urls.append(note["url"])
            if note.get("oid") and note["oid"] not in candidate.sample_oids and len(candidate.sample_oids) < 4:
                candidate.sample_oids.append(str(note["oid"]))
            folder_name = note["folder_name"]
            if folder_name and folder_name not in candidate.sample_folders and len(candidate.sample_folders) < 4:
                candidate.sample_folders.append(folder_name)
            if folder_name and not _is_generic_group_signal(folder_name):
                candidate.signal_weights[folder_name] += 2.5
            for tag in note["tags"]:
                if tag and tag not in candidate.sample_tags and len(candidate.sample_tags) < 6:
                    candidate.sample_tags.append(tag)
                if tag and not _is_generic_group_signal(tag):
                    candidate.signal_weights[tag] += 1.0
            for signal in note.get("content_signals") or []:
                if signal and not _is_generic_group_signal(signal):
                    candidate.signal_weights[signal] += 0.45
                if signal and signal not in candidate.sample_content_signals and len(candidate.sample_content_signals) < 8:
                    candidate.sample_content_signals.append(signal)

        if progress_callback and (index == total_files or index == 1 or index % 5 == 0):
            progress_callback(
                {
                    "stage": f"正在扫描收藏 {index}/{total_files}",
                    "progress": min(58, 5 + int(index / max(total_files, 1) * 53)),
                    "total_files": total_files,
                    "processed_files": index,
                    "matched_followed_count": 0,
                    "total_groups": 0,
                }
            )
        if index % 20 == 0:
            await asyncio.sleep(0)

    ordered = sorted(
        aggregates.values(),
        key=lambda item: (item.note_count, item.latest_date, item.author),
        reverse=True,
    )

    matched_candidates: list[BilibiliFavoriteAuthorAggregate] = []
    if progress_callback:
        progress_callback(
            {
                "stage": "正在匹配关注列表",
                "progress": 68,
                "total_files": total_files,
                "processed_files": total_files,
                "matched_followed_count": 0,
                "total_groups": 0,
            }
        )
    total_authors = len(ordered)
    for index, candidate in enumerate(ordered, start=1):
        candidate.source_summary = _build_author_source_summary(candidate)
        match = _pick_followed_match(candidate, followed_ups or [])
        if not match:
            pass
        else:
            candidate.matched_mid = str(match.get("mid") or "")
            candidate.matched_uname = str(match.get("uname") or candidate.author)
            if candidate.matched_mid and not candidate.author_id:
                candidate.author_id = candidate.matched_mid
            if candidate.matched_mid:
                matched_candidates.append(candidate)
        if progress_callback and (index == total_authors or index <= 3 or index % 10 == 0):
            progress_callback(
                {
                    "stage": f"正在匹配关注作者 {index}/{max(total_authors, 1)}",
                    "progress": min(82, 58 + int(index / max(total_authors, 1) * 24)),
                    "total_files": total_files,
                    "processed_files": total_files,
                    "total_authors": total_authors,
                    "processed_authors": index,
                    "current_author": candidate.author,
                    "matched_followed_count": len(matched_candidates),
                    "total_groups": 0,
                }
            )
        if index % 25 == 0:
            await asyncio.sleep(0)

    group_options = _build_smart_group_options(matched_candidates)
    all_candidates = [
        {
            "author": candidate.author,
            "author_id": candidate.author_id or candidate.matched_mid,
            "matched_mid": candidate.matched_mid,
            "matched_uname": candidate.matched_uname,
            "note_count": candidate.note_count,
            "latest_date": candidate.latest_date,
            "latest_title": candidate.latest_title,
            "sample_titles": candidate.sample_titles,
            "sample_tags": candidate.sample_tags,
            "sample_folders": candidate.sample_folders,
            "sample_oids": candidate.sample_oids,
            "sample_urls": candidate.sample_urls,
            "content_signals": candidate.sample_content_signals,
            "source_summary": candidate.source_summary,
        }
        for candidate in ordered
    ]
    profiles = {
        candidate.matched_mid: {
            "author": candidate.matched_uname or candidate.author,
            "author_id": candidate.matched_mid,
            "matched_author": candidate.author,
            "favorite_note_count": candidate.note_count,
            "smart_groups": [candidate.smart_group_value],
            "smart_group_labels": [candidate.smart_group_label],
            "latest_title": candidate.latest_title,
            "sample_titles": candidate.sample_titles,
            "sample_tags": candidate.sample_tags,
            "sample_folders": candidate.sample_folders,
            "sample_oids": candidate.sample_oids,
            "sample_urls": candidate.sample_urls,
            "source_summary": candidate.source_summary,
        }
        for candidate in matched_candidates
        if candidate.matched_mid
    }

    if progress_callback:
        progress_callback(
            {
                "stage": "本地 B站标签分析完成",
                "progress": 100,
                "total_files": total_files,
                "processed_files": total_files,
                "total_authors": total_authors,
                "processed_authors": total_authors,
                "matched_followed_count": len(profiles),
                "total_groups": len(group_options),
            }
        )

    return {
        "success": True,
        "bilibili_dir": str(bilibili_dir),
        "favorites_dir": str(bilibili_dir / "favorites"),
        "total_files": total_files,
        "total_notes": total_notes,
        "total_authors": len(ordered),
        "matched_followed_count": len(profiles),
        "unmatched_author_count": max(0, len(ordered) - len(profiles)),
        "all_candidates": all_candidates,
        "group_options": group_options,
        "profiles": profiles,
        "message": f"从 {total_notes} 条本地 B 站内容中匹配到 {len(profiles)} 个已关注 UP，整理出 {len(group_options)} 个智能分组。",
    }


def _note_path(base: Path, note: BilibiliNote) -> Path:
    date = _today()
    if note.source_type == "dynamic":
        if _is_manual_link_dynamic(note):
            return (base / BILIBILI_ACTIVE_SAVE_DIRNAME) / f"{date} 动态 {_safe_filename(note.title)}.md"
        folder_path = base / "dynamic"
        for part in [segment for segment in str(note.folder_name or "").split("/") if str(segment or "").strip()]:
            folder_path = folder_path / _safe_filename(part, "监控")
        return folder_path / f"{date} 动态 {_safe_filename(note.title)}.md"
    if note.source_type == "favorite":
        folder = _safe_filename(note.folder_name, "默认收藏夹")
        suffix = f" {note.bvid}" if note.bvid else ""
        return base / "favorites" / folder / f"{date} 收藏 {_safe_filename(note.title)}{suffix}.md"
    if note.source_type == "watch_later":
        suffix = f" {note.bvid}" if note.bvid else ""
        return base / "watch_later" / f"{date} 稍后再看 {_safe_filename(note.title)}{suffix}.md"
    return base / f"{date} {_safe_filename(note.title)}.md"


def _resolve_output_dir(base: Path, notes: list[BilibiliNote]) -> Path:
    if not notes:
        return base
    parent_dirs = [_note_path(base, note).parent.resolve() for note in notes]
    common_dir = Path(os.path.commonpath([str(path) for path in parent_dirs]))
    try:
        common_dir.relative_to(base.resolve())
    except ValueError:
        return base
    return common_dir


def _is_manual_link_dynamic(note: BilibiliNote) -> bool:
    return (
        note.source_type == "dynamic"
        and str((note.metadata or {}).get("crawl_source") or "").strip() == "manual-link"
    )


def _resolve_summary_dir(base: Path, notes: list[BilibiliNote]) -> Path:
    if notes and all(_is_manual_link_dynamic(note) for note in notes):
        return base / BILIBILI_ACTIVE_SAVE_DIRNAME
    return base


def _build_bilibili_unified_entry(
    note: BilibiliNote,
    *,
    obsidian_path: str,
    source_module: str = "bilibili-crawler",
) -> UnifiedVaultEntry:
    entry_type_map = {
        "dynamic": "social-dynamic",
        "favorite": "social-favorite",
        "watch_later": "social-watch-later",
    }
    abo_type_map = {
        "dynamic": "bilibili-dynamic",
        "favorite": "bilibili-favorite",
        "watch_later": "bilibili-watch-later",
    }
    summary = (note.content or "").strip().splitlines()[0][:160] if note.content else ""
    return UnifiedVaultEntry(
        entry_id=first_non_empty(note.dynamic_id, note.bvid, note.metadata.get("oid"), note.url, note.title),
        entry_type=entry_type_map.get(note.source_type, "social-entry"),
        title=note.title,
        summary=summary,
        source_url=note.url,
        source_platform="bilibili",
        source_module=source_module,
        author=note.author,
        author_id=first_non_empty(note.metadata.get("author_id")),
        published=note.published_at,
        tags=note.tags,
        obsidian_path=obsidian_path,
        metadata={
            "abo-type": abo_type_map.get(note.source_type, "bilibili-entry"),
            "platform": "bilibili",
            "folder-name": note.folder_name,
            "dynamic-id": note.dynamic_id,
            "bvid": note.bvid,
            "item-type": note.item_type,
            "images": note.images,
            **dict(note.metadata or {}),
        },
    )


def build_bilibili_dynamic_obsidian_path(
    item: dict[str, Any],
    *,
    vault_path: str | Path | None = None,
) -> str:
    """Return the same relative markdown path used by selected/manual Bilibili saves."""
    title = str(item.get("title") or "").strip() or "B站动态"
    dynamic_id = str(item.get("dynamic_id") or item.get("id") or "").strip()
    url = str(item.get("url") or "").strip() or (
        f"https://t.bilibili.com/{dynamic_id}" if dynamic_id else ""
    )
    dynamic_type = str(item.get("dynamic_type") or "text").strip() or "text"
    note = BilibiliNote(
        source_type="dynamic",
        title=title,
        content=str(item.get("content") or item.get("description") or "").strip(),
        url=url,
        author=str(item.get("author") or item.get("up_name") or "").strip(),
        published_at=str(item.get("published_at") or item.get("published") or ""),
        dynamic_id=dynamic_id,
        bvid=extract_bvid(item.get("bvid") or item.get("url")),
        item_type=dynamic_type,
        images=[],
        tags=merge_tags(item.get("tags") or []),
        folder_name=_resolve_dynamic_folder_name(item),
        metadata={
            "author_id": str(item.get("author_id") or item.get("up_uid") or "").strip(),
            "matched_keywords": normalize_string_list(item.get("matched_keywords")),
            "matched_tags": normalize_string_list(item.get("matched_tags")),
            "monitor_label": str(item.get("monitor_label") or "").strip(),
            "crawl_source": str(item.get("crawl_source") or "").strip(),
            "crawl_source_label": str(item.get("crawl_source_label") or "").strip(),
        },
    )
    vault = _vault_root(vault_path)
    base = vault / "bilibili"
    return _note_path(base, note).relative_to(vault).as_posix()


def write_notes_to_vault(
    notes: list[BilibiliNote],
    *,
    vault_path: str | Path | None = None,
    summary: dict | None = None,
) -> dict:
    vault = _vault_root(vault_path)
    base = vault / "bilibili"
    base.mkdir(parents=True, exist_ok=True)
    output_dir = _resolve_output_dir(base, notes)

    written: list[str] = []
    favorite_written: list[str] = []
    for note in notes:
        path = _note_path(base, note)
        path.parent.mkdir(parents=True, exist_ok=True)
        if note.source_type == "dynamic":
            content = _render_dynamic(note)
        elif note.source_type == "favorite":
            content = _render_favorite(note)
        elif note.source_type == "watch_later":
            content = _render_watch_later(note)
        else:
            content = f"# {note.title}\n\n{note.content}\n"
        obsidian_path = path.relative_to(vault).as_posix()
        write_unified_note(
            path,
            _build_bilibili_unified_entry(note, obsidian_path=obsidian_path),
            content,
        )
        written.append(str(path))
        if note.source_type == "favorite":
            favorite_written.append(str(path))

    rename_result = rename_favorite_markdown_files(favorite_written) if favorite_written else {
        "renamed_count": 0,
        "renamed_sources": [],
        "renamed_files": [],
        "skipped_count": 0,
        "skipped_files": [],
    }
    if rename_result["renamed_count"]:
        renamed_by_source = dict(zip(rename_result["renamed_sources"], rename_result["renamed_files"]))
        written = [renamed_by_source.get(str(Path(path).resolve()), path) for path in written]

    summary_dir = _resolve_summary_dir(base, notes)
    summary_dir.mkdir(parents=True, exist_ok=True)
    index_path = summary_dir / f"{_today()} Bilibili 爬取汇总.md"
    grouped_counts = {
        "dynamic": sum(1 for note in notes if note.source_type == "dynamic"),
        "favorite": sum(1 for note in notes if note.source_type == "favorite"),
        "watch_later": sum(1 for note in notes if note.source_type == "watch_later"),
    }
    links = "\n".join(
        f"- [[{Path(p).resolve().relative_to(base.resolve()).with_suffix('').as_posix()}]]"
        for p in written
    )
    summary = summary or {}
    index_path.write_text(
        f"""# Bilibili 爬取汇总

测试时间：{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

本次使用 Bilibili 登录态读取内容，只保存内容字段，不保存 Cookie。

> [!info]- 测试结果
> - **登录用户**: {summary.get("uname", "")}
> - **MID**: {summary.get("mid", "")}
> - **动态样本**: {grouped_counts["dynamic"]} 条
> - **收藏夹总数**: {summary.get("favorite_folder_count", 0)} 个
> - **收藏样本**: {grouped_counts["favorite"]} 条
> - **稍后再看总数**: {summary.get("watch_later_total", 0)} 条
> - **稍后再看样本**: {grouped_counts["watch_later"]} 条

## 本次写入

{links}
""",
        encoding="utf-8",
    )
    written.insert(0, str(index_path))

    return {
        "success": True,
        "vault_path": str(vault),
        "output_dir": str(output_dir),
        "written_count": len(written),
        "written_files": written,
        "renamed_favorite_count": rename_result["renamed_count"],
        "renamed_favorite_files": rename_result["renamed_files"],
    }


async def save_selected_dynamics_to_vault(
    dynamics: list[dict[str, Any]],
    *,
    vault_path: str | Path | None = None,
) -> dict:
    notes: list[BilibiliNote] = []
    for item in dynamics:
        title = str(item.get("title") or "").strip() or "B站动态"
        content = str(item.get("content") or "").strip()
        author = str(item.get("author") or "").strip()
        dynamic_id = str(item.get("dynamic_id") or item.get("id") or "").strip()
        url = str(item.get("url") or "").strip() or (
            f"https://t.bilibili.com/{dynamic_id}" if dynamic_id else ""
        )
        dynamic_type = str(item.get("dynamic_type") or "text").strip() or "text"
        pic = _normalize_image_url(item.get("pic"))
        bvid = extract_bvid(item.get("bvid") or item.get("url"))
        images = [
            _normalize_image_url(url)
            for url in (item.get("images") or [])
            if _normalize_image_url(url)
        ]
        if pic and pic not in images:
            images = [pic, *images]

        notes.append(
            BilibiliNote(
                source_type="dynamic",
                title=title,
                content=content,
                url=url,
                author=author,
                published_at=str(item.get("published_at") or ""),
                dynamic_id=dynamic_id,
                bvid=bvid,
                item_type=dynamic_type,
                images=images,
                tags=merge_tags(item.get("tags") or []),
                folder_name=_resolve_dynamic_folder_name(item),
                metadata={
                    "author_id": str(item.get("author_id") or ""),
                    "matched_keywords": normalize_string_list(item.get("matched_keywords")),
                    "matched_tags": normalize_string_list(item.get("matched_tags")),
                    "monitor_label": str(item.get("monitor_label") or "").strip(),
                    "crawl_source": str(item.get("crawl_source") or "").strip(),
                    "crawl_source_label": str(item.get("crawl_source_label") or "").strip(),
                },
            )
        )

    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        await _enrich_video_notes(notes, client=client)

    result = write_notes_to_vault(
        notes,
        vault_path=vault_path,
        summary={
            "selected_dynamic_count": len(notes),
        },
    )
    result.update(
        {
            "dynamic_count": len(notes),
            "favorite_count": 0,
            "watch_later_count": 0,
        }
    )
    return result


async def crawl_bilibili_to_vault(
    *,
    cookie: str | None = None,
    vault_path: str | None = None,
    include_dynamics: bool = True,
    include_favorites: bool = True,
    include_watch_later: bool = True,
    dynamic_limit: int = 9,
    favorite_folder_limit: int = 1,
    favorite_item_limit: int = 3,
    watch_later_limit: int = 3,
    use_cdp: bool = True,
    cdp_port: int = 9222,
) -> dict:
    cookie_header = await resolve_cookie_header(cookie, use_cdp=use_cdp, cdp_port=cdp_port)
    if "SESSDATA=" not in cookie_header:
        raise RuntimeError("未获取到 Bilibili SESSDATA，请先登录 Edge 或提供 Cookie")

    verify = await verify_cookie_header(cookie_header)
    if not verify["valid"]:
        raise RuntimeError(f"Bilibili 登录态无效: {verify}")

    notes: list[BilibiliNote] = []
    favorite_folders: list[dict] = []
    watch_later_total = 0

    if include_dynamics:
        notes.extend(await fetch_dynamics(cookie_header, limit=dynamic_limit))
    if include_favorites:
        favorite_notes, favorite_folders = await fetch_favorite_items(
            cookie_header,
            mid=verify["mid"],
            folder_limit=favorite_folder_limit,
            item_limit=favorite_item_limit,
        )
        notes.extend(favorite_notes)
    if include_watch_later:
        watch_notes, watch_later_total = await fetch_watch_later_items(
            cookie_header,
            limit=watch_later_limit,
        )
        notes.extend(watch_notes)

    result = write_notes_to_vault(
        notes,
        vault_path=vault_path,
        summary={
            "mid": verify["mid"],
            "uname": verify["uname"],
            "favorite_folder_count": len(favorite_folders),
            "watch_later_total": watch_later_total,
        },
    )
    result.update(
        {
            "login": verify,
            "dynamic_count": len([n for n in notes if n.source_type == "dynamic"]),
            "favorite_count": len([n for n in notes if n.source_type == "favorite"]),
            "watch_later_count": len([n for n in notes if n.source_type == "watch_later"]),
        }
    )
    return result
