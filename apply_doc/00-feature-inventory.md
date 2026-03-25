# OpenCovibe — Feature Inventory & Status

**Purpose**: Complete map of every feature, its current implementation state, and priority for improvement.
Claude Code should read this first to know what exists, what works, and where to focus.

---

## How to Read Status Labels

```
✅ WORKING     — functional, no known bugs
⚠️  PARTIAL    — implemented but incomplete or buggy
❌ BROKEN      — exists in UI but doesn't function
🔲 MISSING     — planned or hinted in code but not built
🎨 UGLY        — functional but needs UI improvement
```

---

## 1. Chat Page (`/chat`)

| Feature | Status | Notes |
|---|---|---|
| Send message to Claude | ✅ WORKING | Core flow functional |
| Stream response (real-time) | ✅ WORKING | Via Tauri bus_event |
| Tool call cards (inline) | ✅ WORKING | InlineToolCard renders |
| Tool call expand/collapse | ✅ WORKING | expandedTools state |
| Markdown rendering | ✅ WORKING | MarkdownContent component |
| Code syntax highlighting | ✅ WORKING | highlight.js |
| Stop session | ✅ WORKING | stop_session command |
| Permission approval dialog | ✅ WORKING | PermissionPanel |
| Hook review card | ✅ WORKING | HookReviewCard |
| Elicitation dialog | ✅ WORKING | ElicitationDialog |
| File attachments | ✅ WORKING | drag+drop+clipboard |
| Slash commands menu | ✅ WORKING | `/compact`, `/review` etc |
| @ mention menu | ✅ WORKING | file/memory references |
| Model selector | ✅ WORKING | in StatusBar |
| Session fork (Rewind) | ✅ WORKING | RewindModal |
| BTW side question | ✅ WORKING | non-interrupting query |
| PTY terminal pane | ✅ WORKING | XTerminal + xterm.js |
| Session status bar | 🎨 UGLY | functional but dense/cramped |
| Welcome / hero screen | 🎨 UGLY | minimal, no visual hierarchy |
| Message list layout | 🎨 UGLY | tight spacing, hard to read |
| Tool burst header | 🎨 UGLY | plain text, not scannable |
| Context usage grid | ⚠️ PARTIAL | data shows, visualization weak |
| Cost summary view | ⚠️ PARTIAL | numbers show, no trend |
| Plan mode indicator | ⚠️ PARTIAL | status shown, no visual mode change |
| Fast mode toggle | ⚠️ PARTIAL | toggle exists, feedback unclear |
| Verbose mode toggle | ⚠️ PARTIAL | read from CLI config |
| Ralph loop (auto-loop) | ⚠️ PARTIAL | start/cancel works, progress unclear |
| Background task badge | ⚠️ PARTIAL | count shows, panel minimal |
| Effort slider | ⚠️ PARTIAL | UI exists, persistence unclear |
| Remote host dropdown | ⚠️ PARTIAL | dropdown works, SSH state unclear |

---

## 2. Sidebar / Layout (`+layout.svelte`)

| Feature | Status | Notes |
|---|---|---|
| Project folder grouping | ✅ WORKING | buildProjectFolders() |
| Conversation list | ✅ WORKING | grouped by project |
| New chat button | ✅ WORKING | |
| Run rename | ✅ WORKING | |
| Run delete (soft) | ✅ WORKING | swipe or button |
| Expand/collapse projects | ✅ WORKING | |
| Command palette (⌘K) | ✅ WORKING | CommandPalette |
| Prompt favorites | ✅ WORKING | star prompt |
| Search across history | ✅ WORKING | sidebar search bar |
| Setup wizard (first run) | ✅ WORKING | SetupWizard |
| Update banner | ✅ WORKING | UpdateBanner |
| Memory files sidebar | ✅ WORKING | shown in memory tab |
| Sidebar width + collapse | 🎨 UGLY | fixed width, no resize |
| Project item visual design | 🎨 UGLY | text-only, no icons |
| Conversation item density | 🎨 UGLY | too dense, metadata hard to read |
| Active item highlight | 🎨 UGLY | barely visible |
| Keyboard nav in sidebar | ❌ BROKEN | arrow keys don't navigate list |
| Drag to reorder projects | 🔲 MISSING | |
| Pin conversation | 🔲 MISSING | |

---

## 3. Settings Page (`/settings`)

| Feature | Tab | Status | Notes |
|---|---|---|---|
| Language / locale | General | ✅ WORKING | switchLocale() |
| Theme (dark/light) | General | ✅ WORKING | |
| Notification enable | General | ✅ WORKING | |
| Screenshot hotkey | General | ✅ WORKING | |
| Auth source display | Connection | ✅ WORKING | AuthSourceBadge |
| API key input | Connection | ✅ WORKING | set_cli_api_key |
| Platform credentials | Connection | ✅ WORKING | platform_presets |
| CLI verbose toggle | CLI Config | ✅ WORKING | |
| Auto-compact threshold | CLI Config | ✅ WORKING | |
| Max turns setting | CLI Config | ✅ WORKING | |
| Keyboard shortcuts | Shortcuts | ✅ WORKING | KeybindingEditor |
| Remote hosts manage | Remote | ✅ WORKING | add/test/delete |
| SSH key generate | Remote | ✅ WORKING | |
| Debug log panel | Debug | ✅ WORKING | copy/clear |
| Settings tab visual | All | 🎨 UGLY | icon-only tabs with no labels visible |
| Danger zone (reset) | — | 🔲 MISSING | |
| Import/export settings | — | 🔲 MISSING | |

