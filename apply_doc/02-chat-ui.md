# OpenCovibe — Chat Page Design Spec

**File**: `src/routes/chat/+page.svelte`
**Status**: Functional but visually dense and hard to scan.
**Goal**: Make the conversation feel like a premium AI chat app with clear visual hierarchy.

---

## Layout Structure (target)

```
┌─────────────────────────────────────────────────────┐
│  SessionStatusBar (shrink-0, h-12)                   │
├─────────────────────────────────────────────────────┤
│                                                       │
│  Message list area (flex-1, overflow-y-auto)          │
│  • max-w-3xl centered                                 │
│  • pb-32 (space for input box)                        │
│                                                       │
│  [Welcome hero — shown when no run selected]          │
│                                                       │
├─────────────────────────────────────────────────────┤
│  PromptInput (sticky bottom, shrink-0)                │
└─────────────────────────────────────────────────────┘
```

The right details panel (tools/context/files) slides in over the main area on mobile, sits beside on desktop (w-80, `shrink-0`).

---

## 1. Session Status Bar

**File**: `src/lib/components/SessionStatusBar.svelte`

### Current problems
- Too many items crammed into one line
- No visual hierarchy — cost, model, mode all same weight
- Running state not immediately obvious

### Target design

```
┌──────────────────────────────────────────────────────────────────┐
│ [≡]  📁 my-project  ·  feat/auth  │  claude-3-5-sonnet  │  ⬡ $0.12  │  [⋮]  │
└──────────────────────────────────────────────────────────────────┘
```

Left zone (flex items, overflow-hidden):
```svelte
<!-- Sidebar toggle -->
<button onclick={onToggleSidebar} class="p-1.5 rounded hover:bg-gray-700 ...">
  <svg class="h-4 w-4"/>
</button>
<!-- Project / cwd -->
<span class="text-gray-400 text-sm truncate max-w-32">{cwdLabel}</span>
<!-- git branch pill -->
{#if gitBranch}
<span class="px-1.5 py-0.5 rounded text-xs bg-gray-800 text-gray-400 font-mono">
  {gitBranch}
</span>
{/if}
```

Center zone (model + running indicator):
```svelte
<button onclick={onModelChange}
        class="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-gray-700
               text-sm text-gray-200 font-medium">
  {#if running}
    <span class="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse"></span>
  {/if}
  {modelName}
  <svg class="h-3 w-3 text-gray-500"><!-- chevron down --></svg>
</button>
```

Right zone (cost + actions):
```svelte
{#if cost > 0}
<span class="text-xs text-gray-400 font-mono">${cost.toFixed(3)}</span>
{/if}
<!-- Permission mode badge — only when not default -->
{#if permissionMode && permissionMode !== "default"}
<span class="px-1.5 py-0.5 rounded text-xs bg-yellow-900/40 text-yellow-400">
  {permissionMode}
</span>
{/if}
<!-- Overflow menu -->
<button class="p-1.5 rounded hover:bg-gray-700 text-gray-400">
  <svg class="h-4 w-4"><!-- ... --></svg>
</button>
```

---

## 2. Welcome / Hero Screen

**Shown when**: no run is active (`!store.run && !store.running`)

### Current problems
- Plain text, no visual interest
- No clear call to action hierarchy
- Remote host / auth info buried

### Target design

```
┌─────────────────────────────────────┐
│                                       │
│        [App logo/icon 32px]           │
│       OpenCovibe                      │  text-2xl font-semibold
│                                       │
│  ┌─────────────────────────────────┐  │
│  │  📁  /path/to/project      [▾]  │  │  Project selector — large, prominent
│  └─────────────────────────────────┘  │
│                                       │
│  ╭─────────────────────────────────╮  │
│  │  Ask Claude anything...          │  │  PromptInput here (large, inset)
│  ╰─────────────────────────────────╯  │
│                                       │
│  Quick starts:                        │  text-xs text-gray-500
│  [Review changes] [Fix linting] [...]  │  pill buttons
│                                       │
│  ── Recent ──────────────────────── │
│  • project-x · 2h ago · $0.04        │  last 3 runs, clickable
│  • project-y · yesterday             │
└─────────────────────────────────────┘
```

