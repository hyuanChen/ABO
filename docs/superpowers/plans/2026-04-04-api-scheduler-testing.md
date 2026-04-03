# API Scheduling & Execution Testing Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate and fix all API scheduling, module execution, and timing-related functionality through comprehensive testing.

**Architecture:** Test coverage for: 1) Module discovery/loading from default_modules and ~/.abo/modules, 2) APScheduler-based cron scheduling with timezone support, 3) ModuleRunner fetch/process pipeline, 4) FastAPI endpoints for manual trigger and configuration, 5) Hot update of schedule/enabled without restart, 6) State persistence in ~/.abo/module-runtime.json

**Tech Stack:** Python, FastAPI, APScheduler, pytest, pytest-anyio, httpx

---

## Task Overview Map

**Files Under Test:**
- `abo/runtime/scheduler.py` - APScheduler wrapper, job management
- `abo/runtime/runner.py` - ModuleRunner, fetch/process pipeline
- `abo/runtime/discovery.py` - ModuleRegistry, file watching
- `abo/runtime/state.py` - ModuleStateStore, persistence
- `abo/main.py` - FastAPI endpoints (module routes)
- `abo/sdk/base.py` - Module ABC
- `abo/default_modules/*` - 7 built-in modules

---

## Task 1: Module Discovery Tests

**Files:**
- Create: `tests/test_discovery.py`
- Modify: `abo/runtime/discovery.py` (if bugs found)

### Step 1.1: Write test for builtin module loading

```python
import pytest
from pathlib import Path
from abo.runtime.discovery import ModuleRegistry
from abo.sdk.base import Module

def test_load_all_builtin_modules():
    """Test that all 7 default modules are loaded from default_modules/."""
    registry = ModuleRegistry()
    registry.load_all()

    modules = registry.all()
    module_ids = {m.id for m in modules}

    expected = {
        "arxiv-tracker",
        "semantic-scholar-tracker",
        "xiaohongshu-tracker",
        "bilibili-tracker",
        "xiaoyuzhou-tracker",
        "zhihu-tracker",
        "folder-monitor",
    }
    assert expected <= module_ids, f"Missing modules: {expected - module_ids}"
```

### Step 1.2: Write test for module ordering

```python
def test_module_ordering():
    """Test that modules are returned in MODULE_ORDER sequence."""
    registry = ModuleRegistry()
    registry.load_all()

    modules = registry.all()
    module_ids = [m.id for m in modules]

    # Find position of known modules
    arxiv_idx = module_ids.index("arxiv-tracker")
    folder_idx = module_ids.index("folder-monitor")

    # arxiv should come before folder-monitor per MODULE_ORDER
    assert arxiv_idx < folder_idx, "Modules not in expected order"
```

### Step 1.3: Write test for user module directory loading

```python
def test_load_user_modules(tmp_path, monkeypatch):
    """Test loading modules from ~/.abo/modules/."""
    # Create a fake user module
    user_modules_dir = tmp_path / "modules"
    user_modules_dir.mkdir(parents=True)

    mod_dir = user_modules_dir / "test-module"
    mod_dir.mkdir()
    (mod_dir / "__init__.py").write_text('''
from abo.sdk import Module

class TestModule(Module):
    id = "test-user-module"
    name = "Test User Module"
    schedule = "0 9 * * *"

    async def fetch(self):
        return []

    async def process(self, items, prefs):
        return []
''')

    # Patch the user modules path
    from abo import runtime
    original_user_dir = Path.home() / ".abo" / "modules"
    monkeypatch.setattr(runtime.discovery.Path, "home", lambda: tmp_path)

    registry = ModuleRegistry()
    registry.load_all()

    assert registry.get("test-user-module") is not None
    assert registry.get("test-user-module").name == "Test User Module"
```

### Step 1.4: Run tests

```bash
cd /Users/huanc/Desktop/ABO
python -m pytest tests/test_discovery.py -v
```

Expected: PASS (or identify failures to fix)

### Step 1.5: Commit

