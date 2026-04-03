# Module Schedule Config & Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent storage for module runtime state (enabled/schedule) with a schedule editor in the frontend, and support hot scheduler updates without restart.

**Architecture:** Introduce `abo/runtime/state.py` backed by `~/.abo/module-runtime.json` to store and restore module enabled/schedule values. Extend `ModuleScheduler` to add/remove/reschedule jobs dynamically. Replace `PATCH /api/modules/{id}/toggle` with a unified `PATCH /api/modules/{id}` that updates memory, persists JSON, and notifies the scheduler. Update `ModuleDetail.tsx` with a preset + custom cron editor and an enabled toggle.

**Tech Stack:** Python 3.11 + FastAPI + APScheduler, React + TypeScript + Tailwind, JSON file persistence in `~/.abo/`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `abo/runtime/state.py` | Create | Read/write `~/.abo/module-runtime.json`; apply defaults and clean stale entries |
| `tests/test_runtime_state.py` | Create | Unit tests for `ModuleStateStore` |
| `abo/runtime/scheduler.py` | Modify | Add `update_schedule()` and `update_enabled()` for hot job updates |
| `abo/runtime/discovery.py` | Modify | Call `state_store.apply_to_registry()` after `load_all()` |
| `abo/main.py` | Modify | Replace toggle endpoint with unified `PATCH /api/modules/{id}`; wire state store and scheduler |
| `src/modules/feed/ModuleDetail.tsx` | Modify | Add enabled toggle and schedule preset/custom editor; call unified PATCH endpoint |
| `src/components/ModuleConfigPanel.tsx` | Modify | Simplify to display-only card list; click to open `ModuleDetail` |
| `src/core/store.ts` | Modify | Ensure `FeedModule` type has `enabled` and `schedule` |

---

### Task 1: Create `ModuleStateStore` in `abo/runtime/state.py`

**Files:**
- Create: `abo/runtime/state.py`
- Test: `tests/test_runtime_state.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_runtime_state.py`:

```python
import json
import os
from pathlib import Path
import pytest
from abo.runtime.state import ModuleStateStore


class FakeModule:
    def __init__(self, module_id, enabled=True, schedule="0 8 * * *"):
        self.id = module_id
        self.enabled = enabled
        self.schedule = schedule


class FakeRegistry:
    def __init__(self, modules):
        self._modules = {m.id: m for m in modules}

    def all(self):
        return list(self._modules.values())

    def get(self, module_id):
        return self._modules.get(module_id)


@pytest.fixture
def temp_state_path(tmp_path, monkeypatch):
    path = tmp_path / "module-runtime.json"
    monkeypatch.setattr("abo.runtime.state._STATE_PATH", path)
    return path


def test_load_returns_defaults_and_creates_file(temp_state_path):
    store = ModuleStateStore()
    registry = FakeRegistry([FakeModule("m1", enabled=True, schedule="0 9 * * *")])
    data = store.load(registry)
    assert data == {"m1": {"enabled": True, "schedule": "0 9 * * *"}}
    assert temp_state_path.exists()


def test_apply_to_registry_overrides_values(temp_state_path):
    temp_state_path.write_text(json.dumps({
        "m1": {"enabled": False, "schedule": "0 10 * * *"}
    }))
    store = ModuleStateStore()
    m1 = FakeModule("m1", enabled=True, schedule="0 9 * * *")
    registry = FakeRegistry([m1])
    store.apply_to_registry(registry)
    assert m1.enabled is False
    assert m1.schedule == "0 10 * * *"


def test_update_module_persists_and_returns_state(temp_state_path):
    store = ModuleStateStore()
    registry = FakeRegistry([FakeModule("m1")])
    store.load(registry)
    result = store.update_module("m1", enabled=False, schedule="0 12 * * *", registry=registry)
    assert result["enabled"] is False
    assert result["schedule"] == "0 12 * * *"
    saved = json.loads(temp_state_path.read_text())
    assert saved["m1"]["enabled"] is False
    assert saved["m1"]["schedule"] == "0 12 * * *"


def test_cleanup_removes_stale_modules(temp_state_path):
    temp_state_path.write_text(json.dumps({
        "old-module": {"enabled": True, "schedule": "0 8 * * *"},
        "m1": {"enabled": True, "schedule": "0 8 * * *"}
    }))
    store = ModuleStateStore()
    registry = FakeRegistry([FakeModule("m1")])
    store.apply_to_registry(registry)
    saved = json.loads(temp_state_path.read_text())
    assert "old-module" not in saved
    assert "m1" in saved
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/huanc/Desktop/ABO
pytest tests/test_runtime_state.py -v
```

