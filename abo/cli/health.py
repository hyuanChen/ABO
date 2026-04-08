"""CLI process health monitoring."""

import psutil
from typing import Optional
from dataclasses import dataclass
from datetime import datetime
import asyncio


@dataclass
class ProcessHealth:
    pid: int
    status: str  # running, sleeping, zombie, dead
    cpu_percent: float
    memory_mb: float
    create_time: datetime
    is_responsive: bool  # Can respond to signals


class CliHealthMonitor:
    """CLI process health monitor."""

    def __init__(self):
        self._monitored: dict[str, int] = {}  # session_id -> pid

    def register(self, session_id: str, process: asyncio.subprocess.Process):
        """Register process for monitoring."""
        if process.pid:
            self._monitored[session_id] = process.pid

    def unregister(self, session_id: str):
        """Unregister from monitoring."""
        self._monitored.pop(session_id, None)

    def check_health(self, session_id: str) -> Optional[ProcessHealth]:
        """Check process health status."""
        pid = self._monitored.get(session_id)
        if not pid:
            return None

        try:
            proc = psutil.Process(pid)

            # Check if process responds
            is_responsive = True
            try:
                proc.status()
            except psutil.NoSuchProcess:
                return None

            return ProcessHealth(
                pid=pid,
                status=proc.status(),
                cpu_percent=proc.cpu_percent(interval=0.1),
                memory_mb=proc.memory_info().rss / 1024 / 1024,
                create_time=datetime.fromtimestamp(proc.create_time()),
                is_responsive=is_responsive
            )

        except psutil.NoSuchProcess:
            self.unregister(session_id)
            return None
        except Exception as e:
            print(f"Health check error: {e}")
            return None

    def is_healthy(self, session_id: str) -> bool:
        """Quick health check."""
        health = self.check_health(session_id)
        if not health:
            return False

        # Zombie or dead process is unhealthy
        if health.status in ['zombie', 'dead']:
            return False
        if not health.is_responsive:
            return False

        return True


# Global instance
health_monitor = CliHealthMonitor()
