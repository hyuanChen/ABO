import pytest
from abo.runtime.scheduler import ModuleScheduler
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


@pytest.mark.anyio
async def test_update_schedule_changes_job():
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


@pytest.mark.anyio
async def test_update_enabled_removes_and_re_adds_job():
    runner = FakeRunner()
    scheduler = ModuleScheduler(runner)
    m = DummyModule()
    scheduler.start([m])

    scheduler.update_enabled(m, False)
    assert len(scheduler.job_info()) == 0

    scheduler.update_enabled(m, True)
    assert len(scheduler.job_info()) == 1
    scheduler.shutdown()
