#!/usr/bin/env python3
"""Tests for ABO config system."""
import json
import sys
from pathlib import Path

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest
from abo import config


class TestConfigLoad:
    """Test config loading functionality."""

    def test_load_default_config(self, monkeypatch, tmp_path):
        """Test loading config when file doesn't exist returns defaults."""
        # Use temp directory to ensure config file doesn't exist
        monkeypatch.setattr(config, '_CONFIG_PATH', tmp_path / "nonexistent.json")

        result = config.load()

        assert result["vault_path"] == ""
        assert result["literature_path"] == ""
        assert result["version"] == "1.0.0"

    def test_load_existing_config(self, tmp_path, monkeypatch):
        """Test loading existing config file."""
        config_path = tmp_path / "test_config.json"
        test_data = {
            "vault_path": "/test/vault",
            "literature_path": "/test/literature",
            "version": "1.2.3"
        }
        config_path.write_text(json.dumps(test_data))
        monkeypatch.setattr(config, '_CONFIG_PATH', config_path)

        result = config.load()

        assert result["vault_path"] == "/test/vault"
        assert result["literature_path"] == "/test/literature"
        assert result["version"] == "1.2.3"

    def test_load_merges_defaults(self, tmp_path, monkeypatch):
        """Test loading merges with defaults for missing keys."""
        config_path = tmp_path / "test_config.json"
        test_data = {"vault_path": "/test/vault"}  # Missing literature_path and version
        config_path.write_text(json.dumps(test_data))
        monkeypatch.setattr(config, '_CONFIG_PATH', config_path)

        result = config.load()

        assert result["vault_path"] == "/test/vault"
        assert result["literature_path"] == ""  # Default
        assert result["version"] == "1.0.0"  # Default


class TestConfigSave:
    """Test config saving functionality."""

    def test_save_creates_file(self, tmp_path, monkeypatch):
        """Test saving creates config file."""
        config_path = tmp_path / "test_config.json"
        monkeypatch.setattr(config, '_CONFIG_PATH', config_path)

        config.save({"vault_path": "/new/vault"})

        assert config_path.exists()
        saved = json.loads(config_path.read_text())
        assert saved["vault_path"] == "/new/vault"

    def test_save_preserves_existing_values(self, tmp_path, monkeypatch):
        """Test saving preserves existing non-empty values."""
        config_path = tmp_path / "test_config.json"
        initial = {"vault_path": "/existing/vault", "literature_path": "/existing/lit"}
        config_path.write_text(json.dumps(initial))
        monkeypatch.setattr(config, '_CONFIG_PATH', config_path)

        config.save({"vault_path": ""})  # Empty should not overwrite

        saved = json.loads(config_path.read_text())
        assert saved["vault_path"] == "/existing/vault"  # Preserved
        assert saved["literature_path"] == "/existing/lit"


class TestConfigGetters:
    """Test config getter functions."""

    def test_get_vault_path_returns_path(self, tmp_path, monkeypatch):
        """Test get_vault_path returns Path when configured."""
        config_path = tmp_path / "test_config.json"
        config_path.write_text(json.dumps({"vault_path": "/test/vault"}))
        monkeypatch.setattr(config, '_CONFIG_PATH', config_path)

        result = config.get_vault_path()

        assert isinstance(result, Path)
        assert str(result) == "/test/vault"

    def test_get_vault_path_returns_none_when_empty(self, tmp_path, monkeypatch):
        """Test get_vault_path returns None when not configured."""
        config_path = tmp_path / "test_config.json"
        config_path.write_text(json.dumps({"vault_path": ""}))
        monkeypatch.setattr(config, '_CONFIG_PATH', config_path)

        result = config.get_vault_path()

        assert result is None

    def test_get_semantic_scholar_api_key(self, tmp_path, monkeypatch):
        """Test getting Semantic Scholar API key."""
        config_path = tmp_path / "test_config.json"
        config_path.write_text(json.dumps({"semantic_scholar_api_key": "test-api-key-123"}))
        monkeypatch.setattr(config, '_CONFIG_PATH', config_path)

        result = config.get_semantic_scholar_api_key()

        assert result == "test-api-key-123"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
