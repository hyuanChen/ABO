import hashlib
import re
from typing import Any


DEFAULT_XHS_RECENT_DAYS = 180


def _stable_id(prefix: str, label: str, payload: str) -> str:
    digest = hashlib.sha1(f"{prefix}|{label}|{payload}".encode("utf-8")).hexdigest()
    return f"{prefix}-{digest[:10]}"


def normalize_string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        raw_items = re.split(r"[,\n，]+", value)
    elif isinstance(value, (list, tuple, set)):
        raw_items = list(value)
    else:
        raw_items = [value]

    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_items:
        text = str(item or "").strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(text)
    return normalized


def _normalize_positive_int(value: Any, default: int, minimum: int = 1, maximum: int | None = None) -> int:
    try:
        result = int(value)
    except (TypeError, ValueError):
        result = default
    if maximum is not None:
        result = min(result, maximum)
    return max(minimum, result)


def _normalize_non_negative_int(value: Any, default: int) -> int:
    try:
        result = int(value)
    except (TypeError, ValueError):
        result = default
    return max(0, result)


def _normalize_comment_sort(value: Any) -> str:
    return "time" if str(value or "").strip().lower() in {"time", "latest", "newest"} else "likes"


def _normalize_content_sort(value: Any, default: str = "time") -> str:
    normalized = str(value or default).strip().lower()
    return "time" if normalized in {"time", "latest", "newest"} else "likes"


def normalize_xhs_keyword_monitors(config: dict[str, Any]) -> list[dict[str, Any]]:
    raw_monitors = config.get("keyword_monitors")
    fallback_keywords = normalize_string_list(config.get("keywords"))
    if isinstance(raw_monitors, list):
        monitors_source = raw_monitors
    else:
        monitors_source = []

    if not isinstance(raw_monitors, list) and not monitors_source and fallback_keywords:
        monitors_source = [{
            "label": "默认情报推送",
            "keywords": fallback_keywords,
            "enabled": bool(config.get("enable_keyword_search", True)),
            "min_likes": config.get("keyword_min_likes", 500),
            "per_keyword_limit": config.get("keyword_search_limit", 10),
        }]

    normalized: list[dict[str, Any]] = []
    for index, entry in enumerate(monitors_source):
        if isinstance(entry, dict):
            keywords = normalize_string_list(entry.get("keywords") or entry.get("query") or entry.get("label"))
            if not keywords:
                continue
            label = str(keywords[0] or entry.get("label") or entry.get("name")).strip() or keywords[0]
            enabled = bool(entry.get("enabled", True))
            min_likes = _normalize_non_negative_int(entry.get("min_likes"), _normalize_non_negative_int(config.get("keyword_min_likes", 500), 500))
            per_keyword_limit = _normalize_positive_int(
                entry.get("per_keyword_limit", entry.get("limit")),
                _normalize_positive_int(config.get("keyword_search_limit", 10), 10),
                minimum=1,
                maximum=100,
            )
            recent_days = _normalize_positive_int(entry.get("recent_days"), DEFAULT_XHS_RECENT_DAYS, minimum=1, maximum=365)
            sort_by = _normalize_content_sort(entry.get("sort_by"), "time")
            include_comments = bool(entry.get("include_comments", entry.get("crawl_comments", False)))
            comments_limit = _normalize_positive_int(entry.get("comments_limit"), 20, minimum=1, maximum=100)
            comments_sort_by = _normalize_comment_sort(entry.get("comments_sort_by"))
            monitor_id = str(entry.get("id") or _stable_id("xhs-km", label, "|".join(keywords)))
        else:
            keywords = normalize_string_list(entry)
            if not keywords:
                continue
            label = keywords[0]
            enabled = True
            min_likes = _normalize_non_negative_int(config.get("keyword_min_likes", 500), 500)
            per_keyword_limit = _normalize_positive_int(config.get("keyword_search_limit", 10), 10, minimum=1, maximum=100)
            recent_days = DEFAULT_XHS_RECENT_DAYS
            sort_by = "time"
            include_comments = False
            comments_limit = 20
            comments_sort_by = "likes"
            monitor_id = _stable_id("xhs-km", label, "|".join(keywords))

        normalized.append(
            {
                "id": monitor_id,
                "label": label,
                "keywords": keywords,
                "enabled": enabled,
                "min_likes": min_likes,
                "per_keyword_limit": per_keyword_limit,
                "recent_days": recent_days,
                "sort_by": sort_by,
                "include_comments": include_comments,
                "comments_limit": comments_limit,
                "comments_sort_by": comments_sort_by,
            }
        )

    return normalized


