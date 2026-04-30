"""
数据洞察 API 路由
提供个人数据分析和可视化所需的数据
"""
import json
from collections import Counter
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import APIRouter
from pydantic import BaseModel

from ..config import is_demo_mode
from ..demo.data import (
    get_demo_overview, get_demo_today, get_demo_wellness,
    get_demo_engagement, get_demo_preferences_evolution,
    get_demo_intelligence_rhythm,
)
from ..store.cards import CardStore
from ..preferences.engine import PreferenceEngine
from ..activity import ActivityTracker
from ..profile import store as profile_store
from ..storage_paths import get_keyword_preferences_path, resolve_app_root_file

router = APIRouter(prefix="/api/insights")

# ── 数据模型 ──────────────────────────────────────────────────────

class DailyTrendItem(BaseModel):
    date: str
    count: int

class OverviewResponse(BaseModel):
    totalCards: int
    thisWeek: int
    lastWeek: int
    dailyTrend: List[DailyTrendItem]
    byModule: Dict[str, int]
    topTags: List[List[Any]]  # [[tag, count], ...]
    readingStreak: int

class ActivityResponse(BaseModel):
    days: int
    data: List[DailyTrendItem]

class PreferenceEvolutionItem(BaseModel):
    keyword: str
    score: float
    count: int

class PreferencesEvolutionResponse(BaseModel):
    keywords: List[PreferenceEvolutionItem]


# ── Today Snapshot 模型 ──────────────────────────────────────────

class HourlyActivity(BaseModel):
    hour: int
    count: int

class ActivityCounts(BaseModel):
    total: int
    views: int
    likes: int
    saves: int
    dislikes: int
    chats: int
    module_runs: int

class TodoProgress(BaseModel):
    total: int
    done: int
    rate: float  # 0-1

class WellnessSnapshot(BaseModel):
    energy: int
    san: float
    happiness: float

class TodayResponse(BaseModel):
    date: str
    activityCounts: ActivityCounts
    hourlyHeatmap: List[HourlyActivity]
    todoProgress: TodoProgress
    wellness: WellnessSnapshot
    summary: Optional[str]
    topInteractions: List[Dict[str, Any]]  # top cards interacted with today


# ── Wellness Trend 模型 ─────────────────────────────────────────

class DailyWellness(BaseModel):
    date: str
    san: Optional[float]
    happiness: Optional[float]
    energy: Optional[int]

class WeeklyAvg(BaseModel):
    san: float
    happiness: float
    energy: float

class WellnessResponse(BaseModel):
    daily: List[DailyWellness]
    thisWeekAvg: WeeklyAvg
    lastWeekAvg: WeeklyAvg


# ── Engagement Depth 模型 ────────────────────────────────────────

class EngagementCounts(BaseModel):
    totalViewed: int
    liked: int
    saved: int
    starred: int
    disliked: int
    skipped: int

class DailyEngagement(BaseModel):
    date: str
    viewed: int
    deepRead: int  # liked + saved + starred
    rate: float  # deepRead / viewed (0-1)

class WeekComparison(BaseModel):
    thisWeek: EngagementCounts
    lastWeek: EngagementCounts
    cardsDelta: int
    engagementRateDelta: float

class EngagementResponse(BaseModel):
    overall: EngagementCounts
    dailyTrend: List[DailyEngagement]
    weekComparison: WeekComparison


# ── Intelligence Rhythm 模型 ─────────────────────────────────────

class InsightBucket(BaseModel):
    label: str
    count: int
    share: float
    delta: int
    examples: List[str]


class PreferenceSignal(BaseModel):
    keyword: str
    score: float
    count: int
    sourceModules: List[str]


class HourlyRhythmPoint(BaseModel):
    hour: int
    interaction: int
    feed: int
    combined: int


class WeekdayRhythmPoint(BaseModel):
    weekday: int
    label: str
    interaction: int
    feed: int
    combined: int


class PeakWindow(BaseModel):
    label: str
    startHour: int
    endHour: int
    interactionCount: int
    feedCount: int


class InsightHighlight(BaseModel):
    title: str
    moduleId: str
    moduleLabel: str
    detail: str
    createdAt: str


class InsightSuggestion(BaseModel):
    kind: str
    title: str
    detail: str


class IntelligenceRhythmResponse(BaseModel):
    windowDays: int
    recentFeedCount: int
    recentInteractionCount: int
    activeDays: int
    latestSignalDate: str
    cadenceLabel: str
    rhythmSource: str
    summary: str
    peakWindow: PeakWindow
    feedMix: List[InsightBucket]
    themeMix: List[InsightBucket]
    paperMix: List[InsightBucket]
    preferences: List[PreferenceSignal]
    hourlyRhythm: List[HourlyRhythmPoint]
    weekdayRhythm: List[WeekdayRhythmPoint]
    highlights: List[InsightHighlight]
    suggestions: List[InsightSuggestion]