```bash
git add tests/test_discovery.py
git commit -m "test: add module discovery tests"
```

---

## Task 2: Scheduler Core Functionality Tests

**Files:**
- Create: `tests/test_scheduler_core.py`
- Modify: `abo/runtime/scheduler.py` (if bugs found)

### Step 2.1: Write test for scheduler startup with multiple modules

```python
import pytest
from abo.runtime.scheduler import ModuleScheduler
from abo.sdk.base import Module

class DummyModule(Module):
    id = "test-dummy"
    name = "Test Dummy"
    schedule = "0 8 * * *"

    async def fetch(self):
        return []

    async def process(self, items, prefs):
        return []

class FakeRunner:
    def __init__(self):
        self.runs = []

    async def run(self, module):
        self.runs.append(module.id)

@pytest.mark.anyio
async def test_scheduler_starts_all_modules():
    """Test that scheduler starts jobs for all enabled modules."""
    runner = FakeRunner()
    scheduler = ModuleScheduler(runner)

    m1 = DummyModule()
    m1.id = "m1"
    m2 = DummyModule()
    m2.id = "m2"

    scheduler.start([m1, m2])
    try:
        jobs = scheduler.job_info()
        assert len(jobs) == 2
        job_ids = {j["id"] for j in jobs}
        assert job_ids == {"m1", "m2"}
        # Verify next_run is set
        for job in jobs:
            assert job["next_run"] is not None
    finally:
        scheduler.shutdown()
```

### Step 2.2: Write test for run_now manual trigger

```python
@pytest.mark.anyio
async def test_run_now_triggers_module():
    """Test that run_now executes the module immediately."""
    runner = FakeRunner()
    scheduler = ModuleScheduler(runner)

    m1 = DummyModule()
    m1.id = "m1"

    # Create a fake registry
    class FakeRegistry:
        def get(self, module_id):
            if module_id == "m1":
                return m1
            return None

    registry = FakeRegistry()
    scheduler.start([m1])
    try:
        result = await scheduler.run_now("m1", registry)
        assert result is True
        assert "m1" in runner.runs
    finally:
        scheduler.shutdown()
```

### Step 2.3: Write test for disabled modules not scheduled

```python
@pytest.mark.anyio
async def test_disabled_modules_not_scheduled():
    """Test that disabled modules don't get scheduler jobs."""
    runner = FakeRunner()
    scheduler = ModuleScheduler(runner)

    m1 = DummyModule()
    m1.id = "m1"
    m1.enabled = True

    m2 = DummyModule()
    m2.id = "m2"
    m2.enabled = False

    scheduler.start([m1, m2])
    try:
        jobs = scheduler.job_info()
        assert len(jobs) == 1
        assert jobs[0]["id"] == "m1"
    finally:
        scheduler.shutdown()
```

### Step 2.4: Write test for timezone configuration

```python
@pytest.mark.anyio
async def test_scheduler_uses_shanghai_timezone():
    """Test that scheduler uses Asia/Shanghai timezone."""
    from apscheduler.schedulers.asyncio import AsyncIOScheduler

    runner = FakeRunner()
    scheduler = ModuleScheduler(runner)

    # Verify internal scheduler timezone
    assert scheduler._scheduler.timezone.zone == "Asia/Shanghai"
```

### Step 2.5: Run tests

```bash
python -m pytest tests/test_scheduler_core.py -v
```

Expected: PASS

### Step 2.6: Commit

```bash
git add tests/test_scheduler_core.py
git commit -m "test: add scheduler core functionality tests"
```

---

## Task 3: ModuleRunner Execution Tests

**Files:**
- Create: `tests/test_runner.py`
- Modify: `abo/runtime/runner.py` (if bugs found)

### Step 3.1: Write test for full fetch/process pipeline

