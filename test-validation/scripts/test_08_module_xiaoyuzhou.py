#!/usr/bin/env python3
"""Tests for Xiaoyuzhou Tracker Module."""
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest
from abo.default_modules.xiaoyuzhou import XiaoyuzhouTracker


class TestXiaoyuzhouTrackerCreation:
    """Test Xiaoyuzhou Tracker initialization."""

    def test_tracker_has_required_attributes(self):
        """Test tracker has all required module attributes."""
        tracker = XiaoyuzhouTracker()

        assert tracker.id == "xiaoyuzhou-tracker"
        assert tracker.name == "小宇宙"
        assert tracker.schedule == "0 10 * * *"
        assert tracker.icon == "headphones"

    def test_tracker_has_subscription_types(self):
        """Test tracker has subscription types defined."""
        tracker = XiaoyuzhouTracker()

        assert len(tracker.subscription_types) > 0
        assert tracker.subscription_types[0]["type"] == "podcast_id"


class TestXiaoyuzhouExtractIds:
    """Test ID extraction from URLs."""

    def test_extract_podcast_id_from_url(self):
        """Test extracting podcast ID from URL."""
        tracker = XiaoyuzhouTracker()

        url = "https://www.xiaoyuzhoufm.com/podcast/abc123"
        podcast_id = tracker._extract_podcast_id(url)

        assert podcast_id == "abc123"

    def test_extract_podcast_id_returns_as_is(self):
        """Test podcast ID returned as-is when not a URL."""
        tracker = XiaoyuzhouTracker()

        podcast_id = tracker._extract_podcast_id("xyz789")

        assert podcast_id == "xyz789"

    def test_extract_episode_id_from_url(self):
        """Test extracting episode ID from URL."""
        tracker = XiaoyuzhouTracker()

        url = "https://www.xiaoyuzhoufm.com/episode/ep123"
        episode_id = tracker._extract_episode_id(url)

        assert episode_id == "ep123"


class TestXiaoyuzhouFetch:
    """Test Xiaoyuzhou fetch functionality."""

    @pytest.mark.asyncio
    async def test_fetch_returns_items(self):
        """Test fetch returns list of Items."""
        tracker = XiaoyuzhouTracker()

        items = await tracker.fetch(
            keywords=["科研"],
            max_results=5
        )

        assert isinstance(items, list)


class TestXiaoyuzhouProcess:
    """Test Xiaoyuzhou process functionality."""

    @pytest.mark.asyncio
    async def test_process_returns_cards(self):
        """Test process returns list of Cards."""
        tracker = XiaoyuzhouTracker()

        from abo.sdk.types import Item

        items = [
            Item(
                id="xyz-test-001",
                raw={
                    "title": "Test Episode Title",
                    "description": "Test episode description for testing purposes",
                    "url": "https://www.xiaoyuzhoufm.com/episode/test",
                    "podcast_id": "testpodcast",
                    "podcast_name": "Test Podcast",
                    "published": datetime.utcnow().isoformat(),
                    "platform": "xiaoyuzhou"
                }
            )
        ]

        cards = await tracker.process(items, prefs={})

        assert isinstance(cards, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
