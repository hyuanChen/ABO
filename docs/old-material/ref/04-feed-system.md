# 04 — Feed System

> Read this for Intelligence Feed, card display, or feedback changes.

---

## Overview

The Feed is the "overview" tab — a real-time stream of Cards produced by all modules.
Users interact with Cards via 4 feedback actions that affect preference weights.

---

## Architecture

```
Module Runtime → runner.run()
  → card_store.save(card)
  → broadcaster.send_card(card)  ←── WebSocket ──→  Feed.tsx (prependCard)
                                                         ↓
                                                    CardView.tsx
                                                    (user clicks action)
                                                         ↓
                                                  POST /api/cards/{id}/feedback
                                                         ↓
                                                  PreferenceEngine.record_feedback()
                                                  card_store.record_feedback()
                                                  module.on_feedback()
```

---

## Frontend Components

### Feed.tsx (`src/modules/feed/Feed.tsx`)

Main feed view. Features:
- **Initial load**: `GET /api/cards?unread_only=true` (filtered by active module if set)
- **WebSocket**: Connects to `ws://127.0.0.1:8765/ws/feed`, listens for `new_card` events
- **Keyboard navigation**: `j/k` = up/down, `s` = save, `x` = skip, `f` = star, `d` = deep_dive
- **Focus tracking**: `focusIdx` state highlights current card

```tsx
// Keyboard bindings (no modifiers)
case "j": next card
case "k": prev card
case "s": save focused card
case "x": skip focused card (removes from list)
case "f": star focused card
case "d": deep_dive focused card
```

### CardView.tsx (`src/modules/feed/CardView.tsx`)

Individual card display:
- Score bar (gradient width = score × 100%)
- Title, summary, tags (max 5)
- Source link (external)
- 4 action buttons: Save, Skip, Star, Deep Dive

Props:
```typescript
interface Props {
  card: FeedCard;
  focused: boolean;
  onClick: () => void;
  onFeedback: (action: string) => void;
}
```

### FeedSidebar.tsx (`src/modules/feed/FeedSidebar.tsx`)

Left sidebar (w-44) showing module filter buttons:
- "全部" button with total unread count
- Per-module buttons with individual unread counts
- Active filter highlighted with indigo

### ModulePanel.tsx (`src/modules/feed/ModulePanel.tsx`)

Module management panel showing:
- Module list with status dot (enabled/disabled)
- Schedule + next run time
- "Run now" button per module
- "新建模块" button (shows CLI instructions)

Used by: TrendTracker, PodcastDigest, MeetingGenerator, HealthDashboard (as placeholder content).

---

## Backend: Feedback Flow

### POST /api/cards/{card_id}/feedback

```python
@app.post("/api/cards/{card_id}/feedback")
async def feedback(card_id: str, body: FeedbackReq):
    card = _card_store.get(card_id)
    _prefs.record_feedback(card.tags, body.action.value)  # Update tag weights
    _card_store.record_feedback(card_id, body.action.value)  # Mark in DB
    module = _registry.get(card.module_id)
    if module:
        await module.on_feedback(card_id, body.action)  # Module callback
    return {"ok": True}
```

### Preference Weight Rules

| Action | Tag Weight Multiplier |
|--------|---------------------|
| `star` | × 1.1 (all tags) |
| `save` | × 1.05 (all tags) |
| `skip` | × 0.85 (first tag only) |
| `deep_dive` | × 1.1 (all tags) |

Weights are clamped to [0.1, 5.0]. Higher weight → higher relevance for future runs.

---

## WebSocket Protocol

### Feed WebSocket (`/ws/feed`)

```json
// Server → Client: New card
{"type": "new_card", "card": { Card.to_dict() }}

// Client → Server: keepalive (any text, ignored)
```

### Card Dict Shape

```json
{
  "id": "arxiv-2024.12345",
  "title": "Paper Title",
  "summary": "50字摘要",
  "score": 0.85,
  "tags": ["ML", "NLP"],
  "source_url": "https://arxiv.org/abs/...",
  "obsidian_path": "Literature/Author2024-Title.md",
  "module_id": "arxiv-tracker",
  "created_at": 1711900000.0,
  "read": false,
  "metadata": { "authors": [...], "contribution": "..." }
}
```

---

## ArXiv Tracker Frontend (`src/modules/arxiv/ArxivTracker.tsx`)

Dedicated ArXiv page (separate from Feed). Features:
- Paper list from `GET /api/cards?module_id=arxiv-tracker&limit=50`
- Config panel: keywords (comma-separated), minimum score slider
- Score filter slider
- "立即爬取" button → `POST /api/modules/arxiv-tracker/run`
- PaperCard sub-component: score badge (color-coded), authors, tags, contribution highlight, expandable summary, PDF link
