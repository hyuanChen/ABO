import hashlib
import re
from typing import Any

BILIBILI_TRACKER_DEFAULT_DAYS_BACK = 7
BILIBILI_TRACKER_FIXED_UP_DEFAULT_DAYS_BACK = 3
BILIBILI_TRACKER_FOLLOWED_GROUP_DEFAULT_DAYS_BACK = 3
BILIBILI_TRACKER_DEFAULT_LIMIT = 50
BILIBILI_TRACKER_DEFAULT_PAGE_LIMIT = 1000
BILIBILI_TRACKER_LEGACY_PAGE_LIMIT = 5


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


def normalize_positive_int(value: Any, fallback: int, *, maximum: int | None = None) -> int:
    try:
        normalized = max(1, int(value))
    except (TypeError, ValueError):
        normalized = fallback
    if maximum is not None:
        normalized = min(normalized, maximum)
    return normalized


def normalize_bilibili_page_limit(
    value: Any,
    fallback: int,
    *,
    maximum: int = 1000,
) -> int:
    normalized = normalize_positive_int(value, fallback, maximum=maximum)
    if normalized == BILIBILI_TRACKER_LEGACY_PAGE_LIMIT:
        return fallback
    return normalized


def normalize_bilibili_dynamic_monitors(config: dict[str, Any]) -> list[dict[str, Any]]:
    raw_monitors = config.get("daily_dynamic_monitors")
    fallback_keywords = normalize_string_list(config.get("keywords"))
    default_days_back = normalize_positive_int(
        config.get("days_back"),
        BILIBILI_TRACKER_DEFAULT_DAYS_BACK,
        maximum=365,
    )
    default_limit = BILIBILI_TRACKER_DEFAULT_LIMIT
    default_page_limit = normalize_bilibili_page_limit(
        config.get("page_limit"),
        BILIBILI_TRACKER_DEFAULT_PAGE_LIMIT,
    )

    if isinstance(raw_monitors, list):
        monitors_source = raw_monitors
    else:
        monitors_source = []

    if not isinstance(raw_monitors, list) and fallback_keywords:
        monitors_source = [
            {
                "label": keyword,
                "keywords": [keyword],
                "tag_filters": [],
                "enabled": bool(config.get("enable_keyword_search", True)),
                "days_back": default_days_back,
                "limit": default_limit,
                "page_limit": default_page_limit,
            }
            for keyword in fallback_keywords
        ]

    normalized: list[dict[str, Any]] = []
    for entry in monitors_source:
        if isinstance(entry, dict):
            keywords = normalize_string_list(
                entry.get("keywords")
                or entry.get("keyword")
                or entry.get("query")
            )
            tag_filters = normalize_string_list(
                entry.get("tag_filters")
                or entry.get("tags")
                or entry.get("tag_keywords")
            )
            if not keywords and not tag_filters:
                keywords = normalize_string_list(entry.get("label"))
            if not keywords and not tag_filters:
                continue
            label_seed = keywords[0] if keywords else (tag_filters[0] if tag_filters else "每日动态监控")
            label = str(entry.get("label") or entry.get("name") or label_seed).strip() or label_seed
            enabled = bool(entry.get("enabled", True))
            days_back = normalize_positive_int(
                entry.get("days_back", entry.get("recent_days", entry.get("days"))),
                default_days_back,
                maximum=365,
            )
            limit = normalize_positive_int(
                entry.get("limit", entry.get("fetch_limit", entry.get("max_results"))),
                default_limit,
                maximum=1000,
            )
            page_limit = normalize_bilibili_page_limit(
                entry.get("page_limit", entry.get("pages", entry.get("max_pages"))),
                default_page_limit,
            )
            monitor_id = str(entry.get("id") or _stable_id("bili-dm", label, "|".join([*keywords, "#", *tag_filters])))
        else:
            keywords = normalize_string_list(entry)
            tag_filters = []
            if not keywords:
                continue
            label = keywords[0]
            enabled = True
            days_back = default_days_back
            limit = default_limit
            page_limit = default_page_limit
            monitor_id = _stable_id("bili-dm", label, "|".join(keywords))

        normalized.append(
            {
                "id": monitor_id,
                "label": label,
                "keywords": keywords,
                "tag_filters": tag_filters,
                "enabled": enabled,
                "days_back": days_back,
                "limit": limit,
                "page_limit": page_limit,
            }
        )

    return normalized


