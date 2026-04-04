"""Tests for conversation store"""

import os
import pytest
import tempfile
import shutil
from datetime import datetime

from abo.store.conversations import (
    ConversationStore,
    Conversation,
    Message,
    conversation_store,
)


@pytest.fixture
def temp_store():
    """Create a temporary conversation store for testing"""
    # Create a temporary directory
    temp_dir = tempfile.mkdtemp()
    db_path = os.path.join(temp_dir, "test_conversations.db")

    # Ensure parent directory exists
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    # Create a fresh store instance - bypass singleton for testing
    store = object.__new__(ConversationStore)
    store.db_path = db_path
    store._initialized = False
    store._init_db()
    store._initialized = True

    yield store

    # Cleanup
    shutil.rmtree(temp_dir)


class TestConversationStoreInit:
    """Test store initialization"""

    def test_conversation_store_init(self, temp_store):
        """Test that store initializes correctly with tables"""
        # Verify database file was created
        assert os.path.exists(temp_store.db_path)

        # Verify we can perform operations (tables exist)
        conv_id = temp_store.create_conversation(
            cli_type="claude",
            session_id="test-session-1",
            title="Test Conversation",
            workspace="/test/workspace"
        )
        assert conv_id is not None
        assert len(conv_id) > 0


class TestCreateConversation:
    """Test conversation creation"""

    def test_create_conversation(self, temp_store):
        """Test creating a conversation with all fields"""
        conv_id = temp_store.create_conversation(
            cli_type="claude",
            session_id="test-session-2",
            title="My Test Conversation",
            workspace="/Users/test/project"
        )

        # Verify conversation was created
        assert conv_id is not None
        assert isinstance(conv_id, str)

        # Retrieve and verify
        conv = temp_store.get_conversation(conv_id)
        assert conv is not None
        assert conv.id == conv_id
        assert conv.cli_type == "claude"
        assert conv.session_id == "test-session-2"
        assert conv.title == "My Test Conversation"
        assert conv.workspace == "/Users/test/project"
        assert conv.status == "active"
        assert isinstance(conv.created_at, int)
        assert isinstance(conv.updated_at, int)

    def test_create_conversation_minimal(self, temp_store):
        """Test creating a conversation with minimal fields"""
        conv_id = temp_store.create_conversation(
            cli_type="claude",
            session_id="test-session-minimal"
        )

        conv = temp_store.get_conversation(conv_id)
        assert conv is not None
        assert conv.title == ""
        assert conv.workspace == ""

    def test_get_conversation_by_session(self, temp_store):
        """Test retrieving conversation by session_id"""
        conv_id = temp_store.create_conversation(
            cli_type="claude",
            session_id="test-session-lookup",
            title="Session Lookup Test"
        )

        conv = temp_store.get_conversation_by_session("test-session-lookup")
        assert conv is not None
        assert conv.id == conv_id
        assert conv.session_id == "test-session-lookup"

    def test_get_nonexistent_conversation(self, temp_store):
        """Test retrieving non-existent conversation returns None"""
        conv = temp_store.get_conversation("non-existent-id")
        assert conv is None

        conv = temp_store.get_conversation_by_session("non-existent-session")
        assert conv is None


class TestAddAndGetMessages:
    """Test message operations"""

    def test_add_and_get_messages(self, temp_store):
        """Test adding and retrieving messages"""
        # Create a conversation first
        conv_id = temp_store.create_conversation(
            cli_type="claude",
            session_id="test-session-messages"
        )

        # Add messages
        msg1_id = temp_store.add_message(
            conv_id=conv_id,
            role="user",
            content="Hello, how are you?",
            msg_id="msg-001"
        )

        msg2_id = temp_store.add_message(
            conv_id=conv_id,
            role="assistant",
            content="I'm doing well, thank you!",
            msg_id="msg-002",
            content_type="text",
            metadata={"model": "claude-sonnet-4-6"}
        )

        # Verify message IDs were returned
        assert msg1_id is not None
        assert msg2_id is not None
        assert isinstance(msg1_id, str)
        assert isinstance(msg2_id, str)

        # Retrieve messages
        messages = temp_store.get_messages(conv_id)
        assert len(messages) == 2

        # Verify chronological order (oldest first)
        assert messages[0].role == "user"
        assert messages[0].content == "Hello, how are you?"
        assert messages[0].msg_id == "msg-001"

        assert messages[1].role == "assistant"
        assert messages[1].content == "I'm doing well, thank you!"
        assert messages[1].msg_id == "msg-002"
        assert messages[1].metadata == '{"model": "claude-sonnet-4-6"}'

    def test_get_messages_with_limit(self, temp_store):
        """Test retrieving messages with limit"""
        conv_id = temp_store.create_conversation(
            cli_type="claude",
            session_id="test-session-limit"
        )

        # Add multiple messages
        for i in range(5):
            temp_store.add_message(
                conv_id=conv_id,
                role="user",
                content=f"Message {i}"
            )

        # Get with limit
        messages = temp_store.get_messages(conv_id, limit=3)
        assert len(messages) == 3

    def test_get_messages_pagination(self, temp_store):
        """Test message pagination with before_id"""
        import time

        conv_id = temp_store.create_conversation(
            cli_type="claude",
            session_id="test-session-pagination"
        )

        # Add messages with small delays to ensure different timestamps
        msg_ids = []
        for i in range(5):
            msg_id = temp_store.add_message(
                conv_id=conv_id,
                role="user",
                content=f"Message {i}"
            )
            msg_ids.append(msg_id)
            time.sleep(0.01)  # Small delay to ensure different timestamps

        # Get messages before the last one
        messages = temp_store.get_messages(conv_id, before_id=msg_ids[-1], limit=10)
        # Should get messages with timestamp < last message's timestamp
        # Since we added delays, we should get all 4 previous messages
        assert len(messages) >= 3  # At least 3 messages with earlier timestamps