def normalize_xhs_following_scan_monitors(config: dict[str, Any]) -> list[dict[str, Any]]:
    raw_scan = config.get("following_scan")
    if not isinstance(raw_scan, dict):
        raw_scan = {}

    raw_monitors = config.get("following_scan_monitors")
    if isinstance(raw_monitors, list):
        monitors_source = raw_monitors
    else:
        monitors_source = []

    shared_enabled = bool(raw_scan.get("enabled", config.get("follow_feed", False)))
    shared_fetch_limit = _normalize_positive_int(
        raw_scan.get("fetch_limit", raw_scan.get("limit")),
        _normalize_positive_int(config.get("fetch_follow_limit", 20), 20),
        minimum=1,
        maximum=200,
    )
    shared_keyword_filter = bool(raw_scan.get("keyword_filter", True))
    shared_recent_days = _normalize_positive_int(raw_scan.get("recent_days"), DEFAULT_XHS_RECENT_DAYS, minimum=1, maximum=365)
    shared_sort_by = _normalize_content_sort(raw_scan.get("sort_by"), "time")
    shared_include_comments = bool(raw_scan.get("include_comments", raw_scan.get("crawl_comments", False)))
    shared_comments_limit = _normalize_positive_int(raw_scan.get("comments_limit"), 20, minimum=1, maximum=100)
    shared_comments_sort_by = _normalize_comment_sort(raw_scan.get("comments_sort_by"))

    if not isinstance(raw_monitors, list) and not monitors_source:
        fallback_keywords = normalize_string_list(raw_scan.get("keywords"))
        if not fallback_keywords:
            fallback_keywords = normalize_string_list(config.get("keywords"))
        monitors_source = [
            {
                "label": keyword,
                "keywords": [keyword],
                "enabled": shared_enabled,
                "fetch_limit": shared_fetch_limit,
                "keyword_filter": shared_keyword_filter,
                "include_comments": shared_include_comments,
                "comments_limit": shared_comments_limit,
                "comments_sort_by": shared_comments_sort_by,
            }
            for keyword in fallback_keywords
        ]

    normalized: list[dict[str, Any]] = []
    for entry in monitors_source:
        if isinstance(entry, dict):
            keywords = normalize_string_list(entry.get("keywords") or entry.get("keyword") or entry.get("label"))
            if not keywords:
                continue
            label = str(keywords[0] or entry.get("label") or entry.get("name")).strip() or keywords[0]
            enabled = bool(entry.get("enabled", shared_enabled))
            fetch_limit = _normalize_positive_int(
                entry.get("fetch_limit", entry.get("limit")),
                shared_fetch_limit,
                minimum=1,
                maximum=200,
            )
            keyword_filter = bool(entry.get("keyword_filter", shared_keyword_filter))
            recent_days = _normalize_positive_int(entry.get("recent_days"), shared_recent_days, minimum=1, maximum=365)
            sort_by = _normalize_content_sort(entry.get("sort_by"), shared_sort_by)
            include_comments = bool(entry.get("include_comments", entry.get("crawl_comments", shared_include_comments)))
            comments_limit = _normalize_positive_int(entry.get("comments_limit"), shared_comments_limit, minimum=1, maximum=100)
            comments_sort_by = _normalize_comment_sort(entry.get("comments_sort_by", shared_comments_sort_by))
            monitor_id = str(entry.get("id") or _stable_id("xhs-fm", label, "|".join(keywords)))
        else:
            keywords = normalize_string_list(entry)
            if not keywords:
                continue
            label = keywords[0]
            enabled = shared_enabled
            fetch_limit = shared_fetch_limit
            keyword_filter = shared_keyword_filter
            recent_days = shared_recent_days
            sort_by = shared_sort_by
            include_comments = shared_include_comments
            comments_limit = shared_comments_limit
            comments_sort_by = shared_comments_sort_by
            monitor_id = _stable_id("xhs-fm", label, "|".join(keywords))

        normalized.append(
            {
                "id": monitor_id,
                "label": label,
                "keywords": keywords,
                "enabled": enabled,
                "fetch_limit": fetch_limit,
                "recent_days": recent_days,
                "sort_by": sort_by,
                "keyword_filter": keyword_filter,
                "include_comments": include_comments,
                "comments_limit": comments_limit,
                "comments_sort_by": comments_sort_by,
            }
        )

    return normalized


