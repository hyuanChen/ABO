# OpenCovibe — Sidebar & Navigation Design Spec

**File**: `src/routes/+layout.svelte`
**Status**: Functional but visually plain and dense.

---

## Layout Overview

```
┌──────────────────────────────────────────────────────────────┐
│ SIDEBAR (w-60)          │ MAIN CONTENT (flex-1)              │
│                         │                                    │
│ [Logo + app name]       │  <slot />                          │
│ ─────────────────       │                                    │
│ [+ New Chat]            │                                    │
│ ─────────────────       │                                    │
│ 🔍 Search...            │                                    │
│ ─────────────────       │                                    │
│ ▾ my-project            │                                    │
│   ├ Chat about auth     │                                    │
│   ├ Fix linting errors  │                                    │
│   └ Refactor API        │                                    │
│ ▾ other-project         │                                    │
│   └ ...                 │                                    │
│ ─────────────────       │                                    │
│ [NAV ICONS: bottom]     │                                    │
│ Settings · Usage · Plug │                                    │
└──────────────────────────────────────────────────────────────┘
```

---

## 1. Sidebar Structure

```svelte
<!-- +layout.svelte top-level -->
<div class="flex h-screen overflow-hidden bg-gray-950 text-gray-100">

  <!-- Sidebar -->
  <nav class="flex flex-col w-60 shrink-0 border-r border-gray-800 bg-gray-900
              transition-all duration-200 {sidebarOpen ? '' : '-translate-x-full w-0'}">

    <!-- Header: logo + new chat -->
    <div class="flex items-center gap-2 px-3 h-12 border-b border-gray-800 shrink-0">
      <img src="/logo.png" class="h-6 w-6 rounded" alt="OpenCovibe"/>
      <span class="text-sm font-semibold text-gray-100">OpenCovibe</span>
      <div class="flex-1"/>
      <button onclick={newChat}
              class="p-1.5 rounded-md hover:bg-gray-700 text-gray-400 hover:text-white"
              title="New chat (⌘N)">
        <svg class="h-4 w-4"><!-- plus icon --></svg>
      </button>
    </div>

    <!-- Search bar -->
    <div class="px-3 py-2 shrink-0">
      <div class="flex items-center gap-2 rounded-md bg-gray-800 border border-gray-700
                  px-2.5 py-1.5 focus-within:border-gray-500">
        <svg class="h-3.5 w-3.5 text-gray-500 shrink-0"><!-- search --></svg>
        <input placeholder="Search..." class="flex-1 bg-transparent text-xs text-gray-300
               placeholder:text-gray-600 focus:outline-none"/>
        <kbd class="text-xs text-gray-600">⌘K</kbd>
      </div>
    </div>

    <!-- Project + conversation list (scrollable) -->
    <div class="flex-1 overflow-y-auto px-2 pb-2">
      {#each projectGroups as group}
        <ProjectFolderItem {group} {activeRunId} on:select={...}/>
      {/each}
    </div>

    <!-- Bottom nav links -->
    <div class="shrink-0 border-t border-gray-800 p-2">
      <NavBottomItems {activePath}/>
    </div>

  </nav>

  <!-- Main -->
  <main class="flex-1 min-w-0 flex flex-col overflow-hidden">
    <slot />
  </main>

</div>
```

---

## 2. Project Folder Item

**File**: `src/lib/components/ProjectFolderItem.svelte`

### Target design

```
▾ my-project                        [+]       ← folder row
  ├ ● Chat about auth     2h   $0.04          ← active run (green dot)
  ├   Fix linting errors  3h   $0.02
  └   Refactor API       1d
```

```svelte
<!-- Folder header -->
<div class="flex items-center gap-1.5 px-2 py-1.5 rounded-md
            hover:bg-gray-800 cursor-pointer group
            {expanded ? 'text-gray-200' : 'text-gray-400 hover:text-gray-200'}">
  <svg class="h-3.5 w-3.5 transition-transform {expanded ? '' : '-rotate-90'}">
    <!-- chevron down -->
  </svg>
  <!-- folder icon -->
  <svg class="h-3.5 w-3.5 text-gray-500 shrink-0"><!-- folder --></svg>
  <span class="flex-1 text-xs font-medium truncate">{projectName}</span>
  <!-- new chat in folder button — show on hover -->
  <button class="opacity-0 group-hover:opacity-100 p-0.5 rounded
                 hover:bg-gray-600 text-gray-500 hover:text-gray-300"
          onclick|stopPropagation={newChatInFolder}>
    <svg class="h-3 w-3"><!-- plus --></svg>
  </button>
</div>

<!-- Conversation items -->
{#if expanded}
<div class="pl-4">
  {#each group.conversations as run}
    <ConversationItem {run} active={run.id === activeRunId}/>
  {/each}
</div>
{/if}
```

