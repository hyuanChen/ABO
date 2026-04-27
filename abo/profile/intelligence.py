from __future__ import annotations

import re
import uuid
from collections import Counter
from dataclasses import asdict, is_dataclass
from datetime import UTC, datetime
from typing import Any

from ..activity.models import ActivityType, DailyTimeline

SBTI_TYPES = [
    "CTRL", "ATM-er", "Dior-s", "BOSS", "THAN-K", "OH-NO",
    "GOGO", "SEXY", "LOVE-R", "MUM", "FAKE", "OJBK",
    "MALO", "JOKE-R", "WOC!", "THIN-K", "SHIT", "ZZZZ",
    "POOR", "MONK", "IMSB", "SOLO", "FUCK", "DEAD",
    "IMFW", "HHHH", "DRUNK",
]

SBTI_LABELS = {
    "CTRL": "拿捏者",
    "ATM-er": "送钱者",
    "Dior-s": "屌丝",
    "BOSS": "领导者",
    "THAN-K": "感恩者",
    "OH-NO": "哦不人",
    "GOGO": "行者",
    "SEXY": "尤物",
    "LOVE-R": "多情者",
    "MUM": "妈妈",
    "FAKE": "伪人",
    "OJBK": "无所谓人",
    "MALO": "吗喽",
    "JOKE-R": "小丑",
    "WOC!": "握草人",
    "THIN-K": "思考者",
    "SHIT": "愤世者",
    "ZZZZ": "装死者",
    "POOR": "贫困者",
    "MONK": "僧人",
    "IMSB": "傻者",
    "SOLO": "孤儿",
    "FUCK": "草者",
    "DEAD": "死者",
    "IMFW": "废物",
    "HHHH": "傻乐者",
    "DRUNK": "酒鬼",
}

_SBTI_KEYMAP = {re.sub(r"[^A-Z0-9]", "", value.upper()): value for value in SBTI_TYPES}
_SBTI_KEYMAP.update({
    "WOC": "WOC!",
    "THANK": "THAN-K",
    "THINK": "THIN-K",
    "LOVER": "LOVE-R",
    "JOKER": "JOKE-R",
    "ATMER": "ATM-er",
    "OHNO": "OH-NO",
    "DIORS": "Dior-s",
})

TARGET_TODO_MS = 25 * 60 * 1000

_ACTIVITY_LABELS = {
    ActivityType.CARD_VIEW.value: "浏览",
    ActivityType.CARD_LIKE.value: "喜欢",
    ActivityType.CARD_SAVE.value: "收藏",
    ActivityType.CARD_DISLIKE.value: "跳过",
    ActivityType.CARD_SHARE.value: "分享",
    ActivityType.CHAT_START.value: "开启对话",
    ActivityType.CHAT_MESSAGE.value: "讨论",
    ActivityType.MODULE_RUN.value: "运行模块",
    ActivityType.CHECKIN.value: "打卡",
}


def normalize_sbti_type(value: str | None) -> str:
    if not value:
        return "THIN-K"
    key = re.sub(r"[^A-Z0-9]", "", value.strip().upper())
    return _SBTI_KEYMAP.get(key, "THIN-K")


def serialize_keyword_preferences(keyword_prefs: dict[str, Any], limit: int = 8) -> list[dict]:
    serialized: list[dict] = []
    for keyword, raw in keyword_prefs.items():
        data = asdict(raw) if is_dataclass(raw) else dict(raw)
        score = float(data.get("score", 0.0))
        if score <= 0:
            continue
        serialized.append({
            "keyword": keyword,
            "score": score,
            "count": int(data.get("count", 0)),
        })
    serialized.sort(key=lambda item: (item["score"], item["count"]), reverse=True)
    return serialized[:limit]


def build_timeline_digest(
    timeline: DailyTimeline,
    keyword_prefs: dict[str, Any],
    limit: int = 6,
) -> dict:
    positive_keywords = {
        item["keyword"]
        for item in serialize_keyword_preferences(keyword_prefs, limit=12)
        if item["score"] > 0
    }
    activity_counts = timeline.get_interaction_summary()
    tag_counter: Counter[str] = Counter()
    preferred_counter: Counter[str] = Counter()
    module_counter: Counter[str] = Counter()
    titles: list[str] = []

    for activity in timeline.activities:
        if activity.module_id:
            module_counter[activity.module_id] += 1
        if activity.card_title and activity.card_title not in titles:
            titles.append(activity.card_title)
        tags = activity.metadata.get("tags", []) if activity.metadata else []
        for tag in tags:
            normalized = str(tag).strip().lower()
            if not normalized:
                continue
            tag_counter[normalized] += 1
            if normalized in positive_keywords:
                preferred_counter[normalized] += 1

    return {
        "activity_counts": activity_counts,
        "top_tags": [{"tag": tag, "count": count} for tag, count in tag_counter.most_common(limit)],
        "preferred_hits": [{"tag": tag, "count": count} for tag, count in preferred_counter.most_common(limit)],
        "modules": [{"module_id": mid, "count": count} for mid, count in module_counter.most_common(limit)],
        "titles": titles[:limit],
    }


