"""Achievement system — definitions, check logic, unlock recording."""
from abo.game.state import load_state, save_state

# ── Achievement definitions ───────────────────────────────────────────────────

ACHIEVEMENTS: dict[str, dict] = {
    "first_paper": {
        "name": "初窥文献",
        "desc": "导入第一篇文献",
        "icon": "📄",
        "check": lambda s: s["stats"]["papers_imported"] >= 1,
    },
    "paper_reader_5": {
        "name": "勤勉读者",
        "desc": "导入 5 篇文献",
        "icon": "📚",
        "check": lambda s: s["stats"]["papers_imported"] >= 5,
    },
    "literature_hunter": {
        "name": "文献猎手",
        "desc": "精读（Lv.2+）50 篇文献",
        "icon": "🔍",
        "check": lambda s: s["stats"]["papers_digested_lv2_plus"] >= 50,
    },
    "first_collision": {
        "name": "火花初现",
        "desc": "第一次 A+B 创意撞击",
        "icon": "⚡",
        "check": lambda s: s["stats"]["ab_collisions"] >= 1,
    },
    "idea_connector": {
        "name": "创意连接器",
        "desc": "进行 20 次 A+B 撞击",
        "icon": "🔗",
        "check": lambda s: s["stats"]["ab_collisions"] >= 20,
    },
    "first_task": {
        "name": "起步之始",
        "desc": "完成第一个任务",
        "icon": "✅",
        "check": lambda s: s["stats"]["tasks_completed_total"] >= 1,
    },
    "productive_scholar": {
        "name": "高产学者",
        "desc": "单月完成 15 个任务",
        "icon": "🏆",
        "check": lambda s: any(v >= 15 for v in s["stats"].get("monthly_tasks", {}).values()),
    },
    "ai_collaborator": {
        "name": "AI 共创者",
        "desc": "使用 Claude 面板 30 次",
        "icon": "🤖",
        "check": lambda s: s["stats"]["claude_sessions"] >= 30,
    },
    "night_owl": {
        "name": "深夜代码人",
        "desc": "连续 7 天有操作记录",
        "icon": "🌙",
        "check": lambda s: _check_streak(s["stats"]["active_days"], 7),
    },
    "level_5": {
        "name": "小有所成",
        "desc": "达到 Lv.5",
        "icon": "⭐",
        "check": lambda s: s.get("level", 1) >= 5,
    },
    "level_10": {
        "name": "独步天下",
        "desc": "达到 Lv.10",
        "icon": "👑",
        "check": lambda s: s.get("level", 1) >= 10,
    },
    "energy_master": {
        "name": "精力大师",
        "desc": "精力值连续 3 天保持在 50 以上",
        "icon": "💪",
        "check": lambda s: _check_energy_days(s),
    },
}


def _check_streak(active_days: list[str], required: int) -> bool:
    """Check if active_days contains a streak of at least `required` consecutive days."""
    if len(active_days) < required:
        return False
    from datetime import date, timedelta
    try:
        sorted_days = sorted(set(active_days))
        streak = 1
        max_streak = 1
        for i in range(1, len(sorted_days)):
            a = date.fromisoformat(sorted_days[i - 1])
            b = date.fromisoformat(sorted_days[i])
            if b - a == timedelta(days=1):
                streak += 1
                max_streak = max(max_streak, streak)
            else:
                streak = 1
        return max_streak >= required
    except Exception:
        return False


def _check_energy_days(_state: dict) -> bool:
    """Placeholder: energy streak check (requires richer log — returns False for now)."""
    return False


def check_and_unlock(vault_path: str) -> list[dict]:
    """Check all achievements against current state. Unlock new ones and return them."""
    state = load_state(vault_path)
    already = set(state.get("achievements", []))
    newly_unlocked = []

    for ach_id, ach in ACHIEVEMENTS.items():
        if ach_id not in already:
            try:
                if ach["check"](state):
                    already.add(ach_id)
                    newly_unlocked.append({
                        "id": ach_id,
                        "name": ach["name"],
                        "desc": ach["desc"],
                    })
            except Exception:
                pass

    if newly_unlocked:
        save_state(vault_path, {"achievements": list(already)})

    return newly_unlocked


def list_achievements(vault_path: str) -> list[dict]:
    """Return all achievements with unlock status."""
    state = load_state(vault_path)
    unlocked = set(state.get("achievements", []))
    result = []
    for ach_id, ach in ACHIEVEMENTS.items():
        result.append({
            "id": ach_id,
            "name": ach["name"],
            "desc": ach["desc"],
            "unlocked": ach_id in unlocked,
        })
    return result