---

## 3. Conversation Item

```svelte
<button
  onclick={() => selectRun(run.id)}
  class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left group
         {active
           ? 'bg-gray-700 text-gray-100'
           : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}">

  <!-- Running indicator dot -->
  {#if run.status === 'running'}
    <span class="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse shrink-0"></span>
  {:else}
    <span class="h-1.5 w-1.5 rounded-full bg-transparent shrink-0"></span>
  {/if}

  <!-- Title -->
  <span class="flex-1 text-xs truncate">{run.title || 'New chat'}</span>

  <!-- Metadata — show on hover or active -->
  <span class="text-xs text-gray-600 {active ? '' : 'hidden group-hover:inline'}
               shrink-0 font-mono">
    {relativeTime(run.created_at)}
  </span>

  <!-- Delete button — hover only -->
  <button
    onclick|stopPropagation={() => deleteRun(run.id)}
    class="opacity-0 group-hover:opacity-100 p-0.5 rounded
           hover:text-red-400 text-gray-600 shrink-0">
    <svg class="h-3 w-3"><!-- trash --></svg>
  </button>
</button>
```

---

## 4. Bottom Navigation

Thin icon+label bar for page navigation:

```svelte
<div class="flex flex-col gap-0.5">
  {#each navItems as item}
    <a href={item.href}
       class="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs
              {$page.url.pathname.startsWith(item.href)
                ? 'bg-gray-700 text-gray-100'
                : 'text-gray-500 hover:bg-gray-800 hover:text-gray-200'}
              transition-colors">
      <svg class="h-4 w-4 shrink-0">{@html item.icon}</svg>
      <span>{item.label}</span>
      {#if item.badge}
        <span class="ml-auto h-4 min-w-4 px-1 rounded-full bg-blue-600
                     text-white text-xs flex items-center justify-center">
          {item.badge}
        </span>
      {/if}
    </a>
  {/each}
</div>
```

Nav items:
```typescript
const navItems = [
  { href: "/chat",     label: "Chat",     icon: "..." },
  { href: "/history",  label: "History",  icon: "..." },
  { href: "/usage",    label: "Usage",    icon: "..." },
  { href: "/memory",   label: "Memory",   icon: "..." },
  { href: "/explorer", label: "Files",    icon: "..." },
  { href: "/plugins",  label: "Plugins",  icon: "...", badge: unreadCount },
  { href: "/teams",    label: "Teams",    icon: "..." },
  { href: "/settings", label: "Settings", icon: "..." },
];
```

---

## 5. Command Palette

**File**: `src/lib/components/CommandPalette.svelte`
Triggered by `⌘K`. Already functional. Visual improvements:

```svelte
<!-- Modal backdrop -->
<div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start
            justify-center pt-24">
  <div class="w-full max-w-lg rounded-xl bg-gray-800 border border-gray-700
              shadow-2xl overflow-hidden">

    <!-- Search input -->
    <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
      <svg class="h-4 w-4 text-gray-500 shrink-0"><!-- search --></svg>
      <input class="flex-1 bg-transparent text-sm text-gray-100
                    placeholder:text-gray-500 focus:outline-none"
             placeholder="Search commands..."/>
      <kbd class="text-xs text-gray-600 bg-gray-700 px-1.5 py-0.5 rounded">ESC</kbd>
    </div>

    <!-- Results list (max-h-80, overflow-y-auto) -->
    <div class="max-h-80 overflow-y-auto py-2">
      {#each groupedResults as [category, cmds]}
        <div class="px-3 py-1">
          <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {category}
          </span>
        </div>
        {#each cmds as cmd}
          <button class="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-700
                         text-left rounded-md mx-1">
            <span class="text-sm text-gray-200">{cmd.name}</span>
            <span class="flex-1 text-xs text-gray-500">{cmd.description}</span>
            {#if cmd.shortcut}
              <kbd class="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">
                {cmd.shortcut}
              </kbd>
            {/if}
          </button>
        {/each}
      {/each}
    </div>

  </div>
</div>
```