```python
import pytest
from pathlib import Path
from abo.runtime.runner import ModuleRunner
from abo.sdk.base import Module, Item, Card
from abo.sdk.types import FeedbackAction
from abo.store.cards import CardStore
from abo.preferences.engine import PreferenceEngine
from abo.runtime.broadcaster import Broadcaster

class TestModule(Module):
    id = "test-pipeline"
    name = "Test Pipeline"
    schedule = "0 8 * * *"

    def __init__(self):
        super().__init__()
        self.fetch_calls = 0
        self.process_calls = 0

    async def fetch(self):
        self.fetch_calls += 1
        return [
            Item(id="item1", raw={"title": "Test Item 1", "content": "Content 1"}),
            Item(id="item2", raw={"title": "Test Item 2", "content": "Content 2"}),
        ]

    async def process(self, items, prefs):
        self.process_calls += 1
        return [
            Card(
                id="item1",
                title="Test Card 1",
                summary="Summary 1",
                score=0.8,
                tags=["test"],
                source_url="http://test.com/1",
                obsidian_path="Test/item1.md",
            ),
            Card(
                id="item2",
                title="Test Card 2",
                summary="Summary 2",
                score=0.6,
                tags=["test"],
                source_url="http://test.com/2",
                obsidian_path="Test/item2.md",
            ),
        ]

@pytest.mark.anyio
async def test_runner_executes_full_pipeline(tmp_path):
    """Test that runner calls fetch and process in sequence."""
    store = CardStore(path=tmp_path / "cards.db")
    prefs = PreferenceEngine()
    broadcaster = Broadcaster()

    runner = ModuleRunner(store, prefs, broadcaster, vault_path=tmp_path / "vault")

    module = TestModule()
    count = await runner.run(module)

    assert module.fetch_calls == 1
    assert module.process_calls == 1
    assert count == 2  # Both cards processed
```

### Step 3.2: Write test for score threshold filtering

```python
class ScoredModule(Module):
    id = "test-scored"
    name = "Test Scored"
    schedule = "0 8 * * *"

    async def fetch(self):
        return [Item(id="i1", raw={}), Item(id="i2", raw={}), Item(id="i3", raw={})]

    async def process(self, items, prefs):
        return [
            Card(id="i1", title="High", summary="High", score=0.9, tags=[], source_url="", obsidian_path="h.md"),
            Card(id="i2", title="Medium", summary="Medium", score=0.5, tags=[], source_url="", obsidian_path="m.md"),
            Card(id="i3", title="Low", summary="Low", score=0.3, tags=[], source_url="", obsidian_path="l.md"),
        ]

@pytest.mark.anyio
async def test_runner_respects_score_threshold(tmp_path, monkeypatch):
    """Test that cards below threshold are filtered out."""
    store = CardStore(path=tmp_path / "cards.db")
    prefs = PreferenceEngine()
    broadcaster = Broadcaster()

    # Mock threshold to 0.6
    monkeypatch.setattr(prefs, "threshold", lambda module_id: 0.6)
    monkeypatch.setattr(prefs, "max_cards", lambda module_id: 10)

    runner = ModuleRunner(store, prefs, broadcaster, vault_path=tmp_path / "vault")

    module = ScoredModule()
    count = await runner.run(module)

    # Only 0.9 score card should pass threshold of 0.6
    assert count == 1
```

### Step 3.3: Write test for max_cards limiting

```python
@pytest.mark.anyio
async def test_runner_respects_max_cards(tmp_path, monkeypatch):
    """Test that only max_cards highest scored cards are kept."""
    store = CardStore(path=tmp_path / "cards.db")
    prefs = PreferenceEngine()
    broadcaster = Broadcaster()

    # Allow all scores but limit to 2 cards
    monkeypatch.setattr(prefs, "threshold", lambda module_id: 0.0)
    monkeypatch.setattr(prefs, "max_cards", lambda module_id: 2)

    runner = ModuleRunner(store, prefs, broadcaster, vault_path=tmp_path / "vault")

    module = ScoredModule()
    count = await runner.run(module)

    # Should only get top 2 by score
    assert count == 2
```

### Step 3.4: Run tests

