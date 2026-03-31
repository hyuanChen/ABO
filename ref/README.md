# ABO Development Reference

> Modular, progressive-disclosure guides for AI subagents developing ABO features.

## How to Use

Each guide is **self-contained**. A subagent only needs to read:
1. `00-architecture.md` — always read first (project overview + conventions)
2. The specific feature guide for their task

Do NOT read all guides at once. Pick the one matching your task.

## Guide Index

| Guide | When to Read | Content |
|-------|-------------|---------|
| `00-architecture.md` | **Always** | Tech stack, project structure, data flow, design system, dev commands |
| `01-module-sdk.md` | Building a new backend module | Module ABC, Item/Card types, SDK tools, runtime lifecycle |
| `02-frontend-patterns.md` | Any frontend work | React patterns, Zustand store, api.ts, component conventions |
| `03-profile-gamification.md` | Profile/gamification changes | 6 dimensions, pixel avatar, energy system, daily check-in |
| `04-feed-system.md` | Feed or card-related work | Intelligence Feed, CardView, WebSocket, feedback actions |
| `05-literature.md` | Literature module changes | PDF/DOI import, digest levels, FTS5 search, Obsidian links |
| `06-ideas-mindmap.md` | Idea workshop changes | React Flow canvas, A+B collider, canvas persistence |
| `07-claude-panel.md` | Claude chat panel changes | WebSocket streaming, quick actions, context injection |
| `08-pending-features.md` | Implementing meeting/health/podcast/trends | Specs for the 4 unimplemented modules |
| `09-new-feature-checklist.md` | Adding any new feature end-to-end | Step-by-step checklist: backend → store → nav → UI → test |

## Progressive Disclosure Pattern

```
Subagent receives task: "Add RSS feed configuration UI"

1. Read 00-architecture.md        (5 min — understand project)
2. Read 02-frontend-patterns.md   (3 min — React/Zustand patterns)
3. Read 01-module-sdk.md          (3 min — understand RSS module backend)
4. Implement
```

## Key Rules

- All code in `/Users/huanc/Desktop/ABO/` — no git worktree
- Backend: Python 3.14+ / FastAPI on port 8765
- Frontend: React 19 + TypeScript + Tailwind CSS v4 on port 1420
- LLM: `claude --print` subprocess only (no API key)
- Data: JSON in `~/.abo/`, Markdown in Obsidian Vault, SQLite for cards
- Icons: Lucide React only, no emoji in code
- Language: Chinese UI labels, English code identifiers