def normalize_xhs_following_scan(config: dict[str, Any]) -> dict[str, Any]:
    raw_scan = config.get("following_scan")
    if not isinstance(raw_scan, dict):
        raw_scan = {}

    has_explicit_empty_monitors = isinstance(config.get("following_scan_monitors"), list) and not config.get("following_scan_monitors")
    following_scan_monitors = normalize_xhs_following_scan_monitors(config)
    active_monitors = [monitor for monitor in following_scan_monitors if monitor.get("enabled", True)]
    active_keywords: list[str] = []
    for monitor in active_monitors:
        active_keywords.extend(normalize_string_list(monitor.get("keywords")))
    fallback_keywords = normalize_string_list(active_keywords)
    if not fallback_keywords and not has_explicit_empty_monitors:
        fallback_keywords = normalize_string_list(raw_scan.get("keywords"))
    if not fallback_keywords and not has_explicit_empty_monitors:
        fallback_keywords = normalize_string_list(config.get("keywords"))

    label = str(raw_scan.get("label") or raw_scan.get("name") or "关注流扫描").strip() or "关注流扫描"
    primary_monitor = active_monitors[0] if active_monitors else (following_scan_monitors[0] if following_scan_monitors else {})
    enabled = False if has_explicit_empty_monitors else (bool(active_monitors) if following_scan_monitors else bool(raw_scan.get("enabled", config.get("follow_feed", False))))
    fetch_limit = _normalize_positive_int(
        primary_monitor.get("fetch_limit", raw_scan.get("fetch_limit", raw_scan.get("limit"))),
        _normalize_positive_int(config.get("fetch_follow_limit", 20), 20),
        minimum=1,
        maximum=200,
    )
    keyword_filter = bool(primary_monitor.get("keyword_filter", raw_scan.get("keyword_filter", True)))
    recent_days = _normalize_positive_int(primary_monitor.get("recent_days", raw_scan.get("recent_days")), DEFAULT_XHS_RECENT_DAYS, minimum=1, maximum=365)
    sort_by = _normalize_content_sort(primary_monitor.get("sort_by", raw_scan.get("sort_by")), "time")
    include_comments = bool(primary_monitor.get("include_comments", raw_scan.get("include_comments", raw_scan.get("crawl_comments", False))))
    comments_limit = _normalize_positive_int(primary_monitor.get("comments_limit", raw_scan.get("comments_limit")), 20, minimum=1, maximum=100)
    comments_sort_by = _normalize_comment_sort(primary_monitor.get("comments_sort_by", raw_scan.get("comments_sort_by")))

    return {
        "id": str(raw_scan.get("id") or "xhs-following-default"),
        "label": label,
        "keywords": fallback_keywords,
        "enabled": enabled,
        "fetch_limit": fetch_limit,
        "recent_days": recent_days,
        "sort_by": sort_by,
        "keyword_filter": keyword_filter,
        "include_comments": include_comments,
        "comments_limit": comments_limit,
        "comments_sort_by": comments_sort_by,
    }


def normalize_xhs_creator_monitors(config: dict[str, Any]) -> list[dict[str, Any]]:
    raw_monitors = config.get("creator_monitors")
    creator_profiles = dict(config.get("creator_profiles", {}) or {})
    disabled_creator_ids = {str(item).strip() for item in (config.get("disabled_creator_ids") or []) if str(item).strip()}
    if isinstance(raw_monitors, list):
        monitors_source = raw_monitors
    else:
        monitors_source = []

    if not isinstance(raw_monitors, list) and not monitors_source:
        monitors_source = []
        for user_id in normalize_string_list(config.get("user_ids")):
            profile = dict(creator_profiles.get(user_id) or {})
            monitors_source.append(
                {
                    "user_id": user_id,
                    "label": profile.get("author") or user_id,
                    "author": profile.get("author") or user_id,
                    "enabled": user_id not in disabled_creator_ids,
                    "smart_groups": profile.get("smart_groups", []),
                    "smart_group_labels": profile.get("smart_group_labels", []),
                }
            )

    normalized: list[dict[str, Any]] = []
    for entry in monitors_source:
        if not isinstance(entry, dict):
            user_id = str(entry or "").strip()
            if not user_id:
                continue
            entry = {"user_id": user_id}

        user_id = str(entry.get("user_id") or entry.get("author_id") or entry.get("id") or "").strip()
        if not user_id:
            continue

        profile = dict(creator_profiles.get(user_id) or {})
        author = str(entry.get("author") or profile.get("author") or user_id).strip() or user_id
        label = str(entry.get("label") or author or user_id).strip() or user_id
        enabled = bool(entry.get("enabled", user_id not in disabled_creator_ids))
        per_user_limit = _normalize_positive_int(entry.get("per_user_limit", entry.get("limit")), 3, minimum=1, maximum=20)
        recent_days = _normalize_positive_int(entry.get("recent_days"), DEFAULT_XHS_RECENT_DAYS, minimum=1, maximum=365)
        sort_by = _normalize_content_sort(entry.get("sort_by"), "time")
        include_comments = bool(entry.get("include_comments", entry.get("crawl_comments", False)))
        comments_limit = _normalize_positive_int(entry.get("comments_limit"), 20, minimum=1, maximum=100)
        comments_sort_by = _normalize_comment_sort(entry.get("comments_sort_by"))
        smart_groups = normalize_string_list(entry.get("smart_groups") or profile.get("smart_groups"))
        smart_group_labels = normalize_string_list(entry.get("smart_group_labels") or profile.get("smart_group_labels"))
        monitor_id = str(entry.get("id") or _stable_id("xhs-cm", label, user_id))

        normalized.append(
            {
                "id": monitor_id,
                "user_id": user_id,
                "label": label,
                "author": author,
                "enabled": enabled,
                "per_user_limit": per_user_limit,
                "recent_days": recent_days,
                "sort_by": sort_by,
                "include_comments": include_comments,
                "comments_limit": comments_limit,
                "comments_sort_by": comments_sort_by,
                "smart_groups": smart_groups,
                "smart_group_labels": smart_group_labels,
            }
        )

    return normalized