class TestUpdateMessageContent:
    """Test message content updates"""

    def test_update_message_content(self, temp_store):
        """Test updating message content for streaming"""
        conv_id = temp_store.create_conversation(
            cli_type="claude",
            session_id="test-session-update"
        )

        # Add a message with streaming status
        msg_id = temp_store.add_message(
            conv_id=conv_id,
            role="assistant",
            content="",
            msg_id="stream-msg-001",
            status="streaming"
        )

        # Update content (simulating streaming)
        temp_store.update_message_content("stream-msg-001", "Hello")
        temp_store.update_message_content("stream-msg-001", "Hello, world!")

        # Verify update
        messages = temp_store.get_messages(conv_id)
        assert len(messages) == 1
        assert messages[0].content == "Hello, world!"

    def test_finalize_message(self, temp_store):
        """Test finalizing a streaming message"""
        conv_id = temp_store.create_conversation(
            cli_type="claude",
            session_id="test-session-finalize"
        )

        # Add a streaming message
        msg_id = temp_store.add_message(
            conv_id=conv_id,
            role="assistant",
            content="Streaming content...",
            msg_id="stream-msg-002",
            status="streaming"
        )

        # Finalize
        temp_store.finalize_message("stream-msg-002")

        # Verify status changed
        messages = temp_store.get_messages(conv_id)
        assert messages[0].status == "completed"


class TestConversationOperations:
    """Test other conversation operations"""

    def test_list_conversations(self, temp_store):
        """Test listing conversations"""
        # Create multiple conversations
        for i in range(3):
            temp_store.create_conversation(
                cli_type="claude" if i < 2 else "other",
                session_id=f"list-session-{i}",
                title=f"Conversation {i}"
            )

        # List all
        all_convs = temp_store.list_conversations()
        assert len(all_convs) == 3

        # List by cli_type
        claude_convs = temp_store.list_conversations(cli_type="claude")
        assert len(claude_convs) == 2

    def test_update_conversation_title(self, temp_store):
        """Test updating conversation title"""
        conv_id = temp_store.create_conversation(
            cli_type="claude",
            session_id="test-session-title",
            title="Original Title"
        )

        temp_store.update_conversation_title(conv_id, "Updated Title")

        conv = temp_store.get_conversation(conv_id)
        assert conv.title == "Updated Title"

    def test_close_conversation(self, temp_store):
        """Test closing a conversation"""
        conv_id = temp_store.create_conversation(
            cli_type="claude",
            session_id="test-session-close"
        )

        temp_store.close_conversation(conv_id)

        conv = temp_store.get_conversation(conv_id)
        assert conv.status == "closed"

        # Closed conversations should not appear in list
        active_convs = temp_store.list_conversations()
        assert len(active_convs) == 0

    def test_delete_conversation(self, temp_store):
        """Test deleting a conversation cascades to messages"""
        conv_id = temp_store.create_conversation(
            cli_type="claude",
            session_id="test-session-delete"
        )

        # Add some messages
        temp_store.add_message(conv_id, "user", "Message 1")
        temp_store.add_message(conv_id, "assistant", "Message 2")

        # Delete conversation
        temp_store.delete_conversation(conv_id)

        # Verify conversation is gone
        conv = temp_store.get_conversation(conv_id)
        assert conv is None

        # Verify messages are also gone (cascade delete)
        messages = temp_store.get_messages(conv_id)
        assert len(messages) == 0


class TestSearchMessages:
    """Test message search functionality"""

    def test_search_messages(self, temp_store):
        """Test searching messages within a conversation"""
        conv_id = temp_store.create_conversation(
            cli_type="claude",
            session_id="test-session-search"
        )

        # Add messages
        temp_store.add_message(conv_id, "user", "How do I use Python?")
        temp_store.add_message(conv_id, "assistant", "Python is a great language.")
        temp_store.add_message(conv_id, "user", "What about JavaScript?")

        # Search
        results = temp_store.search_messages(conv_id, "Python")
        assert len(results) == 2

        # Search with limit
        results = temp_store.search_messages(conv_id, "Python", limit=1)
        assert len(results) == 1


class TestSingleton:
    """Test singleton pattern"""

    def test_singleton_instance(self):
        """Test that ConversationStore is a singleton"""
        # Reset singleton state first
        original_instance = ConversationStore._instance
        ConversationStore._instance = None

        try:
            # Create first instance
            store1 = ConversationStore()

            # Create second instance - should be the same object
            store2 = ConversationStore()

            # They should be the same object
            assert store2 is store1
        finally:
            # Restore original state
            ConversationStore._instance = original_instance
