# OpenCovibe — State Management Reference

**Use this doc when**: modifying chat behavior, adding UI that reacts to session state, or debugging reactivity.

**Primary file**: `src/lib/stores/session-store.svelte.ts`

---

## SessionPhase State Machine

```
                    startSession()
idle ──────────────────────────────► starting
                                          │
                                    (actor spawned)
                                          ▼
                                       running ◄──────────────┐
                                      /    |    \              │
                           (permission)   │  (hook callback)  │
                                ▼         │        ▼           │
                     waiting_permission   │  waiting_hook      │
                                \         │       /            │
                    respond_permission    │  respond_hook_callback
                                  \       │      /             │
                                   └──────┼──────┘            │
                                          │                    │
                                    (ralph loop) ──────────────┘
                                          │
                                  (stream ends / error / stop)
                                          ▼
                              done | error | stopped
```

**Helper sets** (from `stores/types.ts`):

```typescript
ACTIVE_PHASES    = { starting, running, waiting_permission, waiting_hook, waiting_elicitation }
TERMINAL_PHASES  = { done, error, stopped }
SESSION_ALIVE_PHASES = ACTIVE_PHASES ∪ { done }
```

---

## SessionStore Key Fields

```typescript
// src/lib/stores/session-store.svelte.ts

class SessionStore {
  // State machine
  phase = $state<SessionPhase>("idle");
  running    = $derived(ACTIVE_PHASES.has(this.phase));    // convenience
  finished   = $derived(TERMINAL_PHASES.has(this.phase));

  // Run context
  currentRun  = $state<TaskRun | null>(null);
  runId       = $derived(this.currentRun?.id ?? null);

  // Conversation
  timeline    = $state<TimelineEntry[]>([]);
  lastError   = $state<string | null>(null);

  // Interaction state
  pendingPermission   = $state<PermissionRequest | null>(null);
  pendingHook         = $state<HookEvent | null>(null);
  pendingElicitation  = $state<ElicitationSchema | null>(null);

  // Tool UI state
  expandedTools = $state<Record<string, boolean>>({});

  // Usage / cost
  usage = $state<UsageState>({ inputTokens: 0, outputTokens: 0, cost: 0 });

  // MCP
  mcpServers = $state<McpServerInfo[]>([]);
}
```

---

## TimelineEntry Types

```typescript
type TimelineEntry =
  | { kind: "message";   id: string; role: "user"|"assistant"; content: string; anchorId: string }
  | { kind: "tool";      id: string; toolName: string; input: unknown; output?: unknown;
      status: "running"|"done"|"error"; subTimeline: TimelineEntry[]; anchorId: string }
  | { kind: "system";    id: string; text: string; anchorId: string }
  | { kind: "thinking";  id: string; content: string; anchorId: string };
```

---

## Reading Store in Components

```svelte
<script lang="ts">
  import { getSessionStore } from "$lib/stores/session-store.svelte";

  const session = getSessionStore();
  // session.running, session.timeline, session.phase etc are all reactive $state/$derived
</script>

<!-- Conditional on phase -->
{#if session.phase === "waiting_permission"}
  <PermissionPanel request={session.pendingPermission} />
{:else if session.running}
  <RunningSpinner />
{:else if session.phase === "error"}
  <ErrorBanner message={session.lastError} />
{/if}

<!-- Iterate timeline -->
{#each session.timeline as entry (entry.anchorId)}
  <ChatMessage {entry} expanded={session.expandedTools[entry.id] ?? false} />
{/each}
```

---

## Mutating Timeline (correct patterns)

```typescript
// Append (Svelte 5 $state array — push() is reactive)
session.timeline.push(newEntry);

// Replace single entry (map + spread)
session.timeline = session.timeline.map(e =>
  e.id === targetId ? { ...e, status: "done", output: result } : e
);

// Clear
session.timeline = [];
```

---

## Event Middleware Pipeline

BusEvents from backend pass through middleware before updating store:

```
app.emit("bus_event")
  → transport.listen("bus_event")
  → EventMiddleware.process(event)      [lib/stores/event-middleware.ts]
      filterDuplicates()                dedup by sequence number
      validateSequence()                warn on gaps
      enrichToolData()                  fill tool metadata
  → SessionStore.handleBusEvent(event)
      → phase transitions
      → timeline mutations
      → usage accumulation
```

**Registering custom middleware** (for debugging):
```typescript
import { getEventMiddleware } from "$lib/stores/event-middleware";

getEventMiddleware().use((event, next) => {
  console.log("[debug]", event.type, event);
  next(event);
});
```

---

## Other Stores

### TeamStore (`stores/team-store.svelte.ts`)
```typescript
class TeamStore {
  teams    = $state<Team[]>([]);
  tasks    = $state<TeamTask[]>([]);
  inboxes  = $state<TeamInbox[]>([]);
}
```

### AttentionStore (`stores/attention-store.svelte.ts`)
```typescript
// Tracks unread activity per runId — drives sidebar badge counts
store.bump(runId)   // increment
store.clear(runId)  // mark read
store.counts        // Record<string, number>
```

### CliInfoStore (`stores/cli-info.svelte.ts`)
```typescript
// Singleton — cached CLI version and available slash commands
getCliCommands()        // returns CliCommand[]
updateInstalledVersion(version: string)
```

### KeybindingsStore (`stores/keybindings.svelte.ts`)
```typescript
store.bindings           // KeyBinding[] — user-configurable
store.isPressed(event, action)  // boolean — match check
```

---

## OpGuard: Preventing Concurrent Async Operations

Used internally by SessionStore to prevent double-send etc.:

```typescript
// Pattern (SessionStore uses this internally, not exported)
class OpGuard {
  private _active = false;
  acquire(): boolean { if (this._active) return false; this._active = true; return true; }
  release(): void { this._active = false; }
}

async function safeSend(content: string) {
  if (!sendGuard.acquire()) return;  // reject if already sending
  try {
    await api.sendSessionMessage({ runId, content });
  } finally {
    sendGuard.release();
  }
}
```

---

## Snapshot Cache (`utils/snapshot-cache.ts`)

Caches timeline snapshots for rewind (session fork) without re-fetching:

```typescript
import * as snapshotCache from "$lib/utils/snapshot-cache";

snapshotCache.save(runId, currentTimeline);   // before navigation
const cached = snapshotCache.get(runId);      // on return
if (cached) session.timeline = cached;
```

---

## Reactive Data Flow Diagram

```
Backend event          → EventMiddleware  → handleBusEvent()
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                       timeline.push()  phase = X      usage accumulate
                              │               │               │
                         $derived:       $derived:      $derived:
                       messageCount     running         totalCost
                              │               │               │
                              └───────────────┴───────────────┘
                                              │
                                    Svelte 5 auto-rerenders
                                    only affected components
```
