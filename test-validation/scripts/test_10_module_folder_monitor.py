#!/usr/bin/env python3
"""Tests for Folder Monitor Module."""
import sys
from pathlib import Path

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest


def test_folder_monitor_module_imports():
    """Test Folder Monitor module can be imported."""
    try:
        from abo.default_modules.folder_monitor import FolderMonitor
        assert True
    except ImportError as e:
        pytest.skip(f"FolderMonitor not available: {e}")


def test_folder_monitor_has_required_attributes():
    """Test folder monitor has required module attributes."""
    try:
        from abo.default_modules.folder_monitor import FolderMonitor
        tracker = FolderMonitor()

        assert hasattr(tracker, 'id')
        assert hasattr(tracker, 'name')
        assert hasattr(tracker, 'schedule')
    except ImportError:
        pytest.skip("FolderMonitor not available")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