def normalize_bilibili_followed_group_monitors(
    config: dict[str, Any],
    *,
    label_lookup: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    raw_monitors = config.get("followed_up_group_monitors")
    fallback_groups = normalize_string_list(config.get("followed_up_groups"))
    default_days_back = normalize_positive_int(
        config.get("followed_up_group_days_back"),
        BILIBILI_TRACKER_FOLLOWED_GROUP_DEFAULT_DAYS_BACK,
        maximum=365,
    )
    default_limit = normalize_positive_int(
        config.get("fetch_follow_limit"),
        BILIBILI_TRACKER_DEFAULT_LIMIT,
        maximum=1000,
    )
    default_page_limit = normalize_bilibili_page_limit(
        config.get("page_limit"),
        BILIBILI_TRACKER_DEFAULT_PAGE_LIMIT,
    )

    if isinstance(raw_monitors, list):
        monitors_source = raw_monitors
    else:
        monitors_source = []

    if not isinstance(raw_monitors, list) and fallback_groups:
        monitors_source = [
            {
                "group_value": group_value,
                "label": (label_lookup or {}).get(group_value) or group_value,
                "enabled": True,
                "days_back": default_days_back,
                "limit": default_limit,
                "page_limit": default_page_limit,
            }
            for group_value in fallback_groups
        ]

    normalized: list[dict[str, Any]] = []
    seen_groups: set[str] = set()
    for entry in monitors_source:
        if isinstance(entry, dict):
            group_value = str(
                entry.get("group_value")
                or entry.get("value")
                or entry.get("group")
                or entry.get("key")
                or ""
            ).strip()
            label_seed = (label_lookup or {}).get(group_value) or group_value
            label = str(entry.get("label") or entry.get("name") or label_seed).strip() or label_seed
            enabled = bool(entry.get("enabled", True))
            days_back = normalize_positive_int(
                entry.get("days_back", entry.get("recent_days", entry.get("days"))),
                default_days_back,
                maximum=365,
            )
            limit = normalize_positive_int(
                entry.get("limit", entry.get("fetch_limit", entry.get("max_results"))),
                default_limit,
                maximum=1000,
            )
            page_limit = normalize_bilibili_page_limit(
                entry.get("page_limit", entry.get("pages", entry.get("max_pages"))),
                default_page_limit,
            )
            monitor_id = str(entry.get("id") or _stable_id("bili-gm", label, group_value))
        else:
            group_value = str(entry or "").strip()
            if not group_value:
                continue
            label = (label_lookup or {}).get(group_value) or group_value
            enabled = True
            days_back = default_days_back
            limit = default_limit
            page_limit = default_page_limit
            monitor_id = _stable_id("bili-gm", label, group_value)

        group_key = group_value.casefold()
        if not group_value or group_key in seen_groups:
            continue
        seen_groups.add(group_key)
        normalized.append(
            {
                "id": monitor_id,
                "group_value": group_value,
                "label": label,
                "enabled": enabled,
                "days_back": days_back,
                "limit": limit,
                "page_limit": page_limit,
            }
        )

    return normalized


def build_bilibili_legacy_fields(
    base_config: dict[str, Any],
    *,
    daily_dynamic_monitors: list[dict[str, Any]],
    followed_group_monitors: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    active_monitors = [monitor for monitor in daily_dynamic_monitors if monitor.get("enabled", True)]
    active_keywords: list[str] = []
    for monitor in active_monitors:
        active_keywords.extend(normalize_string_list(monitor.get("keywords")))

    keywords = normalize_string_list(active_keywords)
    if not keywords and not active_monitors:
        keywords = normalize_string_list(base_config.get("keywords"))

    active_followed_group_monitors = [
        monitor for monitor in (followed_group_monitors or [])
        if monitor.get("enabled", True)
    ]
    followed_up_groups = normalize_string_list(
        [monitor.get("group_value") for monitor in active_followed_group_monitors]
    )
    if not followed_up_groups and not active_followed_group_monitors:
        followed_up_groups = normalize_string_list(base_config.get("followed_up_groups"))

    return {
        "keywords": keywords,
        "enable_keyword_search": bool(active_monitors),
        "followed_up_groups": followed_up_groups,
    }
