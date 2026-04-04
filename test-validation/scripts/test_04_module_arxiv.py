#!/usr/bin/env python3
"""Tests for ArXiv Tracker Module."""
import asyncio
import sys
from datetime import datetime, timedelta

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest
from abo.default_modules.arxiv import ArxivTracker, get_available_categories


class TestArxivTrackerCreation:
    """Test ArXiv Tracker initialization."""

    def test_tracker_has_required_attributes(self):
        """Test tracker has all required module attributes."""
        tracker = ArxivTracker()

        assert tracker.id == "arxiv-tracker"
        assert tracker.name == "arXiv 论文追踪"
        assert tracker.schedule == "0 8 * * *"
        assert tracker.icon == "book-open"

    def test_tracker_output_includes_obsidian_and_ui(self):
        """Test tracker outputs to both obsidian and ui."""
        tracker = ArxivTracker()

        assert "obsidian" in tracker.output
        assert "ui" in tracker.output


class TestArxivCategoryHelpers:
    """Test ArXiv category helper functions."""

    def test_get_available_categories_returns_list(self):
        """Test get_available_categories returns a list."""
        categories = get_available_categories()

        assert isinstance(categories, list)
        assert len(categories) > 0

    def test_categories_have_required_fields(self):
        """Test each category has code, name, and main fields."""
        categories = get_available_categories()

        for cat in categories:
            assert "code" in cat
            assert "name" in cat
            assert "main" in cat
            assert isinstance(cat["code"], str)
            assert isinstance(cat["name"], str)

    def test_cs_categories_exist(self):
        """Test computer science categories exist."""
        categories = get_available_categories()
        codes = [c["code"] for c in categories]

        assert "cs.CV" in codes
        assert "cs.LG" in codes
        assert "cs.CL" in codes


class TestArxivFetchByCategory:
    """Test ArXiv fetch_by_category functionality."""

    @pytest.mark.asyncio
    async def test_fetch_with_no_params_uses_defaults(self):
        """Test fetch with no parameters uses default values."""
        tracker = ArxivTracker()

        # Use very restrictive params to limit results
        items = await tracker.fetch_by_category(
            categories=["cs.AI"],
            keywords=["quantum"],  # Very specific keyword
            max_results=5
        )

        # Should return items (even if empty, shouldn't error)
        assert isinstance(items, list)

    @pytest.mark.asyncio
    async def test_fetch_returns_item_objects(self):
        """Test fetch returns list of Item objects."""
        tracker = ArxivTracker()

        items = await tracker.fetch_by_category(
            categories=["cs.CL"],
            max_results=3
        )

        for item in items:
            assert hasattr(item, 'id')
            assert hasattr(item, 'raw')
            assert 'title' in item.raw

    @pytest.mark.asyncio
    async def test_fetch_with_date_filter(self):
        """Test fetch respects days_back parameter."""
        tracker = ArxivTracker()

        items = await tracker.fetch_by_category(
            categories=["cs.AI"],
            days_back=7,  # Very recent papers only
            max_results=10
        )

        # All items should be recent
        cutoff = datetime.utcnow() - timedelta(days=7)
        for item in items:
            published_str = item.raw.get('published', '')
            if published_str:
                published = datetime.fromisoformat(published_str.replace('Z', '+00:00')).replace(tzinfo=None)
                assert published >= cutoff


class TestArxivParseEntry:
    """Test ArXiv entry parsing."""

    def test_parse_entry_extracts_required_fields(self):
        """Test _parse_entry extracts all required fields."""
        import xml.etree.ElementTree as ET

        tracker = ArxivTracker()

        # Create a minimal valid arXiv entry
        xml_str = """<?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
            <entry>
                <id>http://arxiv.org/abs/2401.12345</id>
                <title>Test Paper Title</title>
                <summary>Test abstract for the paper.</summary>
                <author><name>John Doe</name></author>
                <author><name>Jane Smith</name></author>
                <published>2024-01-15T00:00:00Z</published>
                <updated>2024-01-16T00:00:00Z</updated>
                <category term="cs.CV" scheme="http://arxiv.org/schemas/atom"/>
                <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.CV"/>
            </entry>
        </feed>"""

        root = ET.fromstring(xml_str)
        ns = {"a": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
        entry = root.find("a:entry", ns)

        item = tracker._parse_entry(entry)

        assert item is not None
        assert item.id == "2401.12345"
        assert item.raw["title"] == "Test Paper Title"
        assert item.raw["abstract"] == "Test abstract for the paper."
        assert len(item.raw["authors"]) == 2
        assert item.raw["primary_category"] == "cs.CV"


class TestArxivProcess:
    """Test ArXiv process functionality."""

    @pytest.mark.asyncio
    async def test_process_returns_cards(self):
        """Test process returns list of Card objects."""
        tracker = ArxivTracker()

        from abo.sdk.types import Item

        items = [
            Item(
                id="2401.12345",
                raw={
                    "title": "Test Paper",
                    "abstract": "This is a test abstract.",
                    "authors": ["Test Author"],
                    "published": "2024-01-15T00:00:00Z",
                    "primary_category": "cs.CV",
                    "categories": ["cs.CV"],
                    "all_categories": ["Computer Vision and Pattern Recognition"],
                    "url": "https://arxiv.org/abs/2401.12345"
                }
            )
        ]

        cards = await tracker.process(items, prefs={})

        assert isinstance(cards, list)
        assert len(cards) > 0

        card = cards[0]
        assert hasattr(card, 'id')
        assert hasattr(card, 'title')
        assert hasattr(card, 'obsidian_path')
        assert 'cs.CV' in card.tags or any('CV' in tag for tag in card.tags)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
