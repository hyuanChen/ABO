from __future__ import annotations

import asyncio
from typing import Awaitable, Callable, TypeVar


T = TypeVar("T")

_RETRYABLE_ERROR_TOKENS = (
    "timeout",
    "timed out",
    "temporary",
    "temporarily",
    "connection reset",
    "connection aborted",
    "connection closed",
    "connection lost",
    "network",
    "econnreset",
    "eof",
    "stream closed",
    "remoteprotocolerror",
    "remote protocol",
    "server disconnected",
    "502",
    "503",
    "504",
    "too many requests",
    "bridge timeout",
    "frame detached",
    "browser has been closed",
    "target page, context or browser has been closed",
    "current tab became unavailable",
    "click target disappeared",
    "failed to fetch following feed",
    "extension execution failed",
)

_NON_RETRYABLE_ERROR_TOKENS = (
    "sessdata is required",
    "cookie is required",
    "missing cookie",
    "missing sessdata",
    "未配置",
    "没有配置",
    "请输入",
    "已过期或无效",
)


def is_retryable_social_runtime_error(exc: Exception) -> bool:
    if isinstance(exc, (TimeoutError, ConnectionError, OSError)):
        return True

    message = str(exc or "").strip().lower()
    if not message:
        return False

    if any(token in message for token in _NON_RETRYABLE_ERROR_TOKENS):
        return False

    return any(token in message for token in _RETRYABLE_ERROR_TOKENS)


async def run_social_runtime_with_retry(
    label: str,
    operation: Callable[[], Awaitable[T]],
    *,
    attempts: int = 2,
    base_delay_seconds: float = 0.8,
) -> T:
    normalized_attempts = max(1, int(attempts or 1))
    last_error: Exception | None = None

    for attempt in range(1, normalized_attempts + 1):
        try:
            return await operation()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            last_error = exc
            if attempt >= normalized_attempts or not is_retryable_social_runtime_error(exc):
                raise
            delay_seconds = max(0.1, float(base_delay_seconds)) * attempt
            print(
                f"[social-runtime] {label} transient failure on attempt {attempt}/{normalized_attempts}: "
                f"{exc}. retrying in {delay_seconds:.1f}s"
            )
            await asyncio.sleep(delay_seconds)

    assert last_error is not None
    raise last_error
