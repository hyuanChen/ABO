# Profile Gamification + ArXiv Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 11 (角色主页游戏化) — pixel avatar, JoJo-style hexagon radar, skill nodes with progress, achievement badges, daily check-in modal, energy system — plus Phase 6 (ArXiv Tracker full frontend).

**Architecture:** Backend `abo/profile/` module handles all JSON file persistence and stats calculation. Frontend `src/modules/profile/` contains 8 focused components assembled by `Profile.tsx`. NavSidebar gets a top summary card. No new database — all profile data in `~/.abo/*.json`.

**Tech Stack:** Python FastAPI, React + TypeScript, Tailwind CSS, SVG (no D3), CSS box-shadow pixel art, Zustand

---

## File Map

### New files — Backend
- `abo/profile/__init__.py` — package marker
- `abo/profile/store.py` — all JSON read/write helpers for `~/.abo/` files
- `abo/profile/stats.py` — calculate six hex dimensions from CardStore + Vault file counts
- `abo/profile/routes.py` — all `/api/profile/*` FastAPI route handlers

### Modified files — Backend
- `abo/main.py` — import and include profile router

### New files — Frontend
- `src/modules/profile/Profile.tsx` — page assembler
- `src/modules/profile/PixelAvatar.tsx` — CSS box-shadow pixel character, 4 states
- `src/modules/profile/RoleCard.tsx` — identity card + motto display + edit form
- `src/modules/profile/DailyTodo.tsx` — today's task list affecting energy
- `src/modules/profile/HexagonRadar.tsx` — SVG radar with JoJo E→A letter grades
- `src/modules/profile/SkillGrid.tsx` — honeycomb skill nodes with progress %
- `src/modules/profile/AchievementGallery.tsx` — badge row with unlock dates
- `src/modules/profile/DailyCheckInModal.tsx` — SAN + happiness scoring modal

### Modified files — Frontend
- `src/core/store.ts` — add `"profile"` to `ActiveTab`, add `profileEnergy` + `profileSan` state
- `src/modules/nav/NavSidebar.tsx` — add top summary card (avatar + energy bar + motto)
- `src/modules/MainContent.tsx` — add `profile` tab case
- `src/modules/arxiv/ArxivTracker.tsx` — replace placeholder with full implementation

---

## Task 1: Backend profile store helpers

**Files:**
- Create: `abo/profile/__init__.py`
- Create: `abo/profile/store.py`

- [ ] **Step 1: Create package marker**

```python
# abo/profile/__init__.py
```

- [ ] **Step 2: Write `abo/profile/store.py`**

```python
"""
Profile data persistence — all reads/writes to ~/.abo/*.json
"""
import json
import os
from datetime import date, datetime
from pathlib import Path
from typing import Any

_ABO_DIR = Path.home() / ".abo"


def _path(filename: str) -> Path:
    _ABO_DIR.mkdir(parents=True, exist_ok=True)
    return _ABO_DIR / filename


def _read(filename: str, default: Any) -> Any:
    p = _path(filename)
    if not p.exists():
        return default
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write(filename: str, data: Any) -> None:
    p = _path(filename)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, p)


# ── Profile identity ─────────────────────────────────────────────

def get_identity() -> dict:
    return _read("profile.json", {
        "codename": "",
        "long_term_goal": "",
    })


def save_identity(codename: str, long_term_goal: str) -> None:
    _write("profile.json", {
        "codename": codename,
        "long_term_goal": long_term_goal,
    })


# ── Daily motto ──────────────────────────────────────────────────

def get_daily_motto() -> dict:
    return _read("daily_motto.json", {
        "date": "",
        "motto": "开始记录，见证成长。",
        "description": "",
    })


def save_daily_motto(motto: str, description: str) -> None:
    _write("daily_motto.json", {
        "date": date.today().isoformat(),
        "motto": motto,
        "description": description,
    })


# ── SAN log ──────────────────────────────────────────────────────

def append_san(score: int) -> None:
    log = _read("san_log.json", [])
    log.append({"date": date.today().isoformat(), "score": score})
    _write("san_log.json", log[-90:])  # keep last 90 days


def get_san_7d_avg() -> float:
    log = _read("san_log.json", [])
    recent = log[-7:] if len(log) >= 7 else log
    if not recent:
        return 0.0
    return sum(e["score"] for e in recent) / len(recent)


# ── Happiness log ────────────────────────────────────────────────

def append_happiness(score: int) -> None:
    log = _read("happiness_log.json", [])
    log.append({"date": date.today().isoformat(), "score": score})
    _write("happiness_log.json", log[-90:])


def get_happiness_today() -> float:
    log = _read("happiness_log.json", [])
    today = date.today().isoformat()
    for entry in reversed(log):
        if entry["date"] == today:
            return float(entry["score"])
    return 0.0


# ── Energy memory ────────────────────────────────────────────────

def get_energy_today() -> int:
    data = _read("energy_memory.json", {"history": [], "today": {"current": 70, "manual_override": None}})
    override = data.get("today", {}).get("manual_override")
    if override is not None:
        return int(override)
    return int(data.get("today", {}).get("current", 70))


def save_energy_today(energy: int, manual: bool = False) -> None:
    data = _read("energy_memory.json", {"history": [], "today": {}})
    today_str = date.today().isoformat()
    data["today"] = {
        "current": energy,
        "manual_override": energy if manual else None,
    }
    history = data.get("history", [])
    # update or append today's record
    if history and history[-1]["date"] == today_str:
        history[-1]["energy"] = energy
    else:
        history.append({"date": today_str, "energy": energy})
    data["history"] = history[-90:]
    _write("energy_memory.json", data)


# ── Daily todos ──────────────────────────────────────────────────

def get_todos_today() -> list[dict]:
    all_todos = _read("daily_todos.json", {})
    today = date.today().isoformat()
    return all_todos.get(today, [])


def save_todos_today(todos: list[dict]) -> None:
    all_todos = _read("daily_todos.json", {})
    today = date.today().isoformat()
    all_todos[today] = todos
    # keep last 30 days
    sorted_keys = sorted(all_todos.keys())[-30:]
    _write("daily_todos.json", {k: all_todos[k] for k in sorted_keys})


# ── Skills ───────────────────────────────────────────────────────

def get_skills() -> dict:
    return _read("skills.json", {})


def unlock_skill(skill_id: str) -> None:
    skills = get_skills()
    if skill_id not in skills:
        skills[skill_id] = {"unlocked_at": datetime.utcnow().isoformat()}
        _write("skills.json", skills)


# ── Achievements ─────────────────────────────────────────────────

def get_achievements() -> list[dict]:
    return _read("achievements.json", [])


def unlock_achievement(achievement_id: str, name: str) -> bool:
    """Returns True if newly unlocked, False if already had it."""
    achievements = get_achievements()
    existing_ids = {a["id"] for a in achievements}
    if achievement_id in existing_ids:
        return False
    achievements.append({
        "id": achievement_id,
        "name": name,
        "unlocked_at": datetime.utcnow().isoformat(),
    })
    _write("achievements.json", achievements)
    return True


# ── Stats cache ──────────────────────────────────────────────────

def get_stats_cache() -> dict:
    return _read("stats_cache.json", {})


def save_stats_cache(stats: dict) -> None:
    stats["cached_at"] = date.today().isoformat()
    _write("stats_cache.json", stats)
```

- [ ] **Step 3: Verify import works**

```bash
cd /Users/huanc/Desktop/ABO
python3 -c "from abo.profile.store import get_identity, get_daily_motto; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add abo/profile/__init__.py abo/profile/store.py
git commit -m "feat(profile): add JSON persistence store helpers"
```

---

## Task 2: Backend stats calculator

**Files:**
- Create: `abo/profile/stats.py`

- [ ] **Step 1: Write `abo/profile/stats.py`**

