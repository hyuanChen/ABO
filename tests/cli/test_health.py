"""Tests for CLI health monitor."""
import pytest
from unittest.mock import MagicMock, patch
from abo.cli.health import CliHealthMonitor, ProcessHealth


def test_health_monitor_creation():
    """Test CliHealthMonitor creation."""
    monitor = CliHealthMonitor()
    assert monitor is not None
    assert len(monitor._monitored) == 0


def test_register_unregister():
    """Test process registration."""
    monitor = CliHealthMonitor()

    # Mock process
    mock_process = MagicMock()
    mock_process.pid = 12345

    monitor.register("session-1", mock_process)
    assert "session-1" in monitor._monitored
    assert monitor._monitored["session-1"] == 12345

    monitor.unregister("session-1")
    assert "session-1" not in monitor._monitored


def test_check_health_not_registered():
    """Test checking health of unregistered session."""
    monitor = CliHealthMonitor()
    result = monitor.check_health("nonexistent-session")
    assert result is None


def test_is_healthy_not_registered():
    """Test is_healthy returns False for unregistered session."""
    monitor = CliHealthMonitor()
    assert monitor.is_healthy("nonexistent-session") is False
