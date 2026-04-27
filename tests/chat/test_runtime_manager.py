import asyncio
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

from abo.chat.runtime_manager import (
    BACKEND_SESSION_ID_KEY,
    ConversationRuntimeManager,
)
from abo.cli.runner import StreamEvent
from abo.store.conversations import ConversationStore


def _make_store(tmp_path: Path) -> ConversationStore:
    store = object.__new__(ConversationStore)
    store.db_path = str(tmp_path / "runtime-manager.db")
    store._initialized = False
    store._init_db()
    store._initialized = True
    return store


def test_runtime_manager_reuses_runtime_and_persists_resume_metadata(tmp_path, monkeypatch):
    store = _make_store(tmp_path)
    monkeypatch.setattr("abo.chat.runtime_manager.conversation_store", store)

    conv_id = store.create_conversation(cli_type="codex", session_id="session-1", title="Runtime Test")
    conv = store.get_conversation(conv_id)
    manager = ConversationRuntimeManager()

    create_calls = []

    def fake_create(_cli_info, _session_id, _workspace="", resume_session_id=None, conversation_id=None):
        create_calls.append(
            {
                "resume_session_id": resume_session_id,
                "conversation_id": conversation_id,
            }
        )
        runner = AsyncMock()
        runner.last_session_handle = resume_session_id

        async def fake_send(_message, msg_id, on_event):
            runner.last_session_handle = "thread-123"
            await on_event(StreamEvent(type="content", data="done", msg_id=msg_id))

        runner.send_message.side_effect = fake_send
        return runner

    with patch("abo.chat.runtime_manager.detector.get_cli_info") as mock_cli_info, patch(
        "abo.chat.runtime_manager.RunnerFactory.create",
        side_effect=fake_create,
    ):
        mock_cli = AsyncMock()
        mock_cli.id = "codex"
        mock_cli.is_available = True
        mock_cli_info.return_value = mock_cli

        runtime_before = asyncio.run(manager.get_or_create(conv))
        asyncio.run(manager.send_message(conv, "first", "msg-1", lambda _event: asyncio.sleep(0)))

        updated = store.get_conversation(conv_id)
        runtime_after = asyncio.run(manager.get_or_create(updated))
        asyncio.run(manager.send_message(updated, "second", "msg-2", lambda _event: asyncio.sleep(0)))

    metadata = store.parse_metadata(store.get_conversation(conv_id).metadata)
    assert runtime_before is runtime_after
    assert metadata[BACKEND_SESSION_ID_KEY] == "thread-123"
    assert create_calls[0]["resume_session_id"] is None
    assert create_calls[1]["resume_session_id"] == "thread-123"


def test_runtime_manager_uses_existing_resume_metadata(tmp_path, monkeypatch):
    store = _make_store(tmp_path)
    monkeypatch.setattr("abo.chat.runtime_manager.conversation_store", store)

    conv_id = store.create_conversation(
        cli_type="codex",
        session_id="session-2",
        title="Resume Test",
        metadata={
            "backend_session_id": "thread-existing",
            "backend_session_cli_type": "codex",
            "backend_session_conversation_id": None,
        },
    )
    conv = store.get_conversation(conv_id)
    manager = ConversationRuntimeManager()
    captured = {}

    def fake_create(_cli_info, _session_id, _workspace="", resume_session_id=None, conversation_id=None):
        captured["resume_session_id"] = resume_session_id
        runner = AsyncMock()

        async def fake_send(_message, msg_id, on_event):
            await on_event(StreamEvent(type="content", data="ok", msg_id=msg_id))

        runner.send_message.side_effect = fake_send
        return runner

    with patch("abo.chat.runtime_manager.detector.get_cli_info") as mock_cli_info, patch(
        "abo.chat.runtime_manager.RunnerFactory.create",
        side_effect=fake_create,
    ):
        mock_cli = AsyncMock()
        mock_cli.id = "codex"
        mock_cli.is_available = True
        mock_cli_info.return_value = mock_cli

        asyncio.run(manager.send_message(conv, "resume", "msg-1", lambda _event: asyncio.sleep(0)))

    assert captured["resume_session_id"] == "thread-existing"


def test_runtime_manager_stop_preserves_cache_and_kill_removes_it(tmp_path, monkeypatch):
    store = _make_store(tmp_path)
    monkeypatch.setattr("abo.chat.runtime_manager.conversation_store", store)

    conv_id = store.create_conversation(cli_type="claude", session_id="session-3", title="Kill Test")
    conv = store.get_conversation(conv_id)
    manager = ConversationRuntimeManager()

    runtime = asyncio.run(manager.get_or_create(conv))
    runtime._runner = AsyncMock()

    asyncio.run(manager.stop(conv_id))
    assert manager.has_runtime(conv_id) is True

    asyncio.run(manager.kill(conv_id))
    assert manager.has_runtime(conv_id) is False
