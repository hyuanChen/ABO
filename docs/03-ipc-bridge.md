# OpenCovibe — IPC Command Reference

**Use this doc when**: looking up what backend commands exist before implementing frontend features.

All commands called via: `getTransport().invoke("command_name", args)` or `api.xxx()` wrappers.
Registered in: `src-tauri/src/lib.rs` `generate_handler![]`.

---

## Session Lifecycle (`commands/session.rs`)

| Command | Args (JS camelCase) | Returns | Notes |
|---|---|---|---|
| `start_session` | `{ runId, cwd, model?, systemPrompt?, ... }` | `SessionInfo` | Spawns actor + subprocess |
| `send_session_message` | `{ runId, content, attachments? }` | `void` | Sends to live session |
| `stop_session` | `{ runId }` | `void` | Sends Stop to actor |
| `fork_session` | `{ runId, messageIndex }` | `string` | Returns new runId |
| `side_question` | `{ runId, question }` | `string` | Non-interrupting query |
| `start_ralph_loop` | `{ runId, goal }` | `void` | Auto-loop mode |
| `cancel_ralph_loop` | `{ runId }` | `void` | |
| `send_session_control` | `{ runId, action }` | `void` | e.g. interrupt |
| `broadcast_mcp_toggle` | `{ runId, serverId, enabled }` | `void` | |
| `get_bus_events` | `{ runId, afterSeq? }` | `BusEvent[]` | Poll fallback |
| `approve_session_tool` | `{ runId, toolId }` | `void` | |
| `cancel_control_request` | `{ runId }` | `void` | |
| `respond_permission` | `{ runId, allow, alwaysAllow? }` | `void` | |
| `respond_hook_callback` | `{ runId, decision, ... }` | `void` | |
| `respond_elicitation` | `{ runId, values }` | `void` | |

---

## Run Management (`commands/runs.rs`)

| Command | Args | Returns |
|---|---|---|
| `list_runs` | `{ cwd?, limit?, offset? }` | `TaskRun[]` |
| `get_run` | `{ runId }` | `TaskRun` |
| `start_run` | `{ cwd, model?, ... }` | `TaskRun` |
| `stop_run` | `{ runId }` | `void` |
| `update_run_model` | `{ runId, model }` | `void` |
| `rename_run` | `{ runId, name }` | `void` |
| `soft_delete_runs` | `{ runIds: string[] }` | `void` |
| `search_prompts` | `{ query, limit? }` | `PromptResult[]` |
| `add_prompt_favorite` | `{ prompt, tags? }` | `string` |
| `remove_prompt_favorite` | `{ id }` | `void` |
| `update_prompt_favorite_tags` | `{ id, tags }` | `void` |
| `update_prompt_favorite_note` | `{ id, note }` | `void` |
| `list_prompt_favorites` | `{ tag? }` | `PromptFavorite[]` |
| `list_prompt_tags` | `{}` | `string[]` |

---

## Events & History

| Command | Args | Returns |
|---|---|---|
| `get_run_events` | `{ runId, afterSeq? }` | `RunEvent[]` |
| `get_run_artifacts` | `{ runId }` | `RunArtifacts` |
| `search_runs` | `{ query, limit? }` | `RunSearchResult[]` |
| `get_run_files` | `{ runId }` | `string[]` |
| `export_conversation` | `{ runId, format? }` | `string` |

---

## Settings (`commands/settings.rs`, `commands/cli_config.rs`, `commands/cli_settings.rs`)

| Command | Args | Returns |
|---|---|---|
| `get_user_settings` | `{}` | `UserSettings` |
| `update_user_settings` | `{ settings }` | `void` |
| `get_agent_settings` | `{ agent }` | `AgentSettings` |
| `update_agent_settings` | `{ agent, settings }` | `void` |
| `get_cli_config` | `{}` | `CliConfig` |
| `get_project_cli_config` | `{ cwd }` | `CliConfig` |
| `update_cli_config` | `{ config }` | `void` |
| `get_cli_permissions` | `{ cwd }` | `CliPermissions` |
| `update_cli_permissions` | `{ cwd, permissions }` | `void` |

---

## File System (`commands/fs.rs`, `commands/files.rs`)

| Command | Args | Returns |
|---|---|---|
| `list_directory` | `{ path }` | `DirEntry[]` |
| `check_is_directory` | `{ path }` | `boolean` |
| `read_file_base64` | `{ path }` | `string` |
| `read_text_file` | `{ path }` | `string` |
| `write_text_file` | `{ path, content }` | `void` |
| `read_task_output` | `{ taskId }` | `string` |
| `list_memory_files` | `{ cwd }` | `MemoryFile[]` |

---

## Git (`commands/git.rs`)

| Command | Args | Returns |
|---|---|---|
| `get_git_summary` | `{ cwd }` | `GitSummary` |
| `get_git_branch` | `{ cwd }` | `string` |
| `get_git_diff` | `{ cwd, staged? }` | `string` |
| `get_git_status` | `{ cwd }` | `GitStatus` |

---

## Plugins / Skills (`commands/plugins.rs`)

