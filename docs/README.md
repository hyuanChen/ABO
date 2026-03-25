# OpenCovibe Technical Reference

Reference docs for the OpenCovibe desktop app codebase.
Written for AI coding agents (Claude Code) working on this or related projects.

## Documents

| File | When to read |
|---|---|
| [00-architecture-overview.md](./00-architecture-overview.md) | Before touching anything — understand the system |
| [01-frontend-guide.md](./01-frontend-guide.md) | Writing/modifying `.svelte` files or stores |
| [02-backend-guide.md](./02-backend-guide.md) | Adding IPC commands or touching Rust code |
| [03-ipc-bridge.md](./03-ipc-bridge.md) | Looking up available backend commands |
| [04-state-management.md](./04-state-management.md) | Understanding session/chat state flow |
| [05-dev-workflow.md](./05-dev-workflow.md) | Running checks, build, or debugging |

## Stack

```
Frontend  SvelteKit 2 + Svelte 5 (runes) + TypeScript + Tailwind + Vite
Backend   Rust 2021 + Tauri 2 + tokio + axum
IPC       ~80 Tauri commands + WebSocket fallback
State     Svelte 5 class-based stores with $state/$derived
Storage   JSON files (no DB)
```

## Critical Rules

1. Never call `invoke()` in components — always use `src/lib/api.ts`
2. Never put `$state` at module level in `.ts` files — use `.svelte.ts`
3. All new IPC commands must be in `lib.rs` `generate_handler![]`
4. All UI strings need entries in both `messages/en.json` + `messages/zh-CN.json`
5. Run `npm run verify` before committing

> App version: v0.1.41 · Generated: 2026-03-25 
