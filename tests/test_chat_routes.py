"""
Tests for chat routes and WebSocket endpoints.

Tests for FastAPI chat endpoints:
- GET /api/chat/cli/detect
- GET /api/chat/cli/{id}
- POST /api/chat/conversations
- GET /api/chat/conversations
- GET /api/chat/conversations/{id}
- DELETE /api/chat/conversations/{id}
- PATCH /api/chat/conversations/{id}/title
- GET /api/chat/conversations/{id}/messages
- GET /api/chat/connections
- WebSocket /api/chat/ws/{cli_type}/{session_id}
"""
from types import SimpleNamespace
import pytest
import json
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from abo.main import app
from abo.chat import conversation_runtime_manager
from abo.assistant.store import AssistantSessionStore
from abo.store.conversations import ConversationStore


@pytest.fixture(autouse=True)
def reset_singleton():
    """Reset conversation store singleton before each test."""
    ConversationStore._instance = None
    AssistantSessionStore._instance = None
    asyncio.run(conversation_runtime_manager.kill_all())
    yield
    asyncio.run(conversation_runtime_manager.kill_all())
    ConversationStore._instance = None
    AssistantSessionStore._instance = None


def _make_conversation_store(tmp_path) -> ConversationStore:
    store = object.__new__(ConversationStore)
    store.db_path = str(tmp_path / "chat-routes.db")
    store._initialized = False
    store._init_db()
    store._initialized = True
    return store


def _make_assistant_store(tmp_path) -> AssistantSessionStore:
    store = object.__new__(AssistantSessionStore)
    store.db_path = str(tmp_path / "assistant-routes.db")
    store._initialized = False
    store._init_db()
    store._initialized = True
    return store


@pytest.fixture(autouse=True)
def isolate_chat_stores(tmp_path, monkeypatch):
    conversation_store = _make_conversation_store(tmp_path)
    assistant_store = _make_assistant_store(tmp_path)

    monkeypatch.setattr("abo.routes.chat.conversation_store", conversation_store)
    monkeypatch.setattr("abo.routes.chat.assistant_session_store", assistant_store)
    monkeypatch.setattr("abo.chat.runtime_manager.conversation_store", conversation_store)
    monkeypatch.setattr("abo.store.conversations.conversation_store", conversation_store)
    monkeypatch.setattr("abo.assistant.store.assistant_session_store", assistant_store)
    monkeypatch.setattr("abo.routes.chat.build_assistant_chat_context", lambda: "助手工作台上下文：测试。")
    monkeypatch.setattr(
        "abo.chat.runtime_manager.detector.get_cli_info",
        lambda cli_type: SimpleNamespace(id=cli_type, is_available=True),
    )

    yield


@pytest.fixture
def client():
    """Create a TestClient with lifespan support."""
    with TestClient(app) as c:
        yield c


class TestCliDetectionEndpoints:
    """Tests for CLI detection endpoints."""

    def test_cli_detect_endpoint(self, client):
        """Test GET /api/chat/cli/detect returns available CLIs."""
        # Mock the detector to return test data
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.command = "claude"
        mock_cli.version = "1.0.0"
        mock_cli.is_available = True
        mock_cli.protocol = "raw"

        with patch("abo.routes.chat.detector.detect_all", return_value=[mock_cli]):
            response = client.get("/api/chat/cli/detect")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["id"] == "claude"
        assert data[0]["name"] == "Claude Code"
        assert data[0]["command"] == "claude"
        assert data[0]["version"] == "1.0.0"
        assert data[0]["isAvailable"] is True
        assert data[0]["protocol"] == "raw"

    def test_cli_detect_with_force_param(self, client):
        """Test CLI detection with force parameter."""
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.command = "claude"
        mock_cli.version = "1.0.0"
        mock_cli.is_available = True
        mock_cli.protocol = "raw"

        with patch("abo.routes.chat.detector.detect_all", return_value=[mock_cli]) as mock_detect:
            response = client.get("/api/chat/cli/detect?force=true")

        assert response.status_code == 200
        mock_detect.assert_called_once_with(force=True)

    def test_get_cli_info_endpoint(self, client):
        """Test GET /api/chat/cli/{cli_id} returns CLI details."""
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.command = "claude"
        mock_cli.version = "1.0.0"
        mock_cli.is_available = True
        mock_cli.protocol = "raw"

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            response = client.get("/api/chat/cli/claude")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "claude"
        assert data["name"] == "Claude Code"
        assert data["isAvailable"] is True

    def test_get_cli_info_not_found(self, client):
        """Test GET /api/chat/cli/{cli_id} returns 404 for unknown CLI."""
        with patch("abo.routes.chat.detector.get_cli_info", return_value=None):
            response = client.get("/api/chat/cli/unknown")

        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()


