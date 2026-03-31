# 03 — Profile & Gamification System

> Read this for profile page, gamification, energy system, or avatar changes.

---

## Overview

The profile system is a JoJo-style gamification layer with:
- **6 hex dimensions** (research, output, health, learning, SAN, happiness)
- **Pixel avatar** with 4 states based on SAN × Energy
- **Energy system** inferred from behavior (todo completion rate)
- **Daily check-in** (SAN + happiness auto-popup)
- **Skill nodes** + **Achievement badges**

---

## Backend Components

### Profile Store (`abo/profile/store.py`)

All data persisted to `~/.abo/*.json` with atomic writes (`tmp + os.replace`).

| Function | File | Purpose |
|----------|------|---------|
| `get_identity()` / `save_identity()` | `profile.json` | codename + long_term_goal |
| `get_daily_motto()` / `save_daily_motto()` | `daily_motto.json` | motto + description + date |
| `append_san()` / `get_san_7d_avg()` | `san_log.json` | SAN score log (1-10), 7-day rolling avg |
| `append_happiness()` / `get_happiness_today()` | `happiness_log.json` | Happiness score log (1-10) |
| `get_energy_today()` / `save_energy_today()` | `energy_memory.json` | Energy 0-100, manual override support |
| `get_todos_today()` / `save_todos_today()` | `daily_todos.json` | Today's todo list, keyed by date |
| `get_skills()` / `unlock_skill()` | `skills.json` | Skill unlock timestamps |
| `get_achievements()` / `unlock_achievement()` | `achievements.json` | Achievement list |
| `get_stats_cache()` / `save_stats_cache()` | `stats_cache.json` | Cached dimension scores |

### Stats Calculator (`abo/profile/stats.py`)

```python
def calculate_stats(vault_path, card_store) -> dict:
    # Returns 6 dimensions, each with: {score: int, grade: str, raw: dict}
```

| Dimension | Score Formula | Data Sources |
|-----------|--------------|-------------|
| 研究力 research | `min(100, lit_count * 2 + arxiv_stars * 3)` | Literature/*.md count + arxiv star feedback |
| 产出力 output | `min(100, meeting_count * 10 + idea_count * 5)` | Meetings/*.md + Ideas/idea-*.md count |
| 健康力 health | `0` (health module pending) | — |
| 学习力 learning | `min(100, podcast_done * 8 + trend_deep * 5)` | podcast-digest saves + rss-aggregator deep_dives |
| SAN 值 san | `min(100, san_7d_avg * 10)` | 7-day SAN log average × 10 |
| 幸福指数 happiness | `min(100, happiness * 0.6 * 10 + energy * 0.4)` | Today's happiness + energy |

### Grade Mapping

```python
def score_to_grade(score: int) -> str:
    # 80-100 → "A", 60-79 → "B", 40-59 → "C", 20-39 → "D", 0-19 → "E"
```

JoJo-style: E is worst, A is best.

### Routes (`abo/profile/routes.py`)

Uses `APIRouter(prefix="/api/profile")`. Requires `init_routes(card_store)` called at startup.

**Energy auto-recalculation** in `POST /api/profile/todos`:
```python
completion = done_count / total_count
correction = 40 + completion * 60           # 40-100 range
new_energy = int(70 * 0.6 + correction * 0.4)  # base=70, mix with correction
save_energy_today(new_energy, manual=False)
```

**Motto generation** in `POST /api/profile/generate-motto`:
- Calls `batch_call()` (Claude CLI) with identity, todos, energy, SAN context
- Generates motto + 30-char description
- Fallback: "专注当下，积累成势。" on failure

---

## Frontend Components (8 files in `src/modules/profile/`)

### Profile.tsx — Main Page

Orchestrates all sub-components. On mount:
1. Fetches `GET /api/profile`
2. Sets Zustand profile state (energy, SAN, motto, stats)
3. Checks `localStorage("abo_last_checkin")` — shows check-in modal if not today

```tsx
<div className="h-full overflow-auto bg-slate-950 p-6">
  <div className="max-w-3xl mx-auto space-y-6">
    <RoleCard ... />
    <DailyTodo ... />
    <HexagonRadar stats={data.stats} size={300} />
    <SkillGrid ... />
    <AchievementGallery ... />
  </div>
  {showCheckin && <DailyCheckInModal onClose={handleCheckinClose} />}
</div>
```

### PixelAvatar.tsx — SVG Pixel Art

4 states based on `san` (0-10) and `energy` (0-100%):

| State | Condition | Appearance |
|-------|-----------|-----------|
| `full` | SAN ≥ 7 AND energy ≥ 70 | Standing tall, star on head |
| `tired` | SAN ≥ 7 AND energy < 40 | Yawning, zzz bubbles |
| `anxious` | SAN < 5 AND energy ≥ 60 | Shaking, question mark (CSS wiggle animation) |
| `broken` | SAN < 5 AND energy < 40 | Collapsed on ground |

Props: `{ san: number, energy: number, size: number }`

Used in: NavSidebar (small, size=3) and RoleCard (large, size=6).

### RoleCard.tsx

Displays: pixel avatar + codename + goal + motto + energy bar.
Edit mode: inline form for codename + long_term_goal.
Motto refresh: calls `POST /api/profile/generate-motto`.

### DailyTodo.tsx

Inline todo list with add/toggle/remove. Shows completion rate progress bar.
On every change: `POST /api/profile/todos` → triggers energy recalculation.

### HexagonRadar.tsx — SVG Hexagon

Pure SVG. 6 vertices for 6 dimensions. Grid rings at 20%, 40%, 60%, 80%, 100%.
Each vertex shows letter grade (E-A) and score.
Data polygon filled with `fill-indigo-500/20 stroke-indigo-500`.

Props: `{ stats: ProfileStats, size: number }`

### SkillGrid.tsx

15 skill nodes across 6 dimensions, each with progress percentage.
Locked skills shown as `opacity-40`. New unlocks highlight for 3s.

### AchievementGallery.tsx

6 achievements: omni, earlybird, nightowl, deepread, automaster, loop.
Locked = dimmed badge. Unlocked = full color + unlock date.

### DailyCheckInModal.tsx

Modal with two sliders:
- SAN (1-10): "今日精神状态"
- Happiness (1-10): "今日幸福感"

On submit: `POST /api/profile/san` + `POST /api/profile/happiness`.
Tracks via `localStorage("abo_last_checkin")` = ISO date string.

---

## NavSidebar Profile Summary Card

At the top of the sidebar, a clickable card shows:
- PixelAvatar (small, size=3)
- Energy bar (color-coded: ≥70 green, ≥40 amber, <40 red)
- Motto text (truncated)

Clicking navigates to profile tab.

---

## Extending the Profile System

### Adding a New Dimension

1. **Backend** `abo/profile/stats.py`: Add calculation in `calculate_stats()`
2. **Backend** `abo/profile/store.py`: Add data persistence functions if needed
3. **Frontend** `src/core/store.ts`: Add to `ProfileStats` and `DimStat` interface
4. **Frontend** `src/modules/profile/HexagonRadar.tsx`: Update vertex labels

### Adding a New Achievement

1. **Frontend** `AchievementGallery.tsx`: Add to `ACHIEVEMENTS` array
2. **Backend** `abo/profile/routes.py` or module: Call `unlock_achievement(id, name)`

### Adding a New Skill

1. **Frontend** `SkillGrid.tsx`: Add to `DIMENSIONS[n].skills` array
2. **Backend**: Call `unlock_skill(skill_id)` when condition met
