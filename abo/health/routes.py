"""
/api/health/* route handlers
"""
from __future__ import annotations

from collections import Counter
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..activity import ActivityTracker, ActivityType
from ..config import get_vault_path
from ..profile.store import (
    append_happiness,
    append_san,
    get_daily_motto,
    get_identity,
    save_energy_today,
)
from .store import (
    add_habit,
    get_habits,
    get_preferences,
    get_record,
    get_recent_records,
    has_meaningful_record,
    merge_record,
    save_preferences,
    summarize_health,
    toggle_habit_completion,
)

router = APIRouter(prefix="/api/health")


def _today_str() -> str:
    return date.today().isoformat()


def _now() -> datetime:
    return datetime.now()


def _obsidian_url(vault_path: Path, note_path: Path) -> str:
    relative = str(note_path.relative_to(vault_path)).replace("\\", "/")
    return f"obsidian://open?vault={quote(vault_path.name)}&file={quote(relative)}"


def _journal_info(date_str: str) -> dict[str, Any]:
    vault_path = get_vault_path()
    if not vault_path:
        return {"available": False, "path": None, "url": None}
    note_path = Path(vault_path).expanduser() / "Journal" / f"{date_str}.md"
    return {
        "available": True,
        "path": str(note_path),
        "url": _obsidian_url(Path(vault_path).expanduser(), note_path),
    }


def _build_activity_blocks(days: int = 1) -> list[dict[str, Any]]:
    timeline = ActivityTracker().get_timeline(_today_str())
    activities = list(timeline.activities)
    if not activities:
        return []

    blocks: list[list[Any]] = []
    current: list[Any] = []
    previous_ts: datetime | None = None

    for activity in activities:
        ts = datetime.fromisoformat(activity.timestamp)
        if not current:
            current = [activity]
            previous_ts = ts
            continue
        assert previous_ts is not None
        gap_minutes = (ts - previous_ts).total_seconds() / 60
        if gap_minutes <= 45:
            current.append(activity)
        else:
            blocks.append(current)
            current = [activity]
        previous_ts = ts

    if current:
        blocks.append(current)

    built: list[dict[str, Any]] = []
    for index, block in enumerate(blocks):
        start = datetime.fromisoformat(block[0].timestamp)
        end = datetime.fromisoformat(block[-1].timestamp)
        dominant = Counter(item.type.value for item in block).most_common(1)[0][0]
        label = _session_label(dominant, block)
        duration_minutes = max(10, int((end - start).total_seconds() / 60) + 8)
        built.append({
            "id": f"block-{index}",
            "label": label,
            "start": start.strftime("%H:%M"),
            "end": end.strftime("%H:%M"),
            "duration_minutes": duration_minutes,
            "activity_count": len(block),
            "dominant_type": dominant,
        })
    return built


def _session_label(dominant_type: str, block: list[Any]) -> str:
    if dominant_type == ActivityType.CHECKIN.value:
        return "状态记录"
    if dominant_type in {ActivityType.CHAT_MESSAGE.value, ActivityType.CHAT_START.value}:
        return "思考整理"
    if dominant_type == ActivityType.MODULE_RUN.value:
        return "采集运行"

    module_ids = {str(item.module_id or "").strip() for item in block if item.module_id}
    if module_ids & {"arxiv-tracker", "semantic-scholar-tracker"}:
        return "研究输入"
    if dominant_type in {
        ActivityType.CARD_VIEW.value,
        ActivityType.CARD_LIKE.value,
        ActivityType.CARD_SAVE.value,
        ActivityType.CARD_SHARE.value,
    }:
        return "信息摄入"
    return "推进工作"