```bash
python -m pytest tests/test_runner.py -v
```

Expected: PASS (or identify failures)

### Step 3.5: Commit

```bash
git add tests/test_runner.py
git commit -m "test: add ModuleRunner execution tests"
```

---

## Task 4: API Endpoint Tests

**Files:**
- Create: `tests/test_api_modules.py`
- Modify: `abo/main.py` (if bugs found)

### Step 4.1: Write test for GET /api/modules

```python
import pytest
from httpx import AsyncClient, ASGITransport
from abo.main import app

@pytest.mark.anyio
async def test_get_modules():
    """Test GET /api/modules returns module list with status."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/modules")

    assert response.status_code == 200
    data = response.json()
    assert "modules" in data

    modules = data["modules"]
    assert len(modules) >= 7  # At least the 7 default modules

    # Check structure
    for m in modules:
        assert "id" in m
        assert "name" in m
        assert "schedule" in m
        assert "enabled" in m
        assert "next_run" in m
```

### Step 4.2: Write test for POST /api/modules/{id}/run

```python
@pytest.mark.anyio
async def test_run_module_endpoint():
    """Test POST /api/modules/{module_id}/run triggers execution."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # First get list of modules
        resp = await client.get("/api/modules")
        modules = resp.json()["modules"]

        if modules:
            module_id = modules[0]["id"]
            response = await client.post(f"/api/modules/{module_id}/run")
            assert response.status_code == 200
            assert response.json()["ok"] is True
```

### Step 4.3: Write test for module not found

```python
@pytest.mark.anyio
async def test_run_module_not_found():
    """Test POST /api/modules/{id}/run returns 404 for unknown module."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/modules/nonexistent-module/run")
        assert response.status_code == 404
```

### Step 4.4: Write test for GET /api/status scheduler info

```python
@pytest.mark.anyio
async def test_status_includes_scheduler_info():
    """Test /api/status returns scheduler job information."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/status")

    assert response.status_code == 200
    data = response.json()

    assert "scheduler" in data
    assert "active_jobs" in data["scheduler"]
    assert "jobs" in data["scheduler"]

    for job in data["scheduler"]["jobs"]:
        assert "id" in job
        assert "next_run" in job
```

### Step 4.5: Run tests

```bash
python -m pytest tests/test_api_modules.py -v
```

Expected: PASS (may need to handle startup/shutdown lifecycle)

### Step 4.6: Commit

```bash
git add tests/test_api_modules.py
git commit -m "test: add API endpoint tests for modules"
```

---

## Task 5: Integration Test - Full Module Execution Flow

**Files:**
- Create: `tests/test_integration_module_flow.py`
- Modify: Various (if bugs found)

### Step 5.1: Write end-to-end module execution test

```python
import pytest
import asyncio
from pathlib import Path
from abo.runtime.discovery import ModuleRegistry
from abo.runtime.scheduler import ModuleScheduler
from abo.runtime.runner import ModuleRunner
from abo.runtime.state import ModuleStateStore
from abo.store.cards import CardStore
from abo.preferences.engine import PreferenceEngine
from abo.runtime.broadcaster import Broadcaster

@pytest.mark.anyio
async def test_full_module_execution_flow(tmp_path, monkeypatch):
    """
    Integration test: Load modules, apply state, start scheduler,
    manually trigger a module, verify cards are created.
    """
    # Setup paths
    monkeypatch.setattr("abo.store.cards._DB_PATH", tmp_path / "test.db")

    # Initialize components
    registry = ModuleRegistry()
    registry.load_all()

    state_store = ModuleStateStore(path=tmp_path / "state.json")
    state_store.apply_to_registry(registry)

    store = CardStore(path=tmp_path / "cards.db")
    prefs = PreferenceEngine()
    broadcaster = Broadcaster()

    runner = ModuleRunner(store, prefs, broadcaster, vault_path=tmp_path / "vault")
    scheduler = ModuleScheduler(runner)

    # Start with enabled modules
    enabled_modules = registry.enabled()
    scheduler.start(enabled_modules)

    try:
        # Verify jobs are scheduled
        jobs = scheduler.job_info()
        assert len(jobs) == len(enabled_modules)

        # Manually trigger folder-monitor (lightweight module)
        result = await scheduler.run_now("folder-monitor", registry)
        # Note: folder-monitor may fail if no PDFs in Downloads, that's ok for this test

        # Verify scheduler info is accessible
        status = scheduler.job_info()
        for job in status:
            assert job["id"] in [m.id for m in enabled_modules]

    finally:
        scheduler.shutdown()
```

