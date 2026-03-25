# OpenCovibe — Other Pages Design Spec

**Covers**: Settings, History, Usage, Memory, Explorer, Plugins, Teams

---

## Shared Page Shell

All non-chat pages use this wrapper inside `+layout.svelte`'s `<slot/>`:

```svelte
<!-- Standard page header -->
<div class="flex flex-col h-full overflow-hidden">
  <div class="shrink-0 flex items-center gap-3 px-6 h-14 border-b border-gray-800">
    <h1 class="text-base font-semibold text-gray-100">{pageTitle}</h1>
    <!-- optional: right-side actions -->
    <div class="flex-1"/>
    <slot name="actions"/>
  </div>
  <div class="flex-1 overflow-y-auto">
    <slot/>
  </div>
</div>
```

---

## 1. Settings Page (`/settings`)

**File**: `src/routes/settings/+page.svelte`
**6 tabs**: general · connection · cli-config · shortcuts · remote · debug

### Current problems
- Tab bar has icons only — labels cut off
- Settings grouped poorly — related items far apart
- No visual section separators

### Target tab bar

```svelte
<div class="flex border-b border-gray-800 px-6 shrink-0 overflow-x-auto">
  {#each tabs as tab}
    <button
      onclick={() => activeTab = tab.id}
      class="flex items-center gap-2 px-4 py-3 text-sm border-b-2 whitespace-nowrap
             transition-colors
             {activeTab === tab.id
               ? 'border-blue-500 text-blue-400'
               : 'border-transparent text-gray-500 hover:text-gray-300'}">
      <svg class="h-4 w-4">{@html tab.icon}</svg>
      {tabLabels[tab.id]()}
    </button>
  {/each}
</div>
```

### Settings section pattern (within each tab)

```svelte
<!-- Section group -->
<div class="py-6 border-b border-gray-800 last:border-0">
  <h3 class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
    {sectionTitle}
  </h3>
  <div class="space-y-4">
    <!-- Setting row -->
    <div class="flex items-center justify-between gap-4">
      <div class="flex-1 min-w-0">
        <p class="text-sm text-gray-200">{settingName}</p>
        <p class="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <!-- Control: toggle, input, select, etc. -->
      <div class="shrink-0">
        <!-- Toggle switch -->
        <button
          role="switch"
          aria-checked={enabled}
          onclick={toggle}
          class="relative h-5 w-9 rounded-full transition-colors
                 {enabled ? 'bg-blue-600' : 'bg-gray-600'}">
          <span class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow
                       transition-transform {enabled ? 'translate-x-4' : 'translate-x-0.5'}"/>
        </button>
      </div>
    </div>
  </div>
</div>
```

### General tab sections
1. **Appearance** — theme, language
2. **Notifications** — enable/disable
3. **Screenshot** — hotkey
4. **Advanced** — debug mode

### Connection tab sections
1. **Auth Status** — current auth method badge + API key input
2. **Platform** — model platform selector, credentials

### CLI Config tab sections
1. **Behavior** — verbose, auto-compact
2. **Limits** — max turns, timeout
3. **Model** — default model

---

## 2. History Page (`/history`)

**File**: `src/routes/history/+page.svelte`

### Target layout

