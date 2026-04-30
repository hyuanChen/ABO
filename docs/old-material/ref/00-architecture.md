# 00 — Architecture Overview

> Read this first. Every subagent must understand this before touching code.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| App Shell | Tauri 2.x | `@tauri-apps/cli ^2` |
| Frontend | React + TypeScript | React 19.1, TS 5.8 |
| Styling | Tailwind CSS v4 | `tailwindcss ^4.2` (via `@tailwindcss/vite`) |
| State | Zustand | `^5.0` |
| Canvas | React Flow | `@xyflow/react ^12.10` |
| Markdown | react-markdown + remark-gfm | `^10.1` / `^4.0` |
| Icons | lucide-react | `^1.0` |
| Backend | Python FastAPI | `>=0.115` |
| Scheduler | APScheduler | (via FastAPI lifespan) |
| Database | SQLite (cards.db) | stdlib `sqlite3` |
| LLM | Claude CLI | `claude --print` subprocess |
| Data | JSON files (`~/.abo/`) + Obsidian Vault Markdown | — |

---

## Project Structure

```
ABO/
├── CLAUDE.md                    # Dev instructions (canonical)
├── DESIGN.md                    # Product design doc
├── ref/                         # THIS — development reference guides
│
├── src/                         # React frontend
│   ├── App.tsx                  # Root: NavSidebar + MainContent + Toast
│   ├── index.css                # CSS vars, fonts, Tailwind import
│   ├── core/
│   │   ├── api.ts               # HTTP client → http://127.0.0.1:8765
│   │   ├── store.ts             # Zustand store (tabs, feed, profile, toasts)
│   │   └── events.ts            # Typed EventBus (energy-change, xp-gain, vault-change)
│   ├── components/
│   │   ├── Toast.tsx            # Toast system (useToast hook + ToastContainer)
│   │   └── SetupWizard.tsx      # First-run vault path picker
│   └── modules/
│       ├── MainContent.tsx      # Tab router → renders active module
│       ├── nav/NavSidebar.tsx   # Left sidebar with nav + profile summary card
│       ├── profile/             # 8 components (see 03-profile-gamification.md)
│       ├── feed/                # 4 components (see 04-feed-system.md)
│       ├── arxiv/               # ArxivTracker.tsx
│       ├── literature/          # Literature.tsx (see 05-literature.md)
│       ├── ideas/               # MindMap.tsx (see 06-ideas-mindmap.md)
│       ├── claude-panel/        # ClaudePanel.tsx (see 07-claude-panel.md)
│       ├── meeting/             # MeetingGenerator.tsx (placeholder)
│       ├── health/              # HealthDashboard.tsx (placeholder)
│       ├── podcast/             # PodcastDigest.tsx (placeholder)
│       ├── trends/              # TrendTracker.tsx (placeholder)
│       └── settings/            # Settings.tsx
│
├── abo/                         # Python backend
│   ├── __init__.py
│   ├── main.py                  # FastAPI app, CORS, all route registration
│   ├── config.py                # ~/.abo-config.json R/W (vault_path)
│   ├── sdk/                     # Module ABC + types + tools
│   │   ├── __init__.py          # Re-exports: Module, Item, Card, FeedbackAction, tools
│   │   ├── base.py              # Module ABC (fetch, process, on_feedback, get_status)
│   │   ├── types.py             # Item, Card dataclasses, FeedbackAction enum
│   │   └── tools.py             # claude(), claude_json(), fetch_rss(), download_audio(), transcribe()
│   ├── runtime/                 # Module execution engine
│   │   ├── discovery.py         # ModuleRegistry + watchdog hot-reload
│   │   ├── scheduler.py         # APScheduler cron scheduling
│   │   ├── runner.py            # ModuleRunner: fetch→process→filter→vault→sqlite→ws
│   │   └── broadcaster.py       # WebSocket broadcast to connected clients
│   ├── default_modules/         # Built-in modules (4)
│   │   ├── arxiv/__init__.py    # ArxivTracker
│   │   ├── rss/__init__.py      # RssAggregator
│   │   ├── podcast/__init__.py  # PodcastDigest
│   │   └── folder_monitor/__init__.py  # FolderMonitor
│   ├── profile/                 # Gamification system
│   │   ├── store.py             # JSON persistence (12 helpers)
│   │   ├── stats.py             # 6-dimension score calculator
│   │   └── routes.py            # APIRouter(prefix="/api/profile") — 7 endpoints
│   ├── preferences/engine.py    # Tag weight engine (star/save/skip/deep_dive)
│   ├── store/cards.py           # SQLite Card CRUD + feedback tracking
│   ├── literature/              # PDF/DOI import + FTS5 indexer
│   ├── claude_bridge/runner.py  # stream_call() + batch_call() via claude CLI
│   ├── vault/                   # reader.py (frontmatter), writer.py (write markdown)
│   └── obsidian/uri.py          # obsidian:// URI generation
│
├── src-tauri/                   # Tauri/Rust shell
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   └── src/main.rs
│
├── package.json
├── vite.config.ts
├── tsconfig.json
└── requirements.txt
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                       │
│  NavSidebar → MainContent → [Feed, Profile, Arxiv, ...]  │
│       │              │                                    │
│       │    Zustand store.ts ← api.ts ─────────────────┐  │
│       │              │                    HTTP REST     │  │
│       │    WebSocket ws://...8765/ws/feed ──────────┐  │  │
└───────│──────────────│─────────────────────────────│──│──┘
        │              │                             │  │
┌───────▼──────────────▼─────────────────────────────▼──▼──┐
│                  Backend (FastAPI :8765)                   │
│                                                           │
│  Lifespan:                                                │
│    ModuleRegistry.load_all()                              │
│    ModuleRunner(card_store, prefs, broadcaster)           │
│    ModuleScheduler.start(registry.enabled())              │
│    start_watcher(registry, on_change)                     │
│                                                           │
│  Module Run Cycle:                                        │
│    1. module.fetch() → list[Item]                         │
│    2. module.process(items, prefs) → list[Card]           │
│    3. Filter: score >= threshold, top N                   │
│    4. Write Vault markdown (frontmatter)                  │
│    5. SQLite cards.db insert                              │
│    6. WebSocket broadcast to frontend                     │
│                                                           │
│  Data Stores:                                             │
│    ~/.abo-config.json        (vault path)                 │
│    ~/.abo/preferences.json   (tag weights, module config) │
│    ~/.abo/data/cards.db      (SQLite — all Card records)  │
│    ~/.abo/*.json             (profile, san, energy, etc.) │
│    {vault}/Literature/*.md   (paper notes)                │
│    {vault}/Ideas/*.json      (canvas data)                │
│    {vault}/Trends/*.md       (RSS digests)                │
│    {vault}/Podcasts/*.md     (podcast summaries)          │
└───────────────────────────────────────────────────────────┘
```

