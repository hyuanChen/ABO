"""Tests for conversation storage module"""
import pytest
import json
import os
import tempfile
import shutil
from datetime import datetime
from unittest.mock import patch, MagicMock

from abo.store.conversations import (
    Conversation,
    Message,
    ConversationStore,
    conversation_store
)


@pytest.fixture(autouse=True)
def reset_singleton():
    """Reset singleton instance before each test"""
    ConversationStore._instance = None
    yield
    ConversationStore._instance = None


class TestConversationCreation:
    """Tests for conversation creation"""

    def test_conversation_dataclass(self):
        """Test Conversation dataclass creation"""
        now = int(datetime.now().timestamp() * 1000)
        conv = Conversation(
            id="test-id",
            cli_type="claude",
            session_id="session-123",
            title="Test Conversation",
            workspace="/test/workspace",
            status="active",
            created_at=now,
            updated_at=now
        )

        assert conv.id == "test-id"
        assert conv.cli_type == "claude"
        assert conv.session_id == "session-123"
        assert conv.title == "Test Conversation"
        assert conv.workspace == "/test/workspace"
        assert conv.status == "active"
        assert conv.created_at == now
        assert conv.updated_at == now

    def test_create_conversation(self, tmp_path):
        """Test creating a conversation in the store"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        conv_id = store.create_conversation(
            cli_type="claude",
            session_id="session-456",
            title="My Test Chat",
            workspace="/home/user/project"
        )

        assert conv_id is not None
        assert isinstance(conv_id, str)
        assert len(conv_id) > 0

        # Verify the conversation was created
        conv = store.get_conversation(conv_id)
        assert conv is not None
        assert conv.cli_type == "claude"
        assert conv.session_id == "session-456"
        assert conv.title == "My Test Chat"
        assert conv.workspace == "/home/user/project"
        assert conv.status == "active"
        assert conv.created_at > 0
        assert conv.updated_at > 0

    def test_create_conversation_minimal(self, tmp_path):
        """Test creating a conversation with minimal parameters"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        conv_id = store.create_conversation(
            cli_type="gemini",
            session_id="session-minimal"
        )

        conv = store.get_conversation(conv_id)
        assert conv is not None
        assert conv.cli_type == "gemini"
        assert conv.session_id == "session-minimal"
        assert conv.title == ""  # Default empty
        assert conv.workspace == ""  # Default empty
        assert conv.status == "active"

    def test_get_conversation_by_session(self, tmp_path):
        """Test retrieving conversation by session_id"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        # Create a conversation
        conv_id = store.create_conversation(
            cli_type="openclaw",
            session_id="unique-session-789",
            title="Session Test"
        )

        # Retrieve by session_id
        conv = store.get_conversation_by_session("unique-session-789")
        assert conv is not None
        assert conv.id == conv_id
        assert conv.cli_type == "openclaw"
        assert conv.title == "Session Test"

    def test_get_conversation_not_found(self, tmp_path):
        """Test retrieving non-existent conversation"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        conv = store.get_conversation("non-existent-id")
        assert conv is None

    def test_get_conversation_by_session_not_found(self, tmp_path):
        """Test retrieving non-existent session"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        conv = store.get_conversation_by_session("non-existent-session")
        assert conv is None

    def test_list_conversations(self, tmp_path):
        """Test listing conversations"""
        import time
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        # Create multiple conversations with small delays
        conv_ids = []
        for i in range(3):
            time.sleep(0.005)  # 5ms delay to ensure different timestamps
            conv_id = store.create_conversation(
                cli_type="claude",
                session_id=f"session-list-{i}",
                title=f"Chat {i}"
            )
            conv_ids.append(conv_id)

        # List all conversations
        conversations = store.list_conversations()
        assert len(conversations) == 3

        # Should be ordered by updated_at DESC (newest first)
        assert conversations[0].title == "Chat 2"
        assert conversations[1].title == "Chat 1"
        assert conversations[2].title == "Chat 0"

    def test_list_conversations_with_filter(self, tmp_path):
        """Test listing conversations with cli_type filter"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        # Create conversations with different cli_types
        store.create_conversation(cli_type="claude", session_id="s1", title="Claude Chat")
        store.create_conversation(cli_type="gemini", session_id="s2", title="Gemini Chat")
        store.create_conversation(cli_type="claude", session_id="s3", title="Another Claude")

        # Filter by claude
        claude_convs = store.list_conversations(cli_type="claude")
        assert len(claude_convs) == 2
        for conv in claude_convs:
            assert conv.cli_type == "claude"

        # Filter by gemini
        gemini_convs = store.list_conversations(cli_type="gemini")
        assert len(gemini_convs) == 1
        assert gemini_convs[0].title == "Gemini Chat"

    def test_list_conversations_pagination(self, tmp_path):
        """Test conversation listing with pagination"""
        import time
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        # Create 5 conversations with small delays
        for i in range(5):
            time.sleep(0.005)  # 5ms delay to ensure different timestamps
            store.create_conversation(
                cli_type="claude",
                session_id=f"page-session-{i}",
                title=f"Chat {i}"
            )

        # Get first 2
        page1 = store.list_conversations(limit=2, offset=0)
        assert len(page1) == 2
        assert page1[0].title == "Chat 4"
        assert page1[1].title == "Chat 3"

        # Get next 2
        page2 = store.list_conversations(limit=2, offset=2)
        assert len(page2) == 2
        assert page2[0].title == "Chat 2"
        assert page2[1].title == "Chat 1"

        # Get remaining
        page3 = store.list_conversations(limit=2, offset=4)
        assert len(page3) == 1
        assert page3[0].title == "Chat 0"


