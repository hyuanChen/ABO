"""Keep the bundled release backend warm briefly for fast app reopen."""

from __future__ import annotations

import asyncio
import os
import signal
import time
from contextlib import suppress

_IDLE_EXIT_ENV = "ABO_BUNDLED_IDLE_EXIT_SECONDS"
_CHECK_INTERVAL_SECONDS = 5

_last_activity_monotonic = time.monotonic()
_active_websocket_count = 0
_idle_watchdog_task: asyncio.Task | None = None


def _idle_timeout_seconds() -> int:
    if os.environ.get("ABO_RUNNING_BUNDLED_APP") != "1":
        return 0
    try:
        return max(0, int(os.environ.get(_IDLE_EXIT_ENV, "0") or "0"))
    except ValueError:
        return 0


def bundled_idle_enabled() -> bool:
    return _idle_timeout_seconds() > 0


def mark_bundled_backend_activity() -> None:
    global _last_activity_monotonic
    _last_activity_monotonic = time.monotonic()


def bundled_backend_websocket_connected() -> None:
    global _active_websocket_count
    _active_websocket_count += 1
    mark_bundled_backend_activity()


def bundled_backend_websocket_disconnected() -> None:
    global _active_websocket_count
    _active_websocket_count = max(0, _active_websocket_count - 1)
    mark_bundled_backend_activity()


async def _idle_watchdog() -> None:
    timeout_seconds = _idle_timeout_seconds()
    if timeout_seconds <= 0:
        return

    while True:
        await asyncio.sleep(_CHECK_INTERVAL_SECONDS)
        idle_seconds = time.monotonic() - _last_activity_monotonic
        if _active_websocket_count > 0 or idle_seconds < timeout_seconds:
            continue

        print(
            f"[bundled-idle] No frontend activity for {idle_seconds:.1f}s; exiting bundled backend"
        )
        os.kill(os.getpid(), signal.SIGTERM)
        return


def start_bundled_idle_watchdog() -> None:
    global _idle_watchdog_task
    if not bundled_idle_enabled():
        return
    if _idle_watchdog_task and not _idle_watchdog_task.done():
        return

    mark_bundled_backend_activity()
    _idle_watchdog_task = asyncio.create_task(_idle_watchdog())


async def stop_bundled_idle_watchdog() -> None:
    global _idle_watchdog_task
    task = _idle_watchdog_task
    _idle_watchdog_task = None
    if task is None:
        return
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task
