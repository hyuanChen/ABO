# 08 — Pending Features

> Read this when implementing health management.
> Health 是唯一待实现的功能，其他功能（meeting/podcast/trends）已移除。

---

## Current State

**Health** 功能当前状态：
- **Backend**: 需要新建 `abo/health/` 模块
- **Frontend placeholder**: `src/modules/health/HealthDashboard.tsx` 已存在，需要实现
- **Nav entry**: 已在 NavSidebar AUTO 中
- **Tab routing**: 已在 MainContent.tsx 中

---

## Health Management (Phase 8)

### Goal
Daily health check-in → Journal entries → D3 trend charts.

### Backend Needs

```python
# abo/health/routes.py

POST /api/health/checkin
  Body: { sleep_hours: float, exercise: bool, mood: int(1-5), notes: str }
  → Writes to {vault}/Journal/YYYY-MM-DD.md (append health section)
  → Stores to ~/.abo/health_log.json
  → Returns { ok: true }

GET /api/health/history?days=30
  → Returns { records: list[{ date, sleep, exercise, mood }] }

GET /api/health/stats
  → Returns { avg_sleep, exercise_streak, mood_trend }
```

### Frontend Spec (`src/modules/health/HealthDashboard.tsx`)

Replace placeholder with:

```
Header: "健康管理" + Heart icon
├── Today's Check-in Card
│   ├── Sleep hours (slider: 0-12)
│   ├── Exercise toggle
│   ├── Mood selector (5 faces)
│   └── Notes textarea
│   └── Submit button
├── Trend Charts (D3)
│   ├── Sleep trend (line chart, 30 days)
│   ├── Mood trend (line chart, 30 days)
│   └── Exercise streak (bar chart)
├── Streak counter (连续打卡 X 天)
└── Journal link (open today's journal in Obsidian)
```

### Gamification Impact

- Consecutive check-in days + sleep avg → 健康力 (currently 0)
- Updating health score formula in `abo/profile/stats.py`:
  ```python
  health_raw = min(100, streak_days * 5 + avg_sleep_score * 3)
  ```

---

## 已移除的功能

以下功能已从项目中移除：

- **Meeting Generator (Phase 7)** - 组会生成器
- **Podcast Digest (Phase 9)** - 播客代听
- **Trend Tracker (Phase 10)** - Trend 追踪

如需恢复，从 git 历史中提取或重新实现。