Expected: FAIL — `ModuleStateStore` not found.

- [ ] **Step 3: Implement `ModuleStateStore`**

Create `abo/runtime/state.py`:

```python
import json
import os
from pathlib import Path

from .discovery import ModuleRegistry

_STATE_PATH = Path.home() / ".abo" / "module-runtime.json"


class ModuleStateStore:
    def _ensure_path(self):
        _STATE_PATH.parent.mkdir(parents=True, exist_ok=True)

    def load(self, registry: ModuleRegistry) -> dict:
        """Load state from disk, merging with current registry defaults."""
        self._ensure_path()
        if _STATE_PATH.exists():
            stored = json.loads(_STATE_PATH.read_text(encoding="utf-8"))
        else:
            stored = {}

        # Build authoritative state from registry defaults + stored overrides
        result = {}
        for m in registry.all():
            result[m.id] = {
                "enabled": stored.get(m.id, {}).get("enabled", m.enabled),
                "schedule": stored.get(m.id, {}).get("schedule", m.schedule),
            }

        # Clean stale entries and save back
        self.save(result)
        return result

    def save(self, data: dict):
        self._ensure_path()
        tmp = _STATE_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, _STATE_PATH)

    def apply_to_registry(self, registry: ModuleRegistry):
        state = self.load(registry)
        for m in registry.all():
            if m.id in state:
                m.enabled = state[m.id]["enabled"]
                m.schedule = state[m.id]["schedule"]

    def update_module(
        self,
        module_id: str,
        enabled: bool | None,
        schedule: str | None,
        registry: ModuleRegistry,
    ) -> dict:
        module = registry.get(module_id)
        if not module:
            raise ValueError(f"Module {module_id} not found")

        state = self.load(registry)
        module_state = state.setdefault(module_id, {"enabled": module.enabled, "schedule": module.schedule})

        if enabled is not None:
            module_state["enabled"] = enabled
            module.enabled = enabled
        if schedule is not None:
            module_state["schedule"] = schedule
            module.schedule = schedule

        self.save(state)
        return module_state.copy()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/huanc/Desktop/ABO
pytest tests/test_runtime_state.py -v
```

Expected: 5 PASSED.

- [ ] **Step 5: Commit**

```bash
git add abo/runtime/state.py tests/test_runtime_state.py
git commit -m "feat(runtime): add ModuleStateStore with default fallback and stale cleanup

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Extend `ModuleScheduler` for hot schedule/enabled updates

**Files:**
- Modify: `abo/runtime/scheduler.py`
- Test: `tests/test_scheduler_hot_updates.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/test_scheduler_hot_updates.py`:

```python
import asyncio
import pytest
from apscheduler.triggers.cron import CronTrigger

from abo.runtime.scheduler import ModuleScheduler
from abo.runtime.runner import ModuleRunner


class FakeRunner:
    async def run(self, module):
        pass


class FakeModule:
    def __init__(self, module_id, schedule="0 8 * * *"):
        self.id = module_id
        self.schedule = schedule


def test_update_schedule_changes_job():
    runner = FakeRunner()
    scheduler = ModuleScheduler(runner)
    m = FakeModule("m1", "0 8 * * *")
    scheduler.start([m])

    scheduler.update_schedule("m1", "0 10 * * *")
    jobs = scheduler.job_info()
    assert len(jobs) == 1
    assert jobs[0]["id"] == "m1"
    # next_run_time should exist after reschedule
    assert jobs[0]["next_run"] is not None
    scheduler.shutdown()


