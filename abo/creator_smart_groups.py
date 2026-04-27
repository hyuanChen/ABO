from __future__ import annotations

import hashlib
import re
from collections import Counter, defaultdict
from datetime import UTC, datetime
from typing import Any


SMART_GROUP_GENERIC_SIGNALS = {
    "",
    "无",
    "其他",
    "视频",
    "笔记",
    "动态",
    "作者",
    "用户",
    "博主",
    "up主",
    "bilibili",
    "小红书",
    "收藏",
    "收藏夹",
    "收藏专辑",
    "来自收藏专辑",
    "来自收藏夹",
    "来自标签",
    "来自收藏笔记",
    "来自收藏视频",
    "来自稍后再看",
    "来自动态",
    "来自本地收藏",
    "专辑",
    "合集",
    "稍后再看",
    "默认收藏夹",
    "未命名",
    "分享",
    "笔记灵感",
    "收藏的价值在复用",
    "不在囤积",
    "原来还能这么玩",
    "小红书博主",
    "新人博主",
    "素人博主",
    "养成系博主",
    "无标题",
    "碎碎念",
    "新年",
    "记录",
    "热门",
    "反差",
    "抽象",
    "内容过于真实",
    "fyp",
    "ama",
    "askmeanything",
    "tipsonred",
    "cute",
    "interesting",
    "sth useful",
    "sth",
    "useful",
    "test",
    "测试",
    "占位",
    "故事",
    "min",
}
SMART_GROUP_SIGNAL_PREFIXES = (
    "来自收藏专辑：",
    "来自收藏夹：",
    "来自标签：",
    "来自收藏笔记：",
    "来自收藏视频：",
    "来自稍后再看：",
    "来自动态：",
    "来自本地收藏：",
    "收藏专辑：",
    "收藏夹：",
    "标签：",
)
SMART_GROUP_GENERIC_SIGNAL_KEYS = {
    re.sub(r"[()（）\[\]【】]+", "", re.sub(r"[\s\-_·•・]+", "", str(item).strip().lower()))
    for item in SMART_GROUP_GENERIC_SIGNALS
}

_PROFILE_LIST_LIMITS = {
    "sample_titles": 6,
    "sample_tags": 8,
    "sample_folders": 6,
    "sample_albums": 6,
    "sample_urls": 6,
    "sample_note_urls": 6,
    "sample_authors": 6,
    "sample_oids": 6,
    "raw_signals": 8,
}
_OPTION_LIST_LIMITS = {
    "sample_authors": 6,
    "sample_tags": 16,
    "source_signals": 64,
    "platforms": 4,
}
_ASCII_SIGNAL_RE = re.compile(r"[A-Za-z][A-Za-z0-9+._-]{1,31}")
_GENERIC_SIGNAL_PATTERNS = (
    re.compile(r".*(计划|大赛|征集|活动|挑战|打卡)$", re.IGNORECASE),
    re.compile(r".*助力.*", re.IGNORECASE),
    re.compile(r".*(测试|占位).*", re.IGNORECASE),
    re.compile(r"^\d{2,4}([./-]\d{1,2}){0,2}$", re.IGNORECASE),
    re.compile(r"^\d+[.]$", re.IGNORECASE),
)


def _normalize_signal_key(text: str) -> str:
    raw_text = str(text or "").strip()
    for prefix in SMART_GROUP_SIGNAL_PREFIXES:
        if raw_text.startswith(prefix):
            raw_text = raw_text[len(prefix):].strip()
            break
    return re.sub(
        r"[()（）\[\]【】]+",
        "",
        re.sub(r"[\s\-_·•・]+", "", raw_text.lower()),
    )


def normalize_group_signal_key(text: str) -> str:
    return _normalize_signal_key(text)


def normalize_creator_name_key(text: str) -> str:
    return re.sub(
        r"[()（）\[\]【】]+",
        "",
        re.sub(r"[\s\-_·•・]+", "", str(text or "").strip().lower()),
    )


