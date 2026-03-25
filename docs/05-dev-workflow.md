# OpenCovibe — Dev Commands & Workflow

**Use this doc when**: setting up the environment, running checks, or understanding the build pipeline.

---

## Prerequisites

```bash
node >= 20
rustup (stable toolchain)
Xcode Command Line Tools (macOS)
claude CLI (latest)
```

---

## Key Commands

```bash
npm run tauri dev          # PRIMARY: full dev mode (Vite + Tauri hot reload)
npm run verify             # PRE-COMMIT: lint + format + i18n + test + build + rust check
npm run fix                # AUTO-FIX: eslint fix + prettier + cargo fmt
npm run test               # unit tests (Vitest)
npm run test:watch         # test watch mode
npm run tauri build        # production build → .app + .dmg
```

---

## verify = these steps in order

```bash
npm run lint               # ESLint on src/
npm run format:check       # Prettier
npm run i18n:check         # all translation keys present in en.json + zh-CN.json
npm run test               # Vitest unit tests
npm run build              # Vite production build
npm run rust:check         # cargo fmt --check + cargo clippy -- -D warnings
```

**Run `verify` before every commit.** CI gates on all of these.

---

## Hot Reload Behavior

```
Frontend (.svelte, .ts)   Vite HMR — instant, no restart
Rust (.rs)                cargo rebuild — auto restarts Tauri process (~10-30s incremental)
```

---

## Debug Logging

```bash
# Backend logs (Rust)
RUST_LOG=opencovibe_desktop_lib=debug npm run tauri dev   # project logs only
RUST_LOG=debug npm run tauri dev                          # all crates (noisy)
RUST_LOG=warn npm run tauri dev                           # errors + warnings only

# Frontend transport debug
# In browser console: localStorage.setItem("debug", "transport")
# Uses dbg() from lib/utils/debug.ts — enabled by "debug" localStorage key
```

---

## Common Tasks

### Add a new page

```bash
# 1. Create route file
mkdir -p src/routes/my-page
touch src/routes/my-page/+page.svelte

# 2. If needs data loading
touch src/routes/my-page/+page.ts

# 3. Add to sidebar nav in src/routes/+layout.svelte
```

### Add a new Svelte component

```bash
touch src/lib/components/MyComponent.svelte
# Follow template in docs/01-frontend-guide.md
# No registration needed — import directly where used
```

### Add a new IPC command (end-to-end)

```bash
# 1. Write command in src-tauri/src/commands/<module>.rs
# 2. Register in src-tauri/src/lib.rs generate_handler![]
# 3. Add TypeScript wrapper in src/lib/api.ts
# 4. Verify: npm run rust:check && npm run check
```

### Add i18n key

```bash
# 1. Add key+value to messages/en.json
# 2. Add key+value to messages/zh-CN.json
# 3. Use in .svelte: t("your.key")
npm run i18n:check         # verify completeness
```

### Add user settings field

```bash
# 1. Extend Settings struct in src-tauri/src/storage/settings.rs
# 2. Update UserSettings interface in src/lib/types.ts
# 3. Add UI control in src/routes/settings/+page.svelte
```

---

## Script Reference

| Script | What it does |
|---|---|
| `tauri dev` | Vite dev server + Tauri window |
| `dev` | Vite only (port 1420) |
| `build` | Vite production build |
| `tauri build` | Full app bundle (.app/.dmg) |
| `test` | Vitest run |
| `test:watch` | Vitest watch |
| `lint` | ESLint src/ |
| `lint:fix` | ESLint auto-fix |
| `format` | Prettier write |
| `format:check` | Prettier check |
| `check` | svelte-check (TS type check) |
| `rust:fmt` | cargo fmt --check |
| `rust:clippy` | cargo clippy |
| `rust:check` | rust:fmt + rust:clippy |
| `i18n:check` | translation key completeness |
| `doc:check` | doc consistency |
| `fix` | lint:fix + format + cargo fmt |
| `verify` | full pre-commit check |
| `release` | version bump + tag |
| `prebuild:dmg` | clean old DMG before build |

---

## Tauri Config Summary (`tauri.conf.json`)

```
productName     OpenCovibe
identifier      com.opencovibe.desktop
devUrl          http://localhost:1420
window          1280x800, min 900x600, starts maximized
CSP             self + api.anthropic.com + *.anthropic.com only
bundle targets  all (macOS .app + .dmg)
```

---

## Test File Locations

```
src/lib/stores/session-store.test.ts
src/lib/stores/team-store.test.ts
src/lib/stores/attention-store.test.ts
src/lib/stores/keybindings.test.ts
src/lib/stores/event-middleware.test.ts
src/lib/utils/__tests__/              (16 test files)
src/lib/i18n/__tests__/i18n.test.ts
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `command not found` from invoke() | Check `generate_handler![]` in lib.rs for the command |
| Frontend events not arriving | Check `app.emit("event_name")` in Rust matches `transport.listen("event_name")` in TS |
| i18n:check fails | Add missing key to both `messages/en.json` and `messages/zh-CN.json` |
| Rust compile slow | First build downloads all crates (~5-10 min). Incremental is ~10-30s. |
| CSP blocks request | Add domain to `connect-src` in `tauri.conf.json app.security.csp` |
| $state not reactive | File needs `.svelte.ts` extension, not `.ts` |
| bind:value error | Declare prop as `$bindable()`: `let { value = $bindable("") } = $props()` |