def _derive_phase(record: dict[str, Any], blocks: list[dict[str, Any]]) -> dict[str, str]:
    now = _now()
    sleep_hours = record.get("sleep_hours")

    if sleep_hours is not None and sleep_hours < 6.5:
        return {
            "tone": "recover",
            "label": "恢复优先",
            "detail": "睡眠偏少，今天更适合做收敛和维护类工作。",
        }

    if blocks:
        last_block = blocks[-1]
        if last_block["dominant_type"] == ActivityType.CHECKIN.value:
            if has_meaningful_record(record):
                return {
                    "tone": "steady",
                    "label": "状态已更新",
                    "detail": "刚刚完成了一次状态记录，接下来按最重要的任务继续推进即可。",
                }
        end_dt = datetime.combine(date.today(), datetime.strptime(last_block["end"], "%H:%M").time())
        gap_minutes = int((now - end_dt).total_seconds() / 60)
        if gap_minutes <= 25 and last_block["duration_minutes"] >= 90:
            return {
                "tone": "pause",
                "label": "该休息了",
                "detail": f"你刚连续推进了 {last_block['duration_minutes']} 分钟，建议先离开屏幕 8 分钟。",
            }
        if gap_minutes <= 25:
            return {
                "tone": "focus",
                "label": "专注进行中",
                "detail": f"当前工作块已累计 {last_block['duration_minutes']} 分钟，适合先把这一块收完。",
            }

    if has_meaningful_record(record):
        return {
            "tone": "steady",
            "label": "节律已启动",
            "detail": "今天已经有记录，可以继续把状态和工作痕迹收集完整。",
        }

    return {
        "tone": "setup",
        "label": "待启动",
        "detail": "先做 30 秒状态校准，后面的提醒才会更贴近你今天真实情况。",
    }


def _build_guidance(record: dict[str, Any], habits: list[dict[str, Any]], blocks: list[dict[str, Any]]) -> list[dict[str, str]]:
    now = _now()
    guidance: list[dict[str, str]] = []
    completed_count = len(record.get("completed_habits", []))
    enabled_count = len([habit for habit in habits if habit.get("enabled", True)])

    if not has_meaningful_record(record):
        guidance.append({
            "kind": "setup",
            "title": "先补今天的状态校准",
            "detail": "睡眠、情绪和体感只要填一次，系统才能知道今天该推还是该收。",
            "reason": "今天还没有健康记录。",
        })

    sleep_hours = record.get("sleep_hours")
    if sleep_hours is not None and sleep_hours < 6.5:
        guidance.append({
            "kind": "recover",
            "title": "把今天当成低耗能日",
            "detail": "优先推进 1 个最重要任务，减少多线程切换。",
            "reason": f"昨晚睡眠 {sleep_hours:.1f} 小时，恢复不够。",
        })

    water_ml = record.get("water_ml") or 0
    if now.hour >= 14 and water_ml < 1200:
        guidance.append({
            "kind": "hydrate",
            "title": "补一轮水和站立活动",
            "detail": "建议现在补 300-500ml 水，顺带站起来活动 3 分钟。",
            "reason": f"当前记录饮水 {water_ml}ml，下午容易在专注时被忽略。",
        })

    exercise_minutes = record.get("exercise_minutes") or 0
    if now.hour >= 17 and exercise_minutes < 10:
        guidance.append({
            "kind": "move",
            "title": "给身体一个低门槛收尾动作",
            "detail": "哪怕只是快走、拉伸或楼下转一圈，也比完全不动更有用。",
            "reason": "今天还没有形成有效活动量。",
        })

    if blocks:
        last_block = blocks[-1]
        if last_block["duration_minutes"] >= 90:
            guidance.append({
                "kind": "pause",
                "title": "连续工作时间过长",
                "detail": "先停 5-8 分钟，让下一段工作块不要在疲劳状态里开始。",
                "reason": f"最近一段工作块已达到 {last_block['duration_minutes']} 分钟。",
            })

    if enabled_count > 0 and now.hour >= 20 and completed_count < enabled_count:
        guidance.append({
            "kind": "closure",
            "title": "晚上把今天收口",
            "detail": "哪怕只完成一项晚间习惯，也能明显降低第二天的启动成本。",
            "reason": f"今日习惯完成 {completed_count}/{enabled_count}。",
        })

    if not guidance:
        guidance.append({
            "kind": "steady",
            "title": "今天的节律基本在线",
            "detail": "继续保持当前节奏，优先把最重要的一块工作做完整。",
            "reason": "最近的记录没有明显失衡信号。",
        })

    return guidance[:4]


def _history_points(days: int = 21) -> list[dict[str, Any]]:
    history = get_recent_records(days)
    return [
        {
            "date": item["date"],
            "sleep_hours": item.get("sleep_hours"),
            "mood": item.get("mood"),
            "energy": item.get("energy"),
            "exercise_minutes": item.get("exercise_minutes") or 0,
            "focus_minutes": item.get("focus_minutes") or 0,
            "water_ml": item.get("water_ml") or 0,
            "completed_habits_count": len(item.get("completed_habits", [])),
        }
        for item in history
    ]


