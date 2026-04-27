from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..sdk.base import Module
from .runner import ModuleRunner
from .discovery import ModuleRegistry


class ModuleScheduler:
    def __init__(self, runner: ModuleRunner):
        self._runner = runner
        self._scheduler = AsyncIOScheduler(timezone="Asia/Shanghai")

    def start(self, modules: list[Module]):
        for m in modules:
            self._add_job(m)
        self._scheduler.start()
        print(f"[scheduler] Started with {len(modules)} module(s)")

    def _add_job(self, module: Module):
        self._scheduler.add_job(
            self._runner.run,
            CronTrigger.from_crontab(module.schedule),
            args=[module],
            id=module.id,
            replace_existing=True,
            misfire_grace_time=300,
        )

    def reschedule(self, modules: list[Module]):
        for m in modules:
            if not self._scheduler.get_job(m.id):
                self._add_job(m)

    async def run_now(self, module_id: str, registry: ModuleRegistry) -> bool:
        return (await self.run_now_with_count(module_id, registry)) is not None

    async def run_now_with_count(self, module_id: str, registry: ModuleRegistry) -> int | None:
        module = registry.get(module_id)
        if not module:
            return None
        return await self._runner.run(module)

    def job_info(self) -> list[dict]:
        return [
            {
                "id": job.id,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                "trigger": str(job.trigger) if job.trigger else None,
                "misfire_grace_time": job.misfire_grace_time if hasattr(job, "misfire_grace_time") else None,
            }
            for job in self._scheduler.get_jobs()
        ]

    def update_schedule(self, module: Module):
        existing = self._scheduler.get_job(module.id)
        if existing:
            self._scheduler.remove_job(module.id)
        self._add_job(module)

    def update_enabled(self, module: Module, enabled: bool):
        existing = self._scheduler.get_job(module.id)
        if enabled and not existing:
            self._add_job(module)
        elif not enabled and existing:
            self._scheduler.remove_job(module.id)

    def shutdown(self):
        self._scheduler.shutdown(wait=False)