def merge_generated_todos(existing: list[dict], generated: list[dict]) -> tuple[list[dict], int]:
    def normalize_text(text: str) -> str:
        return re.sub(r"\s+", " ", str(text or "")).strip()

    def signature(text: str) -> str:
        return normalize_text(text).lower()

    def normalize_priority(value: Any) -> str:
        lowered = str(value or "").strip().lower()
        if lowered in {"high", "medium", "low"}:
            return lowered
        if lowered in {"p0", "urgent"}:
            return "high"
        if lowered in {"p2", "later"}:
            return "low"
        return "medium"

    merged = [dict(todo) for todo in existing]
    by_signature = {signature(todo.get("text", "")): index for index, todo in enumerate(merged)}
    created = 0

    for raw in generated:
        text = normalize_text(raw.get("text", ""))
        if not text:
            continue

        normalized = {
            "text": text,
            "done": False,
            "started_at": None,
            "duration_ms": None,
            "source": raw.get("source") or "agent",
            "priority": normalize_priority(raw.get("priority")),
            "reason": normalize_text(raw.get("reason", "")),
            "evidence": [normalize_text(item) for item in raw.get("evidence", []) if normalize_text(item)],
            "generated_at": raw.get("generated_at") or datetime.now(UTC).isoformat(),
        }

        key = signature(text)
        existing_index = by_signature.get(key)
        if existing_index is not None:
            existing_todo = merged[existing_index]
            existing_todo.setdefault("source", normalized["source"])
            if not existing_todo.get("priority"):
                existing_todo["priority"] = normalized["priority"]
            if not existing_todo.get("reason") and normalized["reason"]:
                existing_todo["reason"] = normalized["reason"]
            if normalized["evidence"] and not existing_todo.get("evidence"):
                existing_todo["evidence"] = normalized["evidence"]
            continue

        merged.append({
            "id": raw.get("id") or str(uuid.uuid4()),
            **normalized,
        })
        by_signature[key] = len(merged) - 1
        created += 1

    return merged, created


