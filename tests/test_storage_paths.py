from pathlib import Path

from abo.assistant.store import AssistantSessionStore
from abo.store.conversations import ConversationStore
import abo.storage_paths as storage_paths


def _reset_assistant_store_singleton() -> None:
    AssistantSessionStore._instance = None


def _reset_conversation_store_singleton() -> None:
    ConversationStore._instance = None


def test_resolve_app_db_path_uses_macos_application_support(monkeypatch, tmp_path):
    monkeypatch.delenv("ABO_APP_DATA_DIR", raising=False)
    monkeypatch.delenv("ABO_DATA_DIR", raising=False)
    monkeypatch.setattr(storage_paths.sys, "platform", "darwin")
    monkeypatch.setattr(storage_paths.Path, "home", lambda: tmp_path)

    resolved = Path(storage_paths.resolve_app_db_path("assistant_sessions.db"))

    assert resolved == tmp_path / "Library" / "Application Support" / "ABO" / "data" / "assistant_sessions.db"


def test_resolve_app_db_path_migrates_legacy_database(monkeypatch, tmp_path):
    monkeypatch.delenv("ABO_APP_DATA_DIR", raising=False)
    monkeypatch.delenv("ABO_DATA_DIR", raising=False)
    monkeypatch.setattr(storage_paths.sys, "platform", "darwin")
    monkeypatch.setattr(storage_paths.Path, "home", lambda: tmp_path)

    legacy_path = tmp_path / ".abo" / "data" / "assistant_sessions.db"
    legacy_path.parent.mkdir(parents=True, exist_ok=True)
    legacy_path.write_bytes(b"legacy assistant db")

    resolved = Path(storage_paths.resolve_app_db_path("assistant_sessions.db"))

    assert resolved.exists()
    assert resolved.read_bytes() == b"legacy assistant db"


def test_assistant_store_honors_app_data_override(monkeypatch, tmp_path):
    override_root = tmp_path / "PortableABO"
    monkeypatch.setenv("ABO_APP_DATA_DIR", str(override_root))
    monkeypatch.delenv("ABO_DATA_DIR", raising=False)
    _reset_assistant_store_singleton()

    try:
        store = AssistantSessionStore()
        assert Path(store.db_path) == override_root / "data" / "assistant_sessions.db"
        session = store.upsert_session(
            raw_conversation_id="raw-conv-1",
            cli_type="codex",
            raw_session_id="session-1",
            title="Portable Session",
        )
        assert session.title == "Portable Session"
        assert Path(store.db_path).exists()
    finally:
        _reset_assistant_store_singleton()


def test_conversation_store_honors_app_data_override(monkeypatch, tmp_path):
    override_root = tmp_path / "PortableABO"
    monkeypatch.setenv("ABO_APP_DATA_DIR", str(override_root))
    monkeypatch.delenv("ABO_DATA_DIR", raising=False)
    _reset_conversation_store_singleton()

    try:
        store = ConversationStore()
        assert Path(store.db_path) == override_root / "data" / "conversations.db"
        conv_id = store.create_conversation(
            cli_type="codex",
            session_id="session-1",
            title="Portable Raw Conversation",
        )
        assert store.get_conversation(conv_id).title == "Portable Raw Conversation"
        assert Path(store.db_path).exists()
    finally:
        _reset_conversation_store_singleton()
