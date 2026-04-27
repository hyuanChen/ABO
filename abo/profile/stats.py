"""
Calculate six hex dimension scores from existing data sources.
All scores are 0-100 integers.
"""
from datetime import date, timedelta
from pathlib import Path

from ..health.store import summarize_health
from ..store.cards import CardStore
from .store import get_san_7d_avg, get_happiness_today, get_energy_today


def score_to_grade(score: int) -> str:
    """Convert 0-100 score to JoJo letter grade E→A."""
    if score >= 80:
        return "A"
    if score >= 60:
        return "B"
    if score >= 40:
        return "C"
    if score >= 20:
        return "D"
    return "E"


def _count_vault_files(vault_path: str | None, subfolder: str) -> int:
    if not vault_path:
        return 0
    p = Path(vault_path) / subfolder
    if not p.exists():
        return 0
    return len(list(p.glob("*.md")))


def _count_idea_nodes(vault_path: str | None) -> int:
    if not vault_path:
        return 0
    p = Path(vault_path) / "Ideas"
    if not p.exists():
        return 0
    return len(list(p.glob("idea-*.md")))


def calculate_stats(vault_path: str | None, card_store: CardStore) -> dict:
    """
    Returns dict with keys: research, output, health, learning, san, happiness.
    Each key maps to {"score": int, "grade": str, "raw": dict}.
    """
    # ── 研究力 ────────────────────────────────────────────────────
    lit_count = _count_vault_files(vault_path, "Literature")
    arxiv_stars = card_store.count_feedback(module_id="arxiv-tracker", action="star")
    research_raw = min(100, lit_count * 2 + arxiv_stars * 3)

    # ── 产出力 ────────────────────────────────────────────────────
    meeting_count = _count_vault_files(vault_path, "Meetings")
    idea_count = _count_idea_nodes(vault_path)
    output_raw = min(100, meeting_count * 10 + idea_count * 5)

    # ── 健康力 ──────────────────────────────────────────────────────
    health_summary = summarize_health(14)
    health_raw = int(health_summary["health_score"])

    # ── 学习力 ────────────────────────────────────────────────────
    podcast_done = card_store.count_feedback(module_id="podcast-digest", action="save")
    trend_deep = card_store.count_feedback(module_id="rss-aggregator", action="deep_dive")
    learning_raw = min(100, podcast_done * 8 + trend_deep * 5)

    # ── SAN 值 ────────────────────────────────────────────────────
    san_avg = get_san_7d_avg()
    san_raw = min(100, int(san_avg * 10))

    # ── 幸福指数 ──────────────────────────────────────────────────
    happiness_today = get_happiness_today()
    energy_today = get_energy_today()
    happiness_raw = min(100, int(happiness_today * 0.6 * 10 + energy_today * 0.4))

    def dim(score: int, raw_info: dict) -> dict:
        return {"score": score, "grade": score_to_grade(score), "raw": raw_info}

    return {
        "research":  dim(research_raw,  {"lit_count": lit_count, "arxiv_stars": arxiv_stars}),
        "output":    dim(output_raw,    {"meeting_count": meeting_count, "idea_count": idea_count}),
        "health":    dim(health_raw,    {
            "streak_days": health_summary["streak_days"],
            "avg_sleep_7d": health_summary["avg_sleep_7d"],
            "habit_completion_rate_7d": health_summary["habit_completion_rate_7d"],
            "exercise_days_7d": health_summary["exercise_days_7d"],
        }),
        "learning":  dim(learning_raw,  {"podcast_done": podcast_done, "trend_deep": trend_deep}),
        "san":       dim(san_raw,       {"san_7d_avg": round(san_avg, 1)}),
        "happiness": dim(happiness_raw, {"happiness_today": happiness_today, "energy_today": energy_today}),
    }