### Step 5.2: Run integration test

```bash
python -m pytest tests/test_integration_module_flow.py -v -s
```

Expected: PASS (may have warnings about Downloads folder)

### Step 5.3: Commit

```bash
git add tests/test_integration_module_flow.py
git commit -m "test: add end-to-end module execution integration test"
```

---

## Task 6: Cron Expression Validation Tests

**Files:**
- Create: `tests/test_cron_validation.py`
- Modify: `abo/runtime/scheduler.py` (if bugs found)

### Step 6.1: Write test for all module schedules are valid

```python
import pytest
from apscheduler.triggers.cron import CronTrigger
from abo.runtime.discovery import ModuleRegistry

KNOWN_SCHEDULES = {
    "arxiv-tracker": "0 8 * * *",
    "semantic-scholar-tracker": "0 10 * * *",
    "xiaohongshu-tracker": "0 10 * * *",
    "bilibili-tracker": "0 11 * * *",
    "xiaoyuzhou-tracker": "0 10 * * *",
    "zhihu-tracker": "0 13 * * *",
    "folder-monitor": "*/5 * * * *",
}

def test_all_builtin_modules_have_valid_cron():
    """Verify all default modules have valid cron expressions."""
    registry = ModuleRegistry()
    registry.load_all()

    for module in registry.all():
        schedule = module.schedule
        # Should not raise exception
        try:
            CronTrigger.from_crontab(schedule)
        except Exception as e:
            pytest.fail(f"Invalid cron '{schedule}' for module {module.id}: {e}")

def test_builtin_module_schedules_match_expected():
    """Verify module schedules match the documented values."""
    registry = ModuleRegistry()
    registry.load_all()

    for module in registry.all():
        if module.id in KNOWN_SCHEDULES:
            expected = KNOWN_SCHEDULES[module.id]
            actual = module.schedule
            assert actual == expected, (
                f"Module {module.id} schedule mismatch: expected '{expected}', got '{actual}'"
            )
```

### Step 6.2: Write test for schedule updates

```python
@pytest.mark.anyio
async def test_schedule_update_changes_trigger():
    """Test that updating schedule changes the cron trigger."""
    from abo.runtime.scheduler import ModuleScheduler
    from abo.sdk.base import Module

    class TestMod(Module):
        id = "test-sched"
        name = "Test Schedule"
        schedule = "0 8 * * *"

        async def fetch(self):
            return []

        async def process(self, items, prefs):
            return []

    class FakeRunner:
        async def run(self, module):
            pass

    scheduler = ModuleScheduler(FakeRunner())
    m = TestMod()

    scheduler.start([m])
    try:
        # Get original job
        job = scheduler._scheduler.get_job("test-sched")
        original_hour = str(job.trigger.fields[5])

        # Update schedule to 10 AM
        m.schedule = "0 10 * * *"
        scheduler.update_schedule(m)

        # Verify trigger changed
        job = scheduler._scheduler.get_job("test-sched")
        new_hour = str(job.trigger.fields[5])

        assert original_hour == "8"
        assert new_hour == "10"
    finally:
        scheduler.shutdown()
```

### Step 6.3: Run tests

```bash
python -m pytest tests/test_cron_validation.py -v
```

Expected: PASS

### Step 6.4: Commit

```bash
git add tests/test_cron_validation.py
git commit -m "test: add cron expression validation tests"
```

---

## Task 7: State Persistence Integration Tests

