from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from abo.assistant.store import AssistantSessionStore
from abo.main import app
from abo.store.conversations import ConversationStore


def _make_conversation_store(tmp_path) -> ConversationStore:
    store = object.__new__(ConversationStore)
    store.db_path = str(tmp_path / "assistant-conversations.db")
    store._initialized = False
    store._init_db()
    store._initialized = True
    return store


def _make_assistant_store(tmp_path) -> AssistantSessionStore:
    store = object.__new__(AssistantSessionStore)
    store.db_path = str(tmp_path / "assistant-sessions.db")
    store._initialized = False
    store._init_db()
    store._initialized = True
    return store


@pytest.fixture(autouse=True)
def isolate_assistant_stores(tmp_path, monkeypatch):
    ConversationStore._instance = None
    AssistantSessionStore._instance = None

    conversation_store = _make_conversation_store(tmp_path)
    assistant_store = _make_assistant_store(tmp_path)

    monkeypatch.setattr("abo.assistant.routes.conversation_store", conversation_store)
    monkeypatch.setattr("abo.assistant.routes.assistant_session_store", assistant_store)
    monkeypatch.setattr("abo.routes.chat.conversation_store", conversation_store)
    monkeypatch.setattr("abo.routes.chat.assistant_session_store", assistant_store)
    monkeypatch.setattr("abo.chat.runtime_manager.conversation_store", conversation_store)
    monkeypatch.setattr("abo.store.conversations.conversation_store", conversation_store)
    monkeypatch.setattr("abo.assistant.store.assistant_session_store", assistant_store)

    yield

    ConversationStore._instance = None
    AssistantSessionStore._instance = None


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_assistant_overview_demo_mode(client: TestClient):
    with patch("abo.assistant.routes.is_demo_mode", return_value=True), patch(
        "abo.assistant.routes.get_ai_provider",
        return_value="codex",
    ):
        response = client.get("/api/assistant/overview")

    assert response.status_code == 200
    data = response.json()

    assert data["system"]["provider"] == "codex"
    assert data["system"]["providerLabel"] == "Codex"
    assert data["system"]["vaultReady"] is True
    assert data["inbox"]["totalUnread"] >= 0
    assert isinstance(data["inbox"]["spotlight"], list)
    assert "intel" in data["wiki"]
    assert "totalCards" in data["insights"]
    assert data["conversations"]["activeCount"] == 0


def test_assistant_overview_live_mode_backfills_from_raw_assistant_conversations(client: TestClient):
    from abo.assistant import routes as assistant_routes

    conversation_store = assistant_routes.conversation_store
    conversation_id = conversation_store.create_conversation(
        cli_type="codex",
        session_id="raw-session-1",
        title="Internet Wiki 整理",
        origin="assistant",
        metadata={"backend_session_id": "thread-1"},
    )
    conversation_store.add_message(conversation_id, "user", "先整理今天的情报")
    conversation_store.add_message(conversation_id, "assistant", "已经按 Wiki 页面整理。")

    dummy_cards = [
        SimpleNamespace(
            id="card-1",
            title="Embodied Agents Weekly",
            summary="A new roundup worth organizing.",
            module_id="arxiv-tracker",
            score=0.91,
            tags=["robotics", "agent"],
            source_url="https://example.com/1",
            created_at=1_717_171_717,
        )
    ]
    dummy_timeline = SimpleNamespace(
        summary="今天应该先做文献整理，再写 Wiki。",
        activities=[
            SimpleNamespace(type=SimpleNamespace(value="chat_message")),
            SimpleNamespace(type=SimpleNamespace(value="module_run")),
            SimpleNamespace(type=SimpleNamespace(value="chat_start")),
        ],
    )

    with patch("abo.assistant.routes.is_demo_mode", return_value=False), patch(
        "abo.assistant.routes.get_ai_provider",
        return_value="codex",
    ), patch("abo.assistant.routes.get_vault_path", return_value=None), patch(
        "abo.assistant.routes.get_literature_path",
        return_value=None,
    ), patch.object(
        assistant_routes._card_store,
        "unread_counts",
        return_value={"arxiv-tracker": 3},
    ), patch.object(
        assistant_routes._card_store,
        "list",
        return_value=dummy_cards,
    ), patch(
        "abo.assistant.routes._total_cards",
        return_value=18,
    ), patch(
        "abo.assistant.routes._cards_this_week",
        return_value=6,
    ), patch(
        "abo.assistant.routes._reading_streak",
        return_value=4,
    ), patch.object(
        assistant_routes._prefs,
        "get_top_keywords",
        return_value=[("robotics", 0.88)],
    ), patch("abo.assistant.routes.ActivityTracker") as tracker_cls:
        tracker_cls.return_value.get_timeline.return_value = dummy_timeline
        response = client.get("/api/assistant/overview")

    assert response.status_code == 200
    data = response.json()

    assert data["system"]["vaultReady"] is False
    assert data["system"]["literatureReady"] is False
    assert data["inbox"]["totalUnread"] == 3
    assert data["inbox"]["spotlight"][0]["title"] == "Embodied Agents Weekly"
    assert data["wiki"]["intel"]["ready"] is False
    assert data["insights"]["topKeyword"] == "robotics"
    assert data["insights"]["chatCount"] == 2
    assert data["insights"]["moduleRunCount"] == 1
    assert data["conversations"]["activeCount"] == 1
    assert data["conversations"]["recent"][0]["title"] == "Internet Wiki 整理"
    assert data["conversations"]["recent"][0]["rawConversationId"] == conversation_id
    assert data["conversations"]["recent"][0]["rawSessionId"] == "thread-1"