def is_generic_group_signal(text: str) -> bool:
    raw_text = str(text or "").strip()
    normalized = _normalize_signal_key(raw_text)
    if normalized in SMART_GROUP_GENERIC_SIGNAL_KEYS:
        return True
    if len(normalized) <= 1:
        return True
    return any(pattern.fullmatch(raw_text) for pattern in _GENERIC_SIGNAL_PATTERNS)


def extract_signal_tokens(
    *values: Any,
    max_token_length: int = 14,
    min_token_length: int = 2,
) -> list[str]:
    tokens: list[str] = []
    seen_keys: set[str] = set()

    def push(token: Any, *, allow_long_ascii: bool = False) -> None:
        clean = str(token or "").strip().strip("·:：-_ ").strip("#").strip()
        if not clean:
            return
        for prefix in SMART_GROUP_SIGNAL_PREFIXES:
            if clean.startswith(prefix):
                clean = clean[len(prefix):].strip()
                break
        if not clean:
            return

        normalized = _normalize_signal_key(clean)
        if not normalized or len(normalized) < min_token_length:
            return
        if is_generic_group_signal(clean):
            return

        is_ascii_like = bool(re.fullmatch(r"[A-Za-z0-9+._-]+", clean))
        has_ascii = bool(re.search(r"[A-Za-z]", clean))
        has_cjk = bool(re.search(r"[\u4e00-\u9fff]", clean))
        if len(clean) > max_token_length and not (allow_long_ascii and is_ascii_like and len(clean) <= 24):
            return
        if has_cjk and not has_ascii and len(clean) > 8:
            return
        if has_ascii and has_cjk and len(clean) > 6:
            return

        if normalized in seen_keys:
            return
        seen_keys.add(normalized)
        tokens.append(clean)

    for value in values:
        raw_text = str(value or "")
        if not raw_text.strip():
            continue

        for part in re.split(r"[\s\n\r\t|/｜、，,;；#（）()【】\[\]<>《》“”‘’\"'?!！？。、:：]+", raw_text):
            candidate = str(part or "").strip()
            if not candidate:
                continue
            push(candidate)

        for match in _ASCII_SIGNAL_RE.findall(raw_text):
            push(match, allow_long_ascii=True)

    return tokens


def build_smart_group_value(label: str) -> str:
    clean_label = str(label or "").strip()
    if clean_label in {"", "其他"}:
        return "other"
    return "smart-" + hashlib.md5(clean_label.encode("utf-8")).hexdigest()[:8]


def unique_strings(values: list[Any] | tuple[Any, ...] | None, limit: int | None = None) -> list[str]:
    result: list[str] = []
    for value in values or []:
        text = str(value or "").strip()
        if not text or text in result:
            continue
        result.append(text)
        if limit and len(result) >= limit:
            break
    return result


def _max_number(*values: Any) -> int | float | None:
    numbers: list[int | float] = []
    for value in values:
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            numbers.append(value)
    return max(numbers) if numbers else None


def build_group_label_map(
    group_options: list[dict[str, Any]] | None,
    *profile_maps: dict[str, dict[str, Any]] | None,
) -> dict[str, str]:
    label_map: dict[str, str] = {}
    for option in group_options or []:
        value = str(option.get("value") or "").strip()
        label = str(option.get("label") or "").strip()
        if value and label:
            label_map[value] = label
    for profile_map in profile_maps:
        for profile in (profile_map or {}).values():
            groups = unique_strings(profile.get("smart_groups") or [])
            labels = unique_strings(profile.get("smart_group_labels") or [])
            for index, group in enumerate(groups):
                label = labels[index] if index < len(labels) else ""
                if group and label:
                    label_map[group] = label
    return label_map


def _clean_group_label(label: Any) -> str:
    text = re.sub(r"\s+", " ", str(label or "").strip())
    if not text:
        return "其他"
    return text[:48]