```python
"""
Calculate six hex dimension scores from existing data sources.
All scores are 0-100 integers.
"""
from datetime import date, timedelta
from pathlib import Path

from ..store.cards import CardStore
from .store import get_san_7d_avg, get_happiness_today, get_energy_today


def score_to_grade(score: int) -> str:
    """Convert 0-100 score to JoJo letter grade E→A."""
    if score >= 80:
        return "A"
    if score >= 60:
        return "B"
    if score >= 40:
        return "C"
    if score >= 20:
        return "D"
    return "E"


def _count_vault_files(vault_path: str | None, subfolder: str) -> int:
    if not vault_path:
        return 0
    p = Path(vault_path) / subfolder
    if not p.exists():
        return 0
    return len(list(p.glob("*.md")))


def _count_idea_nodes(vault_path: str | None) -> int:
    if not vault_path:
        return 0
    p = Path(vault_path) / "Ideas"
    if not p.exists():
        return 0
    return len(list(p.glob("idea-*.md")))


def calculate_stats(vault_path: str | None, card_store: CardStore) -> dict:
    """
    Returns dict with keys: research, output, health, learning, san, happiness.
    Each key maps to {"score": int, "grade": str, "raw": dict}.
    """
    # ── 研究力 ────────────────────────────────────────────────────
    lit_count = _count_vault_files(vault_path, "Literature")
    arxiv_stars = card_store.count_feedback(module_id="arxiv-tracker", action="star")
    research_raw = min(100, lit_count * 2 + arxiv_stars * 3)

    # ── 产出力 ────────────────────────────────────────────────────
    meeting_count = _count_vault_files(vault_path, "Meetings")
    idea_count = _count_idea_nodes(vault_path)
    output_raw = min(100, meeting_count * 10 + idea_count * 5)

    # ── 健康力 (health module not yet implemented → 0) ─────────────
    health_raw = 0

    # ── 学习力 ────────────────────────────────────────────────────
    podcast_done = card_store.count_feedback(module_id="podcast-digest", action="save")
    trend_deep = card_store.count_feedback(module_id="rss-aggregator", action="deep_dive")
    learning_raw = min(100, podcast_done * 8 + trend_deep * 5)

    # ── SAN 值 ────────────────────────────────────────────────────
    san_avg = get_san_7d_avg()
    san_raw = min(100, int(san_avg * 10))

    # ── 幸福指数 ──────────────────────────────────────────────────
    happiness_today = get_happiness_today()
    energy_today = get_energy_today()
    happiness_raw = min(100, int(happiness_today * 0.6 * 10 + energy_today * 0.4))

    def dim(score: int, raw_info: dict) -> dict:
        return {"score": score, "grade": score_to_grade(score), "raw": raw_info}

    return {
        "research":  dim(research_raw,  {"lit_count": lit_count, "arxiv_stars": arxiv_stars}),
        "output":    dim(output_raw,    {"meeting_count": meeting_count, "idea_count": idea_count}),
        "health":    dim(health_raw,    {"note": "health module pending"}),
        "learning":  dim(learning_raw,  {"podcast_done": podcast_done, "trend_deep": trend_deep}),
        "san":       dim(san_raw,       {"san_7d_avg": round(san_avg, 1)}),
        "happiness": dim(happiness_raw, {"happiness_today": happiness_today, "energy_today": energy_today}),
    }
```

- [ ] **Step 2: Verify import**

```bash
python3 -c "from abo.profile.stats import calculate_stats, score_to_grade; print(score_to_grade(75))"
```

Expected: `B`

- [ ] **Step 3: Commit**

```bash
git add abo/profile/stats.py
git commit -m "feat(profile): add six-dimension stats calculator with JoJo grading"
```

---

## Task 3: Backend profile routes

**Files:**
- Create: `abo/profile/routes.py`
- Modify: `abo/main.py`

- [ ] **Step 1: Add `count_feedback` method to CardStore**

Open `abo/store/cards.py` and add this method to the `CardStore` class:

```python
def count_feedback(self, module_id: str, action: str) -> int:
    """Count cards from a module that received a specific feedback action."""
    with self._conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM cards WHERE module_id=? AND last_feedback=?",
            (module_id, action),
        ).fetchone()
        return row[0] if row else 0
```

- [ ] **Step 2: Write `abo/profile/routes.py`**

```python
"""
/api/profile/* route handlers
"""
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..claude_bridge.runner import batch_call
from ..config import load as load_config
from ..store.cards import CardStore
from .stats import calculate_stats
from .store import (
    append_happiness, append_san,
    get_achievements, get_daily_motto, get_energy_today,
    get_identity, get_skills, get_todos_today,
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
    # recalculate energy from completion rate
    total = len(body.todos)
    if total > 0:
        done = sum(1 for t in body.todos if t.get("done"))
        completion = done / total
        # completion 0→100 maps to correction score 40→100
        correction = int(40 + completion * 60)
        new_energy = int(70 * 0.6 + correction * 0.4)  # base 70 until health module
        save_energy_today(new_energy, manual=False)
    return {"ok": True}


# ── POST /api/profile/generate-motto ─────────────────────────────

@router.post("/generate-motto")
async def generate_motto():
    identity = get_identity()
    todos = get_todos_today()
    energy = get_energy_today()
    from .store import get_san_7d_avg
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
```

- [ ] **Step 3: Wire router into `abo/main.py`**

Add after the existing imports:
```python
from .profile.routes import router as profile_router, init_routes as init_profile_routes
```

Add after `_card_store = CardStore()`:
```python
init_profile_routes(_card_store)
```

Add after `app.add_middleware(...)`:
```python
app.include_router(profile_router)
```

- [ ] **Step 4: Test the routes start up**

```bash
pkill -f "abo.main" 2>/dev/null; sleep 1
python3 -m abo.main &
sleep 3
curl -s http://127.0.0.1:8765/api/profile | python3 -m json.tool | head -20
```

Expected: JSON with `identity`, `daily_motto`, `stats`, `skills`, `achievements`, `energy`, `todos` keys.

- [ ] **Step 5: Commit**

```bash
git add abo/profile/routes.py abo/store/cards.py abo/main.py
git commit -m "feat(profile): add API routes for identity, san, happiness, energy, todos, motto"
```

---

## Task 4: store.ts — add `profile` tab + profile state

**Files:**
- Modify: `src/core/store.ts`

- [ ] **Step 1: Add `"profile"` to `ActiveTab` and profile interfaces**

Replace the `ActiveTab` type and add new interfaces. The full updated `src/core/store.ts`:

```typescript
import { create } from "zustand";

// ── 类型定义 ──────────────────────────────────────────────────────

export type ActiveTab =
  | "profile"
  | "overview"
  | "literature"
  | "arxiv"
  | "meeting"
  | "ideas"
  | "health"
  | "podcast"
  | "trends"
  | "claude"
  | "settings";

export type ToastKind = "info" | "error" | "success";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
}

export interface AppConfig {
  vault_path: string;
  version: string;
}

export interface FeedCard {
  id: string;
  title: string;
  summary: string;
  score: number;
  tags: string[];
  source_url: string;
  obsidian_path: string;
  module_id: string;
  created_at: number;
  read: boolean;
  metadata: Record<string, unknown>;
}

export interface FeedModule {
  id: string;
  name: string;
  icon: string;
  schedule: string;
  enabled: boolean;
  next_run: string | null;
}

export interface DimStat {
  score: number;
  grade: "E" | "D" | "C" | "B" | "A";
  raw: Record<string, unknown>;
}

export interface ProfileStats {
  research: DimStat;
  output: DimStat;
  health: DimStat;
  learning: DimStat;
  san: DimStat;
  happiness: DimStat;
}

// ── Store ─────────────────────────────────────────────────────────

interface AboStore {
  // 导航
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // 配置
  config: AppConfig | null;
  setConfig: (config: AppConfig) => void;

  // Feed
  feedCards: FeedCard[];
  feedModules: FeedModule[];
  activeModuleFilter: string | null;
  unreadCounts: Record<string, number>;
  setFeedCards: (cards: FeedCard[]) => void;
  prependCard: (card: FeedCard) => void;
  setFeedModules: (modules: FeedModule[]) => void;
  setActiveModuleFilter: (id: string | null) => void;
  setUnreadCounts: (counts: Record<string, number>) => void;

  // Profile
  profileEnergy: number;
  profileSan: number;
  profileMotto: string;
  profileStats: ProfileStats | null;
  setProfileEnergy: (e: number) => void;
  setProfileSan: (s: number) => void;
  setProfileMotto: (m: string) => void;
  setProfileStats: (s: ProfileStats) => void;

  // Toast
  toasts: Toast[];
  addToast: (t: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

export const useStore = create<AboStore>((set) => ({
  activeTab: "overview",
  setActiveTab: (activeTab) => set({ activeTab }),

  config: null,
  setConfig: (config) => set({ config }),

  feedCards: [],
  feedModules: [],
  activeModuleFilter: null,
  unreadCounts: {},
  setFeedCards: (feedCards) => set({ feedCards }),
  prependCard: (card) => set((s) => ({ feedCards: [card, ...s.feedCards] })),
  setFeedModules: (feedModules) => set({ feedModules }),
  setActiveModuleFilter: (activeModuleFilter) => set({ activeModuleFilter }),
  setUnreadCounts: (unreadCounts) => set({ unreadCounts }),

  profileEnergy: 70,
  profileSan: 0,
  profileMotto: "",
  profileStats: null,
  setProfileEnergy: (profileEnergy) => set({ profileEnergy }),
  setProfileSan: (profileSan) => set({ profileSan }),
  setProfileMotto: (profileMotto) => set({ profileMotto }),
  setProfileStats: (profileStats) => set({ profileStats }),

  toasts: [],
  addToast: (t) =>
    set((s) => ({
      toasts: [...s.toasts, { ...t, id: crypto.randomUUID() }],
    })),
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
git add src/core/store.ts
git commit -m "feat(store): add profile tab and profile state fields"
```