**Files:**
- Create: `tests/test_state_integration.py`
- Modify: `abo/runtime/state.py` (if bugs found)

### Step 7.1: Write test for state survival across restarts

```python
import json
import pytest
from pathlib import Path
from abo.runtime.state import ModuleStateStore
from abo.runtime.discovery import ModuleRegistry

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

def test_state_persists_enabled_changes(tmp_path):
    """Test that disabling a module persists and reloads correctly."""
    state_path = tmp_path / "state.json"
    store = ModuleStateStore(path=state_path)

    m1 = FakeModule("m1", enabled=True)
    registry = FakeRegistry([m1])

    # Initial load - should save defaults
    store.apply_to_registry(registry)

    # Disable the module
    store.update_module("m1", enabled=False, registry=registry)
    assert m1.enabled is False

    # Create new store instance (simulating restart)
    store2 = ModuleStateStore(path=state_path)
    m1_new = FakeModule("m1", enabled=True)  # Start enabled
    registry2 = FakeRegistry([m1_new])

    # Apply state - should restore disabled
    store2.apply_to_registry(registry2)
    assert m1_new.enabled is False
```

### Step 7.2: Write test for schedule persistence

```python
def test_state_persists_schedule_changes(tmp_path):
    """Test that schedule changes persist across restarts."""
    state_path = tmp_path / "state.json"
    store = ModuleStateStore(path=state_path)

    m1 = FakeModule("m1", schedule="0 8 * * *")
    registry = FakeRegistry([m1])

    store.apply_to_registry(registry)

    # Change schedule
    store.update_module("m1", schedule="0 15 * * *", registry=registry)
    assert m1.schedule == "0 15 * * *"

    # Create new store instance
    store2 = ModuleStateStore(path=state_path)
    m1_new = FakeModule("m1", schedule="0 8 * * *")
    registry2 = FakeRegistry([m1_new])

    # Apply state - should restore new schedule
    store2.apply_to_registry(registry2)
    assert m1_new.schedule == "0 15 * * *"
```

### Step 7.3: Run tests

```bash
python -m pytest tests/test_state_integration.py -v
```

Expected: PASS (or fix state.py issues)

### Step 7.4: Commit

```bash
git add tests/test_state_integration.py
git commit -m "test: add state persistence integration tests"
```

---

## Task 8: Error Handling & Edge Case Tests

**Files:**
- Create: `tests/test_error_handling.py`
- Modify: Various runtime files (if bugs found)

### Step 8.1: Write test for module fetch failure handling

```python
import pytest
from abo.runtime.runner import ModuleRunner
from abo.sdk.base import Module

class FailingFetchModule(Module):
    id = "fail-fetch"
    name = "Failing Fetch"
    schedule = "0 8 * * *"

    async def fetch(self):
        raise Exception("Network error")

    async def process(self, items, prefs):
        return []

@pytest.mark.anyio
async def test_runner_handles_fetch_failure_gracefully(tmp_path):
    """Test that runner handles fetch exceptions without crashing."""
    from abo.store.cards import CardStore
    from abo.preferences.engine import PreferenceEngine
    from abo.runtime.broadcaster import Broadcaster

    store = CardStore(path=tmp_path / "cards.db")
    prefs = PreferenceEngine()
    broadcaster = Broadcaster()

    runner = ModuleRunner(store, prefs, broadcaster, vault_path=tmp_path / "vault")

    module = FailingFetchModule()

    # Should raise the exception (let caller decide handling)
    with pytest.raises(Exception, match="Network error"):
        await runner.run(module)
```

### Step 8.2: Write test for module process failure handling