def _build_reminders(
    record: dict[str, Any],
    habits: list[dict[str, Any]],
    guidance: list[dict[str, str]],
    preferences: dict[str, Any],
) -> list[dict[str, Any]]:
    now = _now()
    reminders: list[dict[str, Any]] = []
    weekly_review = _build_weekly_review(7)
    enabled_habit_count = len([habit for habit in habits if habit.get("enabled", True)])
    completed_count = len(record.get("completed_habits", []))

    if preferences.get("checkin_reminder_enabled", True) and now.hour >= 10 and not has_meaningful_record(record):
        reminders.append({
            "id": f"checkin-{_today_str()}",
            "kind": "checkin",
            "title": "先补今天的状态校准",
            "body": "只要 30 秒，系统后面的休息和节律提醒才会更准确。",
            "level": "high",
            "due_now": True,
        })

    if preferences.get("hydration_reminder_enabled", True) and now.hour >= 14 and (record.get("water_ml") or 0) < 1200:
        reminders.append({
            "id": f"hydrate-{_today_str()}",
            "kind": "hydrate",
            "title": "该补水和站起来活动了",
            "body": f"当前饮水 {record.get('water_ml') or 0}ml，建议现在补一轮水并离开屏幕 3 分钟。",
            "level": "medium",
            "due_now": True,
        })

    if preferences.get("movement_reminder_enabled", True) and now.hour >= 17 and (record.get("exercise_minutes") or 0) < 10:
        reminders.append({
            "id": f"move-{_today_str()}",
            "kind": "movement",
            "title": "今天还没有形成有效活动量",
            "body": "哪怕只做 10 分钟低门槛活动，也比完全不动更好。",
            "level": "medium",
            "due_now": True,
        })

    if (
        preferences.get("closure_reminder_enabled", True)
        and now.hour >= 21
        and enabled_habit_count > 0
        and completed_count < enabled_habit_count
    ):
        reminders.append({
            "id": f"closure-{_today_str()}",
            "kind": "closure",
            "title": "今天还没收口",
            "body": f"今日习惯完成 {completed_count}/{enabled_habit_count}，睡前补一个收尾动作最划算。",
            "level": "medium",
            "due_now": True,
        })

    if (
        preferences.get("review_reminder_enabled", True)
        and weekly_review.get("ready")
        and now.weekday() == 6
        and now.hour >= 20
    ):
        reminders.append({
            "id": f"weekly-review-{_today_str()}",
            "kind": "weekly_review",
            "title": "这周可以做一次健康复盘了",
            "body": weekly_review.get("headline", "系统已经整理好这周的节律变化。"),
            "level": "medium",
            "due_now": True,
        })

    for item in guidance[:2]:
        reminders.append({
            "id": f"guidance-{item['kind']}-{_today_str()}",
            "kind": item["kind"],
            "title": item["title"],
            "body": item["detail"],
            "level": "low",
            "due_now": item["kind"] in {"recover", "pause", "setup"},
        })

    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for reminder in reminders:
        if reminder["id"] in seen:
            continue
        seen.add(reminder["id"])
        unique.append(reminder)
    return unique[:5]


