#!/usr/bin/env python3
"""Tests for ABO SDK types and base classes."""
import sys
from pathlib import Path

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest
from abo.sdk.types import Item, Card, FeedbackAction
from abo.sdk.base import Module


class TestItem:
    """Test Item dataclass."""

    def test_item_creation(self):
        """Test creating an Item."""
        item = Item(
            id="test-001",
            raw={"title": "Test Title", "content": "Test Content"}
        )

        assert item.id == "test-001"
        assert item.raw["title"] == "Test Title"

    def test_item_with_full_data(self):
        """Test creating an Item with all fields."""
        item = Item(
            id="test-002",
            raw={
                "title": "Full Test",
                "url": "https://example.com",
                "author": "Test Author",
                "published": "2024-01-01"
            }
        )

        assert item.id == "test-002"
        assert item.raw["author"] == "Test Author"


class TestCard:
    """Test Card dataclass."""

    def test_card_creation(self):
        """Test creating a Card."""
        card = Card(
            id="card-001",
            module_id="test-module",
            title="Test Card",
            summary="Test summary",
            score=0.85,
            tags=["test", "example"],
            source_url="https://example.com",
            obsidian_path="Test/Card.md",
            metadata={"key": "value"},
            created_at=1704067200.0
        )

        assert card.id == "card-001"
        assert card.module_id == "test-module"
        assert card.score == 0.85
        assert "test" in card.tags

    def test_card_default_values(self):
        """Test Card with default values."""
        card = Card(
            id="card-002",
            title="Minimal Card",
            summary="",
            score=0.0,
            tags=[],
            source_url="",
            obsidian_path="",
            module_id="test-module"
        )

        assert card.summary == ""
        assert card.score == 0.0
        assert card.tags == []
        assert card.metadata == {}


class TestFeedbackAction:
    """Test FeedbackAction enum."""

    def test_feedback_actions_exist(self):
        """Test all expected feedback actions exist."""
        assert hasattr(FeedbackAction, 'SAVE')
        assert hasattr(FeedbackAction, 'SKIP')
        assert hasattr(FeedbackAction, 'STAR')
        assert hasattr(FeedbackAction, 'LIKE')
        assert hasattr(FeedbackAction, 'DISLIKE')

    def test_feedback_action_values(self):
        """Test feedback action string values."""
        assert FeedbackAction.SAVE.value == "save"
        assert FeedbackAction.SKIP.value == "skip"
        assert FeedbackAction.STAR.value == "star"
        assert FeedbackAction.LIKE.value == "like"
        assert FeedbackAction.DISLIKE.value == "dislike"


class TestModuleBase:
    """Test Module base class."""

    def test_module_requires_implementation(self):
        """Test Module cannot be instantiated without implementation."""

        class IncompleteModule(Module):
            id = "incomplete"
            name = "Incomplete"

        with pytest.raises(TypeError):
            IncompleteModule()  # Missing fetch and process

    def test_module_default_output(self):
        """Test Module default output includes obsidian and ui."""

        class TestModule(Module):
            id = "test"
            name = "Test"

            async def fetch(self):
                return []

            async def process(self, items, prefs):
                return []

        assert "obsidian" in TestModule.output
        assert "ui" in TestModule.output

    def test_module_get_status(self):
        """Test Module get_status method."""

        class TestModule(Module):
            id = "test-module"
            name = "Test Module"
            schedule = "0 8 * * *"
            icon = "test-icon"

            async def fetch(self):
                return []

            async def process(self, items, prefs):
                return []

        mod = TestModule()
        status = mod.get_status()

        assert status["id"] == "test-module"
        assert status["name"] == "Test Module"
        assert status["schedule"] == "0 8 * * *"
        assert status["icon"] == "test-icon"
        assert status["enabled"] is True


class TestModuleCookie:
    """Test Module _module_cookie method."""

    def test_module_cookie_empty_when_no_config(self, tmp_path, monkeypatch):
        """Test _module_cookie returns empty string when no config."""
        monkeypatch.setattr(Path, 'home', lambda: tmp_path)

        class TestModule(Module):
            id = "test-cookie-module"
            name = "Test"

            async def fetch(self):
                return []

            async def process(self, items, prefs):
                return []

        mod = TestModule()
        cookie = mod._module_cookie()

        assert cookie == ""


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