# ── 辅助函数 ──────────────────────────────────────────────────────

def calculate_reading_streak(activity_tracker: ActivityTracker) -> int:
    """Calculate consecutive days with activity."""
    streak = 0
    today = datetime.now().date()

    for i in range(365):
        date = today - timedelta(days=i)
        date_str = date.strftime("%Y-%m-%d")
        timeline = activity_tracker.get_timeline(date_str)

        if timeline.activities:
            streak += 1
        else:
            if i > 0:
                break

    return streak


def get_daily_card_counts(card_store: CardStore, days: int = 30) -> List[DailyTrendItem]:
    """Get daily card creation counts for the past N days."""
    results = []
    today = datetime.now().date()

    end_timestamp = datetime.combine(today + timedelta(days=1), datetime.min.time()).timestamp()
    start_timestamp = datetime.combine(today - timedelta(days=days), datetime.min.time()).timestamp()

    with card_store._conn() as conn:
        rows = conn.execute(
            """
            SELECT
                date(created_at, 'unixepoch', 'localtime') as date,
                COUNT(*) as count
            FROM cards
            WHERE created_at >= ? AND created_at < ?
            GROUP BY date
            ORDER BY date ASC
            """,
            (start_timestamp, end_timestamp)
        ).fetchall()

    count_map = {row[0]: row[1] for row in rows}

    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        date_str = d.strftime("%Y-%m-%d")
        results.append(DailyTrendItem(date=date_str, count=count_map.get(date_str, 0)))

    return results


def get_cards_by_module(card_store: CardStore) -> Dict[str, int]:
    """Get card counts grouped by module."""
    with card_store._conn() as conn:
        rows = conn.execute(
            "SELECT module_id, COUNT(*) FROM cards GROUP BY module_id"
        ).fetchall()

    return {row[0]: row[1] for row in rows}


def get_top_tags(card_store: CardStore, limit: int = 10) -> List[List[Any]]:
    """Get most frequent tags across all cards."""
    tag_counter: Counter = Counter()

    with card_store._conn() as conn:
        rows = conn.execute("SELECT tags FROM cards WHERE tags IS NOT NULL").fetchall()

    for row in rows:
        try:
            tags = json.loads(row[0] or "[]")
            tag_counter.update(t.lower() for t in tags)
        except (json.JSONDecodeError, TypeError):
            continue

    return [[tag, count] for tag, count in tag_counter.most_common(limit)]


def get_week_count(card_store: CardStore, weeks_ago: int = 0) -> int:
    """Get count of cards created in a specific week. weeks_ago=0 is this week."""
    today = datetime.now().date()
    monday = today - timedelta(days=today.weekday()) - timedelta(weeks=weeks_ago)
    sunday = monday + timedelta(days=7)
    monday_ts = datetime.combine(monday, datetime.min.time()).timestamp()
    sunday_ts = datetime.combine(sunday, datetime.min.time()).timestamp()

    with card_store._conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM cards WHERE created_at >= ? AND created_at < ?",
            (monday_ts, sunday_ts)
        ).fetchone()

    return row[0] if row else 0


def _read_json_log(filename: str) -> list:
    """Read a JSON log file from the app data directory."""
    p = resolve_app_root_file(filename)
    if not p.exists():
        return []
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            return [{"date": k, "score": v} for k, v in sorted(raw.items())]
        return raw if isinstance(raw, list) else []
    except Exception:
        return []


def _read_energy_history() -> list:
    """Read energy history from the app data directory."""
    p = resolve_app_root_file("energy_memory.json")
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data.get("history", [])
    except Exception:
        return []


def _get_feedback_counts_for_period(card_store: CardStore, start_ts: float, end_ts: float) -> EngagementCounts:
    """Get engagement counts for cards in a time period."""
    with card_store._conn() as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM cards WHERE created_at >= ? AND created_at < ?",
            (start_ts, end_ts)
        ).fetchone()[0]

        rows = conn.execute(
            """SELECT feedback, COUNT(*) FROM cards
               WHERE created_at >= ? AND created_at < ? AND feedback IS NOT NULL
               GROUP BY feedback""",
            (start_ts, end_ts)
        ).fetchall()

    feedback_map = {r[0]: r[1] for r in rows}
    liked = feedback_map.get("like", 0)
    saved = feedback_map.get("save", 0)
    starred = feedback_map.get("star", 0)
    disliked = feedback_map.get("dislike", 0)
    skipped = feedback_map.get("skip", 0)

    return EngagementCounts(
        totalViewed=total,
        liked=liked,
        saved=saved,
        starred=starred,
        disliked=disliked,
        skipped=skipped,
    )


