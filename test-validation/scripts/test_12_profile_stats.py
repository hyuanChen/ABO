#!/usr/bin/env python3
"""Tests for Profile Stats calculation."""
import sys
from pathlib import Path
from datetime import date

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest
from abo.profile.stats import calculate_stats, score_to_grade
from abo.store.cards import CardStore


class TestScoreToGrade:
    """Test score to grade conversion."""

    def test_score_80_and_above_is_grade_a(self):
        """Test scores >= 80 return grade A."""
        assert score_to_grade(80) == "A"
        assert score_to_grade(100) == "A"
        assert score_to_grade(95) == "A"

    def test_score_60_to_79_is_grade_b(self):
        """Test scores 60-79 return grade B."""
        assert score_to_grade(60) == "B"
        assert score_to_grade(79) == "B"
        assert score_to_grade(70) == "B"

    def test_score_40_to_59_is_grade_c(self):
        """Test scores 40-59 return grade C."""
        assert score_to_grade(40) == "C"
        assert score_to_grade(59) == "C"
        assert score_to_grade(50) == "C"

    def test_score_20_to_39_is_grade_d(self):
        """Test scores 20-39 return grade D."""
        assert score_to_grade(20) == "D"
        assert score_to_grade(39) == "D"
        assert score_to_grade(30) == "D"

    def test_score_below_20_is_grade_e(self):
        """Test scores < 20 return grade E."""
        assert score_to_grade(0) == "E"
        assert score_to_grade(19) == "E"
        assert score_to_grade(10) == "E"


class TestCalculateStats:
    """Test stats calculation."""

    def test_calculate_stats_returns_all_dimensions(self, tmp_path):
        """Test calculate_stats returns all six dimensions."""
        db_path = tmp_path / "test.db"
        card_store = CardStore(db_path)

        stats = calculate_stats(None, card_store)

        assert "research" in stats
        assert "output" in stats
        assert "health" in stats
        assert "learning" in stats
        assert "san" in stats
        assert "happiness" in stats

    def test_each_dimension_has_required_fields(self, tmp_path):
        """Test each dimension has score, grade, and raw fields."""
        db_path = tmp_path / "test.db"
        card_store = CardStore(db_path)

        stats = calculate_stats(None, card_store)

        for dim_name, dim_data in stats.items():
            assert "score" in dim_data
            assert "grade" in dim_data
            assert "raw" in dim_data
            assert isinstance(dim_data["score"], int)
            assert isinstance(dim_data["grade"], str)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
