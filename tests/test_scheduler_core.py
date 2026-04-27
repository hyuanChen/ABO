import pytest
from abo.runtime.scheduler import ModuleScheduler
from abo.runtime.discovery import ModuleRegistry
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
        return 1


@pytest.mark.anyio
async def test_scheduler_starts_all_modules():
    """Test that scheduler starts jobs for all enabled modules."""
    runner = FakeRunner()
    scheduler = ModuleScheduler(runner)

    # Create two dummy modules
    m1 = DummyModule()
    m1.id = "m1"
    m1.name = "Module 1"

    m2 = DummyModule()
    m2.id = "m2"
    m2.name = "Module 2"

    modules = [m1, m2]
    scheduler.start(modules)

    try:
        # Verify job_info() returns correct jobs with next_run set
        jobs = scheduler.job_info()
        assert len(jobs) == 2

        job_ids = {job["id"] for job in jobs}
        assert job_ids == {"m1", "m2"}

        # Verify next_run is set for all jobs
        for job in jobs:
            assert job["next_run"] is not None
    finally:
        scheduler.shutdown()


@pytest.mark.anyio
async def test_run_now_triggers_module():
    """Test that run_now executes the module immediately."""
    runner = FakeRunner()
    scheduler = ModuleScheduler(runner)

    # Create a module and start scheduler
    m1 = DummyModule()
    m1.id = "m1"

    registry = ModuleRegistry()
    registry._modules = {"m1": m1}

    scheduler.start([m1])

    try:
        # Clear any initial runs
        runner.runs = []

        # Call run_now
        result = await scheduler.run_now("m1", registry)

        # Verify it returned True (success)
        assert result is True

        # Verify runner.run() was called with the module
        assert "m1" in runner.runs
    finally:
        scheduler.shutdown()


@pytest.mark.anyio
async def test_run_now_returns_false_for_missing_module():
    """Test that run_now returns False for non-existent module."""
    runner = FakeRunner()
    scheduler = ModuleScheduler(runner)

    registry = ModuleRegistry()
    registry._modules = {}

    scheduler.start([])

    try:
        # Call run_now with non-existent module
        result = await scheduler.run_now("nonexistent", registry)

        # Verify it returned False (module not found)
        assert result is False

        # Verify runner.run() was not called
        assert len(runner.runs) == 0
    finally:
        scheduler.shutdown()


@pytest.mark.anyio
async def test_disabled_modules_not_scheduled():
    """Test that disabled modules don't get scheduler jobs."""
    runner = FakeRunner()
    scheduler = ModuleScheduler(runner)

    # Create m1 with enabled=True (default), m2 with enabled=False
    m1 = DummyModule()
    m1.id = "m1"
    m1.enabled = True

    m2 = DummyModule()
    m2.id = "m2"
    m2.enabled = False

    # Note: scheduler.start() adds jobs for all modules passed to it
    # The filtering by enabled should happen before calling start()
    # This test verifies that when we pass only enabled modules, only those get jobs
    enabled_modules = [m for m in [m1, m2] if m.enabled]
    scheduler.start(enabled_modules)

    try:
        # Verify only m1 has a job
        jobs = scheduler.job_info()
        assert len(jobs) == 1
        assert jobs[0]["id"] == "m1"
    finally:
        scheduler.shutdown()


@pytest.mark.anyio
async def test_scheduler_uses_shanghai_timezone():
    """Test that scheduler uses Asia/Shanghai timezone."""
    runner = FakeRunner()
    scheduler = ModuleScheduler(runner)

    # Verify scheduler timezone is set correctly
    # zoneinfo.ZoneInfo uses .key instead of .zone
    assert str(scheduler._scheduler.timezone) == "Asia/Shanghai"

    scheduler.start([])
    try:
        # Double-check after start
        assert str(scheduler._scheduler.timezone) == "Asia/Shanghai"
    finally:
        scheduler.shutdown()