class TestConversationEndpoints:
    """Tests for conversation management endpoints."""

    def test_create_conversation_endpoint(self, client):
        """Test POST /api/chat/conversations creates a new conversation."""
        # Mock CLI info
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            response = client.post(
                "/api/chat/conversations",
                json={
                    "cli_type": "claude",
                    "title": "Test Conversation",
                    "workspace": "/test/workspace"
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "session_id" in data
        assert data["cli_type"] == "claude"
        assert data["title"] == "Test Conversation"
        assert data["workspace"] == "/test/workspace"
        assert data["status"] == "active"
        assert "created_at" in data
        assert "updated_at" in data

    def test_create_conversation_records_chat_start_activity(self, client):
        """Creating a conversation should record a chat_start activity."""
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True
        mock_tracker = MagicMock()

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli), patch(
            "abo.routes.chat.ActivityTracker",
            return_value=mock_tracker,
        ):
            response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "claude", "title": "Activity Chat", "origin": "assistant"},
            )

        assert response.status_code == 200
        mock_tracker.record_activity.assert_called_once()
        kwargs = mock_tracker.record_activity.call_args.kwargs
        assert kwargs["activity_type"].value == "chat_start"
        assert kwargs["metadata"]["context"] == "assistant"

    def test_create_assistant_conversation_mirrors_assistant_session(self, client):
        """Assistant-origin conversations should get a dedicated assistant session record."""
        from abo.routes import chat as chat_routes

        mock_cli = MagicMock()
        mock_cli.id = "codex"
        mock_cli.name = "Codex"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "codex", "title": "Assistant Session", "origin": "assistant"},
            )

        assert response.status_code == 200
        data = response.json()

        sessions = chat_routes.assistant_session_store.list_sessions(limit=10)
        assert len(sessions) == 1
        assert sessions[0].raw_conversation_id == data["id"]
        assert sessions[0].raw_session_id == data["session_id"]
        assert sessions[0].title == "Assistant Session"

    def test_create_conversation_unavailable_cli(self, client):
        """Test creating conversation with unavailable CLI returns 400."""
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.is_available = False

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "claude"}
            )

        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "not available" in data["detail"].lower()

    def test_create_conversation_unknown_cli(self, client):
        """Test creating conversation with unknown CLI returns 400."""
        with patch("abo.routes.chat.detector.get_cli_info", return_value=None):
            response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "unknown"}
            )

        assert response.status_code == 400
        data = response.json()
        assert "detail" in data

    def test_create_conversation_default_title(self, client):
        """Test creating conversation generates default title."""
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "claude"}
            )

        assert response.status_code == 200
        data = response.json()
        assert "New Claude Code chat" in data["title"]

    def test_create_conversation_uses_configured_default_cli(self, client):
        """Test creating conversation without cli_type uses configured default provider."""
        mock_cli = MagicMock()
        mock_cli.id = "codex"
        mock_cli.name = "OpenAI Codex"
        mock_cli.is_available = True

        with patch("abo.routes.chat.get_ai_provider", return_value="codex"), \
             patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            response = client.post("/api/chat/conversations", json={})

        assert response.status_code == 200
        data = response.json()
        assert data["cli_type"] == "codex"
        assert "New OpenAI Codex chat" in data["title"]

    def test_list_conversations_endpoint(self, client):
        """Test GET /api/chat/conversations returns conversation list."""
        # First create a conversation
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            # Create a conversation
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "claude", "title": "Test Chat"}
            )
            assert create_response.status_code == 200

        # List conversations
        response = client.get("/api/chat/conversations")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1

        # Verify conversation structure
        conv = data[0]
        assert "id" in conv
        assert "cli_type" in conv
        assert "session_id" in conv
        assert "title" in conv
        assert "status" in conv
        assert "created_at" in conv
        assert "updated_at" in conv

    def test_list_conversations_with_filter(self, client):
        """Test listing conversations with cli_type filter."""
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            client.post(
                "/api/chat/conversations",
                json={"cli_type": "claude", "title": "Claude Chat"}
            )

        # Filter by cli_type
        response = client.get("/api/chat/conversations?cli_type=claude")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for conv in data:
            assert conv["cli_type"] == "claude"

    def test_list_conversations_with_limit(self, client):
        """Test listing conversations with limit parameter."""
        response = client.get("/api/chat/conversations?limit=5")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) <= 5

    def test_get_conversation_endpoint(self, client):
        """Test GET /api/chat/conversations/{id} returns conversation details."""
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "claude", "title": "Test Chat"}
            )
            conv_id = create_response.json()["id"]

        response = client.get(f"/api/chat/conversations/{conv_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == conv_id
        assert data["title"] == "Test Chat"
        assert data["cli_type"] == "claude"

    def test_get_conversation_not_found(self, client):
        """Test GET /api/chat/conversations/{id} returns 404 for unknown conversation."""
        response = client.get("/api/chat/conversations/non-existent-id")

        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()

    def test_delete_conversation_endpoint(self, client):
        """Test DELETE /api/chat/conversations/{id} removes conversation."""
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "claude", "title": "To Delete"}
            )
            conv_id = create_response.json()["id"]

        # Delete the conversation
        response = client.delete(f"/api/chat/conversations/{conv_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

        # Verify it's deleted
        get_response = client.get(f"/api/chat/conversations/{conv_id}")
        assert get_response.status_code == 404

    def test_delete_conversation_endpoint_removes_assistant_mirror(self, client):
        """Deleting a raw assistant conversation should also delete the mirrored assistant session."""
        from abo.routes import chat as chat_routes

        mock_cli = MagicMock()
        mock_cli.id = "codex"
        mock_cli.name = "Codex"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "codex", "title": "Assistant Delete", "origin": "assistant"},
            )
            conv_id = create_response.json()["id"]

        assert chat_routes.assistant_session_store.count_sessions() == 1

        response = client.delete(f"/api/chat/conversations/{conv_id}")

        assert response.status_code == 200
        assert chat_routes.assistant_session_store.count_sessions() == 0

    def test_update_conversation_title_endpoint(self, client):
        """Test PATCH /api/chat/conversations/{id}/title updates title."""
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "claude", "title": "Original Title"}
            )
            conv_id = create_response.json()["id"]

        # Update title
        response = client.patch(
            f"/api/chat/conversations/{conv_id}/title",
            json={"title": "New Title"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

        # Verify the update
        get_response = client.get(f"/api/chat/conversations/{conv_id}")
        assert get_response.json()["title"] == "New Title"

    def test_update_conversation_title_endpoint_syncs_assistant_session(self, client):
        """Assistant session titles should stay aligned with the raw conversation title."""
        from abo.routes import chat as chat_routes

        mock_cli = MagicMock()
        mock_cli.id = "codex"
        mock_cli.name = "Codex"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "codex", "title": "旧标题", "origin": "assistant"},
            )
            conv_id = create_response.json()["id"]

        response = client.patch(
            f"/api/chat/conversations/{conv_id}/title",
            json={"title": "新标题"},
        )

        assert response.status_code == 200
        session = chat_routes.assistant_session_store.get_session_by_raw_conversation(conv_id)
        assert session is not None
        assert session.title == "新标题"