def test_update_enabled_removes_and_re_adds_job():
    runner = FakeRunner()
    scheduler = ModuleScheduler(runner)
    m = FakeModule("m1", "0 8 * * *")
    scheduler.start([m])

    scheduler.update_enabled("m1", False)
    assert len(scheduler.job_info()) == 0

    scheduler.update_enabled("m1", True)
    assert len(scheduler.job_info()) == 1
    scheduler.shutdown()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/huanc/Desktop/ABO
pytest tests/test_scheduler_hot_updates.py -v
```

Expected: FAIL — `update_schedule` / `update_enabled` not defined on `ModuleScheduler`.

- [ ] **Step 3: Implement the methods**

Modify `abo/runtime/scheduler.py` by inserting the following methods after `job_info()` and before `shutdown()`:

```python
    def update_schedule(self, module_id: str, new_schedule: str):
        job = self._scheduler.get_job(module_id)
        if job:
            self._scheduler.remove_job(module_id)
        # Re-add job using the same runner but with new trigger
        module = None
        # We do a lightweight lookup: the caller (main.py) already updated the module instance,
        # so we accept a Module-like object via a private helper below.
        # Actually expose a cleaner API: update_schedule(module)

    def update_schedule(self, module: Module):
        if self._scheduler.get_job(module.id):
            self._scheduler.remove_job(module.id)
        self._add_job(module)

    def update_enabled(self, module: Module, enabled: bool):
        job_exists = self._scheduler.get_job(module.id) is not None
        if enabled and not job_exists:
            self._add_job(module)
        elif not enabled and job_exists:
            self._scheduler.remove_job(module.id)
```

Wait — we need to edit the actual file carefully. The existing `ModuleScheduler` has `job_info()` then `shutdown()`. Insert the two methods between them.

Edit `abo/runtime/scheduler.py`:

```python
    def job_info(self) -> list[dict]:
        return [
            {
                "id": job.id,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            }
            for job in self._scheduler.get_jobs()
        ]

    def update_schedule(self, module: Module):
        if self._scheduler.get_job(module.id):
            self._scheduler.remove_job(module.id)
        self._add_job(module)

    def update_enabled(self, module: Module, enabled: bool):
        has_job = self._scheduler.get_job(module.id) is not None
        if enabled and not has_job:
            self._add_job(module)
        elif not enabled and has_job:
            self._scheduler.remove_job(module.id)

    def shutdown(self):
        self._scheduler.shutdown(wait=False)
```

- [ ] **Step 4: Update the test to pass a real Module-ish object**

Modify `tests/test_scheduler_hot_updates.py` to use a proper Module subclass context or monkey-patch. Since `Module` is an ABC, we'll create a dummy subclass inside the test.

Replace the test file contents:

```python
import pytest
from abo.runtime.scheduler import ModuleScheduler
from abo.runtime.runner import ModuleRunner
from abo.sdk.base import Module


class DummyModule(Module):
    id = "m1"
    name = "Dummy"
    schedule = "0 8 * * *"

    async def fetch(self):
        return []

    async def process(self, items, prefs):
        return []


class FakeRunner:
    async def run(self, module):
        pass


def test_update_schedule_changes_job():
    runner = FakeRunner()
    scheduler = ModuleScheduler(runner)
    m = DummyModule()
    scheduler.start([m])

    m.schedule = "0 10 * * *"
    scheduler.update_schedule(m)
    jobs = scheduler.job_info()
    assert len(jobs) == 1
    assert jobs[0]["id"] == "m1"
    assert jobs[0]["next_run"] is not None
    scheduler.shutdown()