Implementation notes:
- Center the whole block: `flex flex-col items-center justify-center flex-1 gap-6 max-w-lg mx-auto`
- Project selector: large button with border, not a small chip
- Quick starts: pull from `getQuickActions()` util
- Recent runs: from `lastContinuableRun` + previous runs list

---

## 3. Message List

**File**: `src/lib/components/ChatMessage.svelte`

### Current problems
- User and assistant messages same visual weight
- Tool calls visually merge into messages
- Timestamps hidden, hard to scan

### Target message layout

```
User message:
  ┌────────────────────────────────────────┐
  │                                  You   │  ← right-aligned label
  │  ╭────────────────────────────────╮    │
  │  │ message content here...        │    │  ← blue bubble, right-aligned
  │  ╰────────────────────────────────╯    │
  │                          12:34 PM  📎2 │  ← metadata, right-aligned
  └────────────────────────────────────────┘

Assistant message:
  ┌────────────────────────────────────────┐
  │ Claude  ·  claude-3-5-sonnet           │  ← left label with model
  │ message content...                      │  ← flush left, full width
  │                                         │
  │  12:34 PM  ·  412 tok  ·  $0.012  [↻]  │  ← usage row, muted
  └────────────────────────────────────────┘
```

Svelte layout:
```svelte
<!-- User message -->
<div class="flex flex-col items-end gap-1 py-3">
  <span class="text-xs text-gray-500 mr-1">You</span>
  <div class="max-w-[80%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2.5
              text-white text-sm leading-relaxed">
    {message.content}
  </div>
  <span class="text-xs text-gray-600 mr-1">{formattedTime}</span>
</div>

<!-- Assistant message -->
<div class="flex flex-col gap-2 py-4">
  <div class="flex items-center gap-2">
    <span class="text-xs font-medium text-purple-400">Claude</span>
    <span class="text-xs text-gray-600">{model}</span>
  </div>
  <div class="text-sm leading-relaxed text-gray-100 prose prose-invert prose-sm max-w-none">
    <MarkdownContent {content} />
  </div>
  <!-- usage row -->
  <div class="flex items-center gap-3 text-xs text-gray-600">
    <span>{formattedTime}</span>
    {#if tokens}<span>{tokens} tok</span>{/if}
    {#if cost}<span>${cost.toFixed(4)}</span>{/if}
  </div>
</div>
```

### Message list container

```svelte
<div class="flex-1 overflow-y-auto" bind:this={chatAreaRef}>
  <div class="max-w-3xl mx-auto px-4 pb-32 pt-4">
    {#each store.timeline as entry (entry.anchorId)}
      <!-- messages -->
    {/each}
  </div>
</div>
```

---

## 4. Tool Call Cards

**File**: `src/lib/components/InlineToolCard.svelte`

### Current problems
- All tools look identical — hard to distinguish at a glance
- Collapsed state shows nothing useful
- Expanded state is an unstructured blob

### Target tool card design

```
╭─ ────────────────────────────────────────── ─╮
│ ◈  Read File                    ✓ done  0.2s │  ← colored left border by tool type
│    src/lib/api.ts                             │  ← path/key args preview
╰───────────────────────────────────────────────╯
                   [click to expand ▾]
```

Expanded:
```
╭─ ────────────────────────────────────────── ─╮
│ ◈  Read File                    ✓ done  0.2s │
│    src/lib/api.ts                             │
├───────────────────────────────────────────────┤
│ Input                                         │
│  { "path": "src/lib/api.ts" }                 │
├───────────────────────────────────────────────┤
│ Output (truncated)                            │
│  export async function listRuns()...          │
╰───────────────────────────────────────────────╯
```

Implementation:
```svelte
<div class="rounded-md border-l-2 bg-gray-800/60 overflow-hidden my-1
            border-{toolColor}-500">
  <button class="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700/50"
          onclick={toggle}>
    <!-- tool icon or first letter -->
    <span class="h-5 w-5 rounded text-xs flex items-center justify-center
                 bg-{toolColor}-900/40 text-{toolColor}-400 font-mono font-bold shrink-0">
      {toolName[0].toUpperCase()}
    </span>
    <span class="flex-1 text-left text-sm font-medium text-gray-200">{toolDisplayName}</span>
    <!-- status badge -->
    {#if status === "done"}
      <span class="text-xs text-green-400">✓</span>
    {:else if status === "running"}
      <span class="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse"></span>
    {:else if status === "error"}
      <span class="text-xs text-red-400">✗</span>
    {/if}
    <!-- duration -->
    {#if duration}<span class="text-xs text-gray-600">{duration}s</span>{/if}
    <!-- key arg preview (path, query, etc.) -->
    <span class="text-xs text-gray-500 font-mono truncate max-w-32">{keyArgPreview}</span>
    <!-- expand chevron -->
    <svg class="h-3 w-3 text-gray-600 transition-transform {expanded ? 'rotate-180' : ''}">
  </button>
  {#if expanded}
  <div class="border-t border-gray-700 px-3 py-2 space-y-2">
    <!-- input/output sections -->
  </div>
  {/if}
</div>
```

