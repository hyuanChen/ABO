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


def test_cli_detect_endpoint(client):
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


def test_create_conversation(client):
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


def test_list_conversations(client):
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