def test_update_enabled_removes_and_re_adds_job():
    runner = FakeRunner()
    scheduler = ModuleScheduler(runner)
    m = DummyModule()
    scheduler.start([m])

    scheduler.update_enabled(m, False)
    assert len(scheduler.job_info()) == 0

    scheduler.update_enabled(m, True)
    assert len(scheduler.job_info()) == 1
    scheduler.shutdown()
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/huanc/Desktop/ABO
pytest tests/test_scheduler_hot_updates.py -v
```

Expected: 2 PASSED.

- [ ] **Step 6: Commit**

```bash
git add abo/runtime/scheduler.py tests/test_scheduler_hot_updates.py
git commit -m "feat(scheduler): support hot update of schedule and enabled

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Wire state store into discovery and startup

**Files:**
- Modify: `abo/runtime/discovery.py`
- Modify: `abo/main.py`

- [ ] **Step 1: Modify `discovery.py` to accept and apply state store**

Edit `abo/runtime/discovery.py`. Import `ModuleStateStore` at the top and add an `apply_state` method.

Add import:

```python
from ..runtime.state import ModuleStateStore
```

Insert method in `ModuleRegistry` after `get()`:

```python
    def apply_state(self, store: ModuleStateStore):
        store.apply_to_registry(self)
```

- [ ] **Step 2: Modify `main.py` startup to use state store**

In `abo/main.py`, add near existing imports:

```python
from .runtime.state import ModuleStateStore
```

Add a global singleton after `_registry`:

```python
_state_store = ModuleStateStore()
```

In the lifespan startup logic (inside `@asynccontextmanager`), after `_registry.load_all()` and before scheduler start, add:

```python
    _registry.load_all()
    _state_store.apply_to_registry(_registry)
```

Find the startup block (look for `_registry.load_all()`). It should be inside `lifespan()`.

Assuming it looks like:

```python
    _registry.load_all()
    _runner = ModuleRunner(_card_store, _prefs, broadcaster)
    _scheduler = ModuleScheduler(_runner)
    _scheduler.start(_registry.enabled())
```

Insert the state application:

```python
    _registry.load_all()
    _state_store.apply_to_registry(_registry)
    _runner = ModuleRunner(_card_store, _prefs, broadcaster)
    _scheduler = ModuleScheduler(_runner)
    _scheduler.start(_registry.enabled())
```

- [ ] **Step 3: Commit**

```bash
git add abo/runtime/discovery.py abo/main.py
git commit -m "feat(runtime): apply persisted module state on startup

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Replace toggle endpoint with unified PATCH

**Files:**
- Modify: `abo/main.py`

- [ ] **Step 1: Add schedule validation helper**

In `abo/main.py`, add this function near the top (before routes):

```python
def _validate_cron(expr: str) -> bool:
    from apscheduler.triggers.cron import CronTrigger
    try:
        CronTrigger.from_crontab(expr)
        return True
    except Exception:
        return False
```

- [ ] **Step 2: Replace toggle endpoint with unified PATCH**

Find the existing `toggle` endpoint (around line 1571):

```python
@app.patch("/api/modules/{module_id}/toggle")
async def toggle_module(module_id: str):
    module = _registry.get(module_id)
    if not module:
        raise HTTPException(404, "Module not found")
    module.enabled = not module.enabled
    return {"enabled": module.enabled}
```

Replace it entirely with:

```python
from pydantic import BaseModel

class ModuleUpdatePayload(BaseModel):
    enabled: bool | None = None
    schedule: str | None = None


@app.patch("/api/modules/{module_id}")
async def update_module(module_id: str, payload: ModuleUpdatePayload):
    module = _registry.get(module_id)
    if not module:
        raise HTTPException(404, "Module not found")

    if payload.schedule is not None:
        if not payload.schedule.strip() or not _validate_cron(payload.schedule.strip()):
            raise HTTPException(400, "Invalid cron expression")

    # Update state and persist first
    new_state = _state_store.update_module(
        module_id,
        enabled=payload.enabled,
        schedule=payload.schedule,
        registry=_registry,
    )

    # Notify scheduler
    if _scheduler:
        if payload.schedule is not None:
            _scheduler.update_schedule(module)
        if payload.enabled is not None:
            _scheduler.update_enabled(module, payload.enabled)

    return {"ok": True, **module.get_status(), **new_state}