_MODULE_LABELS = {
    "arxiv-tracker": "arXiv",
    "semantic-scholar-tracker": "Follow Up",
    "xiaohongshu-tracker": "小红书",
    "bilibili-tracker": "Bilibili",
    "xiaoyuzhou-tracker": "小宇宙",
    "zhihu-tracker": "知乎",
    "folder-monitor": "文件监控",
}

_WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

_GENERIC_THEME_LABELS = {
    "",
    "其他",
    "内容",
    "笔记",
    "动态",
    "follow-up",
    "s2-引用",
    "关键词追踪",
    "follow up 追踪",
}


def _safe_json_loads(value: Any, default: Any) -> Any:
    if value in (None, ""):
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return default


def _safe_string_list(value: Any) -> list[str]:
    raw = _safe_json_loads(value, value)
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, list):
        return []

    cleaned: list[str] = []
    seen: set[str] = set()
    for item in raw:
        text = str(item or "").strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
    return cleaned


def _load_cards_for_period(card_store: CardStore, start_day: date, end_day: date) -> list[dict[str, Any]]:
    start_ts = datetime.combine(start_day, datetime.min.time()).timestamp()
    end_ts = datetime.combine(end_day, datetime.min.time()).timestamp()

    with card_store._conn() as conn:
        rows = conn.execute(
            """
            SELECT id, module_id, title, tags, metadata, created_at, feedback
            FROM cards
            WHERE created_at >= ? AND created_at < ?
            ORDER BY created_at DESC
            """,
            (start_ts, end_ts),
        ).fetchall()

    cards: list[dict[str, Any]] = []
    for row in rows:
        created_at = float(row[5] or 0)
        cards.append(
            {
                "id": row[0],
                "module_id": row[1] or "",
                "title": row[2] or "",
                "tags": _safe_string_list(row[3]),
                "metadata": _safe_json_loads(row[4], {}),
                "created_at": created_at,
                "created_dt": datetime.fromtimestamp(created_at) if created_at else None,
                "feedback": row[6] or "",
            }
        )
    return cards


def _load_recent_timelines(activity_tracker: ActivityTracker, days: int) -> list:
    timelines = []
    today = date.today()
    for offset in range(days):
        timeline = activity_tracker.get_timeline((today - timedelta(days=offset)).isoformat())
        if timeline.activities:
            timelines.append(timeline)
    return timelines


def _clean_theme_label(label: str) -> str:
    text = label.strip()
    if not text:
        return ""
    lowered = text.casefold()
    if lowered in _GENERIC_THEME_LABELS:
        return ""
    return text


def _extract_theme_labels(card: dict[str, Any]) -> list[str]:
    metadata = card.get("metadata") or {}
    labels: list[str] = []

    for key in ("smart_group_labels", "paper_tracking_labels", "matched_keywords"):
        labels.extend(_safe_string_list(metadata.get(key)))

    for key in ("smart_group_label", "paper_tracking_label"):
        value = str(metadata.get(key) or "").strip()
        if value:
            labels.append(value)

    crawl_source = str(metadata.get("crawl_source") or "").strip()
    if crawl_source.startswith("keyword:"):
        labels.append(crawl_source.split(":", 1)[1].strip())

    cleaned: list[str] = []
    seen: set[str] = set()
    for label in labels:
        normalized = _clean_theme_label(label)
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(normalized)
    return cleaned[:3]


def _extract_paper_label(card: dict[str, Any]) -> str:
    module_id = card.get("module_id") or ""
    metadata = card.get("metadata") or {}
    if module_id not in {"arxiv-tracker", "semantic-scholar-tracker"}:
        return ""

    for key in ("primary_category_name", "paper_tracking_label"):
        value = str(metadata.get(key) or "").strip()
        if value:
            return value

    for key in ("all_categories", "fields_of_study", "paper_tracking_labels"):
        labels = _safe_string_list(metadata.get(key))
        if labels:
            return labels[0]

    relationship = str(metadata.get("relationship_label") or "").strip()
    if relationship:
        return relationship

    for tag in card.get("tags") or []:
        if "." not in tag and _clean_theme_label(tag):
            return tag
    return ""


