# OpenCovibe — Feature Implementation Guide

**Use this doc when**: Claude Code needs to implement a specific feature or fix.
Each entry describes exactly what to change and where.

---

## How to Approach UI Changes

1. Read `01-design-system.md` first — use those Tailwind classes
2. Find the target file in the inventory below
3. Make surgical edits — don't rewrite working logic, only change presentation
4. Test: `npm run tauri dev` and visually verify
5. Run `npm run lint && npm run check` before committing

---

## Fix Priority Queue

### P0 — Keyboard Navigation in Sidebar (BROKEN)

**Problem**: Arrow keys don't navigate the conversation list.
**File**: `src/routes/+layout.svelte` (sidebar section)

Add `keydown` handler to sidebar list container:
```svelte
<div
  role="listbox"
  tabindex="0"
  onkeydown={handleSidebarKeydown}
  class="flex-1 overflow-y-auto ...">
```

```typescript
function handleSidebarKeydown(e: KeyboardEvent) {
  const allRuns = flattenedRuns; // all visible run items in order
  const idx = allRuns.findIndex(r => r.id === activeRunId);
  if (e.key === "ArrowDown") {
    e.preventDefault();
    const next = allRuns[Math.min(idx + 1, allRuns.length - 1)];
    if (next) selectRun(next.id);
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    const prev = allRuns[Math.max(idx - 1, 0)];
    if (prev) selectRun(prev.id);
  }
}
```

---

### P1 — Chat Message Visual Design

**Problem**: User/assistant messages look identical, too dense.
**Files**:
- `src/lib/components/ChatMessage.svelte` — message bubble styling
- `src/routes/chat/+page.svelte` — message list container padding

**Changes needed**:

In `chat/+page.svelte`, find the message list div and update:
```svelte
<!-- Before -->
<div class="flex-1 overflow-y-auto px-2">

<!-- After -->
<div class="flex-1 overflow-y-auto">
  <div class="max-w-3xl mx-auto px-4 pb-32 pt-4 space-y-1">
```

In `ChatMessage.svelte`, apply role-specific styling per `02-chat-ui.md §3`.

---

### P1 — Status Bar Declutter

**Problem**: All metadata same visual weight, cramped.
**File**: `src/lib/components/SessionStatusBar.svelte`

Find the main status bar container and apply the three-zone layout from `02-chat-ui.md §1`.

Key change: hide non-essential items behind the `[⋮]` overflow menu when running:
- Show while running: project name, model, running indicator, stop button
- Show after done: model, cost, turns, fork button
- Always in overflow: permission mode, verbose, fast mode

---

### P1 — Welcome Screen

**Problem**: Minimal, no visual hierarchy.
**File**: `src/routes/chat/+page.svelte`
**When rendered**: when `!store.run && !store.running` (hero/welcome state)

Find the hero/welcome `{#if !store.run}` block and replace with the layout from `02-chat-ui.md §2`.

---

### P1 — Tool Call Card Visual Polish

**Problem**: All tools look identical, collapsed state shows nothing.
**File**: `src/lib/components/InlineToolCard.svelte`

Apply the colored left-border card design from `02-chat-ui.md §4`.
Use `getToolColor(tool.name)` from `$lib/utils/tool-colors` for the border color.
Show key argument preview (file path, query, etc.) in collapsed state.

---

### P2 — Usage Chart Tooltips

**Problem**: Bar charts have no tooltips.
**File**: `src/routes/usage/+page.svelte` or `src/lib/components/StackedModelChart.svelte`

Add hover tooltip per `04-other-pages.md §3`.
Use `onmouseenter`/`onmouseleave` with a `$state` tooltip position + data.

---

### P2 — History Advanced Filters (Date Range)

**Problem**: Advanced filter panel opens but date range is not wired.
**File**: `src/routes/history/+page.svelte`