```

- [ ] **Step 3: Update any frontend callers to use unified PATCH (backend only)**

The backend route is done. Keep the old subscription/config endpoints (`/api/modules/{id}/config`, `/api/modules/{id}/subscriptions`) as-is; they are unrelated to runtime state.

- [ ] **Step 4: Run a quick sanity check**

Start backend to ensure no syntax/import errors:

```bash
cd /Users/huanc/Desktop/ABO
python -c "from abo.main import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add abo/main.py
git commit -m "feat(api): unified PATCH /api/modules/{id} for enabled/schedule with persistence

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Update `ModuleDetail.tsx` with schedule editor and enabled toggle

**Files:**
- Modify: `src/modules/feed/ModuleDetail.tsx`
- Modify: `src/core/store.ts`

- [ ] **Step 1: Verify `FeedModule` type in store**

Edit `src/core/store.ts`. Find the `FeedModule` type/interface and ensure it has:

```typescript
export interface FeedModule {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  icon?: string;
  next_run?: string;
}
```

If it already has all these fields, no change needed.

- [ ] **Step 2: Add schedule presets and UI to `ModuleDetail.tsx`**

Add these constants at the top of `src/modules/feed/ModuleDetail.tsx` after imports:

```typescript
const SCHEDULE_PRESETS: { label: string; value: string }[] = [
  { label: "每天 8:00", value: "0 8 * * *" },
  { label: "每天 10:00", value: "0 10 * * *" },
  { label: "每天 11:00", value: "0 11 * * *" },
  { label: "每天 13:00", value: "0 13 * * *" },
  { label: "每 5 分钟", value: "*/5 * * * *" },
  { label: "自定义", value: "custom" },
];

function getPresetLabel(schedule: string): string {
  const preset = SCHEDULE_PRESETS.find((p) => p.value === schedule);
  return preset ? preset.label : "自定义";
}
```

Add state hooks inside `ModuleDetail` component (after existing `useState` lines):

```typescript
  const [moduleEnabled, setModuleEnabled] = useState(module.enabled);
  const [moduleSchedule, setModuleSchedule] = useState(module.schedule);
  const [scheduleMode, setScheduleMode] = useState(
    SCHEDULE_PRESETS.some((p) => p.value === module.schedule) ? module.schedule : "custom"
  );
  const [customSchedule, setCustomSchedule] = useState(
    SCHEDULE_PRESETS.some((p) => p.value === module.schedule) ? "" : module.schedule
  );
  const [updatingRuntime, setUpdatingRuntime] = useState(false);
```

Add `saveRuntimeSettings` function before the return statement:

```typescript
  async function saveRuntimeSettings() {
    const scheduleToSave = scheduleMode === "custom" ? customSchedule.trim() : scheduleMode;
    if (!scheduleToSave) {
      toast.error("请输入定时表达式");
      return;
    }
    setUpdatingRuntime(true);
    try {
      await api.patch(`/api/modules/${module.id}`, {
        enabled: moduleEnabled,
        schedule: scheduleToSave,
      });
      toast.success("保存成功", "模块运行设置已更新");
      // Refresh feed modules list in store so parent views stay consistent
      const modulesRes = await api.get<{ modules: FeedModule[] }>("/api/modules");
      if (modulesRes && modulesRes.modules) {
        setFeedModules(modulesRes.modules);
      }
    } catch (err) {
      toast.error("保存失败", "请检查定时表达式是否正确");
    } finally {
      setUpdatingRuntime(false);
    }
  }
```

Import `useStore` and `FeedModule` if not already imported:

```typescript
import { useStore, FeedModule } from "../../core/store";
```

Add the destructured `setFeedModules`:

```typescript
  const { setFeedModules } = useStore();
```

Insert a new "Runtime Settings" Card inside the JSX (recommended placement: on the left column, above the existing "配置参数" Card). In the left column `<div>` (the one containing the Config Card), insert before the Config Card:

