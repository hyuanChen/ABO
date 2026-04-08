"""
数据洞察 API 路由
提供个人数据分析和可视化所需的数据
"""
from datetime import datetime, timedelta
from typing import List, Dict, Any
from fastapi import APIRouter
from pydantic import BaseModel

from ..store.cards import CardStore
from ..preferences.engine import PreferenceEngine
from ..activity import ActivityTracker

router = APIRouter(prefix="/api/insights")

# ── 数据模型 ──────────────────────────────────────────────────────

class DailyTrendItem(BaseModel):
    date: str
    count: int

class OverviewResponse(BaseModel):
    totalCards: int
    thisWeek: int
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


# ── 辅助函数 ──────────────────────────────────────────────────────

def calculate_reading_streak(activity_tracker: ActivityTracker) -> int:
    """Calculate consecutive days with activity."""
    streak = 0
    today = datetime.now().date()

    for i in range(365):  # Check up to 1 year back
        date = today - timedelta(days=i)
        date_str = date.strftime("%Y-%m-%d")
        timeline = activity_tracker.get_timeline(date_str)

        if timeline.activities:
            streak += 1
        else:
            if i > 0:  # If today has no activity, still count it as part of streak
                break

    return streak


def get_daily_card_counts(card_store: CardStore, days: int = 30) -> List[DailyTrendItem]:
    """Get daily card creation counts for the past N days."""
    import sqlite3

    results = []
    today = datetime.now().date()

    # Calculate timestamp range
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

    # Create a map of date -> count
    count_map = {row[0]: row[1] for row in rows}

    # Fill in all dates in range
    for i in range(days):
        date = today - timedelta(days=days - 1 - i)
        date_str = date.strftime("%Y-%m-%d")
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
    import json
    from collections import Counter

    tag_counter = Counter()

    with card_store._conn() as conn:
        rows = conn.execute("SELECT tags FROM cards WHERE tags IS NOT NULL").fetchall()

    for row in rows:
        try:
            tags = json.loads(row[0] or "[]")
            tag_counter.update(t.lower() for t in tags)
        except (json.JSONDecodeError, TypeError):
            continue

    return [[tag, count] for tag, count in tag_counter.most_common(limit)]


def get_this_week_count(card_store: CardStore) -> int:
    """Get count of cards created this week (since Monday)."""
    import sqlite3

    today = datetime.now().date()
    # Find Monday of this week
    monday = today - timedelta(days=today.weekday())
    monday_timestamp = datetime.combine(monday, datetime.min.time()).timestamp()

    with card_store._conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM cards WHERE created_at >= ?",
            (monday_timestamp,)
        ).fetchone()

    return row[0] if row else 0


# ── API 路由 ───────────────────────────────────────────────────────

@router.get("/overview", response_model=OverviewResponse)
async def get_overview():
    """Get overview statistics for the dashboard."""
    card_store = CardStore()
    activity_tracker = ActivityTracker()
    pref_engine = PreferenceEngine()

    # Total cards
    with card_store._conn() as conn:
        row = conn.execute("SELECT COUNT(*) FROM cards").fetchone()
        total_cards = row[0] if row else 0

    # This week's cards
    this_week = get_this_week_count(card_store)

    # Daily trend (30 days)
    daily_trend = get_daily_card_counts(card_store, days=30)

    # Cards by module
    by_module = get_cards_by_module(card_store)

    # Top tags
    top_tags = get_top_tags(card_store, limit=10)

    # Reading streak
    streak = calculate_reading_streak(activity_tracker)

    return OverviewResponse(
        totalCards=total_cards,
        thisWeek=this_week,
        dailyTrend=daily_trend,
        byModule=by_module,
        topTags=top_tags,
        readingStreak=streak
    )


@router.get("/activity", response_model=ActivityResponse)
async def get_activity(days: int = 30):
    """Get daily activity counts for the specified number of days."""
    card_store = CardStore()

    daily_trend = get_daily_card_counts(card_store, days=days)

    return ActivityResponse(
        days=days,
        data=daily_trend
    )


@router.get("/preferences-evolution", response_model=PreferencesEvolutionResponse)
async def get_preferences_evolution():
    """Get keyword preferences with scores."""
    pref_engine = PreferenceEngine()

    all_prefs = pref_engine.get_all_keyword_prefs()

    keywords = [
        PreferenceEvolutionItem(
            keyword=pref.keyword,
            score=pref.score,
            count=pref.count
        )
        for pref in sorted(
            all_prefs.values(),
            key=lambda x: (x.score, x.count),
            reverse=True
        )
    ]

    return PreferencesEvolutionResponse(keywords=keywords)
