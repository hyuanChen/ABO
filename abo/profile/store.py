"""
Profile data persistence in the app data directory.
"""
import json
import os
from datetime import date, datetime
from pathlib import Path
from typing import Any

from ..config import get_abo_dir


def _path(filename: str) -> Path:
    abo_dir = get_abo_dir()
    abo_dir.mkdir(parents=True, exist_ok=True)
    return abo_dir / filename


def _read(filename: str, default: Any) -> Any:
    p = _path(filename)
    if not p.exists():
        return default
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write(filename: str, data: Any) -> None:
    p = _path(filename)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, p)


# ── Profile identity ─────────────────────────────────────────────

def get_identity() -> dict:
    return _read("profile.json", {
        "codename": "",
        "long_term_goal": "",
    })


def save_identity(codename: str, long_term_goal: str) -> None:
    _write("profile.json", {
        "codename": codename,
        "long_term_goal": long_term_goal,
    })


# ── Daily motto ──────────────────────────────────────────────────

def get_daily_motto() -> dict:
    return _read("daily_motto.json", {
        "date": "",
        "motto": "开始记录，见证成长。",
        "description": "",
    })


def save_daily_motto(motto: str, description: str) -> None:
    _write("daily_motto.json", {
        "date": date.today().isoformat(),
        "motto": motto,
        "description": description,
    })


# ── SAN log ──────────────────────────────────────────────────────

def _upsert_daily_score(log: list[dict], score: int) -> list[dict]:
    today = date.today().isoformat()
    updated = False
    normalized: list[dict] = []
    for entry in log:
        if entry.get("date") == today:
            normalized.append({"date": today, "score": score})
            updated = True
        else:
            normalized.append(entry)
    if not updated:
        normalized.append({"date": today, "score": score})
    return normalized


def append_san(score: int) -> None:
    log = _normalize_log(_read("san_log.json", []))
    log = _upsert_daily_score(log, score)
    _write("san_log.json", log[-90:])  # keep last 90 days


def _normalize_log(raw: Any) -> list[dict]:
    """Handle both dict format {date: score} and list format [{date, score}]."""
    if isinstance(raw, dict):
        return [{"date": k, "score": v} for k, v in sorted(raw.items())]
    if isinstance(raw, list):
        return raw
    return []


def get_san_7d_avg() -> float:
    log = _normalize_log(_read("san_log.json", []))
    recent = log[-7:] if len(log) >= 7 else log
    if not recent:
        return 0.0
    return sum(e["score"] for e in recent) / len(recent)


# ── Happiness log ────────────────────────────────────────────────

def append_happiness(score: int) -> None:
    log = _normalize_log(_read("happiness_log.json", []))
    log = _upsert_daily_score(log, score)
    _write("happiness_log.json", log[-90:])


def get_happiness_today() -> float:
    log = _normalize_log(_read("happiness_log.json", []))
    today = date.today().isoformat()
    for entry in reversed(log):
        if entry["date"] == today:
            return float(entry["score"])
    return 0.0


# ── Energy memory ────────────────────────────────────────────────

def get_energy_today() -> int:
    data = _read("energy_memory.json", {"history": [], "today": {"current": 70, "manual_override": None}})
    override = data.get("today", {}).get("manual_override")
    if override is not None:
        return int(override)
    return int(data.get("today", {}).get("current", 70))


def save_energy_today(energy: int, manual: bool = False) -> None:
    data = _read("energy_memory.json", {"history": [], "today": {}})
    today_str = date.today().isoformat()
    data["today"] = {
        "current": energy,
        "manual_override": energy if manual else None,
    }
    history = data.get("history", [])
    if history and history[-1]["date"] == today_str:
        history[-1]["energy"] = energy
    else:
        history.append({"date": today_str, "energy": energy})
    data["history"] = history[-90:]
    _write("energy_memory.json", data)


# ── Daily todos ──────────────────────────────────────────────────

def get_todos_today() -> list:
    all_todos = _read("daily_todos.json", {})
    today = date.today().isoformat()
    return all_todos.get(today, [])


def get_manual_todos_today() -> list:
    return [todo for todo in get_todos_today() if todo.get("source") != "agent"]


def save_todos_today(todos: list) -> None:
    all_todos = _read("daily_todos.json", {})
    today = date.today().isoformat()
    all_todos[today] = todos
    sorted_keys = sorted(all_todos.keys())[-30:]
    _write("daily_todos.json", {k: all_todos[k] for k in sorted_keys})


# ── Persona profile ──────────────────────────────────────────────

def get_persona_profile() -> dict:
    return _read("persona_profile.json", {
        "source_text": "",
        "summary": "",
        "homepage": {
            "codename": "",
            "long_term_goal": "",
            "one_liner": "",
            "narrative": "",
            "strengths": [],
            "working_style": [],
            "preferred_topics": [],
            "next_focus": [],
        },
        "sbti": {
            "type": "",
            "confidence": 0.0,
            "reasoning": [],
        },
        "generated_at": "",
    })


def save_persona_profile(persona: dict) -> None:
    _write("persona_profile.json", persona)


# ── Daily briefing ───────────────────────────────────────────────

def get_daily_briefing(date_str: str | None = None) -> dict:
    briefings = _read("daily_briefings.json", {})
    today = date_str or date.today().isoformat()
    return briefings.get(today, {
        "date": today,
        "raw_text": "",
        "summary": "",
        "focus": "",
        "preferred_keywords": [],
        "suggested_todos": [],
        "intel_cards": [],
        "reading_digest": {},
        "generated_at": "",
    })


def save_daily_briefing(briefing: dict, date_str: str | None = None) -> None:
    briefings = _read("daily_briefings.json", {})
    today = date_str or date.today().isoformat()
    data = {"date": today, **briefing}
    briefings[today] = data
    sorted_keys = sorted(briefings.keys())[-30:]
    _write("daily_briefings.json", {k: briefings[k] for k in sorted_keys})


# ── Skills ───────────────────────────────────────────────────────

def get_skills() -> dict:
    return _read("skills.json", {})


def unlock_skill(skill_id: str) -> None:
    skills = get_skills()
    if skill_id not in skills:
        skills[skill_id] = {"unlocked_at": datetime.utcnow().isoformat()}
        _write("skills.json", skills)


# ── Achievements ─────────────────────────────────────────────────

def get_achievements() -> list:
    return _read("achievements.json", [])


def unlock_achievement(achievement_id: str, name: str) -> bool:
    """Returns True if newly unlocked, False if already had it."""
    achievements = get_achievements()
    existing_ids = {a["id"] for a in achievements}
    if achievement_id in existing_ids:
        return False
    achievements.append({
        "id": achievement_id,
        "name": name,
        "unlocked_at": datetime.utcnow().isoformat(),
    })
    _write("achievements.json", achievements)
    return True


# ── Stats cache ──────────────────────────────────────────────────

def get_stats_cache() -> dict:
    return _read("stats_cache.json", {})


def save_stats_cache(stats: dict) -> None:
    stats["cached_at"] = date.today().isoformat()
    _write("stats_cache.json", stats)