def calculate_workbench(
    timeline: DailyTimeline,
    todos: list[dict],
    keyword_prefs: dict[str, Any],
    energy: int,
    san: float,
    happiness: float,
    briefing_summary: str = "",
) -> dict:
    counts = timeline.get_interaction_summary()
    views = counts.get(ActivityType.CARD_VIEW.value, 0)
    likes = counts.get(ActivityType.CARD_LIKE.value, 0)
    saves = counts.get(ActivityType.CARD_SAVE.value, 0)
    dislikes = counts.get(ActivityType.CARD_DISLIKE.value, 0)
    chats = counts.get(ActivityType.CHAT_START.value, 0) + counts.get(ActivityType.CHAT_MESSAGE.value, 0)
    module_runs = counts.get(ActivityType.MODULE_RUN.value, 0)

    positive_keywords = {
        item["keyword"]
        for item in serialize_keyword_preferences(keyword_prefs, limit=12)
        if item["score"] > 0
    }

    tag_counter: Counter[str] = Counter()
    preferred_counter: Counter[str] = Counter()
    module_counter: Counter[str] = Counter()
    hour_counter: Counter[int] = Counter()
    recent_activity: list[dict] = []

    for activity in timeline.activities[-12:]:
        recent_activity.append({
            "id": activity.id,
            "time": _short_time(activity.timestamp),
            "label": _ACTIVITY_LABELS.get(activity.type.value, activity.type.value),
            "title": activity.card_title or activity.chat_topic or activity.module_id or "未命名活动",
        })

    for activity in timeline.activities:
        if activity.module_id:
            module_counter[activity.module_id] += 1
        tags = activity.metadata.get("tags", []) if activity.metadata else []
        for tag in tags:
            normalized = str(tag).strip().lower()
            if not normalized:
                continue
            tag_counter[normalized] += 1
            if normalized in positive_keywords:
                preferred_counter[normalized] += 1
        try:
            hour_counter[datetime.fromisoformat(activity.timestamp).hour] += 1
        except (TypeError, ValueError):
            continue

    total_tag_hits = sum(tag_counter.values())
    preferred_hits = sum(preferred_counter.values())

    signal_score = round(100 * (
        0.45 * _clamp01((views + likes + saves) / 10)
        + 0.35 * _safe_ratio(preferred_hits, max(total_tag_hits, 1))
        + 0.20 * _safe_ratio(saves, max(views + likes + saves, 1))
    ))

    reflection_anchor = 1.0 if (timeline.summary or briefing_summary) else 0.0
    reflection_score = round(100 * (
        0.55 * _clamp01((likes + saves + chats * 0.5) / max(views + likes + saves + dislikes, 1))
        + 0.25 * _clamp01(chats / 4)
        + 0.20 * reflection_anchor
    ))

    todo_total = len(todos)
    todo_done = sum(1 for todo in todos if todo.get("done"))
    todo_started = sum(1 for todo in todos if todo.get("done") or todo.get("started_at"))
    total_duration = sum(int(todo.get("duration_ms") or 0) for todo in todos if todo.get("done"))

    if todo_total > 0:
        execution_score = round(100 * (
            0.60 * _safe_ratio(todo_done, todo_total)
            + 0.20 * _safe_ratio(todo_started, todo_total)
            + 0.20 * _clamp01(_safe_ratio(total_duration, max(todo_done, 1) * TARGET_TODO_MS))
        ))
    else:
        execution_score = 25 if timeline.activities else 0

    active_hours = sum(1 for count in hour_counter.values() if count > 0)
    wellness_score = (
        0.50 * _clamp01(energy / 100)
        + 0.25 * _clamp01(san / 100)
        + 0.25 * _clamp01(happiness / 10)
    )
    momentum_score = round(100 * (
        0.45 * _clamp01(active_hours / 4)
        + 0.35 * wellness_score
        + 0.20 * _clamp01(len(module_counter) / 3)
    ))

    composite = round(
        signal_score * 0.32
        + execution_score * 0.30
        + reflection_score * 0.20
        + momentum_score * 0.18
    )

    period_counts = {
        "上午": sum(count for hour, count in hour_counter.items() if hour < 12),
        "下午": sum(count for hour, count in hour_counter.items() if 12 <= hour < 18),
        "晚上": sum(count for hour, count in hour_counter.items() if hour >= 18),
    }
    dominant_period = max(period_counts.items(), key=lambda item: item[1])[0] if period_counts else "全天"
    top_topics = [
        {
            "tag": tag,
            "count": count,
            "preferred": tag in positive_keywords,
        }
        for tag, count in tag_counter.most_common(6)
    ]

    summary = _build_workbench_summary(
        composite=composite,
        dominant_period=dominant_period,
        preferred_hits=preferred_hits,
        todo_done=todo_done,
        todo_total=todo_total,
        top_topics=top_topics,
        total_activities=len(timeline.activities),
    )

    return {
        "score": {
            "value": composite,
            "label": _score_label(composite),
            "summary": summary,
        },
        "metrics": [
            {
                "id": "signal",
                "label": "情报吸收",
                "value": signal_score,
                "detail": f"收藏 {saves} 条，偏好命中 {preferred_hits} 次",
            },
            {
                "id": "execution",
                "label": "执行兑现",
                "value": execution_score,
                "detail": f"待办完成 {todo_done}/{todo_total}" if todo_total else "今天还没有明确的待办闭环",
            },
            {
                "id": "reflection",
                "label": "沉淀深度",
                "value": reflection_score,
                "detail": f"对话 {chats} 次，已形成 {1 if (timeline.summary or briefing_summary) else 0} 条总结",
            },
            {
                "id": "momentum",
                "label": "节奏稳定",
                "value": momentum_score,
                "detail": f"{dominant_period}最活跃，涉及 {len(module_counter)} 个来源",
            },
        ],
        "top_topics": top_topics,
        "recent_activity": recent_activity[-6:],
        "todo_snapshot": {
            "total": todo_total,
            "done": todo_done,
            "started": todo_started,
            "duration_ms": total_duration,
        },
        "activity_counts": {
            "views": views,
            "likes": likes,
            "saves": saves,
            "dislikes": dislikes,
            "chats": chats,
            "module_runs": module_runs,
        },
    }


def _build_workbench_summary(
    composite: int,
    dominant_period: str,
    preferred_hits: int,
    todo_done: int,
    todo_total: int,
    top_topics: list[dict],
    total_activities: int,
) -> str:
    topic_line = "、".join(topic["tag"] for topic in top_topics[:3]) if top_topics else "暂无稳定主题"
    if todo_total > 0:
        todo_line = f"待办完成 {todo_done}/{todo_total}"
    else:
        todo_line = "今天还没有形成明确待办"
    return (
        f"{dominant_period}是你的主工作时段，今天共记录 {total_activities} 项活动，"
        f"高偏好主题命中 {preferred_hits} 次，核心关注集中在 {topic_line}。"
        f"{todo_line}，当前推进指数 {composite}。"
    )


def _score_label(score: int) -> str:
    if score >= 85:
        return "推进很稳"
    if score >= 70:
        return "进入状态"
    if score >= 55:
        return "基本在线"
    if score >= 40:
        return "需要收束"
    return "等待起势"


def _safe_ratio(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return numerator / denominator


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _short_time(timestamp: str) -> str:
    try:
        return datetime.fromisoformat(timestamp).strftime("%H:%M")
    except (TypeError, ValueError):
        return "--:--"
