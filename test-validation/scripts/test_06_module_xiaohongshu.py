#!/usr/bin/env python3
"""Tests for Xiaohongshu Tracker Module."""
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest
from abo.default_modules.xiaohongshu import XiaohongshuTracker


class TestXiaohongshuTrackerCreation:
    """Test Xiaohongshu Tracker initialization."""

    def test_tracker_has_required_attributes(self):
        """Test tracker has all required module attributes."""
        tracker = XiaohongshuTracker()

        assert tracker.id == "xiaohongshu-tracker"
        assert tracker.name == "小红书"
        assert tracker.schedule == "30 8 * * *"
        assert tracker.icon == "book-open"

    def test_tracker_has_subscription_types(self):
        """Test tracker has subscription types defined."""
        tracker = XiaohongshuTracker()

        assert len(tracker.subscription_types) > 0
        assert tracker.subscription_types[0]["type"] == "user_id"


class TestXiaohongshuExtractUserId:
    """Test user ID extraction from URLs."""

    def test_extract_user_id_from_profile_url(self):
        """Test extracting user ID from profile URL."""
        tracker = XiaohongshuTracker()

        url = "https://www.xiaohongshu.com/user/profile/abc123"
        user_id = tracker._extract_user_id(url)

        assert user_id == "abc123"

    def test_extract_user_id_returns_as_is(self):
        """Test user ID returned as-is when not a URL."""
        tracker = XiaohongshuTracker()

        user_id = tracker._extract_user_id("xyz789")

        assert user_id == "xyz789"


class TestXiaohongshuFetch:
    """Test Xiaohongshu fetch functionality."""

    @pytest.mark.asyncio
    async def test_fetch_returns_items(self):
        """Test fetch returns list of Items."""
        tracker = XiaohongshuTracker()

        items = await tracker.fetch(
            keywords=["科研"],
            max_results=5
        )

        assert isinstance(items, list)


class TestXiaohongshuProcess:
    """Test Xiaohongshu process functionality."""

    @pytest.mark.asyncio
    async def test_process_returns_cards(self):
        """Test process returns list of Cards."""
        tracker = XiaohongshuTracker()

        from abo.sdk.types import Item

        items = [
            Item(
                id="xhs-test-001",
                raw={
                    "title": "Test Note Title",
                    "content": "Test note content for testing purposes",
                    "url": "https://www.xiaohongshu.com/explore/test",
                    "user_id": "testuser",
                    "published": datetime.utcnow().isoformat(),
                    "platform": "xiaohongshu"
                }
            )
        ]

        cards = await tracker.process(items, prefs={})

        assert isinstance(cards, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
