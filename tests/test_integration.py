"""
Integration tests for chat module.

Tests the complete flow of the chat system including:
- WebSocket chat flow
- CLI detection API
- Conversation lifecycle (CRUD operations)
"""
import pytest
import json
import asyncio
import uuid
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


class TestWebSocketChatFlow:
    """Integration tests for WebSocket chat flow."""

    def test_websocket_chat_flow(self):
        """Test complete WebSocket chat flow:
        - Connect to WebSocket
        - Wait for connected message
        - Send a message
        - Verify start event received

        This test uses the ConnectionManager directly to avoid blocking on the
        WebSocket endpoint's infinite message loop.
        """
        import asyncio
        from abo.routes.chat import ConnectionManager

        manager = ConnectionManager()
        mock_ws = AsyncMock()

        # Connect to the manager
        asyncio.run(manager.connect(mock_ws, "claude:test-session", "claude", "test-session"))

        # Cancel heartbeat to prevent background tasks
        if "claude:test-session" in manager._heartbeat_tasks:
            manager._heartbeat_tasks["claude:test-session"].cancel()

        # Verify connected message was sent
        mock_ws.accept.assert_called_once()
        assert "claude:test-session" in manager.active_connections

        # Verify connected event was sent
        calls = mock_ws.send_json.call_args_list
        connected_calls = [c for c in calls if c[0][0].get("type") == "connected"]
        assert len(connected_calls) == 1

        # Simulate sending a 'start' event (as would happen when a message is processed)
        asyncio.run(manager.send_json("claude:test-session", {"type": "start", "msg_id": "test-msg-123"}))

        # Verify the start event was sent
        calls = mock_ws.send_json.call_args_list
        start_calls = [c for c in calls if c[0][0].get("type") == "start"]
        assert len(start_calls) == 1
        assert start_calls[0][0][0]["msg_id"] == "test-msg-123"

        # Cleanup
        manager.disconnect("claude:test-session")


class TestCliDetectApi:
    """Integration tests for CLI detection API."""

    def test_cli_detect_api(self, client):
        """Test GET /api/chat/cli/detect returns list of available CLIs."""
        # Mock the detector to return test data
        mock_cli1 = MagicMock()
        mock_cli1.id = "claude"
        mock_cli1.name = "Claude Code"
        mock_cli1.command = "claude"
        mock_cli1.version = "1.0.0"
        mock_cli1.is_available = True
        mock_cli1.protocol = "raw"

        mock_cli2 = MagicMock()
        mock_cli2.id = "gemini"
        mock_cli2.name = "Gemini CLI"
        mock_cli2.command = "gemini"
        mock_cli2.version = "2.0.0"
        mock_cli2.is_available = False
        mock_cli2.protocol = "acp"

        mock_clis = [mock_cli1, mock_cli2]

        with patch("abo.routes.chat.detector.detect_all", return_value=mock_clis):
            response = client.get("/api/chat/cli/detect")

        assert response.status_code == 200
        data = response.json()

        # Verify returns a list
        assert isinstance(data, list)
        assert len(data) == 2

        # Verify first CLI structure
        assert data[0]["id"] == "claude"
        assert data[0]["name"] == "Claude Code"
        assert data[0]["command"] == "claude"
        assert data[0]["version"] == "1.0.0"
        assert data[0]["isAvailable"] is True
        assert data[0]["protocol"] == "raw"

        # Verify second CLI structure
        assert data[1]["id"] == "gemini"
        assert data[1]["isAvailable"] is False
        assert data[1]["protocol"] == "acp"


class TestConversationLifecycle:
    """Integration tests for conversation CRUD lifecycle."""

    def test_conversation_lifecycle(self, client):
        """Test complete conversation lifecycle:
        - Create conversation
        - Get conversation by ID
        - List conversations
        - Delete conversation
        """
        # Mock CLI info
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            # 1. Create conversation
            create_response = client.post(
                "/api/chat/conversations",
                json={
                    "cli_type": "claude",
                    "title": "Integration Test Chat",
                    "workspace": "/test/workspace"
                }
            )
            assert create_response.status_code == 200
            created = create_response.json()
            conv_id = created["id"]
            session_id = created["session_id"]

            # Verify created conversation structure
            assert conv_id is not None
            assert len(conv_id) > 0
            assert created["cli_type"] == "claude"
            assert created["title"] == "Integration Test Chat"
            assert created["workspace"] == "/test/workspace"
            assert created["status"] == "active"
            assert "created_at" in created
            assert "updated_at" in created

            # 2. Get conversation by ID
            get_response = client.get(f"/api/chat/conversations/{conv_id}")
            assert get_response.status_code == 200
            retrieved = get_response.json()
            assert retrieved["id"] == conv_id
            assert retrieved["session_id"] == session_id
            assert retrieved["cli_type"] == "claude"
            assert retrieved["title"] == "Integration Test Chat"
            assert retrieved["status"] == "active"

            # 3. List conversations
            list_response = client.get("/api/chat/conversations")
            assert list_response.status_code == 200
            conversations = list_response.json()
            assert isinstance(conversations, list)
            assert len(conversations) >= 1

            # Find our conversation in the list
            found_conv = None
            for conv in conversations:
                if conv["id"] == conv_id:
                    found_conv = conv
                    break
            assert found_conv is not None
            assert found_conv["title"] == "Integration Test Chat"

            # 4. Delete conversation
            delete_response = client.delete(f"/api/chat/conversations/{conv_id}")
            assert delete_response.status_code == 200
            delete_result = delete_response.json()
            assert delete_result["success"] is True

            # Verify conversation is deleted
            get_after_delete = client.get(f"/api/chat/conversations/{conv_id}")
            assert get_after_delete.status_code == 404

    def test_conversation_list_with_filter(self, client):
        """Test listing conversations with cli_type filter."""
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            # Create multiple conversations
            conv_ids = []
            for i in range(3):
                response = client.post(
                    "/api/chat/conversations",
                    json={
                        "cli_type": "claude",
                        "title": f"Chat {i}"
                    }
                )
                assert response.status_code == 200
                conv_ids.append(response.json()["id"])

            # List with filter
            list_response = client.get("/api/chat/conversations?cli_type=claude")
            assert list_response.status_code == 200
            conversations = list_response.json()

            # All returned conversations should have cli_type="claude"
            for conv in conversations:
                assert conv["cli_type"] == "claude"

            # Cleanup
            for conv_id in conv_ids:
                client.delete(f"/api/chat/conversations/{conv_id}")

    def test_conversation_list_with_limit(self, client):
        """Test listing conversations with limit parameter."""
        mock_cli = MagicMock()
        mock_cli.id = "claude"
        mock_cli.name = "Claude Code"
        mock_cli.is_available = True

        with patch("abo.routes.chat.detector.get_cli_info", return_value=mock_cli):
            # Create a few conversations
            conv_ids = []
            for i in range(5):
                response = client.post(
                    "/api/chat/conversations",
                    json={
                        "cli_type": "claude",
                        "title": f"Chat {i}"
                    }
                )
                assert response.status_code == 200
                conv_ids.append(response.json()["id"])

            # List with limit
            list_response = client.get("/api/chat/conversations?limit=3")
            assert list_response.status_code == 200
            conversations = list_response.json()
            assert len(conversations) <= 3

            # Cleanup
            for conv_id in conv_ids:
                client.delete(f"/api/chat/conversations/{conv_id}")
