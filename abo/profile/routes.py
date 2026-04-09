"""
/api/profile/* route handlers
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..claude_bridge.runner import batch_call
from ..config import load as load_config, is_demo_mode
from ..demo.data import get_demo_profile, DEMO_STATS
from ..store.cards import CardStore
from .stats import calculate_stats
from .store import (
    append_happiness, append_san,
    get_achievements, get_daily_motto, get_energy_today,
    get_identity, get_san_7d_avg, get_skills, get_todos_today,
    save_daily_motto, save_energy_today, save_identity, save_todos_today,
    unlock_achievement,
)

router = APIRouter(prefix="/api/profile")

_card_store: CardStore | None = None


def init_routes(card_store: CardStore) -> None:
    global _card_store
    _card_store = card_store


def _vault_path() -> str | None:
    cfg = load_config()
    return cfg.get("vault_path")


# ── GET /api/profile ─────────────────────────────────────────────

@router.get("")
async def get_profile():
    if is_demo_mode():
        return get_demo_profile()
    cs = _card_store or CardStore()
    stats = calculate_stats(_vault_path(), cs)
    return {
        "identity": get_identity(),
        "daily_motto": get_daily_motto(),
        "stats": stats,
        "skills": get_skills(),
        "achievements": get_achievements(),
        "energy": get_energy_today(),
        "todos": get_todos_today(),
    }


# ── GET /api/profile/stats ────────────────────────────────────────

@router.get("/stats")
async def get_stats():
    if is_demo_mode():
        return DEMO_STATS
    cs = _card_store or CardStore()
    return calculate_stats(_vault_path(), cs)


# ── POST /api/profile/identity ────────────────────────────────────

class IdentityReq(BaseModel):
    codename: str = ""
    long_term_goal: str = ""


@router.post("/identity")
async def update_identity(body: IdentityReq):
    save_identity(body.codename, body.long_term_goal)
    return {"ok": True}


# ── POST /api/profile/san ─────────────────────────────────────────

class ScoreReq(BaseModel):
    score: int


@router.post("/san")
async def record_san(body: ScoreReq):
    if not 1 <= body.score <= 10:
        raise HTTPException(400, "score must be 1-10")
    append_san(body.score)
    return {"ok": True}


# ── POST /api/profile/happiness ───────────────────────────────────

@router.post("/happiness")
async def record_happiness(body: ScoreReq):
    if not 1 <= body.score <= 10:
        raise HTTPException(400, "score must be 1-10")
    append_happiness(body.score)
    return {"ok": True}


# ── POST /api/profile/energy ──────────────────────────────────────

class EnergyReq(BaseModel):
    energy: int
    manual: bool = True


@router.post("/energy")
async def override_energy(body: EnergyReq):
    if not 0 <= body.energy <= 100:
        raise HTTPException(400, "energy must be 0-100")
    save_energy_today(body.energy, manual=body.manual)
    return {"ok": True}


# ── POST /api/profile/todos ───────────────────────────────────────

class TodosReq(BaseModel):
    todos: list[dict]


@router.post("/todos")
async def update_todos(body: TodosReq):
    save_todos_today(body.todos)
    total = len(body.todos)
    if total > 0:
        done = sum(1 for t in body.todos if t.get("done"))
        completion = done / total
        correction = int(40 + completion * 60)
        new_energy = int(70 * 0.6 + correction * 0.4)
        save_energy_today(new_energy, manual=False)
    return {"ok": True}


# ── POST /api/profile/generate-motto ─────────────────────────────

@router.post("/generate-motto")
async def generate_motto():
    identity = get_identity()
    todos = get_todos_today()
    energy = get_energy_today()
    san_avg = get_san_7d_avg()

    todo_str = ", ".join(t.get("text", "") for t in todos[:5]) if todos else "暂无"
    prompt = (
        f"基于以下上下文，生成一句适合今天的座右铭。\n"
        f"风格：简洁有力，适合研究者，带一点鼓励但不鸡汤。只返回一句话，不要解释。\n\n"
        f"预期目标：{identity.get('long_term_goal', '努力研究')}\n"
        f"今日待办：{todo_str}\n"
        f"精力状态：{energy}%\n"
        f"SAN值：{san_avg:.1f}/10"
    )
    description_prompt = (
        f"用30字以内中文描述这位研究者最近的状态（基于：精力{energy}%，SAN {san_avg:.1f}/10）。"
        f"语气客观，不加主观评价。"
    )

    try:
        motto = await batch_call(prompt)
        description = await batch_call(description_prompt)
    except Exception:
        motto = "专注当下，积累成势。"
        description = ""

    save_daily_motto(motto.strip(), description.strip())
    return {"motto": motto.strip(), "description": description.strip()}
