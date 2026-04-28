from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable

from abo.tools.xhs_creator_safety import (
    check_creator_allowed,
    record_creator_attempt,
    record_creator_failure,
    record_creator_success,
)
from abo.tools.social_runtime_retry import run_social_runtime_with_retry
from abo.tools.xiaohongshu import XiaohongshuAPI, xiaohongshu_search


LookupCreatorMapping = Callable[[str], dict[str, Any] | None | Awaitable[dict[str, Any] | None]]
UpdateCreatorMapping = Callable[[list[dict[str, Any]], str], None | Awaitable[None]]


async def _maybe_await(value: None | Awaitable[Any]) -> Any:
    if value is None:
        return None
    return await value


async def _maybe_call_lookup(
    lookup_creator_mapping: LookupCreatorMapping | None,
    creator_query: str,
) -> dict[str, Any] | None:
    if lookup_creator_mapping is None:
        return None
    result = lookup_creator_mapping(creator_query)
    if hasattr(result, "__await__"):
        return await result  # type: ignore[return-value]
    return result  # type: ignore[return-value]


def normalize_xhs_recent_days(value: object, default: int = 180) -> int:
    try:
        return max(1, min(int(value or default), 365))
    except (TypeError, ValueError):
        return default


def filter_xhs_notes_by_recent_days(notes: list, recent_days: int, *, sort_by: str = "time") -> list:
    cutoff = datetime.now() - timedelta(days=normalize_xhs_recent_days(recent_days))

    def published_at(note) -> datetime | None:
        value = getattr(note, "published_at", None)
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.replace(tzinfo=None) if value.tzinfo else value
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
        except ValueError:
            return None

    filtered = [note for note in notes if (published_at(note) or datetime.max) >= cutoff]
    if str(sort_by or "time").strip().lower() == "time":
        filtered.sort(key=lambda note: published_at(note) or datetime.max, reverse=True)
    return filtered


def serialize_xhs_note(note) -> dict[str, Any]:
    return {
        "id": note.id,
        "title": note.title,
        "content": note.content[:5000] if getattr(note, "content", "") else "",
        "author": note.author,
        "author_id": note.author_id,
        "likes": note.likes,
        "collects": note.collects,
        "comments_count": note.comments_count,
        "url": note.url,
        "published_at": note.published_at.isoformat() if note.published_at else None,
        "cover_image": note.cover_image,
        "note_type": note.note_type,
        "images": note.images,
        "video_url": note.video_url,
        "xsec_token": note.xsec_token,
        "xsec_source": note.xsec_source,
        "comments_preview": [
            {
                "id": c.id,
                "author": c.author,
                "content": c.content,
                "likes": c.likes,
                "is_top": c.is_top,
            }
            for c in list(getattr(note, "comments_preview", []) or [])
        ],
        "matched_keywords": list(getattr(note, "matched_keywords", []) or []),
    }


async def fetch_xhs_keyword_search_result(
    *,
    keyword: str,
    cookie: str,
    max_results: int = 20,
    min_likes: int = 100,
    sort_by: str = "comprehensive",
    recent_days: int | None = None,
    use_extension: bool = True,
    extension_port: int = 9334,
    dedicated_window_mode: bool = False,
) -> dict[str, Any]:
    # Scheduled feed and proactive tool must share the same keyword-search runtime entry.
    return await run_social_runtime_with_retry(
        f"xiaohongshu keyword search: {keyword}",
        lambda: xiaohongshu_search(
            keyword=keyword,
            max_results=max_results,
            min_likes=min_likes,
            sort_by=sort_by,
            recent_days=recent_days,
            cookie=cookie,
            use_extension=use_extension,
            extension_port=extension_port,
            dedicated_window_mode=dedicated_window_mode,
        ),
    )


async def fetch_xhs_following_feed_result(
    *,
    cookie: str,
    keywords: list[str],
    max_notes: int = 50,
    recent_days: int = 180,
    sort_by: str = "time",
    use_extension: bool = True,
    extension_port: int = 9334,
    dedicated_window_mode: bool = False,
    update_creator_mapping: UpdateCreatorMapping | None = None,
) -> dict[str, Any]:
    async def _fetch_following_once() -> dict[str, Any]:
        api = XiaohongshuAPI()
        try:
            notes = await api.get_following_feed_with_cookie(
                cookie=cookie,
                keywords=keywords,
                max_notes=max(max_notes, 5),
                use_extension=use_extension,
                extension_port=extension_port,
                dedicated_window_mode=dedicated_window_mode,
            )
            notes = filter_xhs_notes_by_recent_days(notes, recent_days, sort_by=sort_by)[:max_notes]

            if update_creator_mapping is not None:
                await _maybe_await(
                    update_creator_mapping(
                        [
                            {
                                "author": note.author,
                                "author_id": note.author_id,
                                "profile_url": f"{api.BASE_URL}/user/profile/{note.author_id}" if note.author_id else "",
                            }
                            for note in notes
                        ],
                        "following-feed-search",
                    )
                )
            return {
                "total_found": len(notes),
                "notes": [serialize_xhs_note(note) for note in notes],
            }
        finally:
            await api.close()

    return await run_social_runtime_with_retry(
        "xiaohongshu following feed",
        _fetch_following_once,
    )