class TestMessageOperations:
    """Tests for message CRUD operations"""

    def test_message_dataclass(self):
        """Test Message dataclass creation"""
        now = int(datetime.now().timestamp() * 1000)
        msg = Message(
            id="msg-id",
            conversation_id="conv-id",
            msg_id="stream-msg-123",
            role="assistant",
            content="Hello, world!",
            content_type="text",
            metadata='{"tokens": 10}',
            status="completed",
            created_at=now
        )

        assert msg.id == "msg-id"
        assert msg.conversation_id == "conv-id"
        assert msg.msg_id == "stream-msg-123"
        assert msg.role == "assistant"
        assert msg.content == "Hello, world!"
        assert msg.content_type == "text"
        assert msg.metadata == '{"tokens": 10}'
        assert msg.status == "completed"
        assert msg.created_at == now

    def test_add_message(self, tmp_path):
        """Test adding a message to a conversation"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        # Create a conversation first
        conv_id = store.create_conversation(
            cli_type="claude",
            session_id="msg-test-session"
        )

        # Add a message
        msg_id = store.add_message(
            conv_id=conv_id,
            role="user",
            content="Hello, AI!",
            content_type="text"
        )

        assert msg_id is not None
        assert isinstance(msg_id, str)

        # Retrieve messages
        messages = store.get_messages(conv_id)
        assert len(messages) == 1
        assert messages[0].role == "user"
        assert messages[0].content == "Hello, AI!"
        assert messages[0].content_type == "text"
        assert messages[0].status == "completed"

    def test_add_message_with_metadata(self, tmp_path):
        """Test adding a message with metadata"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        conv_id = store.create_conversation(
            cli_type="claude",
            session_id="meta-test-session"
        )

        metadata = {"tokens": 150, "latency": 230}
        msg_id = store.add_message(
            conv_id=conv_id,
            role="assistant",
            content="Response with metadata",
            content_type="text",
            metadata=metadata,
            msg_id="stream-123"
        )

        messages = store.get_messages(conv_id)
        assert len(messages) == 1
        assert messages[0].metadata is not None
        parsed_meta = json.loads(messages[0].metadata)
        assert parsed_meta["tokens"] == 150
        assert parsed_meta["latency"] == 230

    def test_add_multiple_messages(self, tmp_path):
        """Test adding multiple messages to a conversation"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        conv_id = store.create_conversation(
            cli_type="claude",
            session_id="multi-msg-session"
        )

        # Add user message
        store.add_message(conv_id, "user", "Question 1")
        # Add assistant response
        store.add_message(conv_id, "assistant", "Answer 1")
        # Add another user message
        store.add_message(conv_id, "user", "Question 2")

        messages = store.get_messages(conv_id)
        assert len(messages) == 3
        assert messages[0].role == "user"
        assert messages[0].content == "Question 1"
        assert messages[1].role == "assistant"
        assert messages[1].content == "Answer 1"
        assert messages[2].role == "user"
        assert messages[2].content == "Question 2"

    def test_get_messages_pagination(self, tmp_path):
        """Test message pagination with before_id"""
        import time
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        conv_id = store.create_conversation(
            cli_type="claude",
            session_id="page-msg-session"
        )

        # Add 5 messages with small delays to ensure different timestamps
        msg_ids = []
        for i in range(5):
            time.sleep(0.005)  # 5ms delay
            msg_id = store.add_message(conv_id, "user", f"Message {i}")
            msg_ids.append(msg_id)

        # Get all messages
        all_messages = store.get_messages(conv_id)
        assert len(all_messages) == 5

        # Get messages before the last one (should return first 4)
        before_last = store.get_messages(conv_id, before_id=msg_ids[4], limit=10)
        assert len(before_last) == 4

    def test_search_messages(self, tmp_path):
        """Test searching messages within a conversation"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        conv_id = store.create_conversation(
            cli_type="claude",
            session_id="search-session"
        )

        store.add_message(conv_id, "user", "Tell me about Python programming")
        store.add_message(conv_id, "assistant", "Python is a great programming language")
        store.add_message(conv_id, "user", "What about JavaScript?")

        # Search for "programming"
        results = store.search_messages(conv_id, "programming")
        assert len(results) == 2
        assert "Python" in results[0].content or "Python" in results[1].content

        # Search for "JavaScript"
        results = store.search_messages(conv_id, "JavaScript")
        assert len(results) == 1
        assert "JavaScript" in results[0].content


