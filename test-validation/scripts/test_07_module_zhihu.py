#!/usr/bin/env python3
"""Tests for Zhihu Tracker Module."""
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest
from abo.default_modules.zhihu import ZhihuTracker


class TestZhihuTrackerCreation:
    """Test Zhihu Tracker initialization."""

    def test_tracker_has_required_attributes(self):
        """Test tracker has all required module attributes."""
        tracker = ZhihuTracker()

        assert tracker.id == "zhihu-tracker"
        assert tracker.name == "知乎"
        assert tracker.schedule == "0 13 * * *"
        assert tracker.icon == "help-circle"

    def test_tracker_has_subscription_types(self):
        """Test tracker has subscription types defined."""
        tracker = ZhihuTracker()

        assert len(tracker.subscription_types) == 2
        types = [t["type"] for t in tracker.subscription_types]
        assert "topic" in types
        assert "user" in types


class TestZhihuExtractIds:
    """Test ID extraction from URLs."""

    def test_extract_topic_id_from_url(self):
        """Test extracting topic ID from URL."""
        tracker = ZhihuTracker()

        url = "https://www.zhihu.com/topic/12345"
        topic_id = tracker._extract_topic_id(url)

        assert topic_id == "12345"

    def test_extract_topic_id_returns_as_is(self):
        """Test topic ID returned as-is when not a URL."""
        tracker = ZhihuTracker()

        topic_id = tracker._extract_topic_id("67890")

        assert topic_id == "67890"

    def test_extract_user_id_from_url(self):
        """Test extracting user ID from URL."""
        tracker = ZhihuTracker()

        url = "https://www.zhihu.com/people/test-user"
        user_id = tracker._extract_user_id(url)

        assert user_id == "test-user"

    def test_extract_user_id_returns_as_is(self):
        """Test user ID returned as-is when not a URL."""
        tracker = ZhihuTracker()

        user_id = tracker._extract_user_id("anotheruser")

        assert user_id == "anotheruser"


class TestZhihuFetch:
    """Test Zhihu fetch functionality."""

    @pytest.mark.asyncio
    async def test_fetch_returns_items(self):
        """Test fetch returns list of Items."""
        tracker = ZhihuTracker()

        items = await tracker.fetch(
            keywords=["科研"],
            max_results=5
        )

        assert isinstance(items, list)


class TestZhihuProcess:
    """Test Zhihu process functionality."""

    @pytest.mark.asyncio
    async def test_process_returns_cards(self):
        """Test process returns list of Cards."""
        tracker = ZhihuTracker()

        from abo.sdk.types import Item

        items = [
            Item(
                id="zhihu-test-001",
                raw={
                    "title": "Test Question Title",
                    "content": "Test answer content for testing purposes",
                    "url": "https://zhuanlan.zhihu.com/p/test",
                    "author": "Test Author",
                    "published": datetime.utcnow().isoformat(),
                    "platform": "zhihu"
                }
            )
        ]

        cards = await tracker.process(items, prefs={})

        assert isinstance(cards, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