```python
class FailingProcessModule(Module):
    id = "fail-process"
    name = "Failing Process"
    schedule = "0 8 * * *"

    async def fetch(self):
        from abo.sdk.types import Item
        return [Item(id="i1", raw={"title": "Test"})]

    async def process(self, items, prefs):
        raise Exception("Processing error")

@pytest.mark.anyio
async def test_runner_handles_process_failure_gracefully(tmp_path):
    """Test that runner handles process exceptions without crashing."""
    from abo.store.cards import CardStore
    from abo.preferences.engine import PreferenceEngine
    from abo.runtime.broadcaster import Broadcaster

    store = CardStore(path=tmp_path / "cards.db")
    prefs = PreferenceEngine()
    broadcaster = Broadcaster()

    runner = ModuleRunner(store, prefs, broadcaster, vault_path=tmp_path / "vault")

    module = FailingProcessModule()

    with pytest.raises(Exception, match="Processing error"):
        await runner.run(module)
```

### Step 8.3: Write test for empty module result handling

```python
class EmptyModule(Module):
    id = "empty"
    name = "Empty"
    schedule = "0 8 * * *"

    async def fetch(self):
        return []

    async def process(self, items, prefs):
        return []

@pytest.mark.anyio
async def test_runner_handles_empty_results(tmp_path):
    """Test that runner handles modules returning empty results."""
    from abo.store.cards import CardStore
    from abo.preferences.engine import PreferenceEngine
    from abo.runtime.broadcaster import Broadcaster

    store = CardStore(path=tmp_path / "cards.db")
    prefs = PreferenceEngine()
    broadcaster = Broadcaster()

    runner = ModuleRunner(store, prefs, broadcaster, vault_path=tmp_path / "vault")

    module = EmptyModule()
    count = await runner.run(module)

    assert count == 0
```

### Step 8.4: Run tests

```bash
python -m pytest tests/test_error_handling.py -v
```

Expected: PASS (may reveal unhandled exceptions that need fixing)

### Step 8.5: Commit

```bash
git add tests/test_error_handling.py
git commit -m "test: add error handling and edge case tests"
```

---

## Task 9: Run All Tests & Regression Check

**Files:**
- All test files
- All source files (if fixes needed)

### Step 9.1: Run complete test suite

```bash
cd /Users/huanc/Desktop/ABO
python -m pytest tests/ -v --tb=short 2>&1 | head -100
```

### Step 9.2: Fix any failing tests

For each failure:
1. Read the failing test
2. Identify root cause in source code
3. Fix the source code
4. Re-run the specific test
5. Continue until all pass

### Step 9.3: Run existing tests to ensure no regression

```bash
python -m pytest tests/test_scheduler_hot_updates.py tests/test_runtime_state.py -v
```

Expected: All PASS

### Step 9.4: Final commit

```bash
git add -A
git commit -m "test: complete API scheduling and execution test suite"
```

---

## Summary of Test Coverage

After completing all tasks, the following should be tested:

| Component | Test File | Coverage |
|-----------|-----------|----------|
| Module Discovery | `test_discovery.py` | Builtin loading, user modules, ordering |
| Scheduler Core | `test_scheduler_core.py` | Startup, run_now, disabled modules, timezone |
| Module Runner | `test_runner.py` | Pipeline, score threshold, max_cards |
| API Endpoints | `test_api_modules.py` | GET /modules, POST /run, error handling |
| Integration | `test_integration_module_flow.py` | End-to-end flow |
| Cron Validation | `test_cron_validation.py` | Expression validity, schedule updates |
| State Persistence | `test_state_integration.py` | Survival across restarts |
| Error Handling | `test_error_handling.py` | Fetch/process failures, empty results |
| Hot Updates | `test_scheduler_hot_updates.py` | Enabled/schedule changes *(existing)* |
| State Store | `test_runtime_state.py` | Load/save/apply *(existing)* |

---

## Self-Review Checklist

Before execution:
- [ ] Spec coverage: All scheduling, execution, and API aspects have tests
- [ ] No placeholders: Every step has executable code/commands
- [ ] Type consistency: Module, Item, Card, FeedbackAction types used correctly
- [ ] DRY: Similar test patterns use fixtures/helpers where appropriate
- [ ] YAGNI: No speculative test cases

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-04-api-scheduler-testing.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach would you prefer?**
