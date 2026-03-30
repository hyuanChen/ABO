"""
Profile data persistence — all reads/writes to ~/.abo/*.json
"""
import json
import os
from datetime import date, datetime
from pathlib import Path
from typing import Any

_ABO_DIR = Path.home() / ".abo"


def _path(filename: str) -> Path:
    _ABO_DIR.mkdir(parents=True, exist_ok=True)
    return _ABO_DIR / filename


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

def append_san(score: int) -> None:
    log = _read("san_log.json", [])
    log.append({"date": date.today().isoformat(), "score": score})
    _write("san_log.json", log[-90:])  # keep last 90 days


def get_san_7d_avg() -> float:
    log = _read("san_log.json", [])
    recent = log[-7:] if len(log) >= 7 else log
    if not recent:
        return 0.0
    return sum(e["score"] for e in recent) / len(recent)


# ── Happiness log ────────────────────────────────────────────────

def append_happiness(score: int) -> None:
    log = _read("happiness_log.json", [])
    log.append({"date": date.today().isoformat(), "score": score})
    _write("happiness_log.json", log[-90:])


def get_happiness_today() -> float:
    log = _read("happiness_log.json", [])
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


def save_todos_today(todos: list) -> None:
    all_todos = _read("daily_todos.json", {})
    today = date.today().isoformat()
    all_todos[today] = todos
    sorted_keys = sorted(all_todos.keys())[-30:]
    _write("daily_todos.json", {k: all_todos[k] for k in sorted_keys})


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
