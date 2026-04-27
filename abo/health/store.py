"""
Persistent storage helpers for the health workspace.
"""
from __future__ import annotations

import json
import os
import uuid
from copy import deepcopy
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from ..config import get_abo_dir

_RECORDS_FILE = "health_records.json"
_HABITS_FILE = "health_habits.json"
_PREFERENCES_FILE = "health_preferences.json"

DEFAULT_HABITS: list[dict[str, Any]] = [
    {
        "id": "focus-setup",
        "name": "开工前明确今天最重要的一件事",
        "cue": "上午第一次进入 ABO 时",
        "identity_anchor": "把自己训练成会先收敛再开工的人。",
        "preferred_window": "09:00-10:30",
        "category": "focus",
        "enabled": True,
    },
    {
        "id": "hydrate-reset",
        "name": "午后补水并站起来活动 3 分钟",
        "cue": "下午连续工作 90 分钟后",
        "identity_anchor": "让身体跟得上认知强度，而不是靠硬撑。",
        "preferred_window": "14:00-16:00",
        "category": "recovery",
        "enabled": True,
    },
    {
        "id": "movement-10",
        "name": "完成 10 分钟低门槛活动",
        "cue": "傍晚收尾前",
        "identity_anchor": "维持一个能长期研究的身体底盘。",
        "preferred_window": "17:00-20:00",
        "category": "movement",
        "enabled": True,
    },
    {
        "id": "day-close",
        "name": "睡前做 5 分钟日收口",
        "cue": "结束当天输入后",
        "identity_anchor": "把今天关掉，明天才不会背着昨天工作。",
        "preferred_window": "21:00-23:30",
        "category": "closure",
        "enabled": True,
    },
]

DEFAULT_PREFERENCES: dict[str, Any] = {
    "notifications_enabled": False,
    "checkin_reminder_enabled": True,
    "hydration_reminder_enabled": True,
    "movement_reminder_enabled": True,
    "closure_reminder_enabled": True,
    "review_reminder_enabled": True,
    "quiet_hours_start": "23:30",
    "quiet_hours_end": "08:00",
    "poll_interval_minutes": 15,
}


def _path(filename: str) -> Path:
    return get_abo_dir() / filename


def _read(filename: str, default: Any) -> Any:
    path = _path(filename)
    if not path.exists():
        return deepcopy(default)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return deepcopy(default)


def _write(filename: str, data: Any) -> None:
    path = _path(filename)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def _today_str() -> str:
    return date.today().isoformat()


def _normalize_habit(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}
    name = str(raw.get("name") or "未命名习惯").strip() or "未命名习惯"
    habit_id = str(raw.get("id") or "").strip() or str(uuid.uuid4())[:8]
    return {
        "id": habit_id,
        "name": name,
        "cue": str(raw.get("cue") or "").strip(),
        "identity_anchor": str(raw.get("identity_anchor") or "").strip(),
        "preferred_window": str(raw.get("preferred_window") or "").strip(),
        "category": str(raw.get("category") or "custom").strip() or "custom",
        "enabled": bool(raw.get("enabled", True)),
    }


def _normalize_record(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}
    completed = raw.get("completed_habits", [])
    if not isinstance(completed, list):
        completed = []
    unique_completed = list(dict.fromkeys(str(item).strip() for item in completed if str(item).strip()))
    return {
        "sleep_hours": _as_float(raw.get("sleep_hours")),
        "mood": _as_int(raw.get("mood")),
        "energy": _as_int(raw.get("energy")),
        "san": _as_int(raw.get("san")),
        "happiness": _as_int(raw.get("happiness")),
        "exercise_minutes": _as_int(raw.get("exercise_minutes")),
        "focus_minutes": _as_int(raw.get("focus_minutes")),
        "water_ml": _as_int(raw.get("water_ml")),
        "notes": str(raw.get("notes") or "").strip(),
        "identity_focus": str(raw.get("identity_focus") or "").strip(),
        "work_mode": str(raw.get("work_mode") or "").strip(),
        "completed_habits": unique_completed,
        "updated_at": str(raw.get("updated_at") or ""),
    }


def _normalize_preferences(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}
    return {
        "notifications_enabled": bool(raw.get("notifications_enabled", False)),
        "checkin_reminder_enabled": bool(raw.get("checkin_reminder_enabled", True)),
        "hydration_reminder_enabled": bool(raw.get("hydration_reminder_enabled", True)),
        "movement_reminder_enabled": bool(raw.get("movement_reminder_enabled", True)),
        "closure_reminder_enabled": bool(raw.get("closure_reminder_enabled", True)),
        "review_reminder_enabled": bool(raw.get("review_reminder_enabled", True)),
        "quiet_hours_start": str(raw.get("quiet_hours_start") or "23:30").strip() or "23:30",
        "quiet_hours_end": str(raw.get("quiet_hours_end") or "08:00").strip() or "08:00",
        "poll_interval_minutes": max(5, min(120, _as_int(raw.get("poll_interval_minutes")) or 15)),
    }


def _as_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def has_meaningful_record(record: dict[str, Any]) -> bool:
    if record.get("completed_habits"):
        return True
    for key in (
        "sleep_hours",
        "mood",
        "energy",
        "san",
        "happiness",
        "exercise_minutes",
        "focus_minutes",
        "water_ml",
    ):
        if record.get(key) not in (None, 0, 0.0, ""):
            return True
    if str(record.get("notes") or "").strip():
        return True
    return False


