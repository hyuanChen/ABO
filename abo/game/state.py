"""game-state.json read/write with default structure."""
import json
from datetime import datetime, timezone
from pathlib import Path


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
}


def _state_path(vault_path: str) -> Path:
    return Path(vault_path) / ".abo" / "game-state.json"


def load_state(vault_path: str) -> dict:
    path = _state_path(vault_path)
    if path.exists():
        return json.loads(path.read_text())
    return DEFAULT_GAME_STATE.copy()


def save_state(vault_path: str, updates: dict) -> dict:
    state = load_state(vault_path)
    # Shallow-merge top-level keys; deep-merge 'energy'
    for key, value in updates.items():
        if key == "energy" and isinstance(value, dict):
            state["energy"].update(value)
        else:
            state[key] = value
    state["energy"]["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    path = _state_path(vault_path)
    path.write_text(json.dumps(state, indent=2, ensure_ascii=False))
    return state


def init_state(vault_path: str) -> dict:
    path = _state_path(vault_path)
    if path.exists():
        return json.loads(path.read_text())
    state = DEFAULT_GAME_STATE.copy()
    state["energy"]["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    path.write_text(json.dumps(state, indent=2, ensure_ascii=False))
    return state