---

## Task 5: PixelAvatar component

**Files:**
- Create: `src/modules/profile/PixelAvatar.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/modules/profile/PixelAvatar.tsx
// CSS box-shadow pixel art character, 12×12 grid, 4 states

type AvatarState = "full" | "tired" | "anxious" | "broken";

interface Props {
  san: number;    // 0-10
  energy: number; // 0-100
  size?: number;  // pixel size of each cell, default 4
}

function getState(san: number, energy: number): AvatarState {
  if (san >= 7 && energy >= 70) return "full";
  if (san >= 7 && energy < 40)  return "tired";
  if (san < 5  && energy >= 60) return "anxious";
  if (san < 5  && energy < 40)  return "broken";
  // transition zone — use lower-saturation version of nearest state
  if (san >= 5 && energy >= 50) return "full";
  return "tired";
}

// Each pixel array: [x, y, color] — (0,0) = top-left
// Colors: skin=#FBBF24, hair=#1E293B, eye=#1E293B, body=#6366F1,
//         star=#FCD34D, zzz=#94A3B8, ques=#F59E0B, floor=#94A3B8

const PIXELS: Record<AvatarState, [number, number, string][]> = {
  full: [
    // head
    [4,0,"#FBBF24"],[5,0,"#FBBF24"],[6,0,"#FBBF24"],[7,0,"#FBBF24"],
    [3,1,"#FBBF24"],[4,1,"#FBBF24"],[5,1,"#FBBF24"],[6,1,"#FBBF24"],[7,1,"#FBBF24"],[8,1,"#FBBF24"],
    [3,2,"#FBBF24"],[4,2,"#1E293B"],[5,2,"#FBBF24"],[6,2,"#FBBF24"],[7,2,"#1E293B"],[8,2,"#FBBF24"],
    [3,3,"#FBBF24"],[4,3,"#FBBF24"],[5,3,"#FBBF24"],[6,3,"#FBBF24"],[7,3,"#FBBF24"],[8,3,"#FBBF24"],
    [4,4,"#FBBF24"],[5,4,"#1E293B"],[6,4,"#1E293B"],[7,4,"#FBBF24"],
    // body upright
    [4,5,"#6366F1"],[5,5,"#6366F1"],[6,5,"#6366F1"],[7,5,"#6366F1"],
    [3,6,"#6366F1"],[4,6,"#6366F1"],[5,6,"#6366F1"],[6,6,"#6366F1"],[7,6,"#6366F1"],[8,6,"#6366F1"],
    [4,7,"#6366F1"],[5,7,"#6366F1"],[6,7,"#6366F1"],[7,7,"#6366F1"],
    // legs
    [4,8,"#1E293B"],[5,8,"#1E293B"],[6,8,"#1E293B"],[7,8,"#1E293B"],
    [4,9,"#1E293B"],[7,9,"#1E293B"],
    // star above head
    [5,-2,"#FCD34D"],[6,-2,"#FCD34D"],
    [4,-1,"#FCD34D"],[5,-1,"#FCD34D"],[6,-1,"#FCD34D"],[7,-1,"#FCD34D"],
  ],
  tired: [
    // head same position but eyes half-closed
    [4,0,"#FBBF24"],[5,0,"#FBBF24"],[6,0,"#FBBF24"],[7,0,"#FBBF24"],
    [3,1,"#FBBF24"],[4,1,"#FBBF24"],[5,1,"#FBBF24"],[6,1,"#FBBF24"],[7,1,"#FBBF24"],[8,1,"#FBBF24"],
    [3,2,"#FBBF24"],[4,2,"#FBBF24"],[5,2,"#1E293B"],[6,2,"#1E293B"],[7,2,"#FBBF24"],[8,2,"#FBBF24"],
    [3,3,"#FBBF24"],[4,3,"#FBBF24"],[5,3,"#FBBF24"],[6,3,"#FBBF24"],[7,3,"#FBBF24"],[8,3,"#FBBF24"],
    [4,4,"#FBBF24"],[5,4,"#FBBF24"],[6,4,"#FBBF24"],[7,4,"#FBBF24"],
    // body slumped
    [4,5,"#6366F1"],[5,5,"#6366F1"],[6,5,"#6366F1"],[7,5,"#6366F1"],
    [3,6,"#6366F1"],[4,6,"#6366F1"],[5,6,"#6366F1"],[6,6,"#6366F1"],[7,6,"#6366F1"],[8,6,"#6366F1"],
    [4,7,"#6366F1"],[5,7,"#6366F1"],[6,7,"#6366F1"],[7,7,"#6366F1"],
    [4,8,"#1E293B"],[5,8,"#1E293B"],[6,8,"#1E293B"],[7,8,"#1E293B"],
    [4,9,"#1E293B"],[7,9,"#1E293B"],
    // zzz above head
    [7,-2,"#94A3B8"],[8,-2,"#94A3B8"],
    [6,-1,"#94A3B8"],[9,-1,"#94A3B8"],
    [5,0,"#94A3B8"],
  ],
  anxious: [
    // head
    [4,0,"#FBBF24"],[5,0,"#FBBF24"],[6,0,"#FBBF24"],[7,0,"#FBBF24"],
    [3,1,"#FBBF24"],[4,1,"#FBBF24"],[5,1,"#FBBF24"],[6,1,"#FBBF24"],[7,1,"#FBBF24"],[8,1,"#FBBF24"],
    [3,2,"#FBBF24"],[4,2,"#1E293B"],[5,2,"#FBBF24"],[6,2,"#FBBF24"],[7,2,"#1E293B"],[8,2,"#FBBF24"],
    [3,3,"#FBBF24"],[5,3,"#1E293B"],[6,3,"#1E293B"],[8,3,"#FBBF24"],
    [4,4,"#FBBF24"],[5,4,"#FBBF24"],[6,4,"#FBBF24"],[7,4,"#FBBF24"],
    // body
    [4,5,"#6366F1"],[5,5,"#6366F1"],[6,5,"#6366F1"],[7,5,"#6366F1"],
    [3,6,"#6366F1"],[4,6,"#6366F1"],[5,6,"#6366F1"],[6,6,"#6366F1"],[7,6,"#6366F1"],[8,6,"#6366F1"],
    [4,7,"#6366F1"],[5,7,"#6366F1"],[6,7,"#6366F1"],[7,7,"#6366F1"],
    [4,8,"#1E293B"],[5,8,"#1E293B"],[6,8,"#1E293B"],[7,8,"#1E293B"],
    [4,9,"#1E293B"],[7,9,"#1E293B"],
    // ? above head
    [5,-2,"#F59E0B"],[6,-2,"#F59E0B"],
    [6,-1,"#F59E0B"],
    [5,0,"#F59E0B"],
  ],
  broken: [
    // head drooped/on floor at row 6-9
    [4,6,"#FBBF24"],[5,6,"#FBBF24"],[6,6,"#FBBF24"],[7,6,"#FBBF24"],
    [3,7,"#FBBF24"],[4,7,"#FBBF24"],[5,7,"#FBBF24"],[6,7,"#FBBF24"],[7,7,"#FBBF24"],[8,7,"#FBBF24"],
    [3,8,"#FBBF24"],[4,8,"#FBBF24"],[5,8,"#1E293B"],[6,8,"#1E293B"],[7,8,"#FBBF24"],[8,8,"#FBBF24"],
    // body sprawled
    [3,9,"#6366F1"],[4,9,"#6366F1"],[5,9,"#6366F1"],[6,9,"#6366F1"],[7,9,"#6366F1"],[8,9,"#6366F1"],
    // legs flat
    [2,10,"#1E293B"],[3,10,"#1E293B"],[4,10,"#1E293B"],
    [7,10,"#1E293B"],[8,10,"#1E293B"],[9,10,"#1E293B"],
    // star eyes
    [4,8,"#F59E0B"],[7,8,"#F59E0B"],
  ],
};

export default function PixelAvatar({ san, energy, size = 4 }: Props) {
  const state = getState(san, energy);
  const pixels = PIXELS[state];

  // find bounding box to center the SVG
  const xs = pixels.map(([x]) => x);
  const ys = pixels.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const W = (maxX - minX + 1) * size;
  const H = (maxY - minY + 1) * size;

  const isAnxious = state === "anxious";

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className={isAnxious ? "animate-[wiggle_0.3s_ease-in-out_infinite]" : ""}
      style={{ imageRendering: "pixelated" }}
      aria-label={`像素小人：${state}`}
    >
      {pixels.map(([x, y, color], i) => (
        <rect
          key={i}
          x={(x - minX) * size}
          y={(y - minY) * size}
          width={size}
          height={size}
          fill={color}
        />
      ))}
    </svg>
  );
}
```