def _coerce_group_labels(value: Any) -> list[str]:
    values = value if isinstance(value, (list, tuple, set)) else [value]
    return unique_strings(
        [_clean_group_label(item) for item in values if str(item or "").strip()],
        limit=4,
    )


def merge_shared_group_options(*option_groups: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}

    for options in option_groups:
        for option in options or []:
            label = str(option.get("label") or "").strip()
            value = str(option.get("value") or "").strip() or build_smart_group_value(label)
            if not value:
                continue
            if not label:
                label = str(option.get("name") or value).strip()
            if not label:
                continue

            entry = merged.setdefault(value, {"value": value, "label": label})
            if not entry.get("label"):
                entry["label"] = label

            count = _max_number(entry.get("count"), option.get("count"))
            if count is not None:
                entry["count"] = count

            entry["sample_authors"] = unique_strings(
                [*(entry.get("sample_authors") or []), *(option.get("sample_authors") or [])],
                limit=_PROFILE_LIST_LIMITS["sample_authors"],
            )
            entry["sample_tags"] = unique_strings(
                [*(entry.get("sample_tags") or []), *(option.get("sample_tags") or [])],
                limit=_OPTION_LIST_LIMITS["sample_tags"],
            )
            entry["source_signals"] = unique_strings(
                [*(entry.get("source_signals") or []), *(option.get("source_signals") or [])],
                limit=_OPTION_LIST_LIMITS["source_signals"],
            )
            entry["platforms"] = unique_strings(
                [*(entry.get("platforms") or []), *(option.get("platforms") or [])],
                limit=_OPTION_LIST_LIMITS["platforms"],
            )

    return sorted(
        merged.values(),
        key=lambda item: (-int(item.get("count") or 0), str(item.get("label") or "")),
    )


def get_shared_creator_group_options(prefs: dict[str, Any]) -> list[dict[str, Any]]:
    modules = prefs.get("modules", {}) if isinstance(prefs, dict) else {}
    shared_snapshot = (
        (prefs.get("shared_creator_grouping", {}) if isinstance(prefs, dict) else {}).get("group_options") or []
    )
    return merge_shared_group_options(
        shared_snapshot,
        (modules.get("bilibili-tracker") or {}).get("creator_group_options") or [],
        (modules.get("xiaohongshu-tracker") or {}).get("creator_group_options") or [],
    )


def sync_shared_creator_group_options(
    prefs: dict[str, Any],
    incoming_options: list[dict[str, Any]] | None = None,
    *,
    replace_existing: bool = False,
) -> list[dict[str, Any]]:
    prefs.setdefault("modules", {})
    prefs.setdefault("shared_creator_grouping", {})
    modules = prefs["modules"]
    shared_options = (
        merge_shared_group_options(incoming_options or [])
        if replace_existing
        else merge_shared_group_options(
            get_shared_creator_group_options(prefs),
            incoming_options or [],
        )
    )
    prefs["shared_creator_grouping"]["group_options"] = shared_options
    for module_id in ("bilibili-tracker", "xiaohongshu-tracker"):
        module_prefs = modules.setdefault(module_id, {})
        module_prefs["creator_group_options"] = shared_options
    return shared_options


