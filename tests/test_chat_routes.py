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
import pytest
import json
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from abo.main import app
from abo.store.conversations import ConversationStore


@pytest.fixture(autouse=True)
def reset_singleton():
    """Reset conversation store singleton before each test."""
    ConversationStore._instance = None
    yield
    ConversationStore._instance = None


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
        mock_runner = AsyncMock()

        asyncio.run(manager.connect(mock_ws, "claude:test-session", "claude", "test-session"))
        manager.runners["claude:test-session"] = mock_runner

        manager.disconnect("claude:test-session")

        assert "claude:test-session" not in manager.active_connections

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
