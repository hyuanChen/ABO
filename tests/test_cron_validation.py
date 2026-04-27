"""
Task 6: Cron Expression Validation Tests

Tests for cron expression validation and schedule updates.
"""
import pytest
from apscheduler.triggers.cron import CronTrigger

from abo.runtime.scheduler import ModuleScheduler
from abo.runtime.runner import ModuleRunner
from abo.runtime.discovery import ModuleRegistry
from abo.sdk import Module, Item, Card


KNOWN_SCHEDULES = {
    "arxiv-tracker": "0 9 * * *",
    "semantic-scholar-tracker": "0 9 * * *",
    "xiaohongshu-tracker": "30 8 * * *",
    "bilibili-tracker": "30 8 * * *",
    "xiaoyuzhou-tracker": "0 9 * * *",
    "zhihu-tracker": "0 9 * * *",
    "folder-monitor": "*/5 * * * *",
}


def test_all_builtin_modules_have_valid_cron():
    """Verify all default modules have valid cron expressions."""
    registry = ModuleRegistry()
    registry.load_all()

    modules = registry.all()
    assert len(modules) > 0, "No modules loaded from registry"

    invalid_schedules = []
    for module in modules:
        try:
            # Validate cron expression by creating a CronTrigger
            CronTrigger.from_crontab(module.schedule)
        except Exception as e:
            invalid_schedules.append((module.id, module.schedule, str(e)))

    assert not invalid_schedules, f"Modules with invalid cron expressions: {invalid_schedules}"


def test_builtin_module_schedules_match_expected():
    """Verify module schedules match the documented values."""
    registry = ModuleRegistry()
    registry.load_all()

    modules = registry.all()
    assert len(modules) > 0, "No modules loaded from registry"

    mismatches = []
    for module in modules:
        if module.id in KNOWN_SCHEDULES:
            expected = KNOWN_SCHEDULES[module.id]
            if module.schedule != expected:
                mismatches.append(
                    (module.id, module.schedule, expected)
                )

    assert not mismatches, f"Module schedules don't match expected: {mismatches}"


# Test module for schedule update tests
class TestMod(Module):
    id = "test-sched"
    name = "Test Schedule"
    schedule = "0 8 * * *"

    async def fetch(self) -> list[Item]:
        return []

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        return []


class FakeRunner:
    async def run(self, module: Module):
        pass


@pytest.mark.anyio
async def test_schedule_update_changes_trigger():
    """Test that updating schedule changes the cron trigger."""
    # Create a TestMod module with schedule="0 8 * * *"
    test_module = TestMod()

    # Create FakeRunner
    runner = FakeRunner()

    # Create and start scheduler
    scheduler = ModuleScheduler(runner)

    try:
        # Start scheduler with the module
        scheduler.start([test_module])

        # Get original job, check hour field == "8"
        job = scheduler._scheduler.get_job("test-sched")
        assert job is not None, "Job should exist after start"

        # fields[5] is hour in CronTrigger
        original_hour = str(job.trigger.fields[5])
        assert original_hour == "8", f"Expected hour='8', got '{original_hour}'"

        # Update module.schedule to "0 10 * * *"
        test_module.schedule = "0 10 * * *"

        # Call scheduler.update_schedule(m)
        scheduler.update_schedule(test_module)

        # Get job again, verify hour field == "10"
        updated_job = scheduler._scheduler.get_job("test-sched")
        assert updated_job is not None, "Job should exist after update"

        updated_hour = str(updated_job.trigger.fields[5])
        assert updated_hour == "10", f"Expected hour='10' after update, got '{updated_hour}'"

    finally:
        scheduler.shutdown()


@pytest.mark.anyio
async def test_update_schedule_preserves_other_fields():
    """Test that update_schedule only changes the schedule, preserves other job config."""
    test_module = TestMod()
    runner = FakeRunner()
    scheduler = ModuleScheduler(runner)

    try:
        scheduler.start([test_module])

        original_job = scheduler._scheduler.get_job("test-sched")
        original_misfire = original_job.misfire_grace_time

        # Update schedule
        test_module.schedule = "30 14 * * *"
        scheduler.update_schedule(test_module)

        updated_job = scheduler._scheduler.get_job("test-sched")

        # Verify ID is preserved
        assert updated_job.id == "test-sched"

        # Verify misfire grace time is preserved (should be 300 seconds)
        # Note: misfire_grace_time is on the job, not the trigger
        assert updated_job.misfire_grace_time == original_misfire

        # Verify minute and hour are updated correctly
        # CronTrigger fields: [year, month, day, week, day_of_week, hour, minute, second]
        assert str(updated_job.trigger.fields[5]) == "14"  # hour at index 5
        assert str(updated_job.trigger.fields[6]) == "30"  # minute at index 6

    finally:
        scheduler.shutdown()


def test_cron_validation_rejects_invalid_expressions():
    """Test that invalid cron expressions are properly rejected."""
    invalid_expressions = [
        "invalid",           # Not a cron expression
        "0 8 * *",          # Missing field
        "0 8 * * * *",      # Extra field
        "99 8 * * *",       # Invalid minute
        "0 25 * * *",       # Invalid hour
        "0 8 32 * *",       # Invalid day of month
        "0 8 * 13 *",       # Invalid month
        "0 8 * * 8",        # Invalid day of week
    ]

    for expr in invalid_expressions:
        with pytest.raises((ValueError, TypeError)):
            CronTrigger.from_crontab(expr)