class TestMessageEndpoints:
    """Tests for message management endpoints."""

    def test_get_messages_endpoint(self, client):
        """Test GET /api/chat/conversations/{id}/messages returns messages."""
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "claude"}
            )
            conv_id = create_response.json()["id"]

        # Add a message via the store directly
        from abo.store.conversations import conversation_store
        conversation_store.add_message(conv_id, "user", "Hello, AI!")

        response = client.get(f"/api/chat/conversations/{conv_id}/messages")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["role"] == "user"
        assert data[0]["content"] == "Hello, AI!"
        assert data[0]["content_type"] == "text"

    def test_get_messages_with_limit(self, client):
        """Test getting messages with limit parameter."""
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "claude"}
            )
            conv_id = create_response.json()["id"]

        # Add multiple messages
        from abo.store.conversations import conversation_store
        for i in range(5):
            conversation_store.add_message(conv_id, "user", f"Message {i}")

        response = client.get(f"/api/chat/conversations/{conv_id}/messages?limit=3")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3

    def test_get_messages_with_metadata(self, client):
        """Test that messages with metadata are properly returned."""
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "claude"}
            )
            conv_id = create_response.json()["id"]

        # Add a message with metadata
        from abo.store.conversations import conversation_store
        conversation_store.add_message(
            conv_id,
            "assistant",
            "Response",
            metadata={"tokens": 100, "latency": 200}
        )

        response = client.get(f"/api/chat/conversations/{conv_id}/messages")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["metadata"] is not None
        assert data[0]["metadata"]["tokens"] == 100
        assert data[0]["metadata"]["latency"] == 200

    def test_send_message_http_includes_recent_history(self, client):
        """Recent chat history should be injected into the runtime prompt."""
        from abo.cli.runner import StreamEvent
        from abo.store.conversations import conversation_store

        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "claude", "title": "History Chat"}
            )
            conv_id = create_response.json()["id"]

        conversation_store.add_message(conv_id, "user", "第一轮问题：帮我整理这周的研究任务。")
        conversation_store.add_message(conv_id, "assistant", "第一轮回答：已经按主题拆成三条主线。")

        captured: dict[str, str] = {}
        mock_runner = AsyncMock()

        async def fake_send_message(message: str, msg_id: str, on_event):
            captured["message"] = message
            await on_event(StreamEvent(type="content", data="done", msg_id=msg_id))

        mock_runner.send_message.side_effect = fake_send_message

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli), patch(
            "abo.chat.runtime_manager.RunnerFactory.create",
            return_value=mock_runner,
        ):
            response = client.post(
                f"/api/chat/conversations/{conv_id}/messages",
                json={"message": "继续推进第二轮。", "conversation_id": conv_id},
            )

        assert response.status_code == 200
        assert "第一轮问题" in captured["message"]
        assert "第一轮回答" in captured["message"]
        assert "当前用户请求：\n继续推进第二轮。" in captured["message"]

    def test_send_message_http_includes_assistant_workspace_context(self, client):
        """Assistant-origin conversations should receive workspace context."""
        from abo.cli.runner import StreamEvent
        from abo.store.conversations import conversation_store

        mock_cli = MagicMock()
        mock_cli.id = "codex"
        mock_cli.name = "Codex"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "codex", "title": "Assistant Chat", "origin": "assistant"},
            )
            conv_id = create_response.json()["id"]

        stored = conversation_store.get_conversation(conv_id)
        assert stored is not None
        assert stored.origin == "assistant"

        captured: dict[str, str] = {}
        mock_runner = AsyncMock()

        async def fake_send_message(message: str, msg_id: str, on_event):
            captured["message"] = message
            await on_event(StreamEvent(type="content", data="done", msg_id=msg_id))

        mock_runner.send_message.side_effect = fake_send_message

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli), patch(
            "abo.routes.chat.build_assistant_chat_context",
            return_value="助手工作台上下文：今日情报 12 条，Internet Wiki 8 页。",
        ), patch(
            "abo.chat.runtime_manager.RunnerFactory.create",
            return_value=mock_runner,
        ):
            response = client.post(
                f"/api/chat/conversations/{conv_id}/messages",
                json={"message": "帮我继续整理这些情报。", "conversation_id": conv_id},
            )

        assert response.status_code == 200
        assert "助手工作台上下文" in captured["message"]
        assert "当前用户请求：\n帮我继续整理这些情报。" in captured["message"]

    def test_send_message_http_context_scope_can_enable_assistant_context(self, client):
        """Assistant context can be requested per-message even on non-assistant conversations."""
        from abo.cli.runner import StreamEvent

        mock_cli = MagicMock()
        mock_cli.id = "codex"
        mock_cli.name = "Codex"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "codex", "title": "Generic Chat"},
            )
            conv_id = create_response.json()["id"]

        captured: dict[str, str] = {}
        mock_runner = AsyncMock()

        async def fake_send_message(message: str, msg_id: str, on_event):
            captured["message"] = message
            await on_event(StreamEvent(type="content", data="done", msg_id=msg_id))

        mock_runner.send_message.side_effect = fake_send_message

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli), patch(
            "abo.routes.chat.build_assistant_chat_context",
            return_value="助手工作台上下文：情报流和 Wiki 已加载。",
        ), patch(
            "abo.chat.runtime_manager.RunnerFactory.create",
            return_value=mock_runner,
        ):
            response = client.post(
                f"/api/chat/conversations/{conv_id}/messages",
                json={
                    "message": "在助手模式下继续整理。",
                    "conversation_id": conv_id,
                    "context_scope": "assistant",
                },
            )

        assert response.status_code == 200
        assert "助手工作台上下文" in captured["message"]

    def test_send_message_http_records_chat_message_activity(self, client):
        """Sending a message should record a chat_message activity."""
        from abo.cli.runner import StreamEvent

        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "claude", "title": "Message Activity"},
            )
            conv_id = create_response.json()["id"]

        mock_runner = AsyncMock()

        async def fake_send_message(message: str, msg_id: str, on_event):
            await on_event(StreamEvent(type="content", data="done", msg_id=msg_id))

        mock_runner.send_message.side_effect = fake_send_message
        mock_tracker = MagicMock()

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli), patch(
            "abo.chat.runtime_manager.RunnerFactory.create",
            return_value=mock_runner,
        ), patch(
            "abo.routes.chat.ActivityTracker",
            return_value=mock_tracker,
        ):
            response = client.post(
                f"/api/chat/conversations/{conv_id}/messages",
                json={"message": "记录这条消息。", "conversation_id": conv_id, "context_scope": "assistant"},
            )

        assert response.status_code == 200
        assert mock_tracker.record_activity.call_count >= 1
        last_call = mock_tracker.record_activity.call_args
        assert last_call.kwargs["activity_type"].value == "chat_message"
        assert last_call.kwargs["metadata"]["context"] == "assistant"

    def test_send_message_http_mirrors_assistant_messages_and_resume_handle(self, client):
        """Assistant message turns should be mirrored into the assistant store and keep the backend session handle."""
        from abo.cli.runner import StreamEvent
        from abo.routes import chat as chat_routes

        mock_cli = MagicMock()
        mock_cli.id = "codex"
        mock_cli.name = "Codex"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "codex", "title": "Assistant Mirror", "origin": "assistant"},
            )
            conv_id = create_response.json()["id"]

        mock_runner = AsyncMock()
        mock_runner.last_session_handle = None

        async def fake_send_message(_message: str, msg_id: str, on_event):
            mock_runner.last_session_handle = "thread-123"
            await on_event(StreamEvent(type="content", data="已整理完成", msg_id=msg_id))

        mock_runner.send_message.side_effect = fake_send_message

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli), patch(
            "abo.chat.runtime_manager.detector.get_cli_info",
            return_value=mock_cli,
        ), patch(
            "abo.chat.runtime_manager.RunnerFactory.create",
            return_value=mock_runner,
        ):
            response = client.post(
                f"/api/chat/conversations/{conv_id}/messages",
                json={"message": "帮我整理这批情报。", "conversation_id": conv_id},
            )

        assert response.status_code == 200
        session = chat_routes.assistant_session_store.get_session_by_raw_conversation(conv_id)
        assert session is not None
        assert session.raw_session_id == "thread-123"

        messages = chat_routes.assistant_session_store.list_messages(session.id, limit=10)
        assert [message.role for message in messages] == ["user", "assistant"]
        assert messages[0].content == "帮我整理这批情报。"
        assert messages[1].content == "已整理完成"

    def test_send_message_http_merges_stream_chunks_into_one_persisted_message(self, client):
        """Streaming chunks should update one assistant DB row instead of duplicating final content."""
        from abo.cli.runner import StreamEvent
        from abo.store.conversations import conversation_store

        mock_cli = MagicMock()
        mock_cli.id = "codex"
        mock_cli.name = "Codex"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "codex", "title": "Stream Merge"},
            )
            conv_id = create_response.json()["id"]

        mock_runner = AsyncMock()

        async def fake_send_message(_message: str, msg_id: str, on_event):
            await on_event(StreamEvent(type="start", data="", msg_id=msg_id))
            await on_event(StreamEvent(type="content", data="第一段", msg_id=msg_id))
            await on_event(StreamEvent(type="content", data="第二段", msg_id=msg_id))
            await on_event(StreamEvent(type="finish", data="", msg_id=msg_id))

        mock_runner.send_message.side_effect = fake_send_message

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli), patch(
            "abo.chat.runtime_manager.RunnerFactory.create",
            return_value=mock_runner,
        ):
            response = client.post(
                f"/api/chat/conversations/{conv_id}/messages",
                json={"message": "测试流式落库。", "conversation_id": conv_id},
            )

        assert response.status_code == 200
        messages = conversation_store.get_messages(conv_id, limit=10)
        assistant_messages = [message for message in messages if message.role == "assistant" and message.content_type == "text"]
        assert len(assistant_messages) == 1
        assert assistant_messages[0].content == "第一段第二段"
        assert assistant_messages[0].status == "completed"