def _build_weekly_review(days: int = 7) -> dict[str, Any]:
    history = get_recent_records(days)
    meaningful = [item for item in history if has_meaningful_record(item)]
    if not meaningful:
        return {
            "ready": False,
            "headline": "这周还没有足够的健康记录",
            "summary": "先连续记录几天，系统才有基础判断你最近的节律变化。",
            "wins": [],
            "risks": ["记录太少，暂时无法判断稳定模式。"],
            "experiments": ["先把每日状态校准和 1 个固定习惯坚持 3 天。"],
            "metrics": {
                "days_recorded": 0,
                "avg_sleep": 0.0,
                "avg_mood": 0.0,
                "habit_completion_rate": 0.0,
                "exercise_days": 0,
            },
        }

    sleep_values = [float(item["sleep_hours"]) for item in meaningful if item.get("sleep_hours") is not None]
    mood_values = [float(item["mood"]) for item in meaningful if item.get("mood") is not None]
    habit_count = max(1, len([habit for habit in get_habits() if habit.get("enabled", True)]))
    habit_rate = sum(min(1.0, len(item.get("completed_habits", [])) / habit_count) for item in meaningful) / len(meaningful)
    exercise_days = sum(1 for item in meaningful if (item.get("exercise_minutes") or 0) >= 10)
    avg_sleep = round(sum(sleep_values) / len(sleep_values), 1) if sleep_values else 0.0
    avg_mood = round(sum(mood_values) / len(mood_values), 1) if mood_values else 0.0

    wins: list[str] = []
    risks: list[str] = []
    experiments: list[str] = []

    if avg_sleep >= 7.2:
        wins.append(f"最近 {len(meaningful)} 天平均睡眠 {avg_sleep} 小时，恢复底盘是稳的。")
    else:
        risks.append(f"最近平均睡眠只有 {avg_sleep} 小时，容易让后半周进入硬撑状态。")
        experiments.append("下周先守住 2 天 7 小时以上睡眠，不追求一步到位。")

    if habit_rate >= 0.6:
        wins.append(f"习惯执行率达到 {int(habit_rate * 100)}%，说明你已经有稳定自控结构。")
    else:
        risks.append(f"习惯执行率只有 {int(habit_rate * 100)}%，提醒太多会失效，先缩到 2-3 项核心动作。")
        experiments.append("删掉一项最难坚持的习惯，只保留最关键的恢复动作。")

    if exercise_days >= 4:
        wins.append(f"这周有 {exercise_days} 天形成了活动量，身体端没有被完全忽略。")
    else:
        risks.append(f"这周只有 {exercise_days} 天有有效活动量，身体恢复在拖认知强度后腿。")
        experiments.append("把活动动作绑定到傍晚收工前，而不是留到完全没精力的时候。")

    if avg_mood >= 3.8:
        wins.append(f"情绪均值 {avg_mood}/5，说明你最近的工作节奏没有明显失控。")
    elif avg_mood > 0:
        risks.append(f"情绪均值 {avg_mood}/5，系统建议下周降低任务并行度。")
        experiments.append("下周给每个工作日只设一个必须完成的主任务。")

    headline = "这周整体在变稳" if len(wins) >= len(risks) else "这周节律有些发散"
    summary = (
        "你最近已经形成一部分稳定节律，但恢复和推进之间还需要更明确的边界。"
        if len(wins) >= len(risks)
        else "这周的主要问题不是不努力，而是恢复动作太容易被工作吞掉。"
    )

    return {
        "ready": True,
        "headline": headline,
        "summary": summary,
        "wins": wins[:3],
        "risks": risks[:3],
        "experiments": experiments[:3] or ["继续维持当前最有效的 2 个习惯，不要一周内频繁改规则。"],
        "metrics": {
            "days_recorded": len(meaningful),
            "avg_sleep": avg_sleep,
            "avg_mood": avg_mood,
            "habit_completion_rate": round(habit_rate, 3),
            "exercise_days": exercise_days,
        },
    }


def _render_journal_section(
    date_str: str,
    record: dict[str, Any],
    habits: list[dict[str, Any]],
    phase: dict[str, str],
    guidance: list[dict[str, str]],
) -> str:
    completed = set(record.get("completed_habits", []))
    habit_lines = [
        f"- [{'x' if habit['id'] in completed else ' '}] {habit['name']}"
        for habit in habits if habit.get("enabled", True)
    ]
    if not habit_lines:
        habit_lines = ["- 暂无启用中的习惯"]

    lines = [
        "## 健康记录（ABO）",
        "<!-- abo-health:start -->",
        "",
        "### 今日状态",
        f"- 睡眠：{record.get('sleep_hours') if record.get('sleep_hours') is not None else '未记录'} 小时",
        f"- 心情：{record.get('mood') if record.get('mood') is not None else '未记录'} / 5",
        f"- 精力：{record.get('energy') if record.get('energy') is not None else '未记录'} / 100",
        f"- SAN：{record.get('san') if record.get('san') is not None else '未记录'} / 10",
        f"- 幸福感：{record.get('happiness') if record.get('happiness') is not None else '未记录'} / 10",
        f"- 饮水：{record.get('water_ml') or 0} ml",
        f"- 活动量：{record.get('exercise_minutes') or 0} 分钟",
        f"- 专注时长：{record.get('focus_minutes') or 0} 分钟",
        "",
        "### 身份提示",
        f"- 今天想守住：{record.get('identity_focus') or '未填写'}",
        f"- 工作模式：{record.get('work_mode') or '未填写'}",
        "",
        "### 今日习惯",
        *habit_lines,
        "",
        "### 系统判断",
        f"- 当前阶段：{phase['label']} - {phase['detail']}",
    ]

    for item in guidance:
        lines.append(f"- 提醒：{item['title']}（{item['reason']}）")

    notes = str(record.get("notes") or "").strip()
    if notes:
        lines.extend([
            "",
            "### 备注",
            notes,
        ])

    lines.extend([
        "",
        "<!-- abo-health:end -->",
    ])
    return "\n".join(lines)