def test_assistant_session_messages_backfill_from_raw_history(client: TestClient):
    from abo.assistant import routes as assistant_routes

    conversation_store = assistant_routes.conversation_store
    assistant_store = assistant_routes.assistant_session_store

    conversation_id = conversation_store.create_conversation(
        cli_type="codex",
        session_id="raw-session-2",
        title="Backfill Messages",
        origin="assistant",
    )
    user_message_id = conversation_store.add_message(conversation_id, "user", "第一条")
    assistant_message_id = conversation_store.add_message(conversation_id, "assistant", "第二条")

    assistant_store.upsert_session(
        raw_conversation_id=conversation_id,
        cli_type="codex",
        raw_session_id="raw-session-2",
        title="Backfill Messages",
    )
    session = assistant_store.get_session_by_raw_conversation(conversation_id)
    assert session is not None

    response = client.get(f"/api/assistant/sessions/{session.id}/messages")

    assert response.status_code == 200
    data = response.json()
    assert [message["role"] for message in data] == ["user", "assistant"]
    assert data[0]["content"] == "第一条"
    assert data[1]["content"] == "第二条"

    mirrored = assistant_store.list_messages(session.id, limit=10)
    assert [message.raw_message_id for message in mirrored] == [user_message_id, assistant_message_id]


def test_delete_assistant_session_removes_raw_conversation_and_mirror(client: TestClient):
    from abo.assistant import routes as assistant_routes

    conversation_store = assistant_routes.conversation_store
    assistant_store = assistant_routes.assistant_session_store

    conversation_id = conversation_store.create_conversation(
        cli_type="codex",
        session_id="raw-session-3",
        title="Delete Both",
        origin="assistant",
    )
    assistant_store.upsert_session(
        raw_conversation_id=conversation_id,
        cli_type="codex",
        raw_session_id="raw-session-3",
        title="Delete Both",
    )
    session = assistant_store.get_session_by_raw_conversation(conversation_id)
    assert session is not None

    response = client.delete(f"/api/assistant/sessions/{session.id}")

    assert response.status_code == 200
    assert assistant_store.get_session(session.id) is None
    assert conversation_store.get_conversation(conversation_id) is None
    assert assistant_store.is_deleted_raw_conversation(conversation_id, "raw-session-3") is True


def test_deleted_assistant_session_does_not_rehydrate_from_stale_raw_conversation(client: TestClient):
    from abo.assistant import routes as assistant_routes

    conversation_store = assistant_routes.conversation_store
    assistant_store = assistant_routes.assistant_session_store

    conversation_id = conversation_store.create_conversation(
        cli_type="codex",
        session_id="raw-session-4",
        title="Should Stay Deleted",
        origin="assistant",
    )
    assistant_store.upsert_session(
        raw_conversation_id=conversation_id,
        cli_type="codex",
        raw_session_id="raw-session-4",
        title="Should Stay Deleted",
    )
    session = assistant_store.get_session_by_raw_conversation(conversation_id)
    assert session is not None

    response = client.request(
        "DELETE",
        f"/api/assistant/sessions/{session.id}",
        json={"rawConversationId": conversation_id, "rawSessionId": "raw-session-4"},
    )
    assert response.status_code == 200

    now = 1_800_000_000_000
    with conversation_store._get_conn() as conn:  # noqa: SLF001 - simulate a stale raw DB row returning after migration/restart
        conn.execute(
            """
            INSERT INTO conversations (
                id, cli_type, session_id, title, workspace, metadata, origin, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                conversation_id,
                "codex",
                "raw-session-4",
                "Should Stay Deleted",
                "",
                "{}",
                "assistant",
                "active",
                now,
                now,
            ),
        )

    sessions_response = client.get("/api/assistant/sessions?limit=20")
    assert sessions_response.status_code == 200
    payload = sessions_response.json()
    assert payload["count"] == 0
    assert payload["items"] == []
    assert assistant_store.get_session_by_raw_conversation(conversation_id) is None


def test_delete_missing_assistant_session_still_tombstones_raw_conversation(client: TestClient):
    from abo.assistant import routes as assistant_routes

    conversation_store = assistant_routes.conversation_store
    assistant_store = assistant_routes.assistant_session_store

    conversation_id = conversation_store.create_conversation(
        cli_type="codex",
        session_id="raw-session-missing-mirror",
        title="Missing Mirror",
        origin="assistant",
    )

    response = client.request(
        "DELETE",
        "/api/assistant/sessions/stale-assistant-session",
        json={
            "rawConversationId": conversation_id,
            "rawSessionId": "raw-session-missing-mirror",
        },
    )

    assert response.status_code == 200
    assert conversation_store.get_conversation(conversation_id) is None
    assert assistant_store.is_deleted_raw_conversation(conversation_id, "raw-session-missing-mirror") is True
