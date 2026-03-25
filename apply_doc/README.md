# OpenCovibe — apply_doc Index

Reference documents for feature development and UI improvement.
Written for Claude Code agents implementing or improving OpenCovibe features.

## Documents

| File | When to read |
|---|---|
| [00-feature-inventory.md](./00-feature-inventory.md) | **Start here** — what features exist, their status (✅/⚠️/❌/🔲/🎨) |
| [01-design-system.md](./01-design-system.md) | Before styling anything — color tokens, component recipes |
| [02-chat-ui.md](./02-chat-ui.md) | Improving the main chat page (messages, status bar, input) |
| [03-sidebar-nav.md](./03-sidebar-nav.md) | Improving sidebar, navigation, command palette |
| [04-other-pages.md](./04-other-pages.md) | Settings, History, Usage, Memory, Explorer, Plugins, Teams |
| [05-implementation-guide.md](./05-implementation-guide.md) | Step-by-step for each fix + how to add new features end-to-end |

## Quick Decision Tree

```
"I want to fix a UI bug"
  → 00 (find the feature) → 01 (tokens) → 02/03/04 (page spec)

"I want to add a new feature"
  → 05 (end-to-end guide) → ../02-backend-guide.md (if needs IPC)

"I want to restyle a component"
  → 01 (design system) → relevant page spec

"I don't know if a feature already exists"
  → 00 (feature inventory)
```

## Highest Priority Fixes

```
P0  Sidebar keyboard navigation (arrow keys broken)
P1  Chat message layout — user vs assistant visual distinction
P1  Session status bar — reduce visual clutter
P1  Welcome/hero screen — no visual hierarchy
P1  Tool call cards — collapsed state shows nothing useful
P2  Usage chart tooltips
P2  History date range filter
P2  Memory: create/delete files
P2  Explorer: create/rename/delete files
```

> App version: v0.1.41 · Generated: 2026-03-25