class TestUpdateMessageContent:
    """Tests for streaming message content updates"""

    def test_update_message_content(self, tmp_path):
        """Test updating message content for streaming"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        conv_id = store.create_conversation(
            cli_type="claude",
            session_id="update-session"
        )

        # Add a message with streaming status
        msg_id = store.add_message(
            conv_id=conv_id,
            role="assistant",
            content="Hello",
            msg_id="stream-msg-456",
            status="streaming"
        )

        # Update the content (simulating streaming)
        store.update_message_content("stream-msg-456", "Hello, world!")

        # Verify the update
        messages = store.get_messages(conv_id)
        assert len(messages) == 1
        assert messages[0].content == "Hello, world!"

    def test_finalize_message(self, tmp_path):
        """Test finalizing a streaming message"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        conv_id = store.create_conversation(
            cli_type="claude",
            session_id="finalize-session"
        )

        # Add a streaming message
        msg_id = store.add_message(
            conv_id=conv_id,
            role="assistant",
            content="Partial content...",
            msg_id="stream-msg-789",
            status="streaming"
        )

        # Finalize the message
        store.finalize_message("stream-msg-789")

        # Verify status is completed
        messages = store.get_messages(conv_id)
        assert messages[0].status == "completed"

    def test_streaming_workflow(self, tmp_path):
        """Test complete streaming workflow"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        conv_id = store.create_conversation(
            cli_type="claude",
            session_id="workflow-session"
        )

        # Start streaming message
        stream_msg_id = "stream-workflow-001"
        msg_id = store.add_message(
            conv_id=conv_id,
            role="assistant",
            content="",
            msg_id=stream_msg_id,
            status="streaming"
        )

        # Simulate streaming chunks
        chunks = ["Hello", ", ", "how ", "can ", "I ", "help?"]
        full_content = ""
        for chunk in chunks:
            full_content += chunk
            store.update_message_content(stream_msg_id, full_content)

        # Finalize
        store.finalize_message(stream_msg_id)

        # Verify final state
        messages = store.get_messages(conv_id)
        assert len(messages) == 1
        assert messages[0].content == "Hello, how can I help?"
        assert messages[0].status == "completed"
        assert messages[0].msg_id == stream_msg_id


class TestConversationLifecycle:
    """Tests for conversation close and delete operations"""

    def test_close_conversation(self, tmp_path):
        """Test closing a conversation"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        conv_id = store.create_conversation(
            cli_type="claude",
            session_id="close-session"
        )

        # Close the conversation
        store.close_conversation(conv_id)

        # Verify it's closed
        conv = store.get_conversation(conv_id)
        assert conv.status == "closed"

        # Closed conversations should not appear in list
        active_convs = store.list_conversations()
        assert len(active_convs) == 0

    def test_delete_conversation(self, tmp_path):
        """Test deleting a conversation and its messages"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        conv_id = store.create_conversation(
            cli_type="claude",
            session_id="delete-session"
        )

        # Add some messages
        store.add_message(conv_id, "user", "Question")
        store.add_message(conv_id, "assistant", "Answer")

        # Verify messages exist
        messages = store.get_messages(conv_id)
        assert len(messages) == 2

        # Delete the conversation
        store.delete_conversation(conv_id)

        # Verify conversation is gone
        conv = store.get_conversation(conv_id)
        assert conv is None

        # Verify messages are also deleted (cascade)
        messages = store.get_messages(conv_id)
        assert len(messages) == 0

    def test_update_conversation_title(self, tmp_path):
        """Test updating conversation title"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        conv_id = store.create_conversation(
            cli_type="claude",
            session_id="title-session",
            title="Original Title"
        )

        # Update title
        store.update_conversation_title(conv_id, "New Title")

        # Verify update
        conv = store.get_conversation(conv_id)
        assert conv.title == "New Title"

    def test_conversation_timestamps_updated_on_message(self, tmp_path):
        """Test that conversation updated_at is updated when message is added"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        conv_id = store.create_conversation(
            cli_type="claude",
            session_id="timestamp-session"
        )

        # Get initial timestamp
        conv = store.get_conversation(conv_id)
        initial_updated = conv.updated_at

        # Wait a tiny bit to ensure timestamp difference
        import time
        time.sleep(0.01)

        # Add a message
        store.add_message(conv_id, "user", "Test message")

        # Verify updated_at changed
        conv = store.get_conversation(conv_id)
        assert conv.updated_at > initial_updated


class TestConversationStoreSingleton:
    """Tests for singleton pattern"""

    def test_singleton_instance(self, tmp_path):
        """Test that ConversationStore is a singleton"""
        db_path = tmp_path / "test_conversations.db"

        # Reset singleton for test
        ConversationStore._instance = None

        store1 = ConversationStore(db_path=str(db_path))
        store2 = ConversationStore(db_path=str(db_path))

        assert store1 is store2

    def test_global_instance(self):
        """Test that conversation_store global exists"""
        assert conversation_store is not None
        assert isinstance(conversation_store, ConversationStore)


class TestErrorHandling:
    """Tests for error handling"""

    def test_add_message_to_nonexistent_conversation(self, tmp_path):
        """Test adding message to non-existent conversation"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        # This should not raise an error but foreign key constraint may fail
        # Depending on SQLite settings
        try:
            store.add_message("non-existent-conv", "user", "Test")
            # If we get here, verify no message was actually added
            messages = store.get_messages("non-existent-conv")
            assert len(messages) == 0
        except Exception:
            # Foreign key constraint violation is expected
            pass

    def test_update_nonexistent_message(self, tmp_path):
        """Test updating content of non-existent message"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        # Should not raise error, just no-op
        store.update_message_content("non-existent-msg", "New content")

    def test_finalize_nonexistent_message(self, tmp_path):
        """Test finalizing non-existent message"""
        db_path = tmp_path / "test_conversations.db"
        store = ConversationStore(db_path=str(db_path))

        # Should not raise error, just no-op
        store.finalize_message("non-existent-msg")
