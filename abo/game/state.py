"""game-state.json read/write with default structure, atomic writes, level-up."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

LEVEL_XP_THRESHOLDS = [0, 200, 500, 1000, 2000, 3500, 5500, 8000, 12000, 18000, 30000]

TITLES = [
    "初入江湖",     # Lv.1
    "牛刀小试",     # Lv.2
    "初窥门径",     # Lv.3
    "渐入佳境",     # Lv.4
    "小有所成",     # Lv.5
    "融会贯通",     # Lv.6
    "登堂入室",     # Lv.7
    "炉火纯青",     # Lv.8
    "出神入化",     # Lv.9
    "独步天下",     # Lv.10
]

DEFAULT_GAME_STATE = {
    "energy": {
        "current": 100,
        "max": 100,
        "lastUpdated": "",
        "log": [],
    },
    "skills": {},
    "achievements": [],
    "level": 1,
    "title": "初入江湖",
    "total_xp": 0,
    "stats": {
        "tasks_completed_total": 0,
        "papers_imported": 0,
        "papers_digested_lv2_plus": 0,
        "ab_collisions": 0,
        "claude_sessions": 0,
        "active_days": [],
        "monthly_tasks": {},
    },
}


def _state_path(vault_path: str) -> Path:
    return Path(vault_path) / ".abo" / "game-state.json"


def _atomic_write(path: Path, data: str) -> None:
    """Write to temp file then rename — prevents corruption on crash."""
    tmp = path.with_suffix(".tmp")
    tmp.write_text(data, encoding="utf-8")
    os.replace(tmp, path)


def load_state(vault_path: str) -> dict:
    path = _state_path(vault_path)
    if path.exists():
        state = json.loads(path.read_text(encoding="utf-8"))
        # Backfill missing keys from defaults
        if "total_xp" not in state:
            state["total_xp"] = 0
        if "stats" not in state:
            state["stats"] = DEFAULT_GAME_STATE["stats"].copy()
        return state
    return json.loads(json.dumps(DEFAULT_GAME_STATE))


def save_state(vault_path: str, updates: dict) -> dict:
    state = load_state(vault_path)
    for key, value in updates.items():
        if key == "energy" and isinstance(value, dict):
            state["energy"].update(value)
        elif key == "stats" and isinstance(value, dict):
            state["stats"].update(value)
        else:
            state[key] = value
    state["energy"]["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    path = _state_path(vault_path)
    _atomic_write(path, json.dumps(state, indent=2, ensure_ascii=False))
    return state


def init_state(vault_path: str) -> dict:
    path = _state_path(vault_path)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    state = json.loads(json.dumps(DEFAULT_GAME_STATE))
    state["energy"]["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    path.parent.mkdir(parents=True, exist_ok=True)
    _atomic_write(path, json.dumps(state, indent=2, ensure_ascii=False))
    return state


def add_total_xp(vault_path: str, xp: int) -> dict:
    """Add XP to total_xp and check for level-up. Returns {leveled_up, new_level, new_title}."""
    state = load_state(vault_path)
    state["total_xp"] = state.get("total_xp", 0) + xp
    old_level = state.get("level", 1)
    new_level = _compute_level(state["total_xp"])
    leveled_up = new_level > old_level
    if leveled_up:
        state["level"] = new_level
        state["title"] = TITLES[min(new_level - 1, len(TITLES) - 1)]
    path = _state_path(vault_path)
    _atomic_write(path, json.dumps(state, indent=2, ensure_ascii=False))
    return {
        "leveled_up": leveled_up,
        "new_level": state["level"],
        "new_title": state["title"],
        "total_xp": state["total_xp"],
    }


def _compute_level(total_xp: int) -> int:
    level = 1
    for i, threshold in enumerate(LEVEL_XP_THRESHOLDS):
        if total_xp >= threshold:
            level = i + 1
    return min(level, len(LEVEL_XP_THRESHOLDS))


def increment_stat(vault_path: str, stat_key: str, amount: int = 1) -> dict:
    """Atomically increment a stats counter."""
    state = load_state(vault_path)
    stats = state.setdefault("stats", DEFAULT_GAME_STATE["stats"].copy())
    if stat_key in stats and isinstance(stats[stat_key], int):
        stats[stat_key] += amount
    elif stat_key == "active_days":
        today = datetime.now().date().isoformat()
        if today not in stats["active_days"]:
            stats["active_days"].append(today)
    elif stat_key == "monthly_tasks":
        month = datetime.now().strftime("%Y-%m")
        stats.setdefault("monthly_tasks", {})
        stats["monthly_tasks"][month] = stats["monthly_tasks"].get(month, 0) + 1
    path = _state_path(vault_path)
    _atomic_write(path, json.dumps(state, indent=2, ensure_ascii=False))
    return stats