def normalize_xhs_tracker_config(config: dict[str, Any]) -> dict[str, Any]:
    return {
        "keyword_monitors": normalize_xhs_keyword_monitors(config),
        "following_scan": normalize_xhs_following_scan(config),
        "following_scan_monitors": normalize_xhs_following_scan_monitors(config),
        "creator_monitors": normalize_xhs_creator_monitors(config),
    }


def build_xhs_legacy_fields(
    base_config: dict[str, Any],
    *,
    keyword_monitors: list[dict[str, Any]],
    following_scan: dict[str, Any],
    creator_monitors: list[dict[str, Any]],
) -> dict[str, Any]:
    active_keyword_monitors = [monitor for monitor in keyword_monitors if monitor.get("enabled", True)]
    active_keywords: list[str] = []
    for monitor in active_keyword_monitors:
        active_keywords.extend(normalize_string_list(monitor.get("keywords")))
    keywords = normalize_string_list(active_keywords)

    primary_monitor = active_keyword_monitors[0] if active_keyword_monitors else (keyword_monitors[0] if keyword_monitors else {})
    user_ids = [str(monitor.get("user_id") or "").strip() for monitor in creator_monitors if str(monitor.get("user_id") or "").strip()]
    disabled_creator_ids = [monitor["user_id"] for monitor in creator_monitors if monitor.get("user_id") and not monitor.get("enabled", True)]

    creator_profiles = dict(base_config.get("creator_profiles", {}) or {})
    for monitor in creator_monitors:
        user_id = str(monitor.get("user_id") or "").strip()
        if not user_id:
            continue
        profile = dict(creator_profiles.get(user_id) or {})
        if monitor.get("author"):
            profile["author"] = monitor.get("author")
            profile["author_id"] = user_id
        profile["smart_groups"] = normalize_string_list(monitor.get("smart_groups"))
        profile["recent_days"] = _normalize_positive_int(monitor.get("recent_days"), DEFAULT_XHS_RECENT_DAYS, minimum=1, maximum=365)
        profile["sort_by"] = _normalize_content_sort(monitor.get("sort_by"), "time")
        if monitor.get("smart_group_labels"):
            profile["smart_group_labels"] = normalize_string_list(monitor.get("smart_group_labels"))
        creator_profiles[user_id] = profile

    creator_push_enabled = bool(base_config.get("creator_push_enabled", False))
    if not user_ids:
        creator_push_enabled = False

    return {
        "keywords": keywords,
        "enable_keyword_search": bool(active_keyword_monitors),
        "keyword_min_likes": _normalize_non_negative_int(primary_monitor.get("min_likes"), _normalize_non_negative_int(base_config.get("keyword_min_likes", 500), 500)),
        "keyword_search_limit": _normalize_positive_int(primary_monitor.get("per_keyword_limit"), _normalize_positive_int(base_config.get("keyword_search_limit", 10), 10), minimum=1, maximum=100),
        "follow_feed": bool(following_scan.get("enabled", False)),
        "fetch_follow_limit": _normalize_positive_int(following_scan.get("fetch_limit"), _normalize_positive_int(base_config.get("fetch_follow_limit", 20), 20), minimum=1, maximum=200),
        "user_ids": user_ids,
        "disabled_creator_ids": disabled_creator_ids,
        "creator_profiles": creator_profiles,
        "creator_push_enabled": creator_push_enabled,
    }