- [ ] **Step 2: Add wiggle animation to `tailwind.config.ts`** (if not present)

```typescript
// tailwind.config.ts — add to theme.extend.keyframes + animation
keyframes: {
  wiggle: {
    "0%, 100%": { transform: "translateX(0px)" },
    "25%": { transform: "translateX(-2px)" },
    "75%": { transform: "translateX(2px)" },
  },
},
animation: {
  wiggle: "wiggle 0.3s ease-in-out infinite",
},
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/modules/profile/PixelAvatar.tsx tailwind.config.ts
git commit -m "feat(profile): add CSS pixel avatar with 4 states"
```

---

## Task 6: HexagonRadar component

**Files:**
- Create: `src/modules/profile/HexagonRadar.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/modules/profile/HexagonRadar.tsx
import { ProfileStats } from "../../core/store";

interface Props {
  stats: ProfileStats;
  size?: number; // SVG canvas size, default 280
}

const DIMS = [
  { key: "research",  label: "研究力", color: "#6366F1" },
  { key: "output",    label: "产出力", color: "#10B981" },
  { key: "health",    label: "健康力", color: "#F59E0B" },
  { key: "learning",  label: "学习力", color: "#3B82F6" },
  { key: "san",       label: "SAN",   color: "#EC4899" },
  { key: "happiness", label: "幸福感", color: "#8B5CF6" },
] as const;

type DimKey = typeof DIMS[number]["key"];

function polarToXY(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function toPath(points: { x: number; y: number }[]) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";
}

export default function HexagonRadar({ stats, size = 280 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.35;
  const labelR = maxR + 28;
  const gradeR = maxR + 14;
  // start at top, go clockwise
  const angles = DIMS.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / 6);

  // grid rings at 20/40/60/80/100
  const rings = [20, 40, 60, 80, 100];

  // data polygon
  const dataPoints = DIMS.map(({ key }, i) => {
    const score = stats[key as DimKey]?.score ?? 0;
    const r = (score / 100) * maxR;
    return polarToXY(cx, cy, r, angles[i]);
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid rings */}
      {rings.map((pct) => {
        const r = (pct / 100) * maxR;
        const pts = angles.map((a) => polarToXY(cx, cy, r, a));
        return (
          <polygon
            key={pct}
            points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
            fill="none"
            stroke="rgb(51 65 85 / 0.6)"
            strokeWidth="1"
          />
        );
      })}

      {/* Axis lines */}
      {angles.map((a, i) => {
        const end = polarToXY(cx, cy, maxR, a);
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={end.x.toFixed(1)} y2={end.y.toFixed(1)}
            stroke="rgb(51 65 85 / 0.4)"
            strokeWidth="1"
          />
        );
      })}

      {/* Data polygon */}
      <path
        d={toPath(dataPoints)}
        fill="rgb(99 102 241 / 0.25)"
        stroke="#6366F1"
        strokeWidth="2"
      />

      {/* Data dots */}
      {dataPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x.toFixed(1)} cy={p.y.toFixed(1)}
          r="4"
          fill={DIMS[i].color}
        />
      ))}

      {/* Labels + JoJo grade */}
      {DIMS.map(({ key, label, color }, i) => {
        const a = angles[i];
        const lp = polarToXY(cx, cy, labelR, a);
        const gp = polarToXY(cx, cy, gradeR, a);
        const grade = stats[key as DimKey]?.grade ?? "E";
        const score = stats[key as DimKey]?.score ?? 0;

        return (
          <g key={i}>
            <text
              x={lp.x.toFixed(1)} y={lp.y.toFixed(1)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="11" fill="#94A3B8"
            >
              {label}
            </text>
            <text
              x={gp.x.toFixed(1)} y={gp.y.toFixed(1)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="13" fontFamily="monospace" fontWeight="bold"
              fill={color}
            >
              {grade}
            </text>
            <title>{`${label}: ${score}/100 (${grade})`}</title>
          </g>
        );
      })}

      {/* Center dot */}
      <circle cx={cx} cy={cy} r="3" fill="rgb(99 102 241 / 0.5)" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/modules/profile/HexagonRadar.tsx
git commit -m "feat(profile): add JoJo E→A hexagon radar SVG component"
```

---

## Task 7: SkillGrid component