class TestConnectionStatusEndpoints:
    """Tests for connection status endpoints."""

    def test_get_connections_endpoint(self, client):
        """Test GET /api/chat/connections returns active connections."""
        response = client.get("/api/chat/connections")

        assert response.status_code == 200
        data = response.json()
        assert "connections" in data
        assert isinstance(data["connections"], list)
        assert "count" in data
        assert isinstance(data["count"], int)

    def test_conversation_runtime_state_and_warmup(self, client):
        """Runtime state should expose cache/resume state and support lightweight warmup."""
        mock_cli = MagicMock()
        mock_cli.id = "codex"
        mock_cli.name = "Codex"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "codex", "title": "Runtime State"},
            )
            conv_id = create_response.json()["id"]

        before = client.get(f"/api/chat/conversations/{conv_id}/runtime")
        assert before.status_code == 200
        assert before.json()["has_runtime"] is False
        assert before.json()["busy"] is False

        with patch("abo.chat.runtime_manager.detector.get_cli_info", return_value=mock_cli):
            warmed = client.post(f"/api/chat/conversations/{conv_id}/warmup")

        assert warmed.status_code == 200
        assert warmed.json()["has_runtime"] is True
        assert warmed.json()["busy"] is False

        after = client.get(f"/api/chat/conversations/{conv_id}/runtime")
        assert after.json()["has_runtime"] is True

    def test_stop_conversation_turn_closes_runtime_runner(self, client):
        """Stop endpoint should close the active runner without deleting the conversation."""
        from abo.routes import chat as chat_routes

        mock_cli = MagicMock()
        mock_cli.id = "codex"
        mock_cli.name = "Codex"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "codex", "title": "Stop Runtime"},
            )
            conv_id = create_response.json()["id"]

        conv = chat_routes.conversation_store.get_conversation(conv_id)
        runtime = asyncio.run(conversation_runtime_manager.get_or_create(conv))
        mock_runner = AsyncMock()
        mock_runner.close = AsyncMock()
        runtime._runner = mock_runner

        response = client.post(f"/api/chat/conversations/{conv_id}/stop")

        assert response.status_code == 200
        assert response.json()["success"] is True
        assert response.json()["stopped"] is True
        assert chat_routes.conversation_store.get_conversation(conv_id) is not None
        mock_runner.close.assert_awaited_once()


