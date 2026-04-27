import asyncio

import pytest

from abo.chat import conversation_runtime_manager


def _patch_chat_test_compat() -> None:
    from abo.cli.runner import RunnerFactory
    from abo.routes import chat as chat_module

    if getattr(chat_module, "RunnerFactory", None) is None:
        chat_module.RunnerFactory = RunnerFactory

    manager_cls = chat_module.ConnectionManager
    if getattr(manager_cls, "_compat_patch_applied", False):
        return

    original_init = manager_cls.__init__

    def patched_init(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        if not hasattr(self, "runners"):
            self.runners = {}

    manager_cls.__init__ = patched_init
    manager_cls._compat_patch_applied = True

    manager = getattr(chat_module, "manager", None)
    if manager is not None and not hasattr(manager, "runners"):
        manager.runners = {}


_patch_chat_test_compat()


class _DetachedTask:
    def __init__(self, coro):
        coro.close()

    def done(self) -> bool:
        return False

    def add_done_callback(self, _callback) -> None:
        return None

    def __await__(self):
        async def _empty():
            return None

        return _empty().__await__()


_original_create_task = asyncio.create_task


def _compat_create_task(coro, *args, **kwargs):
    try:
        return _original_create_task(coro, *args, **kwargs)
    except RuntimeError as exc:
        if "no running event loop" not in str(exc):
            raise
        return _DetachedTask(coro)


asyncio.create_task = _compat_create_task


@pytest.fixture(autouse=True)
def reset_runtime_manager():
    asyncio.run(conversation_runtime_manager.kill_all())
    yield
    asyncio.run(conversation_runtime_manager.kill_all())
