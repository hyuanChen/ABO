from datetime import datetime, timedelta
from apscheduler.triggers.cron import CronTrigger
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import asyncio


class SummaryScheduler:
    def __init__(self, generator):
        self.generator = generator
        self.scheduler = AsyncIOScheduler()

    def start(self):
        """Start the scheduler with daily summary at 11 AM."""
        # Schedule daily summary at 11:00 AM
        trigger = CronTrigger(hour=11, minute=0)
        self.scheduler.add_job(
            self._generate_daily_summary,
            trigger=trigger,
            id="daily_summary",
            replace_existing=True
        )
        self.scheduler.start()
        print("[summary] Daily summary scheduler started (11:00 AM)")

    async def _generate_daily_summary(self):
        """Generate summary for today."""
        today = datetime.now().strftime("%Y-%m-%d")
        print(f"[summary] Generating daily summary for {today}")

        summary = await asyncio.to_thread(self.generator.generate_summary, today)

        if summary:
            print(f"[summary] Successfully generated summary for {today}")
        else:
            print(f"[summary] No summary generated for {today} (no activities or error)")

    def shutdown(self):
        """Shutdown the scheduler."""
        self.scheduler.shutdown()
        print("[summary] Scheduler shutdown")

    def generate_now(self, date: str = None) -> str:
        """Manually trigger summary generation."""
        if date is None:
            date = datetime.now().strftime("%Y-%m-%d")
        return self.generator.generate_summary(date)