class TestWebSocketProtocol:
    """Tests for WebSocket protocol and connection management."""

    def test_websocket_connection(self):
        """Test WebSocket connection establishment."""
        import asyncio
        from abo.routes.chat import ConnectionManager

        manager = ConnectionManager()
        mock_ws = AsyncMock()

        asyncio.run(manager.connect(mock_ws, "claude:test-session", "claude", "test-session"))

        mock_ws.accept.assert_called_once()
        assert "claude:test-session" in manager.active_connections

    def test_websocket_disconnect(self):
        """Test WebSocket disconnection cleanup."""
        import asyncio
        from abo.routes.chat import ConnectionManager

        manager = ConnectionManager()
        mock_ws = AsyncMock()

        asyncio.run(manager.connect(mock_ws, "claude:test-session", "claude", "test-session"))
        message_task = asyncio.create_task(asyncio.sleep(0))
        manager.track_message_task("claude:test-session", message_task)

        manager.disconnect("claude:test-session")

        assert "claude:test-session" not in manager.active_connections
        assert manager.get_message_task("claude:test-session") is message_task
        asyncio.run(message_task)

    def test_send_json_to_client(self):
        """Test sending JSON message to connected client."""
        import asyncio
        from abo.routes.chat import ConnectionManager

        manager = ConnectionManager()
        mock_ws = AsyncMock()

        asyncio.run(manager.connect(mock_ws, "claude:test-session", "claude", "test-session"))

        test_data = {"type": "test", "data": "hello"}
        asyncio.run(manager.send_json("claude:test-session", test_data))

        mock_ws.send_json.assert_called_with(test_data)

    def test_send_json_to_disconnected_client(self):
        """Test sending JSON to disconnected client does not raise."""
        import asyncio
        from abo.routes.chat import ConnectionManager

        manager = ConnectionManager()

        # Should not raise
        asyncio.run(manager.send_json("non-existent", {"type": "test"}))

    def test_heartbeat_mechanism(self):
        """Test heartbeat ping/pong mechanism."""
        import asyncio
        from abo.routes.chat import ConnectionManager

        manager = ConnectionManager()
        mock_ws = AsyncMock()

        asyncio.run(manager.connect(mock_ws, "claude:test-session", "claude", "test-session"))

        # Cancel heartbeat task
        if "claude:test-session" in manager._heartbeat_tasks:
            manager._heartbeat_tasks["claude:test-session"].cancel()

        # Verify connected message was sent
        mock_ws.send_json.assert_called()
        calls = mock_ws.send_json.call_args_list
        connected_calls = [c for c in calls if c[0][0].get("type") == "connected"]
        assert len(connected_calls) > 0

    def test_handle_pong(self):
        """Test handling pong response from client."""
        import asyncio
        import time
        from abo.routes.chat import ConnectionManager

        manager = ConnectionManager()
        mock_ws = AsyncMock()

        asyncio.run(manager.connect(mock_ws, "claude:test-session", "claude", "test-session"))

        # Simulate pong
        manager.handle_pong("claude:test-session", time.time())

        info = manager.connection_info.get("claude:test-session")
        assert info is not None
        assert info.is_alive is True

        # Cancel heartbeat
        if "claude:test-session" in manager._heartbeat_tasks:
            manager._heartbeat_tasks["claude:test-session"].cancel()

    def test_websocket_message_includes_assistant_context_scope(self, client):
        """WebSocket chat should inject assistant context when requested by the caller."""
        from abo.cli.runner import StreamEvent

        mock_cli = MagicMock()
        mock_cli.id = "codex"
        mock_cli.name = "Codex"
        mock_cli.is_available = True
        mock_cli.protocol = "raw"

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "codex", "title": "WS Assistant Chat"},
            )
            payload = create_response.json()

        captured: dict[str, str] = {}
        mock_runner = AsyncMock()

        async def fake_send_message(message: str, msg_id: str, on_event):
            captured["message"] = message
            await on_event(StreamEvent(type="start", data="", msg_id=msg_id))
            await on_event(StreamEvent(type="content", data="ok", msg_id=msg_id))
            await on_event(StreamEvent(type="finish", data="", msg_id=msg_id))

        mock_runner.send_message.side_effect = fake_send_message

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli), patch(
            "abo.routes.chat.build_assistant_chat_context",
            return_value="助手工作台上下文：WS 测试上下文。",
        ), patch(
            "abo.chat.runtime_manager.RunnerFactory.create",
            return_value=mock_runner,
        ):
            with client.websocket_connect(f"/api/chat/ws/{payload['cli_type']}/{payload['session_id']}") as websocket:
                websocket.receive_json()
                websocket.send_json(
                    {
                        "type": "message",
                        "content": "通过 WebSocket 发送",
                        "conversation_id": payload["id"],
                        "context_scope": "assistant",
                    }
                )

                events = []
                content_event = None
                while content_event is None:
                    event = websocket.receive_json()
                    events.append(event)
                    if event["type"] == "content":
                        content_event = event
                start_event = next(event for event in events if event["type"] == "start")
                assert start_event["type"] == "start"
                assert content_event["type"] == "content"

        assert "助手工作台上下文" in captured["message"]
        assert "当前用户请求：\n通过 WebSocket 发送" in captured["message"]


