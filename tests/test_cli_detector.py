"""Tests for CLI detector module"""
import pytest
import json
import os
from datetime import datetime
from unittest.mock import patch, MagicMock, mock_open
from dataclasses import asdict

from abo.cli.detector import CliInfo, CliDetector


class TestCliInfo:
    """Tests for CliInfo dataclass"""

    def test_cli_info_creation(self):
        """Test CliInfo dataclass creation with default values"""
        info = CliInfo(
            id="claude",
            name="Claude Code",
            command="claude",
            check_cmd="claude --version"
        )
        assert info.id == "claude"
        assert info.name == "Claude Code"
        assert info.command == "claude"
        assert info.check_cmd == "claude --version"
        assert info.version == ""
        assert info.is_available is False
        assert info.acp_args == []
        assert info.protocol == "raw"
        assert info.last_check == 0

    def test_cli_info_with_custom_values(self):
        """Test CliInfo with custom values"""
        info = CliInfo(
            id="gemini",
            name="Gemini CLI",
            command="gemini",
            check_cmd="gemini --version",
            version="1.0.0",
            is_available=True,
            acp_args=["--experimental-acp"],
            protocol="acp",
            last_check=1234567890
        )
        assert info.version == "1.0.0"
        assert info.is_available is True
        assert info.acp_args == ["--experimental-acp"]
        assert info.protocol == "acp"
        assert info.last_check == 1234567890

    def test_cli_info_acp_args_default(self):
        """Test that acp_args defaults to empty list, not None"""
        info = CliInfo(
            id="test",
            name="Test CLI",
            command="test",
            check_cmd="test --version"
        )
        assert info.acp_args == []
        # Verify it's a list that can be appended to
        info.acp_args.append("--flag")
        assert info.acp_args == ["--flag"]


class TestCliDetector:
    """Tests for CliDetector class"""

    def test_detector_initialization(self, tmp_path):
        """Test CliDetector initialization with custom db_path"""
        db_path = tmp_path / "cli_configs.json"
        detector = CliDetector(db_path=str(db_path))

        assert detector.db_path == str(db_path)
        assert detector._cache == {}

    def test_detector_registry_has_known_clis(self):
        """Test that detector has all known CLIs in registry"""
        detector = CliDetector(db_path="/tmp/test.json")

        expected_clis = ["claude", "gemini", "openclaw", "codex"]
        for cli_id in expected_clis:
            assert cli_id in detector.REGISTRY
            assert isinstance(detector.REGISTRY[cli_id], CliInfo)

    def test_detector_registry_claude_config(self):
        """Test Claude CLI configuration in registry"""
        detector = CliDetector(db_path="/tmp/test.json")

        claude = detector.REGISTRY["claude"]
        assert claude.id == "claude"
        assert claude.name == "Claude Code"
        assert claude.command == "claude"
        assert claude.check_cmd == "claude --version"
        assert claude.protocol == "raw"

    def test_detector_registry_gemini_config(self):
        """Test Gemini CLI configuration in registry"""
        detector = CliDetector(db_path="/tmp/test.json")

        gemini = detector.REGISTRY["gemini"]
        assert gemini.id == "gemini"
        assert gemini.name == "Gemini CLI"
        assert gemini.protocol == "acp"

    def test_detector_registry_openclaw_config(self):
        """Test OpenClaw CLI configuration in registry"""
        detector = CliDetector(db_path="/tmp/test.json")

        openclaw = detector.REGISTRY["openclaw"]
        assert openclaw.id == "openclaw"
        assert openclaw.name == "OpenClaw"
        assert openclaw.protocol == "websocket"

    def test_detector_registry_codex_config(self):
        """Test Codex CLI configuration in registry"""
        detector = CliDetector(db_path="/tmp/test.json")

        codex = detector.REGISTRY["codex"]
        assert codex.id == "codex"
        assert codex.name == "OpenAI Codex"
        assert codex.protocol == "acp"


