#!/usr/bin/env python3
"""Tests for Bilibili Tracker Module."""
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest
from abo.default_modules.bilibili import BilibiliTracker


class TestBilibiliTrackerCreation:
    """Test Bilibili Tracker initialization."""

    def test_tracker_has_required_attributes(self):
        """Test tracker has all required module attributes."""
        tracker = BilibiliTracker()

        assert tracker.id == "bilibili-tracker"
        assert tracker.name == "哔哩哔哩"
        assert tracker.schedule == "0 11 * * *"
        assert tracker.icon == "play-circle"

    def test_tracker_has_subscription_types(self):
        """Test tracker has subscription types defined."""
        tracker = BilibiliTracker()

        assert len(tracker.subscription_types) > 0
        assert tracker.subscription_types[0]["type"] == "up_uid"


class TestBilibiliExtractUid:
    """Test UID extraction from URLs."""

    def test_extract_uid_from_space_url(self):
        """Test extracting UID from space.bilibili.com URL."""
        tracker = BilibiliTracker()

        url = "https://space.bilibili.com/123456"
        uid = tracker._extract_uid(url)

        assert uid == "123456"

    def test_extract_uid_returns_as_is(self):
        """Test UID returned as-is when not a URL."""
        tracker = BilibiliTracker()

        uid = tracker._extract_uid("987654")

        assert uid == "987654"


class TestBilibiliFetch:
    """Test Bilibili fetch functionality."""

    @pytest.mark.asyncio
    async def test_fetch_returns_items(self):
        """Test fetch returns list of Items."""
        tracker = BilibiliTracker()

        items = await tracker.fetch(
            up_uids=["208259"],  # TestCraft channel
            keywords=["测试"],
            max_results=5
        )

        assert isinstance(items, list)


class TestBilibiliProcess:
    """Test Bilibili process functionality."""

    @pytest.mark.asyncio
    async def test_process_returns_cards(self):
        """Test process returns list of Cards."""
        tracker = BilibiliTracker()

        from abo.sdk.types import Item

        items = [
            Item(
                id="bili-test-001",
                raw={
                    "title": "Test Video Title",
                    "description": "Test video description",
                    "url": "https://www.bilibili.com/video/BV1demo",
                    "bvid": "BV1demo",
                    "up_uid": "123456",
                    "up_name": "Test UP",
                    "published": datetime.utcnow().isoformat(),
                    "platform": "bilibili",
                    "dynamic_type": "video",
                    "pic": ""
                }
            )
        ]

        cards = await tracker.process(items, prefs={})

        assert isinstance(cards, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
