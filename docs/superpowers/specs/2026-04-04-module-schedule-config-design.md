# Module Schedule Config & Persistence Design

> Feature: 模块运行时状态（启用/定时计划）的可视化配置与持久化存储

---

## Background

当前 ABO 的模块管理系统中，`Module.enabled` 和 `Module.schedule` 是类属性，仅在内存中存在。用户通过 `PATCH /api/modules/{id}/toggle` 开关模块后，服务重启即丢失。前端 `ModuleConfigPanel` 和 `ModuleDetail` 中能查看 schedule，但没有编辑入口。这导致：

1. 用户无法自定义模块执行时间。
2. 模块开关状态无法持久化。
3. 前后端配置通道不统一（配置走 `/api/preferences`，运行时状态没有独立存储）。

## Goal

让用户可以在前端 UI 中修改模块的 `enabled` 和 `schedule`，并持久化到后端存储；修改后无需重启后端即可热生效。

## Architecture

引入一个独立的运行时状态文件 `~/.abo/module-runtime.json`，职责与 `preferences.json`（偏好权重/订阅）完全分离。后端通过 `ModuleStateStore` 读写该文件；前端通过统一的 `PATCH /api/modules/{module_id}` 更新状态。调度器（`ModuleScheduler`）提供热更新接口，在 schedule 变更时立即重新调度任务。

## Tech Stack

- Python FastAPI + APScheduler
- React + TypeScript + Tailwind
- JSON 文件持久化（Tauri 迁移友好）

---

## Data Storage

### File: `~/.abo/module-runtime.json`

```json
{
  "arxiv-tracker": {
    "enabled": true,
    "schedule": "0 8 * * *"
  },
  "bilibili-tracker": {
    "enabled": false,
    "schedule": "0 11 * * *"
  }
}
```

**行为：**
- 启动时：`ModuleRegistry.load_all()` 完成后，`ModuleStateStore.apply_to_registry(registry)` 将文件中的状态覆盖到各模块实例。
- 修改时：`PATCH /api/modules/{id}` 更新内存并原子写入文件。
- 缺失时：若文件不存在，用各模块默认值初始化并创建文件。

**可维护性（方便后续加新模块）：**
- `apply_to_registry()` 遍历的是已加载的 `registry.all()`，而不是硬编码的模块列表。新模块只要类上声明了 `id`/`enabled`/`schedule`，就会自动被识别。
- 如果 `module-runtime.json` 中缺少某个新模块的条目，不会报错，直接使用该模块类上的默认值（`Module.enabled` / `Module.schedule`）。
- 如果 JSON 中存在但当前未加载的模块（比如已被删除的旧模块），静默清理并回写文件，避免脏数据累积。
- 所有默认值来源单一：**`Module` 基类 / 子类属性**是唯一的默认 truth。

---

## Backend Design

### New File: `abo/runtime/state.py`

Responsibilities:
- Load / save `module-runtime.json`
- Apply stored state to `ModuleRegistry`
- Update a single module's state and persist

Key methods:
- `load() -> dict`
- `save(data: dict)`
- `apply_to_registry(registry: ModuleRegistry)`
- `update_module(module_id: str, enabled: bool | None, schedule: str | None) -> dict`

### Modified: `abo/runtime/scheduler.py`

Add two methods:
- `update_schedule(module_id: str, new_schedule: str)` — remove old job and re-add with new cron.
- `update_enabled(module_id: str, enabled: bool)` — if disabled, remove job; if enabled and job missing, add it.

### Modified: `abo/runtime/discovery.py`

After `load_all()`, call `state_store.apply_to_registry(self)` to restore persisted values.

### Modified: `abo/main.py`

**Replace** the existing `PATCH /api/modules/{module_id}/toggle` with a unified:

```
PATCH /api/modules/{module_id}
Body: { "enabled"?: boolean, "schedule"?: string }
```

Behavior:
- Validate module exists.
- Validate schedule is non-empty and parseable via `CronTrigger.from_crontab()`.
- Update `module.enabled` / `module.schedule` in memory.
- Persist via `ModuleStateStore`.
- Notify scheduler to add/remove/reschedule the job.
- Return the updated module status.

**Remove** legacy `toggle` endpoint (or deprecate and make it call the new PATCH internally).

---

## Frontend Design

### Modified: `src/modules/feed/ModuleDetail.tsx`

Add a "Runtime Settings" card above or alongside the existing config card:

- **Enable toggle**: switch to turn module on/off.
- **Schedule selector**: dropdown with presets
  - `每天 8:00` (`0 8 * * *`)
  - `每天 10:00` (`0 10 * * *`)
  - `每天 11:00` (`0 11 * * *`)
  - `每天 13:00` (`0 13 * * *`)
  - `每 5 分钟` (`*/5 * * * *`)
  - `自定义`
- When `自定义` is selected, show a text input for raw cron expression.
- **Save button**: calls `PATCH /api/modules/{module_id}` with `{enabled, schedule}`.
- On save success, show toast and refresh module list in store.

### Modified: `src/components/ModuleConfigPanel.tsx`

This component is embedded in `FeedSidebar`. Simplify it to a read-only or lightweight control panel:
- Show module name, icon, current schedule description, and an on/off indicator.
- Clicking a module card navigates to `ModuleDetail` for full editing.
- Remove inline subscription/keyword editing from here; that logic moves entirely to `ModuleDetail`.

If removing subscription editing from `ModuleConfigPanel` causes immediate UI regression in `FeedSidebar`, keep the existing keyword/subscription UI but ensure `ModuleDetail` also supports the same operations (dual entry is acceptable short-term; later we can deprecate the sidebar variant).

### Type update: `src/core/store.ts`

Ensure `FeedModule` type includes `enabled: boolean` and `schedule: string`.

---

## API Changes

| Endpoint | Change |
|----------|--------|
| `GET /api/modules` | No breaking change; already returns `enabled`, `schedule`, `next_run`. |
| `PATCH /api/modules/{id}/toggle` | Replaced by unified PATCH below (or kept as thin redirect). |
| `PATCH /api/modules/{id}` | **New** — update `enabled` and/or `schedule`. |

---

## Error Handling

- Invalid cron: return `400` with message `"Invalid cron expression"`.
- Module not found: return `404`.
- JSON write failure: return `500` but keep memory state rolled back (or accept memory state and log error; simplest is to write before mutating scheduler).

---

## Testing Checklist

- [ ] Toggle module off → job removed from scheduler.
- [ ] Toggle module on → job re-added.
- [ ] Change schedule → `next_run` updates in `GET /api/modules`.
- [ ] Restart backend → previous enabled/schedule values restored from JSON.
- [ ] Frontend preset dropdown selects correct value on load.
- [ ] Custom cron survives round-trip (type -> save -> reload -> display).

---

## Files to Touch

**Backend:**
- `abo/runtime/state.py` (create)
- `abo/runtime/scheduler.py` (modify)
- `abo/runtime/discovery.py` (modify)
- `abo/main.py` (modify)

**Frontend:**
- `src/modules/feed/ModuleDetail.tsx` (modify)
- `src/components/ModuleConfigPanel.tsx` (modify)
- `src/core/store.ts` (verify/update types)