---

## 5. Prompt Input

**File**: `src/lib/components/PromptInput.svelte`

### Current problems
- Toolbar icons not discoverable (no labels)
- Attachment area unclear
- Send button placement unclear on multiline

### Target layout

```
╭──────────────────────────────────────────────╮
│                                               │
│  [textarea — auto-grows, min 1 line]          │
│                                               │
├───────────────────────────────────────────────┤
│ [📎 attach] [/ slash] [@ mention]  [⌘↵ Send] │
╰───────────────────────────────────────────────╯
```

Key styling:
```svelte
<div class="mx-4 mb-4 rounded-xl border border-gray-700 bg-gray-800
            focus-within:border-gray-500 transition-colors shadow-lg">
  <!-- attachment previews (when files attached) -->
  {#if attachments.length}
  <div class="flex flex-wrap gap-2 px-3 pt-3">
    {#each attachments as att}
    <FileAttachment {att} onremove={...}/>
    {/each}
  </div>
  {/if}

  <textarea
    class="w-full bg-transparent text-sm text-gray-100 px-4 py-3
           placeholder:text-gray-500 resize-none focus:outline-none
           min-h-[44px] max-h-48"
    placeholder="Ask Claude anything... (/ for commands)"
  />

  <div class="flex items-center gap-1 px-3 py-2 border-t border-gray-700/50">
    <button class="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200"
            title="Attach file (⌘U)">
      <svg class="h-4 w-4"><!-- paperclip --></svg>
    </button>
    <!-- more toolbar items -->
    <div class="flex-1"></div>
    <button
      disabled={!canSend}
      class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500
             disabled:opacity-40 disabled:cursor-not-allowed
             text-white text-xs font-medium flex items-center gap-1.5">
      <span>Send</span>
      <kbd class="text-blue-300 opacity-70">⌘↵</kbd>
    </button>
  </div>
</div>
```

---

## 6. Scroll-to-bottom Button

Shown when user has scrolled up:
```svelte
{#if showChatScrollHint}
<button
  class="absolute bottom-24 right-6 z-10
         h-8 w-8 rounded-full bg-gray-700 hover:bg-gray-600
         flex items-center justify-center shadow-lg
         text-gray-300 transition-all"
  onclick={scrollToBottom}>
  <svg class="h-4 w-4"><!-- arrow down --></svg>
</button>
{/if}
```

---

## 7. Permission / Hook Approval Cards

These are blocking dialogs — make them visually prominent.

```svelte
<!-- PermissionPanel -->
<div class="mx-4 my-2 rounded-lg border border-yellow-700/50 bg-yellow-900/20 p-4">
  <div class="flex items-start gap-3">
    <svg class="h-5 w-5 text-yellow-400 mt-0.5 shrink-0"><!-- shield --></svg>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-yellow-200">Permission Required</p>
      <p class="text-xs text-yellow-400/80 mt-1">{toolName} wants to {action}</p>
      <code class="mt-2 block text-xs font-mono text-yellow-300/70
                   bg-yellow-950/40 rounded px-2 py-1 break-all">
        {command}
      </code>
    </div>
  </div>
  <div class="flex gap-2 mt-3">
    <button class="px-3 py-1.5 rounded-md bg-yellow-600 hover:bg-yellow-500
                   text-white text-xs font-medium">Allow Once</button>
    <button class="px-3 py-1.5 rounded-md bg-yellow-800 hover:bg-yellow-700
                   text-yellow-200 text-xs">Always Allow</button>
    <button class="px-3 py-1.5 rounded-md hover:bg-gray-700
                   text-gray-400 text-xs ml-auto">Deny</button>
  </div>
</div>
```
