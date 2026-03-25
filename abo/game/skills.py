"""Skill system — XP calculation, level-up, unlock conditions from YAML."""
from pathlib import Path
from typing import Any

import yaml

from abo.game.state import load_state, save_state, add_total_xp, increment_stat


def _load_tree(vault_path: str) -> list[dict]:
    path = Path(vault_path) / ".abo" / "skill-tree.yaml"
    if not path.exists():
        return []
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data.get("skills", [])


def _calc_level(xp: int, xp_curve: list[int]) -> tuple[int, int, int]:
    """Return (level, xp_in_level, xp_for_next)."""
    cumulative = 0
    for i, threshold in enumerate(xp_curve):
        if xp < cumulative + threshold:
            return i + 1, xp - cumulative, threshold
        cumulative += threshold
    return len(xp_curve), xp_curve[-1], xp_curve[-1]


def get_skills_with_state(vault_path: str) -> list[dict]:
    """Merge skill tree definitions with current XP/level state."""
    tree = _load_tree(vault_path)
    state = load_state(vault_path)
    skills_state: dict[str, Any] = state.get("skills", {})

    result = []
    for skill_def in tree:
        sid = skill_def["id"]
        raw_xp = skills_state.get(sid, {}).get("xp", 0)
        xp_curve = skill_def.get("xp_curve", [100] * 10)
        level, xp_in_level, xp_for_next = _calc_level(raw_xp, xp_curve)
        unlocked = skills_state.get(sid, {}).get("unlocked", not skill_def.get("unlock_condition"))

        result.append({
            "id": sid,
            "name": skill_def["name"],
            "category": skill_def.get("category", "general"),
            "max_level": skill_def.get("max_level", 10),
            "level": level,
            "xp_total": raw_xp,
            "xp_in_level": xp_in_level,
            "xp_for_next": xp_for_next,
            "unlocked": unlocked,
            "unlocks": skill_def.get("unlocks", []),
            "unlock_condition": skill_def.get("unlock_condition"),
        })
    return result


def award_xp(vault_path: str, skill_id: str, xp: int) -> dict:
    """Add XP to a skill; auto-unlock, update total XP, check level-up + achievements."""
    state = load_state(vault_path)
    skills: dict[str, Any] = state.get("skills", {})

    entry = skills.get(skill_id, {"xp": 0, "unlocked": False})
    entry["xp"] = entry.get("xp", 0) + xp
    entry["unlocked"] = True
    skills[skill_id] = entry
    updated = save_state(vault_path, {"skills": skills})

    # Update total XP + check level-up
    level_info = add_total_xp(vault_path, xp)

    # Track activity day
    increment_stat(vault_path, "active_days")

    # Check achievements (deferred import to avoid circular)
    from abo.game.achievements import check_and_unlock
    new_achievements = check_and_unlock(vault_path)

    return {
        **updated,
        "xp_awarded": xp,
        "skill_id": skill_id,
        "level_info": level_info,
        "new_achievements": new_achievements,
    }