class TestRequestResponseModels:
    """Tests for Pydantic request/response models."""

    def test_create_conversation_request_validation(self, client):
        """Test CreateConversationRequest validation."""
        # Invalid type for cli_type
        response = client.post("/api/chat/conversations", json={"cli_type": 123})
        assert response.status_code == 422

    def test_update_title_request_validation(self, client):
        """Test update title request validation."""
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            create_response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "claude"}
            )
            conv_id = create_response.json()["id"]

        # Missing title field
        response = client.patch(
            f"/api/chat/conversations/{conv_id}/title",
            json={}
        )
        # Should still work with empty title
        assert response.status_code == 200


class TestErrorHandling:
    """Tests for error handling in chat routes."""

    def test_invalid_conversation_id_format(self, client):
        """Test handling of invalid conversation ID format."""
        # This should return 404 since the ID doesn't exist
        response = client.get("/api/chat/conversations/invalid-id-123")
        assert response.status_code == 404

    def test_conversation_not_found_for_messages(self, client):
        """Test getting messages for non-existent conversation."""
        response = client.get("/api/chat/conversations/non-existent/messages")
        # Should return empty list, not error
        assert response.status_code == 200
        assert response.json() == []

    def test_delete_nonexistent_conversation(self, client):
        """Test deleting a non-existent conversation."""
        # Should not raise error
        response = client.delete("/api/chat/conversations/non-existent")
        assert response.status_code == 200
        assert response.json()["success"] is True