---

## API Routes Summary

### Core
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check → `{"status":"ok"}` |
| GET | `/api/config` | Get vault_path + version |
| POST | `/api/config` | Update config |
| GET | `/api/preferences` | Get preference data |
| POST | `/api/preferences` | Update preferences |

### Feed & Cards
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/cards` | List cards (query: module_id, unread_only, limit, offset) |
| GET | `/api/cards/unread-counts` | Unread count per module |
| POST | `/api/cards/{id}/feedback` | Record user action (save/skip/star/deep_dive) |

### Modules
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/modules` | List all modules with status + next_run |
| POST | `/api/modules/{id}/run` | Trigger immediate module run |
| PATCH | `/api/modules/{id}/toggle` | Enable/disable module |

### Profile
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/profile` | Full profile (identity, motto, stats, skills, achievements, energy, todos) |
| GET | `/api/profile/stats` | Just the 6-dimension stats |
| POST | `/api/profile/identity` | Update codename + long_term_goal |
| POST | `/api/profile/san` | Record SAN score (1-10) |
| POST | `/api/profile/happiness` | Record happiness score (1-10) |
| POST | `/api/profile/energy` | Override energy (0-100) |
| POST | `/api/profile/todos` | Save today's todos (auto-recalculates energy) |
| POST | `/api/profile/generate-motto` | Claude generates daily motto |

### WebSocket
| URL | Purpose |
|-----|---------|
| `ws://127.0.0.1:8765/ws/feed` | Real-time Card push from module runs |
| `ws://127.0.0.1:8765/ws/claude` | Claude CLI streaming chat |

---

## Design System

### Fonts
- **Heading**: `Crimson Pro` (serif) — via Google Fonts
- **Body**: `Atkinson Hyperlegible` (sans-serif) — via Google Fonts

### CSS Custom Properties
```css
:root {
  --bg: #F8FAFC; --surface: #FFFFFF; --surface-2: #F1F5F9;
  --border: #E2E8F0; --text: #1E293B; --text-muted: #475569;
  --primary: #6366F1; --primary-dim: #818CF8; --cta: #10B981;
  --xp: #F59E0B; --danger: #EF4444;
}
.dark {
  --bg: #020617; --surface: #0F172A; --surface-2: #1E293B;
  --border: #334155; --text: #F8FAFC; --text-muted: #94A3B8;
  --primary: #818CF8; --cta: #22C55E; --xp: #FBBF24;
}
```

### Dark Mode
- `darkMode: 'class'` — toggle `document.documentElement.classList.toggle('dark')`
- All components must support both light and dark variants

### Component Conventions
- **Sidebar**: always `bg-slate-900` (dark always)
- **Cards**: `bg-white border-slate-200` / `dark:bg-slate-900 dark:border-slate-700`
- **Icons**: Lucide React SVG only — never emoji
- **Transitions**: `transition-colors duration-150`
- **Focus**: `focus-visible:ring-2 focus-visible:ring-indigo-400`
- **Buttons**: `cursor-pointer` always
- **Rounded corners**: `rounded-xl` or `rounded-2xl` (never sharp corners)

---

## Dev Commands

```bash
python -m abo.main          # Start backend on :8765
npm run dev                 # Start frontend Vite on :1420
npx tsc --noEmit            # TypeScript type check
npx vite build              # Production build
npm run tauri dev            # Full Tauri dev (window + backend)
```

---

## Principles

1. **Obsidian is Source of Truth** — all output writes Vault Markdown
2. **Automation first** — APScheduler + Module Runtime
3. **Claude CLI only LLM** — `subprocess claude --print`, no API key
4. **Module decoupling** — FastAPI routers isolate backend, Zustand + EventBus decouple frontend
5. **Local privacy** — never upload user data
6. **Atomic file writes** — `.tmp` + `os.replace()` for JSON persistence
