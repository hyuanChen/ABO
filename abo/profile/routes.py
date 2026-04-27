"""
/api/profile/* route handlers
"""
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..sdk.tools import agent
from ..config import load as load_config, is_demo_mode
from ..demo.data import get_demo_profile, DEMO_STATS
from ..activity import ActivityTracker
from ..preferences.engine import PreferenceEngine
from ..sdk.tools import agent_json
from ..store.cards import CardStore
from .intelligence import (
    SBTI_LABELS,
    build_timeline_digest,
    calculate_workbench,
    merge_generated_todos,
    normalize_sbti_type,
    serialize_keyword_preferences,
)
from .stats import calculate_stats
from .store import (
    append_happiness, append_san,
    get_achievements, get_daily_briefing, get_daily_motto, get_energy_today,
    get_happiness_today,
    get_identity, get_manual_todos_today, get_persona_profile, get_san_7d_avg, get_skills,
    save_daily_briefing, save_daily_motto, save_energy_today, save_identity,
    save_persona_profile, save_todos_today,
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


def _today_str() -> str:
    return date.today().isoformat()


def _recompute_energy_from_todos(todos: list[dict]) -> None:
    total = len(todos)
    if total <= 0:
        return
    done = sum(1 for t in todos if t.get("done"))
    completion = done / total
    correction = int(40 + completion * 60)
    new_energy = int(70 * 0.6 + correction * 0.4)
    save_energy_today(new_energy, manual=False)


def _load_today_intel_cards(card_store: CardStore, limit: int = 12) -> list[dict]:
    today = date.today()
    start_ts = datetime.combine(today, datetime.min.time()).timestamp()
    end_ts = datetime.combine(today + timedelta(days=1), datetime.min.time()).timestamp()
    cards = card_store.list_created_between(start_ts, end_ts, limit=limit)
    intel_cards: list[dict] = []
    for card in cards:
        intel_cards.append({
            "id": card.id,
            "module_id": card.module_id,
            "title": card.title,
            "summary": card.summary,
            "tags": card.tags,
            "score": round(float(card.score or 0.0), 3),
            "source_url": card.source_url,
            "created_at": card.created_at,
        })
    return intel_cards


def _normalize_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _fallback_persona(wiki_text: str, current_identity: dict) -> dict:
    lines = [line.strip() for line in wiki_text.splitlines() if line.strip()]
    summary = "；".join(lines[:3])[:220] or "你正在围绕持续输入、整理和输出构建自己的研究角色。"
    strengths = lines[:3] if lines else ["愿意持续记录", "会主动筛选高价值信息", "能把兴趣转成行动"]
    preferred_topics: list[str] = []
    for token in ["研究", "AI", "机器人", "认知", "效率", "学术", "阅读", "写作", "产品"]:
        if token.lower() in wiki_text.lower():
            preferred_topics.append(token)
    return {
        "source_text": wiki_text,
        "summary": summary,
        "homepage": {
            "codename": current_identity.get("codename") or "研究者",
            "long_term_goal": current_identity.get("long_term_goal") or "把持续输入沉淀成稳定输出",
            "one_liner": "持续吸收高价值情报，并把它转成自己的工作节奏。",
            "narrative": summary,
            "strengths": strengths[:4],
            "working_style": ["先搜集，再抽象，再落成任务"],
            "preferred_topics": preferred_topics[:5],
            "next_focus": ["把近期最重要的主题收敛成一个明确问题"],
        },
        "sbti": {
            "type": "THIN-K",
            "confidence": 0.42,
            "reasoning": ["文本更像分析型、自我归纳型工作风格", "缺少足够的行为样本时默认使用思考者原型"],
        },
        "generated_at": datetime.now(UTC).isoformat(),
    }


def _fallback_daily_brief(
    intel_text: str,
    digest: dict,
    top_keywords: list[dict],
    intel_cards: list[dict] | None = None,
) -> dict:
    focus_keywords = [item["keyword"] for item in top_keywords[:3] if item.get("score", 0) > 0]
    focus = " / ".join(focus_keywords) if focus_keywords else "把今天的高价值情报变成下一步动作"
    title_samples = digest.get("titles", [])[:2]
    if not title_samples and intel_cards:
        title_samples = [card.get("title", "") for card in intel_cards[:2] if card.get("title")]
    todos = [
        {
            "text": f"整理今天最重要的 2 条情报，写成可复用笔记",
            "priority": "high",
            "reason": "先把输入沉淀成你自己的表达，避免只停留在浏览。",
            "evidence": title_samples,
        },
        {
            "text": f"围绕 {focus or '当前重点主题'} 追一层原始来源",
            "priority": "medium",
            "reason": "把偏好主题继续深挖一层，补足结论背后的依据。",
            "evidence": focus_keywords,
        },
        {
            "text": "回看今天的阅读记录，删掉一条低价值线索",
            "priority": "low",
            "reason": "减少信息堆积，保证明天的情报流更干净。",
            "evidence": [],
        },
    ]
    summary_seed = intel_text.strip().splitlines()[0] if intel_text.strip() else ""
    if not summary_seed and title_samples:
        summary_seed = f"今天最值得消化的线索集中在：{'、'.join(title_samples)}。"
    return {
        "summary": (summary_seed or "今天已经有可推进的情报输入。")[:120],
        "focus": focus,
        "todos": todos,
    }


# ── GET /api/profile ─────────────────────────────────────────────

@router.get("")
async def get_profile():
    if is_demo_mode():
        return get_demo_profile()
    cs = _card_store or CardStore()
    stats = calculate_stats(_vault_path(), cs)
    identity = get_identity()
    energy = get_energy_today()
    todos = get_manual_todos_today()
    san_avg = get_san_7d_avg()
    happiness = get_happiness_today()
    persona = get_persona_profile()
    intel_cards = _load_today_intel_cards(cs)
    daily_briefing = {**get_daily_briefing(), "intel_cards": intel_cards}
    activity_tracker = ActivityTracker()
    prefs_engine = PreferenceEngine()
    try:
        keyword_prefs = prefs_engine.get_all_keyword_prefs(positive_only=True)
    except TypeError:
        keyword_prefs = prefs_engine.get_all_keyword_prefs()
    timeline = activity_tracker.get_timeline(_today_str())
    return {
        "identity": identity,
        "daily_motto": get_daily_motto(),
        "stats": stats,
        "skills": get_skills(),
        "achievements": get_achievements(),
        "energy": energy,
        "todos": todos,
        "persona": persona,
        "daily_briefing": daily_briefing,
        "workbench": calculate_workbench(
            timeline=timeline,
            todos=todos,
            keyword_prefs=keyword_prefs,
            energy=energy,
            san=san_avg,
            happiness=happiness,
            briefing_summary=daily_briefing.get("summary", ""),
        ),
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
    _recompute_energy_from_todos(body.todos)
    return {"ok": True}


# ── POST /api/profile/persona/generate ───────────────────────────

class PersonaGenerateReq(BaseModel):
    wiki_text: str


@router.post("/persona/generate")
async def generate_persona(body: PersonaGenerateReq):
    wiki_text = body.wiki_text.strip()
    if not wiki_text:
        raise HTTPException(400, "wiki_text 不能为空")

    current_identity = get_identity()
    prompt = (
        "你是研究者角色主页的建模助手。请根据用户给出的自述 / Word wiki 文本，"
        "先提炼出“我懂什么、我在做什么、我想去哪里”的人物摘要，"
        "再生成适合放在主页上的角色信息，并推断最贴近的 SBTI 类型。\n\n"
        "## 当前身份信息\n"
        f"{current_identity}\n\n"
        "## 用户原始文本\n"
        f"{wiki_text[:5000]}\n\n"
        "## SBTI 可选类型\n"
        f"{', '.join(f'{code}({label})' for code, label in SBTI_LABELS.items())}\n\n"
        "## 返回格式\n"
        "{\n"
        '  "summary": "120-220字中文摘要",\n'
        '  "homepage": {\n'
        '    "codename": "主页代号",\n'
        '    "long_term_goal": "长期目标",\n'
        '    "one_liner": "一句话主页介绍",\n'
        '    "narrative": "80-160字的人设描述",\n'
        '    "strengths": ["优势1", "优势2"],\n'
        '    "working_style": ["工作方式1", "工作方式2"],\n'
        '    "preferred_topics": ["主题1", "主题2"],\n'
        '    "next_focus": ["接下来值得推进的方向1", "方向2"]\n'
        "  },\n"
        '  "sbti": {\n'
        '    "type": "THIN-K",\n'
        '    "confidence": 0.78,\n'
        '    "reasoning": ["依据1", "依据2", "依据3"]\n'
        "  }\n"
        "}\n\n"
        "要求：\n"
        "1. 只返回 JSON，不要额外解释\n"
        "2. SBTI type 必须从可选类型中选一个\n"
        "3. strengths / working_style / preferred_topics / next_focus 各给 2-5 条\n"
        "4. 文案要贴近研究者日常，不要空泛鸡汤"
    )

    try:
        generated = await agent_json(prompt)
    except Exception:
        generated = {}
    persona = generated if generated else _fallback_persona(wiki_text, current_identity)

    homepage = persona.get("homepage", {}) if isinstance(persona.get("homepage", {}), dict) else {}
    codename = str(homepage.get("codename") or current_identity.get("codename") or "研究者").strip()
    long_term_goal = str(homepage.get("long_term_goal") or current_identity.get("long_term_goal") or "").strip()
    sbti = persona.get("sbti", {}) or {}
    normalized_sbti = normalize_sbti_type(sbti.get("type"))

    final_persona = {
        "source_text": wiki_text,
        "summary": str(persona.get("summary", "")).strip(),
        "homepage": {
            "codename": codename,
            "long_term_goal": long_term_goal,
            "one_liner": str(homepage.get("one_liner", "")).strip(),
            "narrative": str(homepage.get("narrative", "")).strip(),
            "strengths": _normalize_list(homepage.get("strengths", [])),
            "working_style": _normalize_list(homepage.get("working_style", [])),
            "preferred_topics": _normalize_list(homepage.get("preferred_topics", [])),
            "next_focus": _normalize_list(homepage.get("next_focus", [])),
        },
        "sbti": {
            "type": normalized_sbti,
            "label": SBTI_LABELS.get(normalized_sbti, ""),
            "confidence": max(0.0, min(1.0, float(sbti.get("confidence", 0.0) or 0.0))),
            "reasoning": _normalize_list(sbti.get("reasoning", [])),
        },
        "generated_at": datetime.now(UTC).isoformat(),
    }
    if not final_persona["summary"]:
        final_persona = _fallback_persona(wiki_text, current_identity)
        final_persona["sbti"]["type"] = normalized_sbti
        final_persona["sbti"]["label"] = SBTI_LABELS.get(normalized_sbti, "")

    save_persona_profile(final_persona)
    save_identity(
        final_persona["homepage"].get("codename", codename),
        final_persona["homepage"].get("long_term_goal", long_term_goal),
    )
    return {"ok": True, "persona": final_persona}


# ── POST /api/profile/daily-briefing/generate ───────────────────

class DailyBriefReq(BaseModel):
    intel_text: str = ""


@router.post("/daily-briefing/generate")
async def generate_daily_briefing_plan(body: DailyBriefReq | None = None):
    intel_text = (body.intel_text if body else "").strip()
    today = _today_str()
    cs = _card_store or CardStore()
    intel_cards = _load_today_intel_cards(cs)
    if not intel_cards and not intel_text:
        raise HTTPException(400, "今天还没有可用情报")

    activity_tracker = ActivityTracker()
    prefs_engine = PreferenceEngine()
    try:
        keyword_prefs = prefs_engine.get_all_keyword_prefs(positive_only=True)
    except TypeError:
        keyword_prefs = prefs_engine.get_all_keyword_prefs()
    top_keywords = serialize_keyword_preferences(keyword_prefs, limit=8)
    timeline = activity_tracker.get_timeline(today)
    digest = build_timeline_digest(timeline, keyword_prefs)
    manual_todos = get_manual_todos_today()
    persona = get_persona_profile()

    prompt = (
        "你是研究者的情报消化助手。请根据今天已经抓取到的情报卡片、已有阅读轨迹和用户偏好，"
        "生成一段今日 briefing，并整理成 1-3 个单独的情报消化 todo。\n\n"
        "## 角色画像\n"
        f"{persona}\n\n"
        "## 用户偏好关键词\n"
        f"{top_keywords}\n\n"
        "## 今日阅读轨迹摘要\n"
        f"{digest}\n\n"
        "## 用户自己写的今日待办（不要混进去，只用于避重）\n"
        f"{manual_todos}\n\n"
        "## 今日可用情报卡片\n"
        f"{intel_cards}\n\n"
        "## 用户额外补充说明（可能为空）\n"
        f"{intel_text[:1200]}\n\n"
        "## 返回 JSON\n"
        "{\n"
        '  "summary": "80-160字中文总结",\n'
        '  "focus": "一句话说明今天最值得推进的方向",\n'
        '  "todos": [\n'
        "    {\n"
        '      "text": "具体动作，必须可执行",\n'
        '      "priority": "high|medium|low",\n'
        '      "reason": "为什么现在做",\n'
        '      "evidence": ["证据1", "证据2"]\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "要求：\n"
        "1. 这些 todo 是单独的情报消化任务，不要并入用户手写待办\n"
        "2. todo 不能和用户自己写的今日待办重复\n"
        "3. todo 必须具体，尽量能在 25-60 分钟内完成\n"
        "4. 优先把偏好主题和今天最值得深挖的卡片转成动作\n"
        "5. 只返回 JSON"
    )

    try:
        generated = await agent_json(prompt, prefs=prefs_engine.all_data())
    except Exception:
        generated = {}
    planning = generated if generated else _fallback_daily_brief(intel_text, digest, top_keywords, intel_cards)
    generated_todos = planning.get("todos", [])
    if not isinstance(generated_todos, list):
        generated_todos = []
    merged_todos, created_count = merge_generated_todos([], generated_todos)

    briefing = {
        "date": today,
        "raw_text": intel_text,
        "summary": str(planning.get("summary", "")).strip(),
        "focus": str(planning.get("focus", "")).strip(),
        "preferred_keywords": top_keywords,
        "suggested_todos": [todo for todo in merged_todos if todo.get("source") == "agent"],
        "intel_cards": intel_cards,
        "reading_digest": digest,
        "generated_at": datetime.now(UTC).isoformat(),
    }
    if not briefing["summary"]:
        fallback = _fallback_daily_brief(intel_text, digest, top_keywords, intel_cards)
        briefing["summary"] = fallback["summary"]
        briefing["focus"] = fallback["focus"]

    save_daily_briefing(briefing, today)
    return {
        "ok": True,
        "created_count": created_count,
        "daily_briefing": briefing,
        "todos": manual_todos,
    }


# ── POST /api/profile/generate-motto ─────────────────────────────

@router.post("/generate-motto")
async def generate_motto():
    identity = get_identity()
    todos = get_manual_todos_today()
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
        motto = await agent(prompt)
        description = await agent(description_prompt)
    except Exception:
        motto = "专注当下，积累成势。"
        description = ""

    save_daily_motto(motto.strip(), description.strip())
    return {"motto": motto.strip(), "description": description.strip()}
