"""
数据洞察 API 路由
提供个人数据分析和可视化所需的数据
"""
import json
from collections import Counter
from datetime import datetime, timedelta, date
from typing import List, Dict, Any, Optional
from fastapi import APIRouter
from pydantic import BaseModel

from ..config import is_demo_mode
from ..demo.data import (
    get_demo_overview, get_demo_today, get_demo_wellness,
    get_demo_engagement, get_demo_preferences_evolution,
)
from ..store.cards import CardStore
from ..preferences.engine import PreferenceEngine
from ..activity import ActivityTracker
from ..profile import store as profile_store

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
    """Read a JSON log file from ~/.abo/."""
    from pathlib import Path
    p = Path.home() / ".abo" / filename
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
    """Read energy history from ~/.abo/energy_memory.json."""
    from pathlib import Path
    p = Path.home() / ".abo" / "energy_memory.json"
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
    todos = profile_store.get_todos_today()
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


@router.get("/preferences-evolution")
async def get_preferences_evolution():
    """Get keyword preferences with scores."""
    if is_demo_mode():
        return get_demo_preferences_evolution()
    # Read raw JSON to handle format mismatch in keyword_preferences.json
    from pathlib import Path
    kw_path = Path.home() / ".abo" / "keyword_preferences.json"
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
