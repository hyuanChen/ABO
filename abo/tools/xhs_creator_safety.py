"""Safety gate for XHS creator-profile crawling.

The goal is to reduce repeated profile visits and stop quickly when XHS shows
risk controls. This is not an anti-detection layer; it is a conservative fuse.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from abo.config import get_abo_dir


STATE_PATH = get_abo_dir() / "xhs_creator_safety.json"
DEFAULT_RISK_COOLDOWN_HOURS = 12
DEFAULT_BATCH_LIMIT = 5
DEFAULT_BETWEEN_CREATOR_SECONDS_RANGE = (20, 30)


RISK_MARKERS = (
    "访问频繁",
    "安全验证",
    "安全限制",
    "安全访问",
    "扫码",
    "请先登录",
    "登录后查看更多内容",
    "请稍后再试",
    "risk_limited",
    "manual_required",
    "auth_invalid",
)


@dataclass
class CreatorSafetyDecision:
    allowed: bool
    reason: str = ""
    cooldown_until: str = ""


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None, microsecond=0)


def iso(dt: datetime) -> str:
    return dt.isoformat() + "Z"


def parse_time(value: object) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def load_state(path: Path = STATE_PATH) -> dict[str, Any]:
    if not path.exists():
        return {"creators": {}, "global": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"creators": {}, "global": {}}
    return {
        "creators": data.get("creators") if isinstance(data.get("creators"), dict) else {},
        "global": data.get("global") if isinstance(data.get("global"), dict) else {},
    }


def save_state(state: dict[str, Any], path: Path = STATE_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_creator_id(value: object) -> str:
    return str(value or "").strip().split("?")[0].rstrip("/").split("/")[-1]


def has_risk_marker(error: object) -> bool:
    text = str(error or "")
    return any(marker in text for marker in RISK_MARKERS)


def check_creator_allowed(
    creator_id: str,
    *,
    state: dict[str, Any] | None = None,
    now: datetime | None = None,
) -> CreatorSafetyDecision:
    clean_id = normalize_creator_id(creator_id)
    current = now or utc_now()
    data = state or load_state()
    global_state = data.get("global") or {}
    creator_state = (data.get("creators") or {}).get(clean_id) or {}

    global_until = parse_time(global_state.get("cooldown_until"))
    if global_until and global_until > current:
        return CreatorSafetyDecision(False, "全局风险冷却中", iso(global_until))

    creator_until = parse_time(creator_state.get("cooldown_until"))
    if creator_until and creator_until > current:
        return CreatorSafetyDecision(False, "该博主风险冷却中", iso(creator_until))

    return CreatorSafetyDecision(True)


def record_creator_attempt(creator_id: str, *, state: dict[str, Any] | None = None, now: datetime | None = None) -> dict[str, Any]:
    clean_id = normalize_creator_id(creator_id)
    data = state or load_state()
    creators = data.setdefault("creators", {})
    item = creators.setdefault(clean_id, {})
    item["last_attempt_at"] = iso(now or utc_now())
    item["attempt_count"] = int(item.get("attempt_count") or 0) + 1
    save_state(data)
    return data


def record_creator_success(
    creator_id: str,
    *,
    note_ids: list[str] | None = None,
    state: dict[str, Any] | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    clean_id = normalize_creator_id(creator_id)
    data = state or load_state()
    creators = data.setdefault("creators", {})
    item = creators.setdefault(clean_id, {})
    item["last_success_at"] = iso(now or utc_now())
    item["consecutive_failures"] = 0
    if note_ids is not None:
        item["last_seen_note_ids"] = list(dict.fromkeys(note_ids))[:30]
    save_state(data)
    return data


def record_creator_failure(
    creator_id: str,
    error: object,
    *,
    state: dict[str, Any] | None = None,
    now: datetime | None = None,
    risk_cooldown_hours: int = DEFAULT_RISK_COOLDOWN_HOURS,
) -> dict[str, Any]:
    clean_id = normalize_creator_id(creator_id)
    current = now or utc_now()
    data = state or load_state()
    creators = data.setdefault("creators", {})
    item = creators.setdefault(clean_id, {})
    item["last_failure_at"] = iso(current)
    item["last_error"] = str(error or "")[:500]
    item["consecutive_failures"] = int(item.get("consecutive_failures") or 0) + 1
    if has_risk_marker(error):
        cooldown = current + timedelta(hours=risk_cooldown_hours)
        item["cooldown_until"] = iso(cooldown)
        global_state = data.setdefault("global", {})
        global_state["cooldown_until"] = iso(cooldown)
        global_state["last_risk_at"] = iso(current)
        global_state["last_risk_reason"] = str(error or "")[:500]
    save_state(data)
    return data


def select_allowed_creators(
    creator_ids: list[str],
    *,
    batch_limit: int = DEFAULT_BATCH_LIMIT,
) -> tuple[list[str], dict[str, CreatorSafetyDecision]]:
    data = load_state()
    selected: list[str] = []
    decisions: dict[str, CreatorSafetyDecision] = {}
    for creator_id in creator_ids:
        clean_id = normalize_creator_id(creator_id)
        decision = check_creator_allowed(clean_id, state=data)
        decisions[clean_id] = decision
        if decision.allowed and len(selected) < max(1, batch_limit):
            selected.append(clean_id)
    return selected, decisions