| Command | Args | Returns |
|---|---|---|
| `list_standalone_skills` | `{}` | `Skill[]` |
| `list_project_commands` | `{ cwd }` | `ProjectCommand[]` |
| `list_installed_plugins` | `{}` | `InstalledPlugin[]` |
| `install_plugin` | `{ pluginId }` | `void` |
| `uninstall_plugin` | `{ pluginId }` | `void` |
| `enable_plugin` / `disable_plugin` | `{ pluginId }` | `void` |
| `create_skill` | `{ name, content }` | `string` |
| `update_skill` | `{ id, content }` | `void` |
| `delete_skill` | `{ id }` | `void` |
| `search_community_skills` | `{ query }` | `CommunitySkill[]` |
| `install_community_skill` | `{ skillId }` | `void` |
| `get_skill_content` | `{ skillId }` | `string` |

---

## Stats (`commands/stats.rs`)

| Command | Args | Returns |
|---|---|---|
| `get_usage_overview` | `{ days? }` | `UsageOverview` |
| `get_global_usage_overview` | `{}` | `GlobalUsage` |
| `clear_usage_cache` | `{}` | `void` |
| `get_heatmap_daily` | `{ days }` | `HeatmapData[]` |
| `get_changelog` | `{}` | `ChangelogEntry[]` |

---

## Diagnostics (`commands/diagnostics.rs`)

| Command | Args | Returns |
|---|---|---|
| `check_agent_cli` | `{}` | `CliCheckResult` |
| `run_diagnostics` | `{}` | `DiagnosticReport` |
| `test_remote_host` | `{ host }` | `RemoteCheckResult` |
| `get_cli_dist_tags` | `{}` | `DistTags` |
| `check_project_init` | `{ cwd }` | `ProjectInitStatus` |
| `check_ssh_key` | `{}` | `SshKeyStatus` |
| `generate_ssh_key` | `{ comment? }` | `string` |
| `detect_local_proxy` | `{}` | `ProxyInfo` |

---

## PTY Terminal (`commands/pty.rs`)

| Command | Args | Returns |
|---|---|---|
| `spawn_pty` | `{ cwd, cmd?, rows, cols }` | `string` (ptyId) |
| `write_pty` | `{ ptyId, data }` | `void` |
| `resize_pty` | `{ ptyId, rows, cols }` | `void` |
| `close_pty` | `{ ptyId }` | `void` |

PTY output: Tauri event `pty_data_{ptyId}` (string chunks).

---

## Auth / Onboarding (`commands/onboarding.rs`)

| Command | Args | Returns |
|---|---|---|
| `check_auth_status` | `{}` | `AuthStatus` |
| `detect_install_methods` | `{}` | `InstallMethod[]` |
| `run_claude_login` | `{}` | `void` |
| `get_auth_overview` | `{}` | `AuthOverview` |
| `set_cli_api_key` | `{ key }` | `void` |
| `remove_cli_api_key` | `{}` | `void` |

---

## Teams (`commands/teams.rs`)

| Command | Args | Returns |
|---|---|---|
| `list_teams` | `{}` | `Team[]` |
| `get_team_config` | `{ teamId }` | `TeamConfig` |
| `list_team_tasks` | `{ teamId }` | `TeamTask[]` |
| `get_team_task` | `{ teamId, taskId }` | `TeamTask` |
| `get_team_inbox` | `{ teamId }` | `TeamInbox` |
| `get_all_team_inboxes` | `{}` | `TeamInbox[]` |
| `delete_team` | `{ teamId }` | `void` |

---

## MCP Servers (`commands/mcp.rs`)

| Command | Args | Returns |
|---|---|---|
| `list_configured_mcp_servers` | `{}` | `McpServerConfig[]` |
| `add_mcp_server` | `{ config }` | `void` |
| `remove_mcp_server` | `{ serverId }` | `void` |
| `toggle_mcp_server_config` | `{ serverId, enabled }` | `void` |
| `get_disabled_mcp_servers` | `{}` | `string[]` |
| `search_mcp_registry` | `{ query }` | `McpRegistryResult[]` |

---

## Web Server + Misc

| Command | Args | Returns |
|---|---|---|
| `get_web_server_status` | `{}` | `WebServerStatus` |
| `get_web_server_token` | `{}` | `string` |
| `regenerate_web_server_token` | `{}` | `string` |
| `restart_web_server` | `{}` | `void` |
| `get_local_ip` | `{}` | `string[]` |
| `get_cli_info` | `{}` | `CliInfo` |
| `capture_screenshot` | `{}` | `string` (base64) |
| `update_screenshot_hotkey` | `{ shortcut }` | `void` |
| `discover_cli_sessions` | `{}` | `CliSession[]` |
| `import_cli_session` | `{ sessionId }` | `string` |
| `sync_cli_session` | `{ sessionId }` | `void` |
| `check_for_updates` | `{}` | `UpdateInfo` |
| `get_clipboard_files` | `{}` | `ClipboardFile[]` |
| `save_temp_attachment` | `{ data, mimeType }` | `string` |

---

## Real-time Events (frontend listens)

| Event name | Payload | Trigger |
|---|---|---|
| `bus_event` | `BusEvent` | Any AI session activity |
| `pty_data_{ptyId}` | `string` | Terminal output chunk |
| `session_status` | `SessionStatusEvent` | Session phase change |
| `update_available` | `UpdateInfo` | New app version detected |