In the advanced filters panel, add:
```svelte
<div class="flex items-center gap-2">
  <label class="text-xs text-gray-500">From</label>
  <input type="date"
         class="rounded-md bg-gray-800 border border-gray-700 text-xs text-gray-300 px-2 py-1"
         bind:value={dateFrom}
         onchange={applyFilters}/>
  <label class="text-xs text-gray-500">To</label>
  <input type="date"
         class="rounded-md bg-gray-800 border border-gray-700 text-xs text-gray-300 px-2 py-1"
         bind:value={dateTo}
         onchange={applyFilters}/>
</div>
```

Wire to `filters.after = dateFrom ? new Date(dateFrom).toISOString() : undefined`.

---

### P2 — Memory Page: Create/Delete Files

**Problem**: Can only edit existing files.
**File**: `src/routes/memory/+page.svelte`

Add create button per `04-other-pages.md §4`.
Add delete button in file list item (hover):
```svelte
<button onclick|stopPropagation={() => deleteFile(file.path)}
        class="opacity-0 group-hover:opacity-100 p-0.5 rounded
               hover:text-red-400 text-gray-600">
  <svg class="h-3 w-3"><!-- trash --></svg>
</button>
```

`deleteFile` implementation:
```typescript
// Note: no deleteTextFile IPC command exists — use writeTextFile with empty
// or add a new Rust command delete_text_file
// For now: move to trash via shell command
async function deleteFile(path: string) {
  if (!confirm(`Delete ${fileName(path)}?`)) return;
  await api.shellExec(`trash "${path}"`);  // requires tauri-plugin-shell
  // reload file list
}
```

---

### P2 — Explorer: Create/Rename/Delete

**Problem**: Read-only file browser.
**File**: `src/routes/explorer/+page.svelte`

Header actions (shown when file is selected):
```svelte
{#if selectedFilePath}
<div class="flex items-center gap-1">
  <button onclick={createFile}
          class="px-2.5 py-1 rounded-md bg-gray-700 hover:bg-gray-600
                 text-gray-300 text-xs">New file</button>
  <button onclick={renameFile}
          class="px-2.5 py-1 rounded-md hover:bg-gray-700 text-gray-400 text-xs">
    Rename
  </button>
  <button onclick={deleteFile}
          class="px-2.5 py-1 rounded-md hover:bg-red-900/30 text-red-400 text-xs">
    Delete
  </button>
</div>
{/if}
```

These use existing `writeTextFile` and `read_text_file` IPC commands.
`renameFile` = read + write to new path + delete old (via shell).
`deleteFile` = same approach as memory page above.

---

## Adding a New Feature End-to-End

When asked to add a feature that requires both frontend UI and backend data:

### Step 1: Check if IPC command already exists
→ Look in `docs/03-ipc-bridge.md`. If yes, skip to Step 3.

### Step 2: Add Rust command
→ Follow `docs/02-backend-guide.md §2` exactly.
→ Add to `src-tauri/src/commands/<module>.rs`
→ Register in `src-tauri/src/lib.rs`
→ Add TS wrapper in `src/lib/api.ts`

### Step 3: Add UI
→ Check which page this belongs to (`docs/00-feature-inventory.md`)
→ Apply design from `docs/apply_doc/` for that page
→ Use design tokens from `01-design-system.md`
→ Use Svelte 5 patterns from `docs/01-frontend-guide.md`

### Step 4: State management
→ If feature requires persistent UI state across navigation: add to appropriate store in `src/lib/stores/`
→ Local UI state: use `$state()` directly in the component

### Step 5: Verify
```bash
npm run check        # TS type errors
npm run lint         # ESLint
npm run i18n:check   # if you added UI strings
npm run test         # if you added/changed utils
```

---

## UI Improvement Checklist

When improving any component, verify:

```
□ Consistent spacing (use gap-2/p-2 multiples of 4px)
□ Interactive elements have hover states
□ Focused elements have focus-visible rings
□ Disabled elements have opacity-50 + cursor-not-allowed
□ Text contrast: gray-100/200/300 on gray-800/900/950
□ No hardcoded colors — use Tailwind palette
□ No pixel values — use Tailwind scale
□ Dark mode only (no light: variants needed currently)
□ Transitions on color/opacity changes (duration-150)
□ aria-label on icon-only buttons
□ Empty states have helpful text (not just a blank area)
```