def merge_creator_profiles(
    existing_profiles: dict[str, dict[str, Any]] | None,
    incoming_profiles: dict[str, dict[str, Any]] | None,
    group_options: list[dict[str, Any]] | None = None,
) -> dict[str, dict[str, Any]]:
    current_profiles = dict(existing_profiles or {})
    next_profiles = dict(incoming_profiles or {})
    label_map = build_group_label_map(group_options, current_profiles, next_profiles)
    merged: dict[str, dict[str, Any]] = {}

    for author_id in sorted(set(current_profiles) | set(next_profiles)):
        existing = dict(current_profiles.get(author_id) or {})
        incoming = dict(next_profiles.get(author_id) or {})
        if not incoming:
            merged[author_id] = existing
            continue

        manual_override = bool(existing.get("manual_override"))
        if manual_override and existing.get("smart_groups"):
            groups = unique_strings(existing.get("smart_groups") or [])
        else:
            groups = unique_strings(incoming.get("smart_groups") or existing.get("smart_groups") or [])

        profile = {**existing, **incoming}
        profile["author_id"] = str(incoming.get("author_id") or existing.get("author_id") or author_id)
        profile["author"] = (
            str(incoming.get("author") or existing.get("author") or existing.get("matched_author") or author_id).strip()
        )

        incoming_labels = unique_strings(incoming.get("smart_group_labels") or [])
        existing_labels = unique_strings(existing.get("smart_group_labels") or [])
        profile["smart_groups"] = groups
        profile["smart_group_labels"] = [
            label_map.get(group)
            or (incoming_labels[index] if index < len(incoming_labels) else "")
            or (existing_labels[index] if index < len(existing_labels) else "")
            or group
            for index, group in enumerate(groups)
        ]

        if manual_override:
            profile["manual_override"] = True

        for key, limit in _PROFILE_LIST_LIMITS.items():
            profile[key] = unique_strings(
                [*(existing.get(key) or []), *(incoming.get(key) or [])],
                limit=limit,
            )

        for key in (
            "favorite_note_count",
            "note_count",
            "total_likes",
            "total_collects",
            "total_comments",
            "score",
        ):
            value = _max_number(existing.get(key), incoming.get(key))
            if value is not None:
                profile[key] = value

        for key in ("matched_author", "latest_title", "source_summary", "grouping_source"):
            text = str(incoming.get(key) or existing.get(key) or "").strip()
            if text:
                profile[key] = text

        profile["grouping_updated_at"] = datetime.now(UTC).isoformat()
        merged[author_id] = profile

    return merged


def _primary_group_signal(signal_weights: Counter[str]) -> str:
    for signal, _weight in signal_weights.most_common(6):
        if not is_generic_group_signal(signal):
            return signal
    return "other"


def _build_dynamic_group_label(primary_signal: str, members: list[dict[str, Any]]) -> str:
    if primary_signal == "other":
        return "其他"

    secondary = Counter()
    for member in members:
        signal_weights = Counter(member.get("signal_weights") or {})
        for signal, weight in signal_weights.most_common(6):
            if signal == primary_signal or is_generic_group_signal(signal):
                continue
            secondary[signal] += weight

    second = secondary.most_common(1)
    if second and len(members) > 1 and second[0][0] != primary_signal:
        return f"{primary_signal} / {second[0][0]}"
    return primary_signal


