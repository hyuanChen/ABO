"""Energy system — log events, calculate status, apply multipliers."""
from datetime import datetime, timezone
from pathlib import Path

from abo.game.state import load_state, save_state

# Recovery events (positive delta)
RECOVERY_EVENTS: dict[str, dict] = {
    "rest":       {"delta": 20,   "label": "午休 ≥20min"},
    "exercise":   {"delta": 25,   "label": "运动 ≥30min"},
    "meditation": {"delta": 15,   "label": "正念冥想"},
    "coffee":     {"delta": 15,   "label": "咖啡提神"},
    "sleep":      {"delta": None, "label": "充足睡眠"},   # full restore
}

# Cost events (negative delta)
COST_EVENTS: dict[str, dict] = {
    "focus":      {"delta": -15, "label": "高专注任务"},
    "review":     {"delta": -8,  "label": "整理复习"},
    "light":      {"delta": -3,  "label": "轻松浏览"},
    "meeting":    {"delta": -20, "label": "开会汇报"},
    "ai_test":    {"delta": -15, "label": "AI 吃透测试"},
}

ALL_EVENTS = {**RECOVERY_EVENTS, **COST_EVENTS}


def get_multiplier(current: int, max_energy: int) -> float:
    pct = (current / max_energy) * 100
    if pct >= 80:
        return 1.5
    if pct >= 50:
        return 1.0
    if pct >= 20:
        return 0.7
    return 0.5


def get_status_label(current: int, max_energy: int) -> str:
    pct = (current / max_energy) * 100
    if pct >= 80:
        return "高效模式"
    if pct >= 50:
        return "正常模式"
    if pct >= 20:
        return "疲惫模式"
    return "耗尽状态"


def log_energy_event(vault_path: str, event_type: str) -> dict:
    """Apply an energy event and persist to game-state.json."""
    if event_type not in ALL_EVENTS:
        raise ValueError(f"Unknown event type: {event_type}")

    state = load_state(vault_path)
    energy = state["energy"]
    current = energy["current"]
    max_e = energy["max"]
    event = ALL_EVENTS[event_type]

    if event["delta"] is None:
        # Sleep = full restore
        new_val = max_e
        delta = max_e - current
    else:
        delta = event["delta"]
        new_val = max(0, min(max_e, current + delta))

    timestamp = datetime.now(timezone.utc).strftime("%H:%M")
    log_entry = {"time": timestamp, "delta": new_val - current, "reason": event["label"]}

    # Keep only last 20 log entries
    log = energy.get("log", [])
    log.append(log_entry)
    if len(log) > 20:
        log = log[-20:]

    return save_state(vault_path, {
        "energy": {"current": new_val, "max": max_e, "log": log}
    })
