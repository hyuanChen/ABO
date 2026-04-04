#!/usr/bin/env python3
"""Tests for Semantic Scholar Tracker Module."""
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest
from abo.default_modules.semantic_scholar_tracker import SemanticScholarTracker, get_default_queries


class TestSemanticScholarTrackerCreation:
    """Test Semantic Scholar Tracker initialization."""

    def test_tracker_has_required_attributes(self):
        """Test tracker has all required module attributes."""
        tracker = SemanticScholarTracker()

        assert tracker.id == "semantic-scholar-tracker"
        assert tracker.name == "Semantic Scholar 后续论文"
        assert tracker.schedule == "0 10 * * *"
        assert tracker.icon == "git-branch"

    def test_tracker_has_default_api_key(self):
        """Test tracker has default API key."""
        tracker = SemanticScholarTracker()

        assert tracker.DEFAULT_API_KEY is not None
        assert len(tracker.DEFAULT_API_KEY) > 0


class TestSemanticScholarGetDefaultQueries:
    """Test get_default_queries helper function."""

    def test_returns_list_of_queries(self):
        """Test function returns list of default queries."""
        queries = get_default_queries()

        assert isinstance(queries, list)
        assert len(queries) > 0

    def test_queries_have_required_fields(self):
        """Test each query has name, query, and description."""
        queries = get_default_queries()

        for q in queries:
            assert "name" in q
            assert "query" in q
            assert "description" in q


class TestSemanticScholarPaperToItem:
    """Test paper to item conversion."""

    def test_paper_to_item_conversion(self):
        """Test _paper_to_item converts paper dict to Item."""
        tracker = SemanticScholarTracker()

        paper = {
            "paperId": "abc123",
            "title": "Test Paper Title",
            "abstract": "Test abstract",
            "authors": [{"name": "Author One"}, {"name": "Author Two"}],
            "year": 2024,
            "venue": "Test Venue",
            "publicationDate": "2024-01-15",
            "citationCount": 10,
            "referenceCount": 20,
            "fieldsOfStudy": ["Computer Science", "AI"],
            "externalIds": {"ArXiv": "2401.12345"}
        }

        item = tracker._paper_to_item(paper, source_paper_title="Original Paper")

        assert item.id == "2401.12345"  # Uses arXiv ID
        assert item.raw["title"] == "Test Paper Title"
        assert item.raw["source_paper_title"] == "Original Paper"
        assert len(item.raw["authors"]) == 2


class TestSemanticScholarFetch:
    """Test Semantic Scholar fetch functionality."""

    @pytest.mark.asyncio
    async def test_fetch_followups_returns_items(self):
        """Test fetch_followups returns list of Items."""
        tracker = SemanticScholarTracker()

        # Use a well-known paper
        items = await tracker.fetch_followups(
            query="attention is all you need",
            max_results=3,
            days_back=365  # Last year
        )

        assert isinstance(items, list)


class TestSemanticScholarProcess:
    """Test Semantic Scholar process functionality."""

    @pytest.mark.asyncio
    async def test_process_returns_cards(self):
        """Test process returns list of Cards."""
        tracker = SemanticScholarTracker()

        from abo.sdk.types import Item

        items = [
            Item(
                id="s2-test-001",
                raw={
                    "title": "Test Follow-up Paper",
                    "abstract": "This is a test abstract for follow-up paper.",
                    "authors": ["Test Author"],
                    "year": 2024,
                    "venue": "Test Conference",
                    "published": "2024-01-15",
                    "citation_count": 5,
                    "reference_count": 15,
                    "fields_of_study": ["AI", "ML"],
                    "source_paper_title": "Original Paper",
                    "url": "https://example.com/paper"
                }
            )
        ]

        cards = await tracker.process(items, prefs={})

        assert isinstance(cards, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