def _build_bucket_pairs(
    current_pairs: list[tuple[str, str]],
    previous_labels: list[str],
    limit: int = 5,
) -> list[InsightBucket]:
    current_counter = Counter(label for label, _ in current_pairs if label)
    previous_counter = Counter(label for label in previous_labels if label)
    if not current_counter:
        return []

    total = sum(current_counter.values()) or 1
    examples_map: dict[str, list[str]] = {}
    for label, title in current_pairs:
        if not label or not title:
            continue
        bucket_examples = examples_map.setdefault(label, [])
        if title not in bucket_examples and len(bucket_examples) < 2:
            bucket_examples.append(title)

    buckets: list[InsightBucket] = []
    for label, count in current_counter.most_common(limit):
        buckets.append(
            InsightBucket(
                label=label,
                count=count,
                share=round(count / total, 3),
                delta=count - previous_counter.get(label, 0),
                examples=examples_map.get(label, []),
            )
        )
    return buckets


def _load_keyword_preferences(limit: int = 6) -> list[PreferenceSignal]:
    kw_path = get_keyword_preferences_path()
    if not kw_path.exists():
        return []

    try:
        raw = json.loads(kw_path.read_text(encoding="utf-8"))
    except Exception:
        return []

    signals: list[PreferenceSignal] = []
    for keyword, value in raw.items():
        if not isinstance(value, dict):
            continue
        score = float(value.get("score", 0) or 0)
        count = int(value.get("count", 0) or 0)
        source_modules = _safe_string_list(value.get("source_modules"))
        signals.append(
            PreferenceSignal(
                keyword=str(keyword),
                score=round(score, 3),
                count=count,
                sourceModules=source_modules,
            )
        )

    signals.sort(key=lambda item: (item.score, item.count), reverse=True)
    return [item for item in signals if item.score > 0][:limit]


def _build_hourly_rhythm(recent_cards: list[dict[str, Any]], recent_timelines: list) -> list[HourlyRhythmPoint]:
    interaction_counts = {hour: 0 for hour in range(24)}
    feed_counts = {hour: 0 for hour in range(24)}

    for card in recent_cards:
        created_dt = card.get("created_dt")
        if created_dt:
            feed_counts[created_dt.hour] += 1

    for timeline in recent_timelines:
        for activity in timeline.activities:
            try:
                ts = datetime.fromisoformat(activity.timestamp)
            except (TypeError, ValueError):
                continue
            interaction_counts[ts.hour] += 1

    return [
        HourlyRhythmPoint(
            hour=hour,
            interaction=interaction_counts[hour],
            feed=feed_counts[hour],
            combined=interaction_counts[hour] + feed_counts[hour],
        )
        for hour in range(24)
    ]


def _build_weekday_rhythm(recent_cards: list[dict[str, Any]], recent_timelines: list) -> list[WeekdayRhythmPoint]:
    interaction_counts = {weekday: 0 for weekday in range(7)}
    feed_counts = {weekday: 0 for weekday in range(7)}

    for card in recent_cards:
        created_dt = card.get("created_dt")
        if created_dt:
            feed_counts[created_dt.weekday()] += 1

    for timeline in recent_timelines:
        if not timeline.activities:
            continue
        try:
            weekday = date.fromisoformat(timeline.date).weekday()
        except ValueError:
            continue
        interaction_counts[weekday] += len(timeline.activities)

    return [
        WeekdayRhythmPoint(
            weekday=weekday,
            label=_WEEKDAY_LABELS[weekday],
            interaction=interaction_counts[weekday],
            feed=feed_counts[weekday],
            combined=interaction_counts[weekday] + feed_counts[weekday],
        )
        for weekday in range(7)
    ]


def _build_peak_window(hourly_rhythm: list[HourlyRhythmPoint]) -> PeakWindow:
    best_start = 0
    best_total = -1
    best_interaction = 0
    best_feed = 0

    for start_hour in range(24):
        current = hourly_rhythm[start_hour]
        next_point = hourly_rhythm[(start_hour + 1) % 24]
        combined_total = current.combined + next_point.combined
        if combined_total > best_total:
            best_total = combined_total
            best_start = start_hour
            best_interaction = current.interaction + next_point.interaction
            best_feed = current.feed + next_point.feed

    end_hour = (best_start + 2) % 24
    return PeakWindow(
        label=f"{best_start:02d}:00-{end_hour:02d}:00",
        startHour=best_start,
        endHour=end_hour,
        interactionCount=best_interaction,
        feedCount=best_feed,
    )


