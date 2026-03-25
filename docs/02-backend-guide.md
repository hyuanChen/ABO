# OpenCovibe — Backend Patterns (Rust / Tauri 2)

**Use this doc when**: adding IPC commands, modifying agent behavior, or touching storage.

---

## Adding a New IPC Command — Exact Steps

### 1. Write the command function

```rust
// src-tauri/src/commands/files.rs  (or appropriate module)

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct MyArgs {
    pub path: String,
    pub limit: Option<u32>,
}

#[derive(Serialize)]
pub struct MyResult {
    pub items: Vec<String>,
    pub total: u32,
}

#[tauri::command]
pub async fn my_new_command(args: MyArgs) -> Result<MyResult, String> {
    // implementation
    Ok(MyResult { items: vec![], total: 0 })
}
```

### 2. Register in lib.rs

```rust
// src-tauri/src/lib.rs — inside generate_handler![]
.invoke_handler(tauri::generate_handler![
    // ... existing ...
    commands::files::my_new_command,   // ADD HERE
])
```

### 3. Add TypeScript wrapper in api.ts

```typescript
// src/lib/api.ts
export async function myNewCommand(path: string, limit?: number): Promise<{
  items: string[];
  total: number;
}> {
  return getTransport().invoke("my_new_command", { args: { path, limit } });
}
```

---

## IPC Rules

```
Rust function name → JS invoke() string    snake_case preserved exactly
Rust param name snake_case → JS camelCase  auto-converted by Tauri
Return type must impl Serialize
Arg types must impl Deserialize
Async commands: use String not &str for params
Error type: Result<T, String> is sufficient; serialize to string
```

---

## Accessing Managed State in Commands

State is registered in `lib.rs` via `.manage()`. Access via injected params:

```rust
use crate::agent::stream::ProcessMap;

#[tauri::command]
pub async fn count_processes(
    processes: tauri::State<'_, ProcessMap>,
) -> Result<usize, String> {
    Ok(processes.lock().await.len())
}
```

**Registered state types** (from `lib.rs`):

| Type | Purpose |
|---|---|
| `ProcessMap` | Running claude stream processes |
| `PtyMap` | Running PTY sessions |
| `ActorSessionMap` | Session actors (tokio tasks) |
| `CliInfoCache` | CLI version info cache |
| `Arc<EventWriter>` | Writes events to disk |
| `SpawnLocks` | Prevents duplicate session starts |
| `ShutdownGate` | One-shot shutdown sequencing |
| `CancellationToken` | Global graceful shutdown signal |
| `SharedLiveToken` | Web server auth token |
| `EffectiveWebPort` | Current web server port |

---

## Session Actor Pattern

Each conversation is an independent tokio Actor. Never interact with subprocesses directly from commands — always go through the actor.

```
commands::session::send_session_message()
  → ActorSessionMap.get(run_id)        [agent/adapter.rs]
  → handle.cmd_tx.send(ActorCommand::SendMessage { content })
  → SessionActor receives → writes to subprocess stdin
  → stdout → claude_stream::parse() → BusEvent
  → app.emit("bus_event", payload)     → frontend
```

**ActorCommand variants** (`agent/session_actor.rs`):
```rust
ActorCommand::Stop { reply }
ActorCommand::SendMessage { content }
ActorCommand::SendControl { action }
ActorCommand::RespondPermission { allow, always_allow }
ActorCommand::RespondHookCallback { decision, ... }
ActorCommand::RespondElicitation { values }
```

---

## Emitting Events to Frontend

```rust
// From any async context with AppHandle
app_handle.emit("bus_event", &payload).ok();
app_handle.emit("session_status", &status_payload).ok();

// PTY output uses run-specific event name
app_handle.emit(&format!("pty_data_{}", pty_id), &data).ok();
```

Frontend listens with `transport.listen("event_name", handler)`.

---

## Storage Layer

No database. JSON files under:
```
macOS: ~/Library/Application Support/OpenCovibe/
```

**Write pattern** — always atomic (write tmp → rename):

```rust
pub fn save<T: serde::Serialize>(path: &Path, data: &T) -> Result<(), Box<dyn Error>> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(data)?)?;
    std::fs::rename(tmp, path)?;   // atomic on same filesystem
    Ok(())
}
```

**Event storage**: NDJSON (newline-delimited JSON) at `runs/{run_id}/events.jsonl`.
**Run metadata**: `runs/{run_id}/meta.json`.

---

## Error Handling Conventions

```rust
// Simple: String errors (sufficient for most commands)
#[tauri::command]
pub async fn delete_run(run_id: String) -> Result<(), String> {
    storage::runs::delete(&run_id).map_err(|e| e.to_string())
}

// Structured: when frontend needs to distinguish error types
#[derive(Debug, serde::Serialize)]
pub struct AppError { pub code: String, pub message: String }

#[tauri::command]
pub async fn risky_op(path: String) -> Result<String, AppError> {
    if !std::path::Path::new(&path).exists() {
        return Err(AppError { code: "NOT_FOUND".into(), message: path });
    }
    Ok("ok".into())
}
```

---

## Graceful Shutdown

The app uses a two-phase shutdown (`lib.rs: graceful_shutdown_actors()`):
1. Fire `CancellationToken` → actors self-clean (3s window)
2. Force-drain remaining actors via `ActorCommand::Stop`
3. Kill remaining `ProcessMap` and `PtyMap` entries

**Always check `CancellationToken` in long-running loops**:
```rust
tokio::select! {
    _ = cancel_token.cancelled() => break,
    result = some_future => { /* handle */ }
}
```

---

## Logging

```rust
log::debug!("[commands::session] starting session {}", run_id);
log::info!("[agent] actor spawned for run {}", run_id);
log::warn!("[storage] failed to parse event, skipping: {}", e);
log::error!("[web_server] fatal error: {}", e);
```

Default filter: `opencovibe_desktop_lib=debug,warn`
Override: `RUST_LOG=opencovibe_desktop_lib=trace npm run tauri dev`

---

## Web Server (axum)

Internal HTTP + WebSocket server for browser mode. Start/stop controlled via:
- `commands::web_server::restart_web_server` (IPC)
- Auto-start in `lib.rs setup()` if enabled in settings

Auth: ephemeral 32-char alphanumeric token in `SharedLiveToken`, rotated on demand.
CSP allows: `api.anthropic.com`, `*.anthropic.com`, `self` only.
