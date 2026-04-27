"""
Gamification action-reward system for ABO.
Maps user actions to game state changes (XP, SAN, happiness, productivity).
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Callable

from ..profile import store as profile_store


@dataclass
class ActionReward:
    """Reward definition for an action."""
    xp: int = 0
    happiness: int = 0
    san: int = 0
    productivity: int = 0
    energy_cost: int = 0


# Action reward definitions
ACTION_REWARDS = {
    # Research actions
    "save_paper": ActionReward(xp=10, happiness=2, productivity=5),
    "read_paper": ActionReward(xp=15, san=-2, productivity=8),
    "star_paper": ActionReward(xp=20, happiness=5, productivity=3),
    "like_content": ActionReward(xp=5, happiness=3),
    "dislike_content": ActionReward(xp=1, san=-1),  # Small reward for feedback
    "complete_crawl": ActionReward(xp=20, productivity=10),
    "save_to_literature": ActionReward(xp=15, productivity=5),

    # Daily actions
    "daily_login": ActionReward(xp=5, happiness=1),
    "check_feed": ActionReward(xp=2),
    "daily_checkin": ActionReward(xp=10, happiness=5, san=2),

    # Idea actions
    "create_idea": ActionReward(xp=10, happiness=3, productivity=3),
    "connect_ideas": ActionReward(xp=15, happiness=2, productivity=5),

    # Task actions
    "complete_todo": ActionReward(xp=8, happiness=2, productivity=5),
    "create_todo": ActionReward(xp=3),

    # Module feedback
    "card_like": ActionReward(xp=5, happiness=3),
    "card_dislike": ActionReward(xp=1),
    "card_save": ActionReward(xp=10, happiness=2, productivity=3),
    "card_skip": ActionReward(xp=0),
}


def apply_action(user_id: str, action: str, metadata: dict = None) -> dict:
    """Apply action rewards to user game state.

    Args:
        user_id: User identifier (for multi-user support)
        action: Action key from ACTION_REWARDS
        metadata: Optional additional context

    Returns:
        Dict with applied rewards
    """
    reward = ACTION_REWARDS.get(action, ActionReward())
    result = {
        "action": action,
        "rewards": {
            "xp": reward.xp,
            "happiness_delta": reward.happiness,
            "san_delta": reward.san,
            "productivity_delta": reward.productivity,
            "energy_cost": reward.energy_cost,
        },
        "applied_at": datetime.now().isoformat(),
    }

    # Apply to profile store
    try:
        # Update happiness (0-100 range)
        if reward.happiness != 0:
            current_happiness = profile_store.get_happiness_today()
            new_happiness = max(0, min(100, current_happiness + reward.happiness))
            profile_store.append_happiness(new_happiness)

        # Update SAN (0-100 range, written daily)
        if reward.san != 0:
            current_san = profile_store.get_san_7d_avg()  # already 0-100
            new_san = max(0, min(100, int(current_san + reward.san)))
            profile_store.append_san(new_san)

        # Check for achievements
        _check_action_achievements(action, metadata or {})

    except Exception as e:
        result["error"] = str(e)

    return result


def _check_action_achievements(action: str, metadata: dict):
    """Check and unlock achievements based on actions."""
    achievement_checks = {
        "first_like": ("card_like", lambda m: True, "初次点赞", "给第一条内容点了赞"),
        "first_save": ("save_to_literature", lambda m: True, "文献收集者", "保存了第一篇文献"),
        "first_paper": ("save_paper", lambda m: True, "学术起步", "保存了第一篇论文"),
        "daily_checkin_7d": ("daily_checkin", lambda m: _get_checkin_streak() >= 7, "坚持一周", "连续签到7天"),
        "keyword_master": ("card_like", lambda m: _get_liked_count() >= 10, "关键词大师", "点赞了10条内容"),
    }

    for ach_id, (required_action, condition, name, desc) in achievement_checks.items():
        if action == required_action and condition(metadata):
            if profile_store.unlock_achievement(ach_id, name):
                print(f"[achievement] Unlocked: {name}")


def _get_checkin_streak() -> int:
    """Get consecutive check-in days (simplified)."""
    # TODO: Implement proper streak tracking
    return 1


def _get_liked_count() -> int:
    """Get total liked count."""
    # TODO: Implement proper liked count tracking
    return 0


def get_daily_stats() -> dict:
    """Get today's gaming stats."""
    return {
        "happiness": profile_store.get_happiness_today(),
        "san_7d_avg": profile_store.get_san_7d_avg(),
        "energy": profile_store.get_energy_today(),
        "todos_completed": len([t for t in profile_store.get_manual_todos_today() if t.get("done")]),
        "achievements": profile_store.get_achievements(),
    }