def get_habits() -> list[dict[str, Any]]:
    raw = _read(_HABITS_FILE, DEFAULT_HABITS)
    if not isinstance(raw, list) or not raw:
        raw = deepcopy(DEFAULT_HABITS)
    habits = [_normalize_habit(item) for item in raw]
    _write(_HABITS_FILE, habits)
    return habits


def get_preferences() -> dict[str, Any]:
    prefs = _normalize_preferences(_read(_PREFERENCES_FILE, DEFAULT_PREFERENCES))
    _write(_PREFERENCES_FILE, prefs)
    return prefs


def save_preferences(prefs: dict[str, Any]) -> dict[str, Any]:
    current = get_preferences()
    merged = _normalize_preferences({**current, **prefs})
    _write(_PREFERENCES_FILE, merged)
    return merged


def save_habits(habits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = [_normalize_habit(item) for item in habits]
    _write(_HABITS_FILE, normalized)
    return normalized


def add_habit(
    name: str,
    cue: str = "",
    identity_anchor: str = "",
    preferred_window: str = "",
    category: str = "custom",
) -> dict[str, Any]:
    habits = get_habits()
    habit = _normalize_habit({
        "id": str(uuid.uuid4())[:8],
        "name": name,
        "cue": cue,
        "identity_anchor": identity_anchor,
        "preferred_window": preferred_window,
        "category": category,
        "enabled": True,
    })
    habits.append(habit)
    save_habits(habits)
    return habit


def get_records() -> dict[str, dict[str, Any]]:
    raw = _read(_RECORDS_FILE, {})
    if not isinstance(raw, dict):
        raw = {}
    return {str(day): _normalize_record(record) for day, record in raw.items()}


def get_record(date_str: str | None = None) -> dict[str, Any]:
    records = get_records()
    return records.get(date_str or _today_str(), _normalize_record({}))


def save_record(date_str: str, record: dict[str, Any]) -> dict[str, Any]:
    records = get_records()
    normalized = _normalize_record(record)
    records[date_str] = normalized
    sorted_days = sorted(records.keys())[-120:]
    _write(_RECORDS_FILE, {day: records[day] for day in sorted_days})
    return normalized


def merge_record(date_str: str, patch: dict[str, Any]) -> dict[str, Any]:
    current = get_record(date_str)
    merged = {**current}
    for key, value in patch.items():
        if key == "completed_habits":
            merged[key] = list(dict.fromkeys(str(item).strip() for item in value if str(item).strip()))
            continue
        if value is None:
            continue
        merged[key] = value
    return save_record(date_str, merged)


def toggle_habit_completion(habit_id: str, date_str: str | None = None, completed: bool | None = None) -> dict[str, Any]:
    target_date = date_str or _today_str()
    record = get_record(target_date)
    completed_habits = list(record.get("completed_habits", []))
    is_completed = habit_id in completed_habits
    next_completed = (not is_completed) if completed is None else bool(completed)

    if next_completed and habit_id not in completed_habits:
        completed_habits.append(habit_id)
    if not next_completed:
        completed_habits = [item for item in completed_habits if item != habit_id]

    return merge_record(target_date, {"completed_habits": completed_habits})


def get_recent_records(days: int = 21) -> list[dict[str, Any]]:
    records = get_records()
    items: list[dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        day = (date.today() - timedelta(days=offset)).isoformat()
        items.append({"date": day, **records.get(day, _normalize_record({}))})
    return items


def _average(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def summarize_health(days: int = 21) -> dict[str, Any]:
    history = get_recent_records(days)
    habits = [habit for habit in get_habits() if habit.get("enabled", True)]
    habit_count = len(habits)
    recent7 = history[-7:]

    sleep_values = [float(item["sleep_hours"]) for item in recent7 if item.get("sleep_hours") is not None]
    mood_values = [float(item["mood"]) for item in recent7 if item.get("mood") is not None]
    exercise_days = sum(1 for item in recent7 if (item.get("exercise_minutes") or 0) >= 10)

    completion_ratios: list[float] = []
    for item in recent7:
        if habit_count <= 0:
            completion_ratios.append(0.0)
            continue
        completion_ratios.append(min(1.0, len(item.get("completed_habits", [])) / habit_count))
    habit_completion_rate = _average(completion_ratios)

    streak_days = 0
    for item in reversed(history):
        if has_meaningful_record(item):
            streak_days += 1
        else:
            break

    avg_sleep = _average(sleep_values)
    avg_mood = _average(mood_values)
    sleep_score = max(0, min(35, int((avg_sleep / 8.0) * 35))) if sleep_values else 0
    streak_score = min(35, streak_days * 5)
    habit_score = min(20, int(habit_completion_rate * 20))
    mood_score = max(0, min(10, int((avg_mood / 5.0) * 10))) if mood_values else 0
    health_score = min(100, sleep_score + streak_score + habit_score + mood_score)

    last_checkin_date = ""
    for item in reversed(history):
        if has_meaningful_record(item):
            last_checkin_date = item["date"]
            break

    return {
        "history": history,
        "streak_days": streak_days,
        "avg_sleep_7d": round(avg_sleep, 1) if sleep_values else 0.0,
        "avg_mood_7d": round(avg_mood, 1) if mood_values else 0.0,
        "habit_completion_rate_7d": round(habit_completion_rate, 3),
        "exercise_days_7d": exercise_days,
        "health_score": health_score,
        "last_checkin_date": last_checkin_date,
        "enabled_habit_count": habit_count,
    }