async def fetch_xhs_creator_recent_result(
    *,
    creator_query: str,
    cookie: str,
    recent_days: int = 180,
    max_notes: int = 20,
    use_extension: bool = True,
    extension_port: int = 9334,
    dedicated_window_mode: bool = False,
    manual_current_tab: bool = False,
    require_extension_success: bool = False,
    lookup_creator_mapping: LookupCreatorMapping | None = None,
    update_creator_mapping: UpdateCreatorMapping | None = None,
    enforce_safety: bool = True,
    record_creator_metrics: bool = True,
) -> dict[str, Any]:
    api = XiaohongshuAPI()
    try:
        normalized_query = str(creator_query or "").strip()
        if not normalized_query:
            raise ValueError("请输入 UP 主名称、主页链接或 user_id")

        resolved_user_id = normalized_query
        resolved_author = ""
        resolved_profile_url = ""
        if not re.search(r"/user/profile/[^/?#]+", normalized_query):
            matched_mapping = await _maybe_call_lookup(lookup_creator_mapping, normalized_query)
            if matched_mapping:
                resolved_user_id = str(matched_mapping.get("author_id") or "").strip() or resolved_user_id
                resolved_author = str(matched_mapping.get("author") or "").strip()
                resolved_profile_url = str(matched_mapping.get("profile_url") or "").strip()
            elif not re.fullmatch(r"[A-Za-z0-9_-]{8,}", normalized_query):
                raise ValueError("没有找到这个名字对应的本地 user_id 映射。请先用关注流关键词搜索命中该博主，或直接粘贴主页链接 / user_id。")

        clean_user_id = api._extract_user_id(resolved_user_id)
        if enforce_safety:
            safety_decision = check_creator_allowed(clean_user_id)
            if not safety_decision.allowed:
                suffix = f"，冷却到 {safety_decision.cooldown_until}" if safety_decision.cooldown_until else ""
                raise RuntimeError(f"已跳过指定博主主页访问：{safety_decision.reason}{suffix}")

        if record_creator_metrics:
            record_creator_attempt(clean_user_id)

        try:
            notes = await run_social_runtime_with_retry(
                f"xiaohongshu creator recent: {clean_user_id}",
                lambda: api.get_user_notes_with_cookie(
                    resolved_user_id,
                    cookie=cookie,
                    max_notes=max(1, min(max_notes, 50)),
                    use_extension=use_extension,
                    extension_port=extension_port,
                    dedicated_window_mode=dedicated_window_mode,
                    manual_current_tab=manual_current_tab,
                    require_extension_success=require_extension_success,
                ),
            )
        except Exception as exc:
            if record_creator_metrics:
                record_creator_failure(clean_user_id, exc)
            raise

        filtered_notes = filter_xhs_notes_by_recent_days(notes, recent_days, sort_by="time")[: max(1, min(max_notes, 50))]
        if record_creator_metrics:
            record_creator_success(clean_user_id, note_ids=[str(getattr(note, "id", "")) for note in notes if getattr(note, "id", "")])

        profile_url = resolved_profile_url or f"{api.BASE_URL}/user/profile/{clean_user_id}"
        if update_creator_mapping is not None:
            await _maybe_await(
                update_creator_mapping(
                    [
                        {
                            "author": resolved_author or clean_user_id,
                            "author_id": clean_user_id,
                            "profile_url": profile_url,
                        }
                    ],
                    "creator-recent",
                )
            )

        return {
            "creator_query": normalized_query,
            "resolved_author": resolved_author or clean_user_id,
            "resolved_user_id": clean_user_id,
            "profile_url": profile_url,
            "recent_days": normalize_xhs_recent_days(recent_days),
            "total_found": len(filtered_notes),
            "notes": [serialize_xhs_note(note) for note in filtered_notes],
        }
    finally:
        await api.close()