def _upsert_journal(date_str: str, record: dict[str, Any], habits: list[dict[str, Any]], phase: dict[str, str], guidance: list[dict[str, str]]) -> None:
    vault_path = get_vault_path()
    if not vault_path:
        return

    vault = Path(vault_path).expanduser()
    note_path = vault / "Journal" / f"{date_str}.md"
    note_path.parent.mkdir(parents=True, exist_ok=True)
    section = _render_journal_section(date_str, record, habits, phase, guidance)

    existing = note_path.read_text(encoding="utf-8") if note_path.exists() else f"# {date_str}\n"
    start_marker = "<!-- abo-health:start -->"
    end_marker = "<!-- abo-health:end -->"
    if start_marker in existing and end_marker in existing:
        start_idx = existing.index(start_marker)
        end_idx = existing.index(end_marker) + len(end_marker)
        while end_idx < len(existing) and existing[end_idx] in "\r\n":
            end_idx += 1
        replacement_start = existing.rfind("## 健康记录（ABO）", 0, start_idx)
        if replacement_start == -1:
            replacement_start = start_idx
        updated = existing[:replacement_start].rstrip() + "\n\n" + section + "\n"
    else:
        updated = existing.rstrip() + "\n\n" + section + "\n"
    note_path.write_text(updated, encoding="utf-8")


def _build_dashboard(days: int = 21) -> dict[str, Any]:
    habits = get_habits()
    preferences = get_preferences()
    today = get_record(_today_str())
    summary = summarize_health(days)
    blocks = _build_activity_blocks()
    phase = _derive_phase(today, blocks)
    guidance = _build_guidance(today, habits, blocks)
    reminders = _build_reminders(today, habits, guidance, preferences)
    enabled_habits = [habit for habit in habits if habit.get("enabled", True)]
    completed = set(today.get("completed_habits", []))
    habits_payload = [
        {
            **habit,
            "completed_today": habit["id"] in completed,
        }
        for habit in habits
    ]
    return {
        "today": {
            **today,
            "date": _today_str(),
            "completed_habits_count": len(completed),
            "enabled_habits_count": len(enabled_habits),
            "checkin_done": has_meaningful_record(today),
        },
        "summary": {
            "streak_days": summary["streak_days"],
            "avg_sleep_7d": summary["avg_sleep_7d"],
            "avg_mood_7d": summary["avg_mood_7d"],
            "habit_completion_rate_7d": summary["habit_completion_rate_7d"],
            "exercise_days_7d": summary["exercise_days_7d"],
            "health_score": summary["health_score"],
            "last_checkin_date": summary["last_checkin_date"],
        },
        "identity": get_identity(),
        "motto": get_daily_motto(),
        "phase": phase,
        "guidance": guidance,
        "reminders": reminders,
        "reminder_preferences": preferences,
        "habits": habits_payload,
        "activity_blocks": blocks,
        "history": _history_points(days),
        "weekly_review": _build_weekly_review(7),
        "journal": _journal_info(_today_str()),
    }


class HealthCheckinReq(BaseModel):
    sleep_hours: float | None = None
    mood: int | None = None
    energy: int | None = None
    san: int | None = None
    happiness: int | None = None
    exercise_minutes: int | None = None
    focus_minutes: int | None = None
    water_ml: int | None = None
    notes: str | None = None
    identity_focus: str | None = None
    work_mode: str | None = None
    completed_habits: list[str] | None = None


class HabitCreateReq(BaseModel):
    name: str
    cue: str = ""
    identity_anchor: str = ""
    preferred_window: str = ""
    category: str = "custom"


class HabitToggleReq(BaseModel):
    completed: bool | None = None


