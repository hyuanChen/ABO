#!/usr/bin/env python3
"""Tests for ABO Card Store (SQLite)."""
import sys
from pathlib import Path

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest
from abo.store.cards import CardStore
from abo.sdk.types import Card


class TestCardStoreCreation:
    """Test CardStore initialization."""

    def test_store_creates_db_file(self, tmp_path):
        """Test CardStore creates database file."""
        db_path = tmp_path / "test.db"
        store = CardStore(db_path)

        assert db_path.exists()

    def test_store_creates_tables(self, tmp_path):
        """Test CardStore creates required tables."""
        db_path = tmp_path / "test.db"
        store = CardStore(db_path)

        # Check tables exist
        with store._conn() as conn:
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='cards'"
            )
            assert cursor.fetchone() is not None


class TestCardStoreSave:
    """Test saving cards."""

    def test_save_card(self, tmp_path, sample_card_data):
        """Test saving a card."""
        db_path = tmp_path / "test.db"
        store = CardStore(db_path)

        card = Card(**sample_card_data)
        store.save(card)

        # Verify saved
        result = store.get("test-card-001")
        assert result is not None
        assert result.title == "Test Card Title"

    def test_save_updates_existing(self, tmp_path):
        """Test saving updates existing card."""
        db_path = tmp_path / "test.db"
        store = CardStore(db_path)

        card1 = Card(
            id="card-001",
            module_id="test",
            title="Original Title",
            summary="Original summary",
            score=0.5,
            tags=["original"],
            source_url="https://example.com",
            obsidian_path="Test.md"
        )
        store.save(card1)

        card2 = Card(
            id="card-001",
            module_id="test",
            title="Updated Title",
            summary="Updated summary",
            score=0.9,
            tags=["updated"],
            source_url="https://example.com",
            obsidian_path="Test.md"
        )
        store.save(card2)

        result = store.get("card-001")
        assert result.title == "Updated Title"
        assert result.score == 0.9


class TestCardStoreList:
    """Test listing cards."""

    def test_list_all_cards(self, tmp_path):
        """Test listing all cards."""
        db_path = tmp_path / "test.db"
        store = CardStore(db_path)

        # Save multiple cards
        for i in range(5):
            card = Card(
                id=f"card-{i}",
                module_id="test-module",
                title=f"Card {i}",
                summary="Summary",
                score=0.5,
                tags=["test"],
                source_url="https://example.com",
                obsidian_path="Test.md",
                created_at=1704067200.0 + i
            )
            store.save(card)

        cards = store.list()
        assert len(cards) == 5

    def test_list_by_module(self, tmp_path):
        """Test listing cards by module."""
        db_path = tmp_path / "test.db"
        store = CardStore(db_path)

        # Save cards from different modules
        for i in range(3):
            card = Card(
                id=f"mod1-card-{i}",
                module_id="module-1",
                title=f"Module 1 Card {i}",
                summary="Summary",
                score=0.5,
                tags=["test"],
                source_url="https://example.com",
                obsidian_path="Test.md"
            )
            store.save(card)

        for i in range(2):
            card = Card(
                id=f"mod2-card-{i}",
                module_id="module-2",
                title=f"Module 2 Card {i}",
                summary="Summary",
                score=0.5,
                tags=["test"],
                source_url="https://example.com",
                obsidian_path="Test.md"
            )
            store.save(card)

        mod1_cards = store.list(module_id="module-1")
        assert len(mod1_cards) == 3

        mod2_cards = store.list(module_id="module-2")
        assert len(mod2_cards) == 2

    def test_list_unread_only(self, tmp_path):
        """Test listing only unread cards."""
        db_path = tmp_path / "test.db"
        store = CardStore(db_path)

        # Save cards
        for i in range(3):
            card = Card(
                id=f"card-{i}",
                module_id="test",
                title=f"Card {i}",
                summary="Summary",
                score=0.5,
                tags=["test"],
                source_url="https://example.com",
                obsidian_path="Test.md"
            )
            store.save(card)

        # Mark one as read
        store.mark_read("card-1")

        unread = store.list(unread_only=True)
        assert len(unread) == 2


class TestCardStoreFeedback:
    """Test feedback operations."""

    def test_record_feedback(self, tmp_path):
        """Test recording feedback on a card."""
        db_path = tmp_path / "test.db"
        store = CardStore(db_path)

        card = Card(
            id="feedback-card",
            module_id="test",
            title="Feedback Card",
            summary="Summary",
            score=0.5,
            tags=["test"],
            source_url="https://example.com",
            obsidian_path="Test.md"
        )
        store.save(card)

        store.record_feedback("feedback-card", "save")

        # Verify (card should be marked read and feedback recorded)
        # We can verify by checking unread count
        unread = store.list(unread_only=True)
        assert len(unread) == 0

    def test_count_feedback(self, tmp_path):
        """Test counting feedback by action."""
        db_path = tmp_path / "test.db"
        store = CardStore(db_path)

        # Save and feedback cards
        for i in range(3):
            card = Card(
                id=f"card-{i}",
                module_id="test-module",
                title=f"Card {i}",
                summary="Summary",
                score=0.5,
                tags=["test"],
                source_url="https://example.com",
                obsidian_path="Test.md"
            )
            store.save(card)
            action = "save" if i < 2 else "dismiss"
            store.record_feedback(f"card-{i}", action)

        save_count = store.count_feedback("test-module", "save")
        dismiss_count = store.count_feedback("test-module", "dismiss")

        assert save_count == 2
        assert dismiss_count == 1


class TestCardStoreUnreadCounts:
    """Test unread count functionality."""

    def test_unread_counts_by_module(self, tmp_path):
        """Test getting unread counts by module."""
        db_path = tmp_path / "test.db"
        store = CardStore(db_path)

        # Module 1: 2 unread, 1 read
        for i in range(3):
            card = Card(
                id=f"mod1-{i}",
                module_id="module-1",
                title=f"M1 Card {i}",
                summary="Summary",
                score=0.5,
                tags=["test"],
                source_url="https://example.com",
                obsidian_path="Test.md"
            )
            store.save(card)
        store.mark_read("mod1-0")

        # Module 2: 1 unread
        card = Card(
            id="mod2-0",
            module_id="module-2",
            title="M2 Card",
            summary="Summary",
            score=0.5,
            tags=["test"],
            source_url="https://example.com",
            obsidian_path="Test.md"
        )
        store.save(card)

        counts = store.unread_counts()

        assert counts["module-1"] == 2
        assert counts["module-2"] == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