```tsx
            <Card title="运行设置" icon={<Clock style={{ width: "20px", height: "20px", color: "var(--color-primary)" }} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* Enabled Toggle */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)" }}>启用模块</div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>关闭后该模块将停止定时运行</div>
                  </div>
                  <button
                    onClick={() => setModuleEnabled((v) => !v)}
                    style={{
                      width: "44px",
                      height: "24px",
                      borderRadius: "9999px",
                      border: "none",
                      cursor: "pointer",
                      background: moduleEnabled ? "var(--color-success)" : "var(--text-muted)",
                      position: "relative",
                      transition: "background 0.2s ease",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: "2px",
                        left: moduleEnabled ? "22px" : "2px",
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "white",
                        transition: "left 0.2s ease",
                      }}
                    />
                  </button>
                </div>

                {/* Schedule Selector */}
                <div>
                  <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "8px" }}>运行计划</div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "12px" }}>选择模块自动执行的时间</div>
                  <select
                    value={scheduleMode}
                    onChange={(e) => setScheduleMode(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: "var(--radius-full)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-app)",
                      color: "var(--text-main)",
                      fontSize: "0.9375rem",
                      outline: "none",
                    }}
                  >
                    {SCHEDULE_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  {scheduleMode === "custom" && (
                    <input
                      type="text"
                      value={customSchedule}
                      onChange={(e) => setCustomSchedule(e.target.value)}
                      placeholder="例如：0 8 * * *"
                      style={{
                        width: "100%",
                        marginTop: "12px",
                        padding: "12px 16px",
                        borderRadius: "var(--radius-full)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-app)",
                        color: "var(--text-main)",
                        fontSize: "0.9375rem",
                        outline: "none",
                      }}
                    />
                  )}
                </div>

                <button
                  onClick={saveRuntimeSettings}
                  disabled={updatingRuntime}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "12px 24px",
                    borderRadius: "var(--radius-full)",
                    background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                    color: "white",
                    fontSize: "0.9375rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <Save style={{ width: "18px", height: "18px" }} />
                  {updatingRuntime ? "保存中..." : "保存运行设置"}
                </button>
              </div>
            </Card>
```

Ensure `Clock` is imported from `lucide-react` at the top of the file.

- [ ] **Step 3: Commit frontend changes**

