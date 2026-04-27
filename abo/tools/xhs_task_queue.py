"""Shared in-process queue for Xiaohongshu browser/bridge tasks."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator, Awaitable, Callable

_XHS_ACTIVE_TASK_LOCK = asyncio.Lock()

ProgressCallback = Callable[[str], None | Awaitable[None]]


async def _maybe_await(value: None | Awaitable[None]) -> None:
    if value is not None:
        await value


@asynccontextmanager
async def xhs_serial_task(label: str, on_stage: ProgressCallback | None = None) -> AsyncIterator[None]:
    """Run an XHS task after all previously queued XHS tasks finish.

    The XHS extension bridge binds a fixed local port and drives a single real
    browser tab/window, so all active crawling/searching jobs must be serialized.
    """
    if _XHS_ACTIVE_TASK_LOCK.locked() and on_stage:
        await _maybe_await(on_stage(f"排队等待小红书任务：{label}"))
    async with _XHS_ACTIVE_TASK_LOCK:
        if on_stage:
            await _maybe_await(on_stage(f"开始执行小红书任务：{label}"))
        yield