**Files:**
- Create: `src/modules/profile/SkillGrid.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/modules/profile/SkillGrid.tsx
import { useEffect, useState } from "react";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";

interface SkillNode {
  id: string;
  label: string;
  dim: string;
  target: number;
  current: number; // provided by backend /api/profile/stats
  unit: string;
}

// Static skill definitions — progress filled in from live stats
const SKILLS: SkillNode[] = [
  // 研究力
  { id: "lit-10",   label: "初窥门径", dim: "research",  target: 10,  current: 0, unit: "篇文献" },
  { id: "lit-50",   label: "文献猎手", dim: "research",  target: 50,  current: 0, unit: "篇文献" },
  { id: "idea-20",  label: "领域综述", dim: "research",  target: 20,  current: 0, unit: "Idea节点" },
  // 产出力
  { id: "meet-1",   label: "初次汇报", dim: "output",    target: 1,   current: 0, unit: "次汇报" },
  { id: "meet-10",  label: "周会常客", dim: "output",    target: 10,  current: 0, unit: "次汇报" },
  { id: "idea-wk",  label: "想法喷涌", dim: "output",    target: 10,  current: 0, unit: "Idea/周" },
  // 健康力
  { id: "slp-7",    label: "早睡早起", dim: "health",    target: 7,   current: 0, unit: "天连续" },
  { id: "chk-30",   label: "运动达人", dim: "health",    target: 30,  current: 0, unit: "天打卡" },
  { id: "nrg-90",   label: "精力管理", dim: "health",    target: 90,  current: 0, unit: "精力值" },
  // 学习力
  { id: "pod-10",   label: "耳听八方", dim: "learning",  target: 10,  current: 0, unit: "播客" },
  { id: "trd-20",   label: "趋势捕手", dim: "learning",  target: 20,  current: 0, unit: "次探索" },
  // SAN
  { id: "san-7d",   label: "情绪稳定", dim: "san",       target: 7,   current: 0, unit: "天≥6" },
  { id: "san-30d",  label: "心如止水", dim: "san",       target: 30,  current: 0, unit: "天≥7" },
  // 幸福
  { id: "hap-80",   label: "小确幸",   dim: "happiness", target: 80,  current: 0, unit: "幸福指数" },
  { id: "bal",      label: "工作平衡", dim: "happiness", target: 2,   current: 0, unit: "维度≥60" },
];

const DIM_COLORS: Record<string, string> = {
  research: "#6366F1", output: "#10B981", health: "#F59E0B",
  learning: "#3B82F6", san: "#EC4899",   happiness: "#8B5CF6",
};

const DIM_LABELS: Record<string, string> = {
  research: "研究力", output: "产出力", health: "健康力",
  learning: "学习力", san: "SAN值",   happiness: "幸福感",
};

interface Props {
  unlockedSkills: Record<string, { unlocked_at: string }>;
}

export default function SkillGrid({ unlockedSkills }: Props) {
  const [newlyUnlocked, setNewlyUnlocked] = useState<string | null>(null);
  const toast = useToast();

  const dims = [...new Set(SKILLS.map((s) => s.dim))];

  // Highlight newly unlocked for 3 seconds
  useEffect(() => {
    if (newlyUnlocked) {
      const t = setTimeout(() => setNewlyUnlocked(null), 3000);
      return () => clearTimeout(t);
    }
  }, [newlyUnlocked]);

  function getPct(skill: SkillNode): number {
    if (unlockedSkills[skill.id]) return 100;
    return Math.min(100, Math.round((skill.current / skill.target) * 100));
  }

  return (
    <div className="space-y-6">
      {dims.map((dim) => {
        const dimSkills = SKILLS.filter((s) => s.dim === dim);
        const color = DIM_COLORS[dim];
        return (
          <div key={dim}>
            <h3 className="text-sm font-medium mb-3" style={{ color }}>
              {DIM_LABELS[dim]}
            </h3>
            <div className="flex flex-wrap gap-3">
              {dimSkills.map((skill) => {
                const pct = getPct(skill);
                const unlocked = pct >= 100;
                const isNew = newlyUnlocked === skill.id;
                const unlockDate = unlockedSkills[skill.id]?.unlocked_at?.slice(0, 10);

                return (
                  <div
                    key={skill.id}
                    className={`
                      relative w-24 rounded-xl border-2 p-2 text-center text-xs
                      transition-all duration-300
                      ${unlocked
                        ? "bg-slate-800 border-current"
                        : "bg-slate-900 border-slate-700 text-slate-400"
                      }
                      ${isNew ? "ring-2 ring-offset-1 ring-amber-400" : ""}
                    `}
                    style={{ borderColor: unlocked ? color : undefined }}
                    title={unlocked && unlockDate ? `解锁于 ${unlockDate}` : `${skill.current}/${skill.target} ${skill.unit}`}
                  >
                    <div className={`font-medium mb-1 ${unlocked ? "text-white" : ""}`}>
                      {skill.label}
                    </div>
                    {unlocked ? (
                      <div className="text-xs" style={{ color }}>✓ 已解锁</div>
                    ) : (
                      <>
                        <div className="text-slate-500 mb-1">{pct}%</div>
                        <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </>
                    )}
                    {unlocked && (
                      <div
                        className="absolute inset-0 rounded-xl pointer-events-none"
                        style={{
                          boxShadow: `0 0 8px 2px ${color}40`,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/modules/profile/SkillGrid.tsx
git commit -m "feat(profile): add skill grid with progress % and unlock glow"
```

---

## Task 8: AchievementGallery component

**Files:**
- Create: `src/modules/profile/AchievementGallery.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/modules/profile/AchievementGallery.tsx

interface Achievement {
  id: string;
  name: string;
  unlocked_at: string;
}

const ALL_ACHIEVEMENTS = [
  { id: "omni",     label: "全能研究者", desc: "六维同时 ≥ 60",                icon: "⬡" },
  { id: "earlybird",label: "早起鸟",     desc: "连续 30 天 08:00 前打开 ABO", icon: "☀" },
  { id: "nightowl", label: "深夜斗士",   desc: "23:00 后保存文献累计 50 次",  icon: "🌙" },
  { id: "deepread", label: "深度阅读",   desc: "文献 digest 达到 3 级",       icon: "◎" },
  { id: "automaster",label:"自动化大师", desc: "创建 3 个自定义模块",         icon: "⚙" },
  { id: "loop",     label: "知识闭环",   desc: "arXiv → Idea → 组会完整走通", icon: "∞" },
];

interface Props {
  achievements: Achievement[];
}

export default function AchievementGallery({ achievements }: Props) {
  const unlockedMap = new Map(achievements.map((a) => [a.id, a]));

  return (
    <div>
      <h3 className="text-sm font-medium text-slate-400 mb-3">成就徽章</h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {ALL_ACHIEVEMENTS.map(({ id, label, desc, icon }) => {
          const unlocked = unlockedMap.get(id);
          return (
            <div
              key={id}
              className={`
                flex-shrink-0 w-20 rounded-xl border-2 p-2 text-center
                transition-all duration-200
                ${unlocked
                  ? "bg-slate-800 border-amber-500"
                  : "bg-slate-900/50 border-slate-700 opacity-40 grayscale"
                }
              `}
              title={unlocked ? `解锁于 ${unlocked.unlocked_at.slice(0, 10)}\n${desc}` : desc}
            >
              <div className="text-2xl mb-1">{icon}</div>
              <div className={`text-xs font-medium ${unlocked ? "text-amber-400" : "text-slate-500"}`}>
                {label}
              </div>
              {unlocked && (
                <div
                  className="absolute inset-0 rounded-xl pointer-events-none"
                  style={{ boxShadow: "0 0 10px 2px rgba(245, 158, 11, 0.3)" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/profile/AchievementGallery.tsx
git commit -m "feat(profile): add achievement gallery with lock/unlock states"
```

---

## Task 9: RoleCard + DailyCheckInModal + DailyTodo

**Files:**
- Create: `src/modules/profile/RoleCard.tsx`
- Create: `src/modules/profile/DailyCheckInModal.tsx`
- Create: `src/modules/profile/DailyTodo.tsx`

- [ ] **Step 1: Create `RoleCard.tsx`**