class TestCliDetectorDetection:
    """Tests for CLI detection functionality"""

    @patch('abo.cli.detector.shutil.which')
    @patch('abo.cli.detector.subprocess.run')
    def test_detect_single_mocked_available(self, mock_run, mock_which, tmp_path):
        """Test detection with mocked subprocess - CLI available"""
        mock_which.return_value = "/usr/bin/claude"
        # First call is for _get_enhanced_env, second is for version check
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout="PATH=/usr/bin\n", stderr=""),  # env call
            MagicMock(returncode=0, stdout="claude version 1.2.3\n", stderr=""),  # version call
        ]

        db_path = tmp_path / "cli_configs.json"
        detector = CliDetector(db_path=str(db_path))

        info = detector.REGISTRY["claude"]
        result = detector._detect_single(info)

        assert result.is_available is True
        assert result.version == "claude version 1.2.3"
        assert result.last_check > 0
        mock_which.assert_called_once_with("claude")
        assert mock_run.call_count == 2  # env call + version call

    @patch('abo.cli.detector.shutil.which')
    def test_detect_single_not_in_path(self, mock_which, tmp_path):
        """Test detection when CLI is not in PATH"""
        mock_which.return_value = None

        db_path = tmp_path / "cli_configs.json"
        detector = CliDetector(db_path=str(db_path))

        info = detector.REGISTRY["claude"]
        result = detector._detect_single(info)

        assert result.is_available is False
        assert result.version == ""
        mock_which.assert_called_once_with("claude")

    @patch('abo.cli.detector.shutil.which')
    @patch('abo.cli.detector.subprocess.run')
    def test_detect_single_nonzero_exit(self, mock_run, mock_which, tmp_path):
        """Test detection when CLI returns non-zero exit (still available)"""
        mock_which.return_value = "/usr/bin/claude"
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="",
            stderr="some error"
        )

        db_path = tmp_path / "cli_configs.json"
        detector = CliDetector(db_path=str(db_path))

        info = detector.REGISTRY["claude"]
        result = detector._detect_single(info)

        # Non-zero exit still marks as available per implementation
        assert result.is_available is True
        assert result.version == "unknown"

    @patch('abo.cli.detector.shutil.which')
    @patch('abo.cli.detector.subprocess.run')
    def test_detect_single_timeout(self, mock_run, mock_which, tmp_path):
        """Test detection when CLI times out"""
        import subprocess
        mock_which.return_value = "/usr/bin/claude"
        mock_run.side_effect = subprocess.TimeoutExpired(cmd="claude --version", timeout=10)

        db_path = tmp_path / "cli_configs.json"
        detector = CliDetector(db_path=str(db_path))

        info = detector.REGISTRY["claude"]
        result = detector._detect_single(info)

        assert result.is_available is False
        assert result.version == "timeout"

    @patch('abo.cli.detector.shutil.which')
    @patch('abo.cli.detector.subprocess.run')
    def test_detect_single_exception(self, mock_run, mock_which, tmp_path):
        """Test detection when subprocess raises exception"""
        mock_which.return_value = "/usr/bin/claude"
        mock_run.side_effect = Exception("Permission denied")

        db_path = tmp_path / "cli_configs.json"
        detector = CliDetector(db_path=str(db_path))

        info = detector.REGISTRY["claude"]
        result = detector._detect_single(info)

        assert result.is_available is False
        assert "error" in result.version


class TestCliDetectorCache:
    """Tests for cache functionality"""

    def test_load_cache_empty_file(self, tmp_path):
        """Test loading cache when file doesn't exist"""
        db_path = tmp_path / "nonexistent.json"
        detector = CliDetector(db_path=str(db_path))

        assert detector._cache == {}

    def test_load_cache_valid_data(self, tmp_path):
        """Test loading cache with valid data"""
        db_path = tmp_path / "cli_configs.json"

        # Create cache file with test data
        cache_data = [
            {
                "id": "claude",
                "name": "Claude Code",
                "command": "claude",
                "check_cmd": "claude --version",
                "version": "1.0.0",
                "is_available": True,
                "acp_args": ["--print"],
                "protocol": "raw",
                "last_check": int(datetime.now().timestamp())
            }
        ]
        db_path.write_text(json.dumps(cache_data))

        detector = CliDetector(db_path=str(db_path))

        assert "claude" in detector._cache
        assert detector._cache["claude"].is_available is True
        assert detector._cache["claude"].version == "1.0.0"

    def test_save_cache(self, tmp_path):
        """Test saving cache to file"""
        db_path = tmp_path / "cli_configs.json"
        detector = CliDetector(db_path=str(db_path))

        # Add something to cache
        info = CliInfo(
            id="test",
            name="Test CLI",
            command="test",
            check_cmd="test --version",
            version="2.0.0",
            is_available=True,
            last_check=1234567890
        )
        detector._cache["test"] = info
        detector._save_cache()

        # Read back and verify
        saved_data = json.loads(db_path.read_text())
        assert len(saved_data) == 1
        assert saved_data[0]["id"] == "test"
        assert saved_data[0]["version"] == "2.0.0"
        assert saved_data[0]["is_available"] is True


class TestCliDetectorGetInfo:
    """Tests for get_cli_info method"""

    def test_get_cli_info_from_cache(self, tmp_path):
        """Test getting CLI info from cache"""
        db_path = tmp_path / "cli_configs.json"
        detector = CliDetector(db_path=str(db_path))

        # Add to cache
        info = CliInfo(
            id="claude",
            name="Claude Code",
            command="claude",
            check_cmd="claude --version",
            version="1.0.0",
            is_available=True,
            last_check=int(datetime.now().timestamp())
        )
        detector._cache["claude"] = info

        result = detector.get_cli_info("claude")
        assert result is not None
        assert result.version == "1.0.0"

    def test_get_cli_info_not_found(self, tmp_path):
        """Test getting CLI info for unknown CLI"""
        db_path = tmp_path / "cli_configs.json"
        detector = CliDetector(db_path=str(db_path))

        result = detector.get_cli_info("unknown-cli")
        assert result is None


class TestCliDetectorAddCustom:
    """Tests for add_custom_cli method"""

    @patch('abo.cli.detector.shutil.which')
    @patch('abo.cli.detector.subprocess.run')
    def test_add_custom_cli(self, mock_run, mock_which, tmp_path):
        """Test adding a custom CLI"""
        mock_which.return_value = "/usr/bin/custom"
        mock_run.return_value = MagicMock(returncode=0, stdout="1.0.0", stderr="")

        db_path = tmp_path / "cli_configs.json"
        detector = CliDetector(db_path=str(db_path))

        custom_info = CliInfo(
            id="custom",
            name="Custom CLI",
            command="custom",
            check_cmd="custom --version",
            protocol="raw"
        )

        detector.add_custom_cli(custom_info)

        assert "custom" in detector.REGISTRY
        assert "custom" in detector._cache
