# OpenCovibe — Architecture Reference for Claude Code

**Use this doc when**: understanding how the app is structured before modifying any feature.

---

## What This App Does

Local-first Mac desktop app wrapping the `claude` CLI into a native window. Users chat with Claude Code through a SvelteKit UI; the Rust backend manages subprocess lifecycle, event streaming, and persistence.

---

## Stack (exact versions)

```
Frontend  SvelteKit ^2.16 + Svelte ^5.53 + TypeScript ^5.7 + Tailwind ^3.4 + Vite ^6.1
Backend   Rust 2021 + Tauri ^2.5 + tokio (full) + axum ^0.7 + serde ^1
Testing   Vitest ^4 (frontend) · cargo test (backend)
```

---

## Directory Map

```
src/                          SvelteKit frontend
  app.html / app.css          HTML shell + global styles
  routes/                     File-system routing
    +layout.svelte            Sidebar nav, wraps all pages
    +page.svelte              Root redirect
    chat/+page.svelte         PRIMARY: main conversation view
    settings/+page.svelte
    history/+page.svelte
    usage/+page.svelte
    memory/+page.svelte
    plugins/+page.svelte
    teams/+page.svelte
    explorer/+page.svelte
  lib/
    api.ts                    ONLY entry point for backend calls
    commands.ts               CommandPalette definitions
    types.ts                  ALL shared TypeScript types
    components/               ~60 Svelte components
    stores/                   Svelte 5 rune-based state (*.svelte.ts)
    transport/                IPC abstraction (Tauri ↔ WebSocket)
    utils/                    Pure functions
    i18n/                     Translations

src-tauri/
  tauri.conf.json             App config, CSP, window settings
  Cargo.toml                  Rust dependencies
  src/
    lib.rs                    ENTRY: registers ALL ~80 IPC commands
    main.rs                   Binary: calls lib::run()
    commands/                 ~25 IPC command modules
    agent/                    AI process management
    storage/                  JSON file persistence
    web_server/               axum HTTP + WebSocket server
    hooks/                    fs-watch for teams/tasks

messages/                     i18n translation JSON files
scripts/                      Build/release scripts
```

---

## Core Data Flow: User Sends a Message

```
PromptInput.svelte
  → SessionStore.sendMessage()           [lib/stores/session-store.svelte.ts]
  → api.sendSessionMessage(...)          [lib/api.ts]
  → transport.invoke("send_session_message", args)  [lib/transport/index.ts]
  → TauriTransport → invoke()            [@tauri-apps/api/core]
  → commands::session::send_session_message()  [src-tauri/src/commands/session.rs]
  → SessionActor.cmd_tx.send(...)        [src-tauri/src/agent/session_actor.rs]
  → claude subprocess stdin
  → claude stdout → claude_stream::parse()
  → app.emit("bus_event", payload)
  → transport.listen("bus_event", handler)
  → SessionStore.handleBusEvent()
  → timeline updated → components re-render
```

---

## Dual-Mode Runtime

The same frontend runs in two modes — detection is automatic:

```typescript
// lib/transport/index.ts
const isTauri = typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
_instance = isTauri ? new TauriTransport() : new WsTransport();
```

| | Desktop (Tauri) | Browser (WebSocket) |
|---|---|---|
| IPC | `@tauri-apps/api/core invoke()` | `ws://localhost:{port}/ws` |
| Events | `@tauri-apps/api/event listen()` | WebSocket messages |
| Backend | In-process Rust | Same Rust, via network |

---

## Shared State Types (lib/stores/)

```
session-store.svelte.ts    Chat session state machine (primary)
team-store.svelte.ts       Team tasks/inboxes
cli-info.svelte.ts         CLI version cache
attention-store.svelte.ts  Unread badge counts
keybindings.svelte.ts      Keyboard shortcut config
```

All stores use **Svelte 5 class + $state fields**, not writable() stores.

---

## Backend Module Boundaries

| Module | Responsibility | Key files |
|---|---|---|
| `commands/` | IPC surface (frontend-callable) | session.rs, runs.rs, plugins.rs |
| `agent/` | subprocess lifecycle | session_actor.rs, spawn.rs, claude_stream.rs |
| `storage/` | file persistence | runs.rs, settings.rs, events.rs |
| `web_server/` | HTTP + WS for browser mode | mod.rs, ws.rs, broadcaster.rs |
| `hooks/` | fs watchers | team_watcher.rs |

**Do not call storage directly from commands without going through agent/ when session is live.**

---

## Key Constraints

- All IPC commands must be registered in `lib.rs` `generate_handler![]` — no exceptions
- Never call `invoke()` directly in components — always go through `lib/api.ts`
- Never add module-level `$state` — must be inside class or function (SSR safety)
- Async Tauri commands cannot use `&str` params — use `String`
- All new UI strings need entries in both `messages/en.json` and `messages/zh-CN.json`