---

## 4. Plugins Page (`/plugins`)

| Feature | Tab | Status | Notes |
|---|---|---|---|
| Browse community skills | Skills | ✅ WORKING | searchCommunitySkills |
| Install community skill | Skills | ✅ WORKING | installCommunitySkill |
| View skill content | Skills | ✅ WORKING | getSkillContent |
| Create custom skill | Skills | ✅ WORKING | inline editor |
| Edit custom skill | Skills | ✅ WORKING | |
| Delete custom skill | Skills | ✅ WORKING | |
| Browse MCP registry | MCP | ✅ WORKING | McpDiscoverPanel |
| Add configured MCP server | MCP | ✅ WORKING | McpConfiguredPanel |
| Toggle MCP server | MCP | ✅ WORKING | |
| Hook manager | Hooks | ✅ WORKING | HookManager |
| Marketplace plugins | Plugins | ⚠️ PARTIAL | list loads, install flow unclear |
| Agent definitions list | Agents | ✅ WORKING | AgentsPanel |
| Create/edit agent | Agents | ✅ WORKING | AgentEditor modal |
| Skill editor UX | Skills | 🎨 UGLY | plain textarea, no syntax help |
| Plugin card layout | All | 🎨 UGLY | inconsistent card sizes |

---

## 5. Usage Page (`/usage`)

| Feature | Status | Notes |
|---|---|---|
| Daily cost chart | ✅ WORKING | bar chart |
| Token breakdown | ✅ WORKING | input/output/cache |
| Heatmap calendar | ✅ WORKING | HeatmapCalendar |
| Model usage stacked chart | ✅ WORKING | StackedModelChart |
| Date range filter | ✅ WORKING | 1d/7d/30d/90d/All |
| App vs Global scope toggle | ✅ WORKING | |
| Run history table | ✅ WORKING | sortable |
| Chart mode switching | ✅ WORKING | cost/tokens/messages/sessions |
| Export data | 🔲 MISSING | |
| Cost per project breakdown | 🔲 MISSING | |
| Chart visual polish | 🎨 UGLY | basic bars, no tooltips |

---

## 6. History Page (`/history`)

| Feature | Status | Notes |
|---|---|---|
| Full-text search | ✅ WORKING | searchRuns |
| Status filter pills | ✅ WORKING | completed/failed/running |
| Tool usage facets | ✅ WORKING | |
| Pagination | ✅ WORKING | 50 per page |
| Navigate to run | ✅ WORKING | click → /chat |
| Date range filter | ⚠️ PARTIAL | not wired to UI |
| Cost display per run | ✅ WORKING | |
| Advanced filters toggle | ⚠️ PARTIAL | panel opens, limited options |
| Visual design | 🎨 UGLY | plain list, no visual hierarchy |

---

## 7. Memory Page (`/memory`)

| Feature | Status | Notes |
|---|---|---|
| Edit CLAUDE.md | ✅ WORKING | CodeEditor (CodeMirror) |
| Preview markdown | ✅ WORKING | toggle edit/preview |
| Auto-save / dirty state | ✅ WORKING | dirty indicator + save |
| List memory files (sidebar) | ✅ WORKING | filterVisibleCandidates |
| Switch between files | ✅ WORKING | selectedFile state |
| Custom file via ?file= | ✅ WORKING | query param override |
| Create new memory file | 🔲 MISSING | can only edit existing |
| Delete memory file | 🔲 MISSING | |
| Memory file template | 🔲 MISSING | |

---

## 8. Explorer Page (`/explorer`)

| Feature | Status | Notes |
|---|---|---|
| File tree (sidebar) | ✅ WORKING | FilesPanel component |
| File content view | ✅ WORKING | CodeEditor |
| Markdown preview | ✅ WORKING | |
| Image preview | ✅ WORKING | base64 display |
| Edit + save file | ✅ WORKING | writeTextFile |
| Git diff view | ✅ WORKING | getGitDiff overlay |
| Navigate directories | ✅ WORKING | listDirectory |
| Upload / create file | 🔲 MISSING | |
| Delete file | 🔲 MISSING | |
| Rename file | 🔲 MISSING | |

---

## 9. Teams Page (`/teams`)

| Feature | Status | Notes |
|---|---|---|
| Team list + switch | ✅ WORKING | sidebar |
| Task board (pending/in-progress/done) | ✅ WORKING | Kanban-style |
| Task detail expand | ✅ WORKING | async load description |
| Team inbox messages | ✅ WORKING | per-agent tabs |
| Team status bar | ✅ WORKING | member statuses |
| Delete team | ✅ WORKING | with confirmation |
| Create team | 🔲 MISSING | no UI, teams come from filesystem |
| Assign task to session | 🔲 MISSING | |
| Task visual design | 🎨 UGLY | basic cards |

---

## Priority Fix List

Based on the above, the highest-impact improvements are:

```
P0 (broken/blocking)
  - Keyboard navigation in sidebar

P1 (ugly core UI — visible every session)
  - Chat message list spacing + visual design
  - Session status bar — reduce visual noise
  - Welcome/hero screen redesign
  - Sidebar conversation item design

P2 (incomplete features with clear path)
  - History page advanced filters
  - Usage charts with tooltips
  - Memory page: create/delete files
  - Explorer: create/delete/rename
```
