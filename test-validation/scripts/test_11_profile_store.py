#!/usr/bin/env python3
"""Tests for Profile Store."""
import json
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest
from abo.profile import store


class TestProfileIdentity:
    """Test identity storage."""

    def test_save_and_get_identity(self, tmp_path, monkeypatch):
        """Test saving and retrieving identity."""
        monkeypatch.setattr(store, '_ABO_DIR', tmp_path)

        store.save_identity("TestUser", "Become a great researcher")
        identity = store.get_identity()

        assert identity["codename"] == "TestUser"
        assert identity["long_term_goal"] == "Become a great researcher"


class TestProfileEnergy:
    """Test energy tracking."""

    def test_save_and_get_energy(self, tmp_path, monkeypatch):
        """Test saving and retrieving energy."""
        monkeypatch.setattr(store, '_ABO_DIR', tmp_path)

        store.save_energy_today(85, manual=True)
        energy = store.get_energy_today()

        assert energy == 85


class TestProfileTodos:
    """Test todo tracking."""

    def test_save_and_get_todos(self, tmp_path, monkeypatch):
        """Test saving and retrieving todos."""
        monkeypatch.setattr(store, '_ABO_DIR', tmp_path)

        todos = [
            {"text": "Read paper", "done": True},
            {"text": "Write code", "done": False}
        ]
        store.save_todos_today(todos)
        retrieved = store.get_todos_today()

        assert len(retrieved) == 2
        assert retrieved[0]["text"] == "Read paper"
        assert retrieved[0]["done"] is True


class TestProfileMotto:
    """Test motto storage."""

    def test_save_and_get_motto(self, tmp_path, monkeypatch):
        """Test saving and retrieving motto."""
        monkeypatch.setattr(store, '_ABO_DIR', tmp_path)

        store.save_daily_motto("Focus on progress, not perfection.", "Productive day")
        motto = store.get_daily_motto()

        assert motto["motto"] == "Focus on progress, not perfection."
        assert motto["description"] == "Productive day"


class TestProfileSAN:
    """Test SAN tracking."""

    def test_append_and_get_san(self, tmp_path, monkeypatch):
        """Test appending and retrieving SAN scores."""
        monkeypatch.setattr(store, '_ABO_DIR', tmp_path)

        store.append_san(8)
        store.append_san(9)
        avg = store.get_san_7d_avg()

        assert avg == 9.0


class TestProfileHappiness:
    """Test happiness tracking."""

    def test_append_and_get_happiness(self, tmp_path, monkeypatch):
        """Test appending and retrieving happiness scores."""
        monkeypatch.setattr(store, '_ABO_DIR', tmp_path)

        store.append_happiness(7)
        happiness = store.get_happiness_today()

        assert happiness == 7.0


class TestProfileSkills:
    """Test skill tracking."""

    def test_unlock_and_get_skills(self, tmp_path, monkeypatch):
        """Test unlocking and retrieving skills."""
        monkeypatch.setattr(store, '_ABO_DIR', tmp_path)

        store.unlock_skill("python")
        skills = store.get_skills()

        assert "python" in skills
        assert "unlocked_at" in skills["python"]


class TestProfileAchievements:
    """Test achievement tracking."""

    def test_unlock_and_get_achievements(self, tmp_path, monkeypatch):
        """Test unlocking and retrieving achievements."""
        monkeypatch.setattr(store, '_ABO_DIR', tmp_path)

        result = store.unlock_achievement("first_login", "First Login")
        achievements = store.get_achievements()

        assert result is True
        assert len(achievements) == 1
        assert achievements[0]["id"] == "first_login"

    def test_unlock_duplicate_returns_false(self, tmp_path, monkeypatch):
        """Test unlocking duplicate achievement returns False."""
        monkeypatch.setattr(store, '_ABO_DIR', tmp_path)

        store.unlock_achievement("test_ach", "Test Achievement")
        result = store.unlock_achievement("test_ach", "Test Achievement")

        assert result is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