class ReminderPreferencesReq(BaseModel):
    notifications_enabled: bool | None = None
    checkin_reminder_enabled: bool | None = None
    hydration_reminder_enabled: bool | None = None
    movement_reminder_enabled: bool | None = None
    closure_reminder_enabled: bool | None = None
    review_reminder_enabled: bool | None = None
    quiet_hours_start: str | None = None
    quiet_hours_end: str | None = None
    poll_interval_minutes: int | None = None


@router.get("/dashboard")
async def get_dashboard(days: int = 21):
    safe_days = max(7, min(days, 60))
    return _build_dashboard(safe_days)


@router.get("/reminders")
async def get_reminders():
    dashboard = _build_dashboard(14)
    return {
        "preferences": dashboard["reminder_preferences"],
        "reminders": dashboard["reminders"],
        "phase": dashboard["phase"],
        "weekly_review_ready": dashboard["weekly_review"]["ready"],
    }


@router.get("/weekly-review")
async def get_weekly_review():
    return _build_weekly_review(7)


@router.post("/preferences")
async def update_preferences(body: ReminderPreferencesReq):
    prefs = save_preferences(body.model_dump(exclude_none=True))
    return {"ok": True, "preferences": prefs, "dashboard": _build_dashboard(21)}


@router.post("/checkin")
async def save_checkin(body: HealthCheckinReq):
    if body.sleep_hours is not None and not 0 <= body.sleep_hours <= 16:
        raise HTTPException(400, "sleep_hours must be 0-16")
    if body.mood is not None and not 1 <= body.mood <= 5:
        raise HTTPException(400, "mood must be 1-5")
    if body.energy is not None and not 0 <= body.energy <= 100:
        raise HTTPException(400, "energy must be 0-100")
    if body.san is not None and not 1 <= body.san <= 10:
        raise HTTPException(400, "san must be 1-10")
    if body.happiness is not None and not 1 <= body.happiness <= 10:
        raise HTTPException(400, "happiness must be 1-10")
    for field_name, value in {
        "exercise_minutes": body.exercise_minutes,
        "focus_minutes": body.focus_minutes,
        "water_ml": body.water_ml,
    }.items():
        if value is not None and value < 0:
            raise HTTPException(400, f"{field_name} must be >= 0")

    date_str = _today_str()
    record = merge_record(date_str, {
        "sleep_hours": body.sleep_hours,
        "mood": body.mood,
        "energy": body.energy,
        "san": body.san,
        "happiness": body.happiness,
        "exercise_minutes": body.exercise_minutes,
        "focus_minutes": body.focus_minutes,
        "water_ml": body.water_ml,
        "notes": body.notes,
        "identity_focus": body.identity_focus,
        "work_mode": body.work_mode,
        "completed_habits": body.completed_habits if body.completed_habits is not None else get_record(date_str).get("completed_habits", []),
        "updated_at": _now().isoformat(),
    })

    if body.san is not None:
        append_san(body.san)
    if body.happiness is not None:
        append_happiness(body.happiness)
    if body.energy is not None:
        save_energy_today(body.energy, manual=True)

    ActivityTracker().record_activity(
        activity_type=ActivityType.CHECKIN,
        metadata={
            "source": "health",
            "sleep_hours": record.get("sleep_hours"),
            "mood": record.get("mood"),
            "energy": record.get("energy"),
            "completed_habits_count": len(record.get("completed_habits", [])),
        },
    )

    habits = get_habits()
    blocks = _build_activity_blocks()
    phase = _derive_phase(record, blocks)
    guidance = _build_guidance(record, habits, blocks)
    _upsert_journal(date_str, record, habits, phase, guidance)
    return {"ok": True, "dashboard": _build_dashboard()}


@router.post("/habits")
async def create_habit(body: HabitCreateReq):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "name is required")
    habit = add_habit(
        name=name,
        cue=body.cue,
        identity_anchor=body.identity_anchor,
        preferred_window=body.preferred_window,
        category=body.category,
    )
    return {"ok": True, "habit": habit, "dashboard": _build_dashboard()}


@router.post("/habits/{habit_id}/toggle")
async def toggle_habit(habit_id: str, body: HabitToggleReq):
    habit_ids = {habit["id"] for habit in get_habits()}
    if habit_id not in habit_ids:
        raise HTTPException(404, "habit not found")
    toggle_habit_completion(habit_id, completed=body.completed)
    return {"ok": True, "dashboard": _build_dashboard()}