def _determine_cadence_label(weekday_rhythm: list[WeekdayRhythmPoint], active_days: int, window_days: int) -> str:
    total = sum(point.combined for point in weekday_rhythm)
    if total == 0:
        return "等待更多记录"
    if active_days <= max(2, window_days // 5):
        return "间歇冲刺型"

    weekdays = sum(point.combined for point in weekday_rhythm[:5])
    weekend = sum(point.combined for point in weekday_rhythm[5:])
    midweek = sum(point.combined for point in weekday_rhythm[1:4])

    if weekdays >= max(1, weekend * 2):
        return "工作日推进型"
    if weekend >= max(1, int(weekdays * 0.8)):
        return "周末补课型"
    if midweek >= total * 0.55:
        return "周中爆发型"
    return "均匀循环型"


def _build_highlights(recent_cards: list[dict[str, Any]], limit: int = 6) -> list[InsightHighlight]:
    highlights: list[InsightHighlight] = []
    for card in recent_cards[:limit]:
        theme_labels = _extract_theme_labels(card)
        paper_label = _extract_paper_label(card)
        detail = theme_labels[0] if theme_labels else (paper_label or "最近情报")
        created_dt = card.get("created_dt")
        highlights.append(
            InsightHighlight(
                title=card.get("title") or "",
                moduleId=card.get("module_id") or "",
                moduleLabel=_MODULE_LABELS.get(card.get("module_id") or "", card.get("module_id") or ""),
                detail=detail,
                createdAt=created_dt.isoformat() if created_dt else "",
            )
        )
    return highlights


def _build_summary(
    window_days: int,
    cadence_label: str,
    peak_window: PeakWindow,
    rhythm_source: str,
    feed_mix: list[InsightBucket],
    theme_mix: list[InsightBucket],
    paper_mix: list[InsightBucket],
) -> str:
    primary_theme = theme_mix[0].label if theme_mix else ""
    primary_module = feed_mix[0].label if feed_mix else "情报流"
    primary_paper = paper_mix[0].label if paper_mix else ""
    rhythm_phrase = {
        "hybrid": "推送和操作",
        "interaction": "操作行为",
        "feed": "情报流入",
        "none": "记录信号",
    }.get(rhythm_source, "记录信号")

    parts = [f"最近 {window_days} 天，你的节奏更像「{cadence_label}」"]
    if primary_theme:
        parts.append(f"主题重心偏向「{primary_theme}」")
    else:
        parts.append(f"内容来源以 {primary_module} 为主")
    if primary_paper:
        parts.append(f"论文主要落在 {primary_paper}")
    if peak_window.interactionCount or peak_window.feedCount:
        parts.append(f"{rhythm_phrase}高峰在 {peak_window.label}")
    return "，".join(parts) + "。"


def _build_suggestions(
    *,
    window_days: int,
    cadence_label: str,
    peak_window: PeakWindow,
    rhythm_source: str,
    recent_feed_count: int,
    recent_interaction_count: int,
    theme_mix: list[InsightBucket],
    paper_mix: list[InsightBucket],
) -> list[InsightSuggestion]:
    suggestions: list[InsightSuggestion] = []

    if recent_feed_count > 0 and recent_interaction_count <= max(2, recent_feed_count // 6):
        suggestions.append(
            InsightSuggestion(
                kind="feedback",
                title="反馈还不够密",
                detail="最近情报进来得比你的反馈快很多。每轮至少标记几条 like/save/dislike，偏好画像才会更快贴近你这段时间的生活状态。",
            )
        )

    if peak_window.interactionCount or peak_window.feedCount:
        if peak_window.startHour >= 22 or peak_window.startHour < 2:
            suggestions.append(
                InsightSuggestion(
                    kind="rhythm",
                    title="夜间是高峰时段",
                    detail="如果这是主动安排，可以保留；如果只是被动拖延，建议把第一轮论文筛读前移到白天，只把收藏和复盘留到晚上。",
                )
            )
        elif 8 <= peak_window.startHour < 12:
            suggestions.append(
                InsightSuggestion(
                    kind="rhythm",
                    title="上午适合做判断题",
                    detail="你的高峰靠前，适合把需要筛选和判断的情报放在上午，把轻量浏览和回顾留给下午或晚上。",
                )
            )

    if paper_mix and paper_mix[0].share >= 0.45:
        suggestions.append(
            InsightSuggestion(
                kind="papers",
                title=f"{paper_mix[0].label} 最近占比最高",
                detail=f"最近窗口里这类论文占到 {int(paper_mix[0].share * 100)}% 左右。可以继续深挖，同时给相邻方向留一次交叉补充，避免视角越来越窄。",
            )
        )

    if theme_mix:
        suggestions.append(
            InsightSuggestion(
                kind="theme",
                title=f"最近生活信号集中在「{theme_mix[0].label}」",
                detail="建议把这类内容分成方法收藏、情绪提示、待执行动作三层，不要让所有状态都堆在同一个标签里。",
            )
        )

    if cadence_label == "间歇冲刺型":
        suggestions.append(
            InsightSuggestion(
                kind="cadence",
                title="你的节奏更像冲刺",
                detail=f"最近 {window_days} 天不是匀速推进，而是几次集中爆发。更适合做 2-3 天一次的小复盘，而不是要求自己每天都高活跃。",
            )
        )

    if rhythm_source == "feed" and recent_feed_count > 0:
        suggestions.append(
            InsightSuggestion(
                kind="source",
                title="现在更像情报在推着你走",
                detail="最近的时段判断主要来自 Feed 到达时间，而不是交互记录。给关键内容补一点操作记录，洞察会更接近你的真实作息。",
            )
        )

    return suggestions[:3]


# ── API 路由 ───────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview():
    """Get overview statistics for the dashboard."""
    if is_demo_mode():
        return get_demo_overview()
    card_store = CardStore()
    activity_tracker = ActivityTracker()

    with card_store._conn() as conn:
        row = conn.execute("SELECT COUNT(*) FROM cards").fetchone()
        total_cards = row[0] if row else 0

    this_week = get_week_count(card_store, weeks_ago=0)
    last_week = get_week_count(card_store, weeks_ago=1)
    daily_trend = get_daily_card_counts(card_store, days=30)
    by_module = get_cards_by_module(card_store)
    top_tags = get_top_tags(card_store, limit=10)
    streak = calculate_reading_streak(activity_tracker)

    return OverviewResponse(
        totalCards=total_cards,
        thisWeek=this_week,
        lastWeek=last_week,
        dailyTrend=daily_trend,
        byModule=by_module,
        topTags=top_tags,
        readingStreak=streak,
    )


@router.get("/today")
async def get_today():
    """Get today's detailed snapshot — activities, heatmap, todos, wellness."""
    if is_demo_mode():
        return get_demo_today()
    activity_tracker = ActivityTracker()
    today_str = date.today().isoformat()
    timeline = activity_tracker.get_timeline(today_str)

    # Count activities by type
    views = likes = saves = dislikes = chats = module_runs = 0
    hourly_counts: dict[int, int] = {h: 0 for h in range(24)}
    top_cards: list[dict] = []
    seen_cards: set[str] = set()

    for act in timeline.activities:
        # Parse hour from timestamp
        try:
            ts = datetime.fromisoformat(act.timestamp)
            hourly_counts[ts.hour] = hourly_counts.get(ts.hour, 0) + 1
        except (ValueError, TypeError):
            pass

        t = act.type.value
        if t == "card_view":
            views += 1
        elif t == "card_like":
            likes += 1
            if act.card_id and act.card_id not in seen_cards:
                top_cards.append({"id": act.card_id, "title": act.card_title or "", "action": "like"})
                seen_cards.add(act.card_id)
        elif t == "card_save":
            saves += 1
            if act.card_id and act.card_id not in seen_cards:
                top_cards.append({"id": act.card_id, "title": act.card_title or "", "action": "save"})
                seen_cards.add(act.card_id)
        elif t == "card_dislike":
            dislikes += 1
        elif t in ("chat_start", "chat_message"):
            chats += 1
        elif t == "module_run":
            module_runs += 1

    total = len(timeline.activities)

    # Todo progress
    todos = profile_store.get_manual_todos_today()
    todo_total = len(todos)
    todo_done = sum(1 for t in todos if t.get("done", False))
    todo_rate = todo_done / todo_total if todo_total > 0 else 0.0

    # Wellness
    energy = profile_store.get_energy_today()
    san = profile_store.get_san_7d_avg()
    happiness = profile_store.get_happiness_today()

    return TodayResponse(
        date=today_str,
        activityCounts=ActivityCounts(
            total=total, views=views, likes=likes, saves=saves,
            dislikes=dislikes, chats=chats, module_runs=module_runs,
        ),
        hourlyHeatmap=[HourlyActivity(hour=h, count=hourly_counts.get(h, 0)) for h in range(24)],
        todoProgress=TodoProgress(total=todo_total, done=todo_done, rate=todo_rate),
        wellness=WellnessSnapshot(energy=energy, san=round(san, 1), happiness=happiness),
        summary=timeline.summary,
        topInteractions=top_cards[:8],
    )


@router.get("/wellness")
async def get_wellness(days: int = 30):
    """Get wellness trends: SAN, happiness, energy over time."""
    if is_demo_mode():
        return get_demo_wellness()
    san_log = _read_json_log("san_log.json")
    happiness_log = _read_json_log("happiness_log.json")
    energy_history = _read_energy_history()

    # Build lookup maps
    san_map = {e["date"]: e["score"] for e in san_log}
    happiness_map = {e["date"]: e["score"] for e in happiness_log}
    energy_map = {e["date"]: e.get("energy", e.get("value", 0)) for e in energy_history}

    today = date.today()
    daily: list[DailyWellness] = []

    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        ds = d.isoformat()
        daily.append(DailyWellness(
            date=ds,
            san=san_map.get(ds),
            happiness=happiness_map.get(ds),
            energy=energy_map.get(ds),
        ))

    # Weekly averages
    def _week_avg(days_offset: int) -> WeeklyAvg:
        start = today - timedelta(days=today.weekday() + days_offset)
        san_vals = []
        hap_vals = []
        eng_vals = []
        for i in range(7):
            ds = (start + timedelta(days=i)).isoformat()
            if ds in san_map:
                san_vals.append(san_map[ds])
            if ds in happiness_map:
                hap_vals.append(happiness_map[ds])
            if ds in energy_map:
                eng_vals.append(energy_map[ds])
        return WeeklyAvg(
            san=round(sum(san_vals) / len(san_vals), 1) if san_vals else 0,
            happiness=round(sum(hap_vals) / len(hap_vals), 1) if hap_vals else 0,
            energy=round(sum(eng_vals) / len(eng_vals)) if eng_vals else 0,
        )

    return WellnessResponse(
        daily=daily,
        thisWeekAvg=_week_avg(0),
        lastWeekAvg=_week_avg(7),
    )


@router.get("/engagement")
async def get_engagement(days: int = 30):
    """Get engagement depth: views vs deep reads, quality metrics."""
    if is_demo_mode():
        return get_demo_engagement()
    card_store = CardStore()
    today = date.today()

    # Overall 30-day engagement
    start_ts = datetime.combine(today - timedelta(days=days), datetime.min.time()).timestamp()
    end_ts = datetime.combine(today + timedelta(days=1), datetime.min.time()).timestamp()
    overall = _get_feedback_counts_for_period(card_store, start_ts, end_ts)

    # Daily engagement trend
    daily_trend: list[DailyEngagement] = []
    with card_store._conn() as conn:
        rows = conn.execute(
            """SELECT
                date(created_at, 'unixepoch', 'localtime') as d,
                COUNT(*) as total,
                SUM(CASE WHEN feedback IN ('like', 'save', 'star') THEN 1 ELSE 0 END) as deep
            FROM cards
            WHERE created_at >= ? AND created_at < ?
            GROUP BY d ORDER BY d ASC""",
            (start_ts, end_ts)
        ).fetchall()

    date_map = {r[0]: (r[1], r[2] or 0) for r in rows}
    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        ds = d.strftime("%Y-%m-%d")
        viewed, deep = date_map.get(ds, (0, 0))
        rate = deep / viewed if viewed > 0 else 0.0
        daily_trend.append(DailyEngagement(date=ds, viewed=viewed, deepRead=deep, rate=round(rate, 3)))

    # Week comparison
    this_monday = today - timedelta(days=today.weekday())
    last_monday = this_monday - timedelta(weeks=1)

    this_week_start = datetime.combine(this_monday, datetime.min.time()).timestamp()
    this_week_end = datetime.combine(this_monday + timedelta(days=7), datetime.min.time()).timestamp()
    last_week_start = datetime.combine(last_monday, datetime.min.time()).timestamp()
    last_week_end = datetime.combine(last_monday + timedelta(days=7), datetime.min.time()).timestamp()

    tw = _get_feedback_counts_for_period(card_store, this_week_start, this_week_end)
    lw = _get_feedback_counts_for_period(card_store, last_week_start, last_week_end)

    tw_rate = (tw.liked + tw.saved + tw.starred) / tw.totalViewed if tw.totalViewed > 0 else 0
    lw_rate = (lw.liked + lw.saved + lw.starred) / lw.totalViewed if lw.totalViewed > 0 else 0

    return EngagementResponse(
        overall=overall,
        dailyTrend=daily_trend,
        weekComparison=WeekComparison(
            thisWeek=tw,
            lastWeek=lw,
            cardsDelta=tw.totalViewed - lw.totalViewed,
            engagementRateDelta=round(tw_rate - lw_rate, 3),
        ),
    )


@router.get("/activity", response_model=ActivityResponse)
async def get_activity(days: int = 30):
    """Get daily activity counts for the specified number of days."""
    card_store = CardStore()
    daily_trend = get_daily_card_counts(card_store, days=days)
    return ActivityResponse(days=days, data=daily_trend)


@router.get("/intelligence-rhythm")
async def get_intelligence_rhythm(days: int = 14):
    """Fuse recent feed, paper categories, active hours, and preference signals."""
    if is_demo_mode():
        return get_demo_intelligence_rhythm()

    safe_days = max(7, min(days, 30))
    today = date.today()
    start_day = today - timedelta(days=safe_days - 1)
    previous_start_day = start_day - timedelta(days=safe_days)

    card_store = CardStore()
    activity_tracker = ActivityTracker()

    recent_cards = _load_cards_for_period(card_store, start_day, today + timedelta(days=1))
    previous_cards = _load_cards_for_period(card_store, previous_start_day, start_day)
    recent_timelines = _load_recent_timelines(activity_tracker, safe_days)

    recent_feed_pairs = [
        (_MODULE_LABELS.get(card["module_id"], card["module_id"] or "其他"), card.get("title") or "")
        for card in recent_cards
    ]
    previous_feed_labels = [
        _MODULE_LABELS.get(card["module_id"], card["module_id"] or "其他")
        for card in previous_cards
    ]
    feed_mix = _build_bucket_pairs(recent_feed_pairs, previous_feed_labels, limit=5)

    recent_theme_pairs: list[tuple[str, str]] = []
    previous_theme_labels: list[str] = []
    for card in recent_cards:
        recent_theme_pairs.extend((label, card.get("title") or "") for label in _extract_theme_labels(card))
    for card in previous_cards:
        previous_theme_labels.extend(_extract_theme_labels(card))
    theme_mix = _build_bucket_pairs(recent_theme_pairs, previous_theme_labels, limit=6)

    recent_paper_pairs = []
    previous_paper_labels = []
    for card in recent_cards:
        label = _extract_paper_label(card)
        if label:
            recent_paper_pairs.append((label, card.get("title") or ""))
    for card in previous_cards:
        label = _extract_paper_label(card)
        if label:
            previous_paper_labels.append(label)
    paper_mix = _build_bucket_pairs(recent_paper_pairs, previous_paper_labels, limit=5)

    preferences = _load_keyword_preferences(limit=6)
    hourly_rhythm = _build_hourly_rhythm(recent_cards, recent_timelines)
    weekday_rhythm = _build_weekday_rhythm(recent_cards, recent_timelines)
    peak_window = _build_peak_window(hourly_rhythm)

    interaction_total = sum(point.interaction for point in hourly_rhythm)
    feed_total = len(recent_cards)
    active_days = len(
        {
            *{
                card["created_dt"].date().isoformat()
                for card in recent_cards
                if card.get("created_dt")
            },
            *{timeline.date for timeline in recent_timelines if timeline.activities},
        }
    )

    if interaction_total and feed_total:
        rhythm_source = "hybrid"
    elif interaction_total:
        rhythm_source = "interaction"
    elif feed_total:
        rhythm_source = "feed"
    else:
        rhythm_source = "none"

    latest_dates = [
        card["created_dt"].date().isoformat()
        for card in recent_cards
        if card.get("created_dt")
    ] + [timeline.date for timeline in recent_timelines if timeline.activities]
    latest_signal_date = max(latest_dates) if latest_dates else today.isoformat()

    cadence_label = _determine_cadence_label(weekday_rhythm, active_days, safe_days)
    summary = _build_summary(
        safe_days,
        cadence_label,
        peak_window,
        rhythm_source,
        feed_mix,
        theme_mix,
        paper_mix,
    )
    highlights = _build_highlights(recent_cards, limit=6)
    suggestions = _build_suggestions(
        window_days=safe_days,
        cadence_label=cadence_label,
        peak_window=peak_window,
        rhythm_source=rhythm_source,
        recent_feed_count=feed_total,
        recent_interaction_count=interaction_total,
        theme_mix=theme_mix,
        paper_mix=paper_mix,
    )

    return IntelligenceRhythmResponse(
        windowDays=safe_days,
        recentFeedCount=feed_total,
        recentInteractionCount=interaction_total,
        activeDays=active_days,
        latestSignalDate=latest_signal_date,
        cadenceLabel=cadence_label,
        rhythmSource=rhythm_source,
        summary=summary,
        peakWindow=peak_window,
        feedMix=feed_mix,
        themeMix=theme_mix,
        paperMix=paper_mix,
        preferences=preferences,
        hourlyRhythm=hourly_rhythm,
        weekdayRhythm=weekday_rhythm,
        highlights=highlights,
        suggestions=suggestions,
    )


@router.get("/preferences-evolution")
async def get_preferences_evolution():
    """Get keyword preferences with scores."""
    if is_demo_mode():
        return get_demo_preferences_evolution()
    # Read raw JSON to handle format mismatch in keyword_preferences.json
    kw_path = get_keyword_preferences_path()
    keywords: list[PreferenceEvolutionItem] = []

    if kw_path.exists():
        try:
            raw = json.loads(kw_path.read_text(encoding="utf-8"))
            for key, val in raw.items():
                score = val.get("score", 0)
                count = val.get("count", 0)
                keywords.append(PreferenceEvolutionItem(
                    keyword=key,
                    score=round(score, 3),
                    count=count,
                ))
        except Exception:
            pass

    keywords.sort(key=lambda x: (x.score, x.count), reverse=True)
    return PreferencesEvolutionResponse(keywords=keywords)