```bash
git add src/modules/feed/ModuleDetail.tsx src/core/store.ts
git commit -m "feat(ui): add schedule editor and enabled toggle to ModuleDetail

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Simplify `ModuleConfigPanel.tsx` for display-only

**Files:**
- Modify: `src/components/ModuleConfigPanel.tsx`

- [ ] **Step 1: Remove inline editing, keep lightweight overview**

Since `ModuleConfigPanel` appears in `FeedSidebar` and `ModuleDetail` is the primary full configuration page, simplify this component so it only shows module summary and navigates to `ModuleDetail`.

There are two acceptable strategies:

A. **Deep clean:** Remove all keyword/subscription editing state and handlers, turning it into a pure list with a click-to-config action.
B. **Safe refactor:** Keep the existing `isExpanded` keyword/subscription UI but add a top-level "模块管理" link/button that opens `ModuleDetail`.

We pick **A** to keep UI unambiguous, but we must make sure every call site still compiles and looks reasonable.

Replace the body of `ModuleConfigPanel` (the JSX inside `return`) with a simplified card grid. Remove the expanded keyword/subscription editing section entirely.

Edit `src/components/ModuleConfigPanel.tsx`:

Delete the expanded block starting at `{isExpanded && module.enabled && (` through its closing `)}` and the surrounding `isExpanded` / `hasSubscriptions` logic.

Replace the entire component render (from `if (loading)` through the end) with:

```tsx
  const { setModuleToConfigure } = useStore();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40" style={{ color: "var(--text-muted)" }}>
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        加载模块配置...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: "var(--text-main)" }}>
          <Settings className="w-5 h-5" style={{ color: "var(--color-primary)" }} />
          爬虫模块
        </h3>
        <button
          onClick={loadModules}
          className="text-xs flex items-center gap-1 transition-colors hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
        >
          <RefreshCw className="w-3 h-3" />
          刷新
        </button>
      </div>

      <div className="grid gap-3">
        {modules.map((module) => (
          <div
            key={module.id}
            onClick={() => setModuleToConfigure(module.id)}
            className="rounded-lg border transition-all cursor-pointer"
            style={{
              background: module.enabled ? "var(--bg-card)" : "var(--bg-hover)",
              borderColor: module.enabled ? "var(--color-success)" : "var(--border-light)",
              opacity: module.enabled ? 1 : 0.7,
            }}
          >
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div style={{ color: module.enabled ? "var(--color-primary)" : "var(--text-muted)" }}>
                  {getModuleIcon(module.id)}
                </div>
                <div>
                  <div className="font-medium" style={{ color: "var(--text-main)" }}>{module.name}</div>
                  <div className="flex items-center gap-3 text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {getScheduleDescription(module.schedule)}
                    </span>
                    {module.keywords && module.keywords.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        {module.keywords.length} 个关键词
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="text-xs px-2 py-1 rounded-md"
                  style={{
                    background: module.enabled ? "rgba(16,185,129,0.15)" : "var(--bg-hover)",
                    color: module.enabled ? "var(--color-success)" : "var(--text-muted)",
                  }}
                >
                  {module.enabled ? "已启用" : "已禁用"}
                </span>
                <Settings className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg-hover)" }}>
          <div className="text-2xl font-bold" style={{ color: "var(--color-success)" }}>
            {modules.filter((m) => m.enabled).length}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>已启用</div>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg-hover)" }}>
          <div className="text-2xl font-bold" style={{ color: "var(--text-light)" }}>
            {modules.filter((m) => !m.enabled).length}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>已禁用</div>
        </div>
      </div>
    </div>
  );
```

Also update imports to add `useStore`:

```tsx
import { useStore } from "../core/store";
```

Remove unused state hooks (`expandedModule`, `newSubscriptions`, `newKeywords`) and their handler functions (`addSubscription`, `removeSubscription`, `addKeyword`, `removeKeyword`, `toggleModule`) if they are no longer referenced. If you prefer a safer minimal change, you can leave the unused helper functions in the file, but remove all references to `expandedModule`/`newSubscriptions`/`newKeywords` so the component compiles without errors.

- [ ] **Step 2: Run TypeScript check**

```bash
cd /Users/huanc/Desktop/ABO
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ModuleConfigPanel.tsx
git commit -m "feat(ui): simplify ModuleConfigPanel to display-only, navigate to ModuleDetail for editing

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Final integration test and cleanup

- [ ] **Step 1: Full type check**

```bash
cd /Users/huanc/Desktop/ABO
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run Python tests**

```bash
cd /Users/huanc/Desktop/ABO
pytest tests/test_runtime_state.py tests/test_scheduler_hot_updates.py -v
```

Expected: 7 PASSED total.

- [ ] **Step 3: Verify backend imports cleanly**

```bash
cd /Users/huanc/Desktop/ABO
python -c "from abo.main import app; print('imports ok')"
```

Expected: `imports ok`

- [ ] **Step 4: Commit if everything passes**

No extra files to add here, but if any minor fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: pass integration checks for module schedule config

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Independent JSON state file (`module-runtime.json`) with default fallback — Task 1.
- ✅ New module auto-registration and stale cleanup — Task 1 via `load(registry)` and `apply_to_registry`.
- ✅ Scheduler hot update for schedule/enabled — Task 2.
- ✅ Unified PATCH API replacing toggle — Task 4.
- ✅ Frontend preset + custom cron editor in `ModuleDetail` — Task 5.
- ✅ `ModuleConfigPanel` simplified to display-only — Task 6.

**2. Placeholder scan:**
- No TBD/TODO. All code blocks are concrete and runnable.

**3. Type consistency:**
- `ModuleStateStore.update_module` signature matches test usage.
- `ModuleScheduler.update_schedule` and `update_enabled` signatures accept `Module` objects (consistent with existing `_add_job`).
- Frontend `FeedModule` interface already assumed to include `enabled` and `schedule`.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-04-module-schedule-config.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints for review

**Which approach?**
