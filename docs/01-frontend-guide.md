# OpenCovibe — Frontend Patterns (Svelte 5)

**Use this doc when**: writing or modifying any `.svelte` file or `lib/stores/*.svelte.ts`.

---

## Svelte 5 Rules (enforced in this project)

```
✅ USE                          ❌ DO NOT USE
─────────────────────────────────────────────
$state(value)                   let x = value  (not reactive)
$derived(expr)                  $: x = expr
$props()                        export let prop
onclick={handler}               on:click={handler}
{@render children()}            <slot />
callback props                  createEventDispatcher
*.svelte.ts for stores          *.ts with $state at module level
```

---

## State: $state / $derived

```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);   // computed — never use $effect for this
  let list = $state<string[]>([]);

  // Mutating arrays: push() works on $state arrays
  function add(item: string) {
    list.push(item);  // triggers reactivity
  }
</script>
```

---

## Props Pattern

```svelte
<script lang="ts">
  // Standard props with types inline
  let { title, count = 0, onchange }: {
    title: string;
    count?: number;
    onchange?: (v: number) => void;
  } = $props();

  // Two-way binding
  let { value = $bindable("") } = $props();
</script>
```

---

## Component Communication

```
Parent → Child      props
Child → Parent      callback props (onchange, onsubmit, onclose)
Cross-component     import store from lib/stores/ (singleton pattern)
```

```svelte
<!-- Parent -->
<MyComponent
  title="hello"
  onsubmit={(data) => handleSubmit(data)}
/>

<!-- Child -->
<script lang="ts">
  let { title, onsubmit }: { title: string; onsubmit?: (d: Data) => void } = $props();
</script>
<button onclick={() => onsubmit?.({ ... })}>Submit</button>
```

---

## Side Effects: $effect

Only for DOM operations, subscriptions, or external sync. **Not for deriving values.**

```svelte
<script lang="ts">
  $effect(() => {
    const el = document.getElementById("target");
    el?.scrollIntoView();
    return () => { /* cleanup runs on re-run or unmount */ };
  });
</script>
```

---

## New Component Template

```svelte
<!-- src/lib/components/MyComponent.svelte -->
<script lang="ts">
  import type { SomeType } from "$lib/types";

  let {
    items = [],
    onselect,
  }: {
    items?: SomeType[];
    onselect?: (item: SomeType) => void;
  } = $props();

  let selected = $state<SomeType | null>(null);
  let count = $derived(items.length);
</script>

<div class="flex flex-col gap-2">
  {#each items as item (item.id)}
    <button
      class="px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
      onclick={() => { selected = item; onselect?.(item); }}
    >
      {item.name}
    </button>
  {/each}
</div>
```

---

## Calling the Backend (IPC)

**Always use `lib/api.ts`.** Never call `invoke()` directly in a component.

```svelte
<script lang="ts">
  import * as api from "$lib/api";
  import { getTransport } from "$lib/transport";

  // One-shot calls
  async function load() {
    const runs = await api.listRuns();
  }

  // Real-time event subscription
  $effect(() => {
    let unlisten: (() => void) | undefined;

    getTransport()
      .listen<BusEvent>("bus_event", (payload) => {
        // handle event
      })
      .then((fn) => { unlisten = fn; });

    return () => unlisten?.();  // cleanup on unmount
  });
</script>
```

---

## Routes

| Path | File | Notes |
|---|---|---|
| `/chat` | `routes/chat/+page.svelte` | Most complex — uses SessionStore |
| `/settings` | `routes/settings/+page.svelte` | |
| `/history` | `routes/history/+page.svelte` | |
| `/usage` | `routes/usage/+page.svelte` | Token charts |
| `/memory` | `routes/memory/+page.svelte` | CLAUDE.md editor |
| `/plugins` | `routes/plugins/+page.svelte` | Skill manager |
| `/teams` | `routes/teams/+page.svelte` | Needs `+page.ts` loader |
| `/explorer` | `routes/explorer/+page.svelte` | File browser |

`+layout.svelte` renders sidebar for all routes.

---

## Tailwind Conventions

```
Spacing   p-1=4px  p-2=8px  p-4=16px  (4px base)
Colors    gray-*=neutral  blue-*=action  green-*=success  red-*=danger
Dark mode dark: prefix variant on every color class
Text      text-sm=14px  text-xs=12px
```

---

## i18n

```svelte
<script lang="ts">
  import { t } from "$lib/i18n";
</script>

<button>{t("chat.send")}</button>
<!-- Key must exist in messages/en.json AND messages/zh-CN.json -->
```

Add keys to both files, then run `npm run i18n:check`.

---

## Common Mistakes to Avoid

| Mistake | Correct |
|---|---|
| `let x = val` (no $state) | `let x = $state(val)` |
| `$effect` for derived value | `$derived(expr)` |
| `on:click` | `onclick` |
| `<slot />` | `{@render children()}` |
| `invoke()` in component | `api.xxx()` |
| Module-level `$state` in `.ts` | Use `.svelte.ts` extension |
| Hard-coded UI string | `t("key")` from i18n |
