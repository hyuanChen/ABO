"""Conversation-scoped runtime cache and session resume helpers."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from typing import Awaitable, Callable, Optional

from ..cli.detector import detector
from ..cli.runner import BaseRunner, RunnerFactory, StreamEvent
from ..store.conversations import Conversation, conversation_store

logger = logging.getLogger(__name__)

EventHandler = Callable[[StreamEvent], Awaitable[None]]

BACKEND_SESSION_ID_KEY = "backend_session_id"
BACKEND_SESSION_CLI_KEY = "backend_session_cli_type"
BACKEND_SESSION_CONVERSATION_KEY = "backend_session_conversation_id"
BACKEND_SESSION_UPDATED_AT_KEY = "backend_session_updated_at"


class RuntimeBusyError(RuntimeError):
    """Raised when a conversation already has an active turn."""


class ConversationRuntime:
    """Runtime state for a single conversation."""

    def __init__(self, conversation_id: str):
        self.conversation_id = conversation_id
        self._lock = asyncio.Lock()
        self._runner: Optional[BaseRunner] = None
        self._active_turn: Optional[asyncio.Task] = None
        self._last_active = time.monotonic()
        self._last_active_wall = time.time()
        self._resume_session_id: Optional[str] = None
        self._resume_cli_type: Optional[str] = None

    @property
    def last_active(self) -> float:
        return self._last_active

    @property
    def last_active_at(self) -> int:
        return int(self._last_active_wall * 1000)

    def touch(self) -> None:
        self._last_active = time.monotonic()
        self._last_active_wall = time.time()

    def is_busy(self) -> bool:
        return self._active_turn is not None and not self._active_turn.done()

    def _load_resume_state(self, conv: Conversation) -> None:
        metadata = conversation_store.parse_metadata(conv.metadata)
        session_id = str(metadata.get(BACKEND_SESSION_ID_KEY) or "").strip()
        session_cli = str(metadata.get(BACKEND_SESSION_CLI_KEY) or "").strip()
        session_conv = str(metadata.get(BACKEND_SESSION_CONVERSATION_KEY) or "").strip()

        if not session_id or session_cli != conv.cli_type:
            return
        if session_conv and session_conv != conv.id:
            return

        self._resume_session_id = session_id
        self._resume_cli_type = session_cli

    async def warmup(self, conv: Conversation) -> None:
        """Prepare lightweight runtime state without starting a CLI turn."""
        async with self._lock:
            self.touch()
            self._load_resume_state(conv)

            cli_info = detector.get_cli_info(conv.cli_type)
            if not cli_info or not cli_info.is_available:
                raise RuntimeError(f"CLI {conv.cli_type} not available")

    def state(self, conv: Optional[Conversation] = None) -> dict:
        cli_type = conv.cli_type if conv else self._resume_cli_type
        return {
            "conversation_id": self.conversation_id,
            "has_runtime": True,
            "busy": self.is_busy(),
            "last_active_at": self.last_active_at,
            "resume_session_id": self._resume_session_id,
            "cli_type": cli_type,
        }

    def _persist_resume_state(self, conv: Conversation, session_id: Optional[str]) -> None:
        normalized = str(session_id or "").strip()
        if not normalized:
            return
        if normalized == self._resume_session_id and self._resume_cli_type == conv.cli_type:
            return

        self._resume_session_id = normalized
        self._resume_cli_type = conv.cli_type
        conversation_store.merge_conversation_metadata(
            conv.id,
            {
                BACKEND_SESSION_ID_KEY: normalized,
                BACKEND_SESSION_CLI_KEY: conv.cli_type,
                BACKEND_SESSION_CONVERSATION_KEY: conv.id,
                BACKEND_SESSION_UPDATED_AT_KEY: int(time.time() * 1000),
            },
        )

    async def send_message(
        self,
        conv: Conversation,
        message: str,
        msg_id: str,
        on_event: EventHandler,
    ) -> None:
        if self.is_busy():
            raise RuntimeBusyError(f"Conversation {conv.id} already has an active turn")

        async with self._lock:
            if self.is_busy():
                raise RuntimeBusyError(f"Conversation {conv.id} already has an active turn")

            self.touch()
            self._load_resume_state(conv)

            cli_info = detector.get_cli_info(conv.cli_type)
            if not cli_info or not cli_info.is_available:
                raise RuntimeError(f"CLI {conv.cli_type} not available")

            runner = RunnerFactory.create(
                cli_info,
                conv.session_id,
                conv.workspace,
                resume_session_id=self._resume_session_id,
                conversation_id=conv.id,
            )
            self._runner = runner
            current_task = asyncio.current_task()
            self._active_turn = current_task

            async def handle_event(event: StreamEvent) -> None:
                session_handle = getattr(runner, "last_session_handle", None)
                if session_handle:
                    self._persist_resume_state(conv, session_handle)
                await on_event(event)

            try:
                await runner.send_message(message, msg_id, handle_event)
                session_handle = getattr(runner, "last_session_handle", None)
                if session_handle:
                    self._persist_resume_state(conv, session_handle)
            finally:
                self.touch()
                conversation_store.touch_conversation(conv.id)
                if self._active_turn is current_task:
                    self._active_turn = None
                if self._runner is runner:
                    self._runner = None

    async def stop(self) -> bool:
        self.touch()
        runner = self._runner
        active_turn = self._active_turn
        stopped = bool(runner or (active_turn and not active_turn.done()))
        if runner:
            await runner.close()
        if active_turn and not active_turn.done() and active_turn is not asyncio.current_task():
            if runner is None:
                active_turn.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await active_turn
                return stopped
            try:
                await asyncio.wait_for(asyncio.shield(active_turn), timeout=2.0)
            except asyncio.TimeoutError:
                active_turn.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await active_turn
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception("Failed while stopping conversation turn")
        return stopped

    async def kill(self) -> None:
        await self.stop()
        active_turn = self._active_turn
        if active_turn and not active_turn.done() and active_turn is not asyncio.current_task():
            try:
                await asyncio.wait_for(active_turn, timeout=2.0)
            except asyncio.TimeoutError:
                active_turn.cancel()
            except Exception:
                logger.exception("Failed while waiting for conversation turn to stop")


class ConversationRuntimeManager:
    """Cache runtime state by conversation id."""

    def __init__(self):
        self._runtimes: dict[str, ConversationRuntime] = {}
        self._lock = asyncio.Lock()

    async def get_or_create(self, conv: Conversation) -> ConversationRuntime:
        runtime = self._runtimes.get(conv.id)
        if runtime:
            runtime.touch()
            return runtime

        async with self._lock:
            runtime = self._runtimes.get(conv.id)
            if runtime is None:
                runtime = ConversationRuntime(conv.id)
                self._runtimes[conv.id] = runtime
            runtime.touch()
            return runtime

    async def send_message(
        self,
        conv: Conversation,
        message: str,
        msg_id: str,
        on_event: EventHandler,
    ) -> None:
        runtime = await self.get_or_create(conv)
        await runtime.send_message(conv, message, msg_id, on_event)

    async def warmup(self, conv: Conversation) -> dict:
        runtime = await self.get_or_create(conv)
        await runtime.warmup(conv)
        return runtime.state(conv)

    async def stop(self, conv_id: str) -> bool:
        runtime = self._runtimes.get(conv_id)
        if runtime:
            return await runtime.stop()
        return False

    async def kill(self, conv_id: str) -> None:
        runtime = self._runtimes.pop(conv_id, None)
        if runtime:
            await runtime.kill()

    async def kill_all(self) -> None:
        targets = list(self._runtimes.keys())
        for conv_id in targets:
            await self.kill(conv_id)

    async def cleanup_idle(self, *, max_idle_seconds: float) -> list[str]:
        now = time.monotonic()
        expired = [
            conv_id
            for conv_id, runtime in self._runtimes.items()
            if (now - runtime.last_active) >= max_idle_seconds and not runtime.is_busy()
        ]
        for conv_id in expired:
            await self.kill(conv_id)
        return expired

    def has_runtime(self, conv_id: str) -> bool:
        return conv_id in self._runtimes

    def get_state(self, conv: Conversation) -> dict:
        runtime = self._runtimes.get(conv.id)
        if not runtime:
            metadata = conversation_store.parse_metadata(conv.metadata)
            return {
                "conversation_id": conv.id,
                "has_runtime": False,
                "busy": False,
                "last_active_at": None,
                "resume_session_id": str(metadata.get(BACKEND_SESSION_ID_KEY) or "").strip() or None,
                "cli_type": conv.cli_type,
            }
        return runtime.state(conv)


conversation_runtime_manager = ConversationRuntimeManager()