def assign_dynamic_smart_groups(
    entries: list[dict[str, Any]],
    signal_group_labels: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    if not entries:
        return []

    normalized_signal_group_labels = {
        _normalize_signal_key(signal): _coerce_group_labels(label)
        for signal, label in (signal_group_labels or {}).items()
        if str(signal or "").strip()
    }
    global_scores = Counter()
    signal_support = Counter()

    for entry in entries:
        signal_weights = Counter(entry.get("signal_weights") or {})
        seen_signals: set[str] = set()
        for signal, weight in signal_weights.most_common(4):
            if is_generic_group_signal(signal):
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

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in entries:
        signal_weights = Counter(entry.get("signal_weights") or {})
        ai_group_scores = Counter()
        for signal, weight in signal_weights.most_common(12):
            group_labels = normalized_signal_group_labels.get(_normalize_signal_key(signal)) or []
            if not group_labels:
                continue
            for group_label in group_labels:
                ai_group_scores[group_label] += weight
        if ai_group_scores:
            best_group_label = ai_group_scores.most_common(1)[0][0]
            grouped[f"label::{best_group_label}"].append(entry)
            continue

        best_signal = ""
        best_weight = 0.0

        for signal, weight in signal_weights.most_common(6):
            if signal in canonical and weight > best_weight:
                best_signal = signal
                best_weight = weight

        if not best_signal:
            best_signal = _primary_group_signal(signal_weights)
            if best_signal != "other" and best_signal not in canonical and len(entries) > 12:
                grouped["label::待细化"].append(entry)
                continue

        grouped[f"signal::{best_signal or 'other'}"].append(entry)

    options: list[dict[str, Any]] = []
    for grouping_key, members in grouped.items():
        if grouping_key.startswith("label::"):
            label = _clean_group_label(grouping_key.split("::", 1)[1])
        else:
            primary_signal = grouping_key.split("::", 1)[1]
            label = _build_dynamic_group_label(primary_signal, members)
        value = build_smart_group_value(label)
        signal_counter = Counter()
        source_signals: list[str] = []
        platforms = unique_strings(
            [member.get("platform") for member in members],
            limit=_OPTION_LIST_LIMITS["platforms"],
        )

        for member in members:
            member["smart_group_value"] = value
            member["smart_group_label"] = label
            signal_weights = Counter(member.get("signal_weights") or {})
            for signal, weight in signal_weights.most_common(5):
                if is_generic_group_signal(signal):
                    continue
                signal_counter[signal] += weight
                normalized_signal = _normalize_signal_key(signal)
                if grouping_key.startswith("label::"):
                    if label in (normalized_signal_group_labels.get(normalized_signal) or []):
                        source_signals.append(signal)
                else:
                    source_signals.append(signal)

        options.append(
            {
                "value": value,
                "label": label,
                "count": len(members),
                "sample_authors": unique_strings(
                    [
                        member.get("display_name")
                        or member.get("author")
                        or member.get("matched_author")
                        or member.get("author_id")
                        for member in members
                    ],
                    limit=4,
                ),
                "sample_tags": [signal for signal, _score in signal_counter.most_common(4)],
                "source_signals": unique_strings(
                    source_signals or [signal for signal, _score in signal_counter.most_common(6)],
                    limit=_OPTION_LIST_LIMITS["source_signals"],
                ),
                "platforms": platforms,
            }
        )

    return merge_shared_group_options(options)


def match_smart_groups_from_content_tags(
    tags: list[Any] | tuple[Any, ...] | None,
    group_options: list[dict[str, Any]] | None,
) -> tuple[list[str], list[str]]:
    normalized_tags = unique_strings(tags or [], limit=24)
    if not normalized_tags or not group_options:
        return [], []

    matched_values: list[str] = []
    matched_labels: list[str] = []
    normalized_tag_keys = {
        _normalize_signal_key(tag)
        for tag in normalized_tags
        if len(_normalize_signal_key(tag)) >= 2
    }

    def keys_match(tag_key: str, signal_key: str) -> bool:
        if not tag_key or not signal_key:
            return False
        if tag_key == signal_key:
            return True
        # Avoid broad false positives like "知识" -> "健康知识科普".
        if min(len(tag_key), len(signal_key)) < 4:
            return False
        return tag_key in signal_key or signal_key in tag_key

    for option in group_options or []:
        value = str(option.get("value") or "").strip()
        label = str(option.get("label") or "").strip()
        if not value or not label:
            continue

        candidate_signals = unique_strings(
            [
                *(option.get("source_signals") or []),
                *(option.get("sample_tags") or []),
            ],
            limit=20,
        )
        normalized_signals = [
            _normalize_signal_key(signal)
            for signal in candidate_signals
            if len(_normalize_signal_key(signal)) >= 2 and not is_generic_group_signal(signal)
        ]
        if not normalized_signals:
            continue

        hit = False
        for signal_key in normalized_signals:
            for tag_key in normalized_tag_keys:
                if keys_match(tag_key, signal_key):
                    hit = True
                    break
            if hit:
                break

        if hit:
            matched_values.append(value)
            matched_labels.append(label)

    return unique_strings(matched_values), unique_strings(matched_labels)


def build_shared_signal_entries(shared_grouping: dict[str, Any] | None) -> list[dict[str, Any]]:
    snapshot = shared_grouping or {}
    group_options = snapshot.get("group_options") or []
    creator_catalog = snapshot.get("creator_catalog") or {}
    vault_signal_database = snapshot.get("vault_signal_database") or {}
    explicit_labels = {
        str(signal).strip(): _coerce_group_labels(label)
        for signal, label in (snapshot.get("signal_group_labels") or {}).items()
        if str(signal or "").strip() and _coerce_group_labels(label)
    }
    inferred_labels: dict[str, list[str]] = {}
    for option in group_options:
        label = _clean_group_label(option.get("label"))
        for signal in option.get("source_signals") or []:
            raw_signal = str(signal or "").strip()
            if raw_signal and raw_signal not in inferred_labels:
                inferred_labels[raw_signal] = [label]

    aggregated: dict[str, dict[str, Any]] = {}

    for item in vault_signal_database.get("signals") or []:
        raw_signal = str(item.get("signal") or "").strip()
        if not raw_signal or is_generic_group_signal(raw_signal):
            continue
        entry = aggregated.setdefault(
            raw_signal,
            {
                "signal": raw_signal,
                "group_labels": explicit_labels.get(raw_signal) or inferred_labels.get(raw_signal) or [],
                "group_label": "",
                "count": 0,
                "platforms": [],
                "sample_authors": [],
                "sample_groups": [],
            },
        )
        entry["count"] = int(entry.get("count") or 0) + int(item.get("count") or 0)
        entry["group_labels"] = unique_strings(
            [
                *(entry.get("group_labels") or []),
                *(explicit_labels.get(raw_signal) or []),
                *(inferred_labels.get(raw_signal) or []),
            ],
            limit=4,
        )
        entry["group_label"] = " · ".join(entry.get("group_labels") or [])
        entry["platforms"] = unique_strings(
            [*(entry.get("platforms") or []), *(item.get("platforms") or [])],
            limit=4,
        )
        entry["sample_authors"] = unique_strings(
            [
                *(entry.get("sample_authors") or []),
                *(item.get("sample_authors") or []),
                *(item.get("sample_titles") or []),
            ],
            limit=5,
        )

    for item in creator_catalog.values():
        author = str(item.get("author") or "").strip()
        platform = str(item.get("platform") or "").strip()
        group_labels = unique_strings(item.get("smart_group_labels") or [], limit=3)
        for signal in unique_strings(item.get("raw_signals") or [], limit=12):
            raw_signal = str(signal or "").strip()
            if not raw_signal or is_generic_group_signal(raw_signal):
                continue
            entry = aggregated.setdefault(
                raw_signal,
                {
                    "signal": raw_signal,
                    "group_labels": explicit_labels.get(raw_signal) or inferred_labels.get(raw_signal) or [],
                    "group_label": "",
                    "count": 0,
                    "platforms": [],
                    "sample_authors": [],
                    "sample_groups": [],
                },
            )
            entry["count"] = int(entry.get("count") or 0) + 1
            entry["group_labels"] = unique_strings(
                [
                    *(entry.get("group_labels") or []),
                    *(explicit_labels.get(raw_signal) or []),
                    *(inferred_labels.get(raw_signal) or []),
                ],
                limit=4,
            )
            entry["group_label"] = " · ".join(entry.get("group_labels") or [])
            entry["platforms"] = unique_strings(
                [*(entry.get("platforms") or []), platform],
                limit=4,
            )
            entry["sample_authors"] = unique_strings(
                [*(entry.get("sample_authors") or []), author],
                limit=5,
            )
            entry["sample_groups"] = unique_strings(
                [*(entry.get("sample_groups") or []), *group_labels],
                limit=3,
            )

    return sorted(
        aggregated.values(),
        key=lambda item: (-int(item.get("count") or 0), str(item.get("signal") or "")),
    )