```
┌─── Header ───────────────────────────────────────────┐
│ History          [all] [completed] [failed] [running] │
├─── Search bar ───────────────────────────────────────┤
│ 🔍 Search conversations...                           │
├─── Run list ─────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────┐ │
│ │ ● Fix authentication bug                         │ │  ← title
│ │   my-project  ·  completed  ·  2h ago  ·  $0.04  │ │  ← metadata row
│ └──────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────┐ │
│ │ ● Refactor database layer                        │ │
│ │   ...                                            │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

Run list item:
```svelte
<button
  onclick={() => goto(`/chat?run=${run.id}`)}
  class="w-full text-left rounded-lg bg-gray-800 hover:bg-gray-700
         border border-gray-700 hover:border-gray-600
         px-4 py-3 transition-colors">
  <div class="flex items-start gap-3">
    <!-- Status dot -->
    <span class="mt-1.5 h-2 w-2 rounded-full shrink-0
                 {statusDotColor(run.status)}"></span>
    <div class="flex-1 min-w-0">
      <p class="text-sm text-gray-100 truncate font-medium">
        {run.title || run.first_prompt || 'Untitled'}
      </p>
      <div class="flex items-center gap-2 mt-1 text-xs text-gray-500">
        <span class="truncate">{projectName(run.cwd)}</span>
        <span>·</span>
        <span>{relativeTime(run.created_at)}</span>
        {#if run.cost_usd > 0}
          <span>·</span>
          <span class="font-mono">${run.cost_usd.toFixed(3)}</span>
        {/if}
        {#if run.num_turns}
          <span>·</span>
          <span>{run.num_turns} turns</span>
        {/if}
      </div>
    </div>
  </div>
</button>
```

Status filter pills:
```svelte
<div class="flex gap-1.5">
  {#each ['all', 'completed', 'failed', 'running'] as status}
    <button
      onclick={() => setStatus(status)}
      class="px-3 py-1 rounded-full text-xs font-medium transition-colors
             {activeStatus === status
               ? 'bg-gray-600 text-gray-100'
               : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}">
      {status}
      {#if facets[status]}
        <span class="ml-1 text-gray-500">({facets[status]})</span>
      {/if}
    </button>
  {/each}
</div>
```

**Missing feature to implement**: date range filter UI. Wire `filters.after` and `filters.before` to a date range picker (two `<input type="date">` in the advanced filters panel).

---

## 3. Usage Page (`/usage`)

**File**: `src/routes/usage/+page.svelte`

### Target layout

```
┌─── Header row ────────────────────────────────────────────┐
│ Usage    [app] [global]    [1d][7d][30d][90d][All]  [↻]   │
├─── KPI cards ─────────────────────────────────────────────┤
│  ┌────────────┐ ┌────────────┐ ┌────────────┐             │
│  │ $12.40     │ │ 4.2M tok   │ │ 127 chats  │             │
│  │ Total cost │ │ Total tokens│ │ Sessions   │             │
│  └────────────┘ └────────────┘ └────────────┘             │
├─── Chart area ─────────────────────────────────────────────┤
│ [cost][tokens][messages][sessions]  ← chart mode tabs      │
│  [bar chart — daily breakdown]                             │
├─── Heatmap ────────────────────────────────────────────────┤
│  [HeatmapCalendar]                                         │
├─── Run table ──────────────────────────────────────────────┤
│  Date ▼ | Project | Cost | Tokens | Turns                  │
└───────────────────────────────────────────────────────────┘
```

KPI card:
```svelte
<div class="rounded-lg bg-gray-800 border border-gray-700 p-4">
  <p class="text-2xl font-semibold text-gray-100 tabular-nums">{value}</p>
  <p class="text-xs text-gray-500 mt-1">{label}</p>
  {#if delta !== null}
    <p class="text-xs mt-1 {delta >= 0 ? 'text-red-400' : 'text-green-400'}">
      {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}% vs prev period
    </p>
  {/if}
</div>
```

**Chart tooltips** (missing feature): Add a tooltip overlay on bar hover:
```svelte
<!-- On bar mouseenter, show: -->
<div class="absolute z-10 bg-gray-700 rounded-md px-3 py-2 text-xs shadow-lg
            pointer-events-none"
     style="top: {y}px; left: {x}px">
  <p class="font-medium text-gray-100">{formatDate(day.date)}</p>
  <p class="text-gray-300">{formatCost(day.costUsd)}</p>
  <p class="text-gray-400">{formatTokens(day.tokens)}</p>
</div>
```

---

## 4. Memory Page (`/memory`)

**File**: `src/routes/memory/+page.svelte`

### Target layout (two-column)

```
┌─── File list (sidebar, w-52) ──┬─── Editor area ────────────┐
│ CLAUDE.md files                 │  [Edit] [Preview]  [Save]  │
│ ─────────────                   │                            │
│ ● CLAUDE.md          ~2kb       │  [CodeMirror or Markdown]  │
│   AGENTS.md          ~1kb       │                            │
│   project/CLAUDE.md             │                            │
│ ─────────────                   │                            │
│ [+ New file]                    │                            │
└────────────────────────────────┴────────────────────────────┘
```

File list item:
```svelte
<button
  onclick={() => selectFile(file.path)}
  class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left
         {selected ? 'bg-gray-700 text-gray-100' : 'hover:bg-gray-800 text-gray-400'}">
  <svg class="h-3.5 w-3.5 shrink-0 {isDirty ? 'text-yellow-400' : 'text-gray-500'}">
    <!-- file icon -->
  </svg>
  <span class="flex-1 text-xs truncate">{fileName(file.path)}</span>
  <span class="text-xs text-gray-600">{formatSize(file.size)}</span>
</button>
```

**Missing features to implement**:

```svelte
<!-- Create new file button -->
<button onclick={createNewFile}
        class="w-full flex items-center gap-2 px-3 py-2 rounded-md
               text-gray-500 hover:text-gray-300 hover:bg-gray-800 text-xs">
  <svg class="h-3.5 w-3.5"><!-- plus --></svg>
  New file
</button>
```

`createNewFile` implementation:
```typescript
async function createNewFile() {
  const name = prompt("File name (e.g. AGENTS.md):");
  if (!name) return;
  const path = `${projectCwd}/.claude/${name}`;
  await api.writeTextFile({ path, content: `# ${name}\n` });
  selectedFile = path;
  await loadFile(path);
}
```

---

## 5. Explorer Page (`/explorer`)

**File**: `src/routes/explorer/+page.svelte`

### Target layout

```
┌─── File tree (w-56) ──────────┬─── Viewer/Editor ──────────┐
│ FilesPanel                    │  ┌── breadcrumb ──────────┐ │
│ (existing component)          │  │ src > lib > api.ts     │ │
│                               │  └───────────────────────┘ │
│                               │  [Edit][Preview][Git Diff] │
│                               │  [CodeMirror]              │
└───────────────────────────────┴────────────────────────────┘
```

Breadcrumb (missing):
```svelte
<div class="flex items-center gap-1 text-xs text-gray-500 px-4 py-2 border-b border-gray-800">
  {#each pathParts as part, i}
    {#if i > 0}<span>/</span>{/if}
    <button class="hover:text-gray-200">{part}</button>
  {/each}
</div>
```

**Missing features to implement**:

File action buttons (shown in header when file selected):
```svelte
<div class="flex items-center gap-1">
  <button onclick={createFile} class="...">New file</button>
  <button onclick={renameFile} class="...">Rename</button>
  <button onclick={deleteFile} class="text-red-400 ...">Delete</button>
</div>
```

---

## 6. Plugins Page (`/plugins`)

**File**: `src/routes/plugins/+page.svelte`
**Tabs**: skills · mcp · hooks · plugins · agents

### Tab design (same pattern as settings, left sidebar tabs)

```svelte
<!-- Left tab list -->
<div class="w-40 shrink-0 border-r border-gray-800 flex flex-col gap-0.5 p-2">
  {#each tabs as tab}
    <button class="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left
                   {activeTab === tab ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:bg-gray-800'}">
      <svg class="h-4 w-4 shrink-0">{@html tabIcons[tab]}</svg>
      {tabLabels[tab]}
    </button>
  {/each}
</div>
```

### Skills tab — Skill card

```svelte
<div class="rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-600
            p-4 flex flex-col gap-3 transition-colors">
  <div class="flex items-start justify-between gap-2">
    <div class="flex-1 min-w-0">
      <h3 class="text-sm font-medium text-gray-100">{skill.name}</h3>
      <p class="text-xs text-gray-400 mt-1 line-clamp-2">{skill.description}</p>
    </div>
    <button onclick={installSkill}
            class="shrink-0 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500
                   text-white text-xs font-medium">
      Install
    </button>
  </div>
  <div class="flex items-center gap-3 text-xs text-gray-600">
    <span>{formatInstallCount(skill.installCount)} installs</span>
    <span>{skill.author}</span>
  </div>
</div>
```

### MCP server card

```svelte
<div class="rounded-lg bg-gray-800 border border-gray-700 p-4">
  <div class="flex items-center gap-3">
    <div class="h-9 w-9 rounded-lg bg-gray-700 flex items-center justify-center shrink-0">
      <svg class="h-5 w-5 text-gray-400"><!-- server icon --></svg>
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-gray-100">{server.name}</p>
      <p class="text-xs text-gray-500 truncate">{server.command}</p>
    </div>
    <!-- toggle -->
    <button role="switch" aria-checked={server.enabled} onclick={toggle}
            class="relative h-5 w-9 rounded-full transition-colors
                   {server.enabled ? 'bg-blue-600' : 'bg-gray-600'}">
      <span class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform
                   {server.enabled ? 'translate-x-4' : 'translate-x-0.5'}"/>
    </button>
  </div>
</div>
```

---

## 7. Teams Page (`/teams`)

**File**: `src/routes/teams/+page.svelte`

### Target: Kanban-style task board

```
┌─── Team selector (left) ────┬─── Task board (right) ─────────────┐
│ ▾ my-team                   │  PENDING          IN PROGRESS   DONE│
│   member1 ●                  │  ┌──────────────┐                   │
│   member2 ○                  │  │ Fix auth bug │                   │
│                              │  │ member1      │                   │
│ ─────────────               │  └──────────────┘                   │
│ ▾ other-team                │                                     │
└─────────────────────────────┴─────────────────────────────────────┘
```

Task card:
```svelte
<div class="rounded-lg bg-gray-800 border border-gray-700 p-3 cursor-pointer
            hover:border-gray-600 transition-colors">
  <p class="text-sm text-gray-200 font-medium leading-snug">{task.subject}</p>
  {#if task.description}
    <p class="text-xs text-gray-500 mt-1.5 line-clamp-2">{task.description}</p>
  {/if}
  <div class="flex items-center gap-2 mt-3 text-xs text-gray-600">
    <span class="px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{task.owner || 'unassigned'}</span>
  </div>
</div>
```

Column header:
```svelte
<div class="flex items-center gap-2 mb-3">
  <span class="h-2 w-2 rounded-full {columnColor[status]}"></span>
  <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">{status}</span>
  <span class="ml-auto text-xs text-gray-600">{tasks.length}</span>
</div>
```