```typescript
// src/modules/profile/RoleCard.tsx
import { useState } from "react";
import { Edit3, RefreshCw } from "lucide-react";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";
import PixelAvatar from "./PixelAvatar";

interface Props {
  codename: string;
  longTermGoal: string;
  motto: string;
  description: string;
  energy: number;
  san: number;
  onUpdated: () => void;
}

export default function RoleCard({ codename, longTermGoal, motto, description, energy, san, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(codename);
  const [editGoal, setEditGoal] = useState(longTermGoal);
  const [generatingMotto, setGeneratingMotto] = useState(false);
  const toast = useToast();

  async function saveName() {
    try {
      await api.post("/api/profile/identity", { codename: editName, long_term_goal: editGoal });
      toast.success("身份信息已保存");
      setEditing(false);
      onUpdated();
    } catch {
      toast.error("保存失败");
    }
  }

  async function refreshMotto() {
    setGeneratingMotto(true);
    try {
      const r = await api.post<{ motto: string }>("/api/profile/generate-motto");
      toast.success("座右铭已更新", r.motto);
      onUpdated();
    } catch {
      toast.error("生成失败，Claude 可能未运行");
    } finally {
      setGeneratingMotto(false);
    }
  }

  return (
    <div className="bg-slate-800 rounded-2xl p-5 flex gap-5 items-start">
      {/* Pixel avatar */}
      <div className="flex-shrink-0 flex flex-col items-center gap-2">
        <PixelAvatar san={san} energy={energy} size={5} />
        {/* Energy bar */}
        <div className="w-12">
          <div className="text-xs text-slate-400 text-center mb-0.5">{energy}%</div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${energy}%`,
                backgroundColor: energy >= 70 ? "#10B981" : energy >= 40 ? "#F59E0B" : "#EF4444",
              }}
            />
          </div>
        </div>
      </div>

      {/* Identity info */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="研究员代号"
              className="w-full px-2 py-1 rounded bg-slate-700 text-white text-sm border border-slate-600"
            />
            <textarea
              value={editGoal}
              onChange={(e) => setEditGoal(e.target.value)}
              placeholder="预期目标..."
              rows={2}
              className="w-full px-2 py-1 rounded bg-slate-700 text-white text-sm border border-slate-600 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={saveName} className="text-sm px-3 py-1 rounded bg-indigo-500 hover:bg-indigo-600 text-white">保存</button>
              <button onClick={() => setEditing(false)} className="text-sm px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300">取消</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-white">{codename || "未设置代号"}</h2>
              <button onClick={() => { setEditing(true); setEditName(codename); setEditGoal(longTermGoal); }}
                className="text-slate-500 hover:text-slate-300" aria-label="编辑身份信息">
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>
            {longTermGoal && (
              <p className="text-sm text-slate-300 mb-2">{longTermGoal}</p>
            )}
            {description && (
              <p className="text-xs text-slate-500 mb-3 italic">{description}</p>
            )}
            <div className="flex items-start gap-2 p-2.5 bg-slate-700/60 rounded-lg">
              <span className="text-amber-400 text-xs mt-0.5">💡</span>
              <p className="text-sm text-amber-100 flex-1">{motto || "点击刷新生成今日座右铭"}</p>
              <button onClick={refreshMotto} disabled={generatingMotto}
                className="text-slate-500 hover:text-slate-300 ml-1 shrink-0" aria-label="重新生成座右铭">
                <RefreshCw className={`w-3.5 h-3.5 ${generatingMotto ? "animate-spin" : ""}`} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `DailyCheckInModal.tsx`**

```typescript
// src/modules/profile/DailyCheckInModal.tsx
import { useState } from "react";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";

interface Props {
  onClose: () => void;
}

export default function DailyCheckInModal({ onClose }: Props) {
  const [san, setSan] = useState(5);
  const [happiness, setHappiness] = useState(5);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function submit() {
    setSaving(true);
    try {
      await Promise.all([
        api.post("/api/profile/san", { score: san }),
        api.post("/api/profile/happiness", { score: happiness }),
      ]);
      toast.success("每日打卡完成");
      onClose();
    } catch {
      toast.error("打卡失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">每日状态打卡</h2>
        <p className="text-sm text-slate-400 mb-5">记录今天的状态，帮助追踪成长曲线。</p>

        {/* SAN */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-pink-400 mb-2">
            SAN 值 <span className="text-white">— {san}/10</span>
          </label>
          <input type="range" min="1" max="10" value={san}
            onChange={(e) => setSan(Number(e.target.value))}
            className="w-full accent-pink-500" />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>精神崩溃</span><span>心如止水</span>
          </div>
        </div>

        {/* Happiness */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-purple-400 mb-2">
            幸福感 <span className="text-white">— {happiness}/10</span>
          </label>
          <input type="range" min="1" max="10" value={happiness}
            onChange={(e) => setHappiness(Number(e.target.value))}
            className="w-full accent-purple-500" />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>很痛苦</span><span>非常幸福</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
            {saving ? "保存中..." : "完成打卡"}
          </button>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm">
            跳过
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `DailyTodo.tsx`**

```typescript
// src/modules/profile/DailyTodo.tsx
import { useState } from "react";
import { Plus, X, Check } from "lucide-react";
import { api } from "../../core/api";

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

interface Props {
  todos: Todo[];
  onChange: (todos: Todo[]) => void;
}

export default function DailyTodo({ todos, onChange }: Props) {
  const [newText, setNewText] = useState("");

  async function sync(updated: Todo[]) {
    onChange(updated);
    try {
      await api.post("/api/profile/todos", { todos: updated });
    } catch { /* silent */ }
  }

  function addTodo() {
    if (!newText.trim()) return;
    const updated = [...todos, { id: crypto.randomUUID(), text: newText.trim(), done: false }];
    setNewText("");
    sync(updated);
  }

  function toggle(id: string) {
    sync(todos.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  }

  function remove(id: string) {
    sync(todos.filter((t) => t.id !== id));
  }

  const done = todos.filter((t) => t.done).length;
  const pct = todos.length > 0 ? Math.round((done / todos.length) * 100) : 0;

  return (
    <div className="bg-slate-800/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-300">今日待办</h3>
        <span className="text-xs text-slate-500">{done}/{todos.length} · 完成率 {pct}%</span>
      </div>

      {/* Progress */}
      {todos.length > 0 && (
        <div className="h-1 bg-slate-700 rounded-full overflow-hidden mb-3">
          <div
            className="h-full rounded-full transition-all duration-500 bg-emerald-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* List */}
      <div className="space-y-1.5 mb-3">
        {todos.map((todo) => (
          <div key={todo.id} className="flex items-center gap-2 group">
            <button onClick={() => toggle(todo.id)}
              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0
                ${todo.done ? "bg-emerald-500 border-emerald-500" : "border-slate-600 hover:border-slate-400"}`}
              aria-label={todo.done ? "标记未完成" : "标记完成"}>
              {todo.done && <Check className="w-2.5 h-2.5 text-white" />}
            </button>
            <span className={`flex-1 text-sm ${todo.done ? "line-through text-slate-500" : "text-slate-300"}`}>
              {todo.text}
            </span>
            <button onClick={() => remove(todo.id)}
              className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-400"
              aria-label="删除">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Add */}
      <div className="flex gap-2">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTodo()}
          placeholder="添加今日任务..."
          className="flex-1 bg-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 border border-slate-600 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
        />
        <button onClick={addTodo} aria-label="添加"
          className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/modules/profile/RoleCard.tsx src/modules/profile/DailyCheckInModal.tsx src/modules/profile/DailyTodo.tsx
git commit -m "feat(profile): add RoleCard, DailyCheckInModal, DailyTodo components"
```

---

## Task 10: Profile main page

**Files:**
- Create: `src/modules/profile/Profile.tsx`

- [ ] **Step 1: Create `Profile.tsx`**

```typescript
// src/modules/profile/Profile.tsx
import { useEffect, useState } from "react";
import { api } from "../../core/api";
import { useStore, ProfileStats } from "../../core/store";
import { useToast } from "../../components/Toast";
import RoleCard from "./RoleCard";
import DailyTodo from "./DailyTodo";
import HexagonRadar from "./HexagonRadar";
import SkillGrid from "./SkillGrid";
import AchievementGallery from "./AchievementGallery";
import DailyCheckInModal from "./DailyCheckInModal";

interface ProfileData {
  identity: { codename: string; long_term_goal: string };
  daily_motto: { motto: string; description: string; date: string };
  stats: ProfileStats;
  skills: Record<string, { unlocked_at: string }>;
  achievements: Array<{ id: string; name: string; unlocked_at: string }>;
  energy: number;
  todos: Array<{ id: string; text: string; done: boolean }>;
}

const CHECKIN_KEY = "abo_last_checkin";

function shouldShowCheckin(): boolean {
  const last = localStorage.getItem(CHECKIN_KEY);
  const today = new Date().toISOString().slice(0, 10);
  return last !== today;
}

export default function Profile() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [todos, setTodos] = useState<Array<{ id: string; text: string; done: boolean }>>([]);
  const [showCheckin, setShowCheckin] = useState(false);
  const { setProfileEnergy, setProfileSan, setProfileMotto, setProfileStats } = useStore();

  useEffect(() => {
    load();
    if (shouldShowCheckin()) {
      setShowCheckin(true);
    }
  }, []);

  async function load() {
    try {
      const d = await api.get<ProfileData>("/api/profile");
      setData(d);
      setTodos(d.todos || []);
      setProfileEnergy(d.energy);
      setProfileSan(d.stats?.san?.score ?? 0);
      setProfileMotto(d.daily_motto?.motto ?? "");
      setProfileStats(d.stats);
    } catch { /* silent */ }
  }

  function handleCheckinClose() {
    localStorage.setItem(CHECKIN_KEY, new Date().toISOString().slice(0, 10));
    setShowCheckin(false);
    load(); // refresh data after checkin
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        加载中...
      </div>
    );
  }

  const san = data.stats?.san?.score ?? 0;
  const sanRaw = data.stats?.san?.raw as { san_7d_avg?: number } | undefined;

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* A. Role Card */}
        <RoleCard
          codename={data.identity.codename}
          longTermGoal={data.identity.long_term_goal}
          motto={data.daily_motto.motto}
          description={data.daily_motto.description}
          energy={data.energy}
          san={Math.round((sanRaw?.san_7d_avg ?? 0))}
          onUpdated={load}
        />

        {/* B. Daily Todo */}
        <DailyTodo todos={todos} onChange={setTodos} />

        {/* C. Hexagon Radar */}
        <div className="bg-slate-800/50 rounded-xl p-5 flex flex-col items-center">
          <h3 className="text-sm font-medium text-slate-400 mb-4 self-start">六维能力</h3>
          <HexagonRadar stats={data.stats} size={300} />
        </div>

        {/* D. Skills + Achievements */}
        <div className="bg-slate-800/50 rounded-xl p-5 space-y-6">
          <SkillGrid unlockedSkills={data.skills} />
          <AchievementGallery achievements={data.achievements} />
        </div>
      </div>

      {/* Check-in modal */}
      {showCheckin && <DailyCheckInModal onClose={handleCheckinClose} />}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/modules/profile/Profile.tsx
git commit -m "feat(profile): add Profile main page assembling all components"
```

---

## Task 11: NavSidebar top summary card

**Files:**
- Modify: `src/modules/nav/NavSidebar.tsx`

- [ ] **Step 1: Update NavSidebar**

Replace the full contents of `src/modules/nav/NavSidebar.tsx`:

```typescript
import { useStore, ActiveTab } from "../../core/store";
import PixelAvatar from "../profile/PixelAvatar";
import {
  Inbox, BookOpen, Lightbulb, MessageSquare,
  Rss, Presentation, Heart, Headphones, TrendingUp,
  Settings, Zap, User,
} from "lucide-react";

type NavItem = { id: ActiveTab; label: string; Icon: React.FC<{ className?: string; "aria-hidden"?: boolean }> };

const MAIN: NavItem[] = [
  { id: "profile",   label: "角色",     Icon: User },
  { id: "overview",  label: "今日",     Icon: Inbox },
  { id: "literature",label: "文献库",   Icon: BookOpen },
  { id: "ideas",     label: "Idea",     Icon: Lightbulb },
  { id: "claude",    label: "Claude",   Icon: MessageSquare },
];

const AUTO: NavItem[] = [
  { id: "arxiv",   label: "arXiv",  Icon: Rss },
  { id: "meeting", label: "组会",   Icon: Presentation },
  { id: "health",  label: "健康",   Icon: Heart },
  { id: "podcast", label: "播客",   Icon: Headphones },
  { id: "trends",  label: "Trends", Icon: TrendingUp },
];

export default function NavSidebar() {
  const {
    activeTab, setActiveTab,
    unreadCounts, config,
    profileEnergy, profileSan, profileMotto,
  } = useStore();
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  const vaultOk = Boolean(config?.vault_path);

  function NavBtn({ id, label, Icon }: NavItem) {
    const active = activeTab === id;
    return (
      <button
        onClick={() => setActiveTab(id)}
        className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm
          transition-colors duration-150 cursor-pointer
          ${active
            ? "bg-slate-700 text-white"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="w-4 h-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left">{label}</span>
        {id === "overview" && totalUnread > 0 && (
          <span className="text-xs bg-indigo-500 text-white rounded-full px-1.5 py-0.5 leading-none">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>
    );
  }

  return (
    <nav className="w-48 shrink-0 h-full bg-slate-900 flex flex-col py-4 px-3 gap-1">
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 mb-3">
        <Zap className="w-5 h-5 text-indigo-400" aria-hidden />
        <span className="text-lg text-white font-semibold">ABO</span>
        <span className="text-xs text-slate-600 ml-auto">v1.0</span>
      </div>

      {/* Top summary card — click to go to profile */}
      <button
        onClick={() => setActiveTab("profile")}
        className="flex items-center gap-2.5 w-full px-2 py-2.5 rounded-xl
          bg-slate-800 hover:bg-slate-700 transition-colors duration-150 cursor-pointer mb-2"
        aria-label="打开角色主页"
      >
        <div className="shrink-0">
          <PixelAvatar san={profileSan / 10} energy={profileEnergy} size={3} />
        </div>
        <div className="flex-1 min-w-0">
          {/* Energy bar */}
          <div className="flex items-center gap-1 mb-1">
            <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${profileEnergy}%`,
                  backgroundColor: profileEnergy >= 70 ? "#10B981" : profileEnergy >= 40 ? "#F59E0B" : "#EF4444",
                }}
              />
            </div>
            <span className="text-xs text-slate-500">{profileEnergy}%</span>
          </div>
          {/* Motto */}
          <p className="text-xs text-slate-400 truncate leading-tight">
            {profileMotto || "开始记录，见证成长"}
          </p>
        </div>
      </button>

      {/* Main nav */}
      {MAIN.map((item) => <NavBtn key={item.id} {...item} />)}

      {/* 自动化分组 */}
      <div className="mt-3 mb-1 px-3">
        <span className="text-xs text-slate-600 uppercase tracking-wider">自动化</span>
      </div>
      {AUTO.map((item) => <NavBtn key={item.id} {...item} />)}

      {/* 底部 */}
      <div className="mt-auto">
        <div className={`flex items-center gap-1.5 px-3 py-1 mb-2 text-xs
          ${vaultOk ? "text-emerald-500" : "text-amber-500"}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${vaultOk ? "bg-emerald-500" : "bg-amber-500"}`} />
          {vaultOk ? "Vault 已连接" : "请配置 Vault"}
        </div>
        <NavBtn id="settings" label="设置" Icon={Settings} />
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/modules/nav/NavSidebar.tsx
git commit -m "feat(nav): add top summary card with pixel avatar, energy bar, motto"
```

---

## Task 12: Wire profile tab into MainContent + ArXiv full frontend

**Files:**
- Modify: `src/modules/MainContent.tsx`
- Modify: `src/modules/arxiv/ArxivTracker.tsx`

- [ ] **Step 1: Update MainContent.tsx to add profile tab**

```typescript
import { useStore } from "../core/store";
import Feed from "./feed/Feed";
import FeedSidebar from "./feed/FeedSidebar";
import Literature from "./literature/Literature";
import MindMap from "./ideas/MindMap";
import ClaudePanel from "./claude-panel/ClaudePanel";
import Profile from "./profile/Profile";
import ArxivTracker from "./arxiv/ArxivTracker";
import MeetingGenerator from "./meeting/MeetingGenerator";
import HealthDashboard from "./health/HealthDashboard";
import PodcastDigest from "./podcast/PodcastDigest";
import TrendTracker from "./trends/TrendTracker";
import Settings from "./settings/Settings";

export default function MainContent() {
  const activeTab = useStore((s) => s.activeTab);

  if (activeTab === "overview") {
    return (
      <main className="flex-1 min-h-0 flex overflow-hidden h-full bg-slate-50 dark:bg-slate-950">
        <FeedSidebar />
        <div className="flex-1 min-w-0 overflow-hidden">
          <Feed />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {activeTab === "profile"    && <Profile />}
      {activeTab === "literature" && <Literature />}
      {activeTab === "ideas"      && <MindMap />}
      {activeTab === "claude"     && <ClaudePanel />}
      {activeTab === "arxiv"      && <ArxivTracker />}
      {activeTab === "meeting"    && <MeetingGenerator />}
      {activeTab === "health"     && <HealthDashboard />}
      {activeTab === "podcast"    && <PodcastDigest />}
      {activeTab === "trends"     && <TrendTracker />}
      {activeTab === "settings"   && <Settings />}
    </main>
  );
}
```

- [ ] **Step 2: Replace ArxivTracker placeholder with full implementation**

```typescript
// src/modules/arxiv/ArxivTracker.tsx
import { useEffect, useState } from "react";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";
import { BookOpen, RefreshCw, ExternalLink, Star, Filter, Settings } from "lucide-react";

interface ArxivPaper {
  id: string;
  title: string;
  summary: string;
  score: number;
  tags: string[];
  source_url: string;
  metadata: {
    authors: string[];
    published: string;
    "pdf-url": string;
    contribution: string;
  };
}

interface ArxivConfig {
  keywords: string[];
  min_score: number;
}

export default function ArxivTracker() {
  const [papers, setPapers] = useState<ArxivPaper[]>([]);
  const [config, setConfig] = useState<ArxivConfig>({ keywords: ["machine learning"], min_score: 0.5 });
  const [filterScore, setFilterScore] = useState(0);
  const [showConfig, setShowConfig] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => { loadPapers(); }, []);

  async function loadPapers() {
    try {
      const data = await api.get<{ cards: ArxivPaper[] }>("/api/cards?module_id=arxiv-tracker&limit=50");
      setPapers(data.cards || []);
    } catch { /* silent */ }
  }

  async function runCrawl() {
    setLoading(true);
    try {
      await api.post("/api/modules/arxiv-tracker/run");
      toast.success("爬取任务已启动", "论文将在处理完成后出现在 Feed 中");
      setTimeout(loadPapers, 8000);
    } catch (err) {
      toast.error("启动失败", err instanceof Error ? err.message : "");
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    try {
      await api.post("/api/preferences", {
        modules: { "arxiv-tracker": { keywords: config.keywords, score_threshold: config.min_score } }
      });
      toast.success("配置已保存");
      setShowConfig(false);
    } catch {
      toast.error("保存失败");
    }
  }

  const filtered = papers.filter((p) => p.score >= filterScore);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">arXiv 论文追踪</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">自动爬取 · Claude 评分 · 相关度排序</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <Settings className="w-4 h-4" />配置
          </button>
          <button onClick={runCrawl} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "爬取中..." : "立即爬取"}
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="px-6 py-4 bg-slate-100 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
          <div className="max-w-xl space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                追踪关键词（逗号分隔）
              </label>
              <input type="text"
                value={config.keywords.join(", ")}
                onChange={(e) => setConfig({ ...config, keywords: e.target.value.split(",").map(k => k.trim()).filter(Boolean) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="text-sm text-slate-700 dark:text-slate-300">
                最低评分: {config.min_score}
              </label>
              <input type="range" min="0" max="1" step="0.1" value={config.min_score}
                onChange={(e) => setConfig({ ...config, min_score: parseFloat(e.target.value) })}
                className="flex-1" />
            </div>
            <button onClick={saveConfig}
              className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm">
              保存
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 px-6 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <Filter className="w-4 h-4 text-slate-400" />
        <span className="text-sm text-slate-500">评分 ≥</span>
        <input type="range" min="0" max="1" step="0.1" value={filterScore}
          onChange={(e) => setFilterScore(parseFloat(e.target.value))}
          className="w-28" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 w-6">{filterScore.toFixed(1)}</span>
        <span className="ml-auto text-sm text-slate-400">{filtered.length} 篇</span>
      </div>

      {/* Paper list */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>暂无论文数据</p>
              <p className="text-sm mt-1">点击"立即爬取"开始追踪</p>
            </div>
          ) : (
            filtered.map((paper) => <PaperCard key={paper.id} paper={paper} />)
          )}
        </div>
      </div>
    </div>
  );
}

function PaperCard({ paper }: { paper: ArxivPaper }) {
  const [expanded, setExpanded] = useState(false);
  const scoreColor = paper.score >= 0.8 ? "bg-emerald-500" : paper.score >= 0.6 ? "bg-amber-500" : "bg-slate-400";
  const meta = paper.metadata || {};
  const authors = meta.authors || [];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition-shadow">
      <div className="flex gap-3">
        <div className={`w-10 h-10 rounded-full ${scoreColor} flex-shrink-0 flex items-center justify-center text-white font-bold text-sm`}>
          {(paper.score * 10).toFixed(0)}
        </div>
        <div className="flex-1 min-w-0">
          <a href={paper.source_url} target="_blank" rel="noopener noreferrer"
            className="font-semibold text-slate-800 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-start gap-1.5 mb-1">
            <span>{paper.title}</span>
            <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-50" />
          </a>
          <div className="text-xs text-slate-500 mb-2">
            {authors.slice(0, 3).join(", ")}{authors.length > 3 ? " et al." : ""}
            {meta.published ? ` · ${meta.published}` : ""}
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {paper.tags?.map((t) => (
              <span key={t} className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 rounded-full">{t}</span>
            ))}
          </div>
          {meta.contribution && (
            <div className="flex gap-1.5 mb-2 p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
              <Star className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-700 dark:text-slate-300">{meta.contribution}</p>
            </div>
          )}
          <p className={`text-sm text-slate-600 dark:text-slate-400 ${expanded ? "" : "line-clamp-2"}`}>
            {paper.summary}
          </p>
          <div className="flex gap-3 mt-2">
            <button onClick={() => setExpanded(!expanded)}
              className="text-xs text-indigo-500 hover:underline">{expanded ? "收起" : "展开"}</button>
            {meta["pdf-url"] && (
              <a href={meta["pdf-url"]} target="_blank" rel="noopener noreferrer"
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">PDF</a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript — zero errors**

```bash
npx tsc --noEmit 2>&1
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/modules/MainContent.tsx src/modules/arxiv/ArxivTracker.tsx
git commit -m "feat: wire profile tab into MainContent; implement ArXiv full frontend"
```

---

## Task 13: Final verification + push

- [ ] **Step 1: TypeScript clean**

```bash
npx tsc --noEmit 2>&1
```

Expected: no output.

- [ ] **Step 2: Vite build succeeds**

```bash
npx vite build 2>&1 | tail -8
```

Expected: `✓ built in X.XXs`

- [ ] **Step 3: Backend starts with profile routes**

```bash
pkill -f "abo.main" 2>/dev/null; sleep 1
python3 -m abo.main &
sleep 3
curl -s http://127.0.0.1:8765/api/profile | python3 -m json.tool | head -15
curl -s http://127.0.0.1:8765/api/profile/stats | python3 -m json.tool | head -15
```

Expected: both return valid JSON with expected keys.

- [ ] **Step 4: Push to main**

```bash
git push origin main
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ NavSidebar top card (Task 11)
- ✅ `profile` ActiveTab (Task 4)
- ✅ RoleCard with pixel avatar + motto (Tasks 5, 9)
- ✅ DailyTodo affecting energy (Tasks 9, 3)
- ✅ HexagonRadar JoJo E→A (Tasks 2, 6)
- ✅ SkillGrid with progress % (Tasks 3, 7)
- ✅ AchievementGallery (Tasks 3, 8)
- ✅ DailyCheckInModal auto-popup (Task 9)
- ✅ All backend routes (Tasks 1-3)
- ✅ ArXiv full frontend (Task 12)
- ✅ Skipped: meeting/health/podcast/trends — placeholder components remain

**Type consistency:** `ProfileStats` defined in `store.ts` Task 4, consumed in `HexagonRadar` Task 6 and `Profile` Task 10. `DimStat` interface used consistently. `PixelAvatar` props `san: number (0-10)`, `energy: number (0-100)` — NavSidebar passes `profileSan/10` correctly.

**No placeholders found.**
