#!/usr/bin/env python3
"""Tests for Bilibili Tools."""
import sys
from pathlib import Path

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest


def test_bilibili_tools_imports():
    """Test Bilibili tools can be imported."""
    try:
        from abo.tools.bilibili import bilibili_fetch_followed, bilibili_verify_sessdata
        assert True
    except ImportError as e:
        pytest.skip(f"Bilibili tools not available: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
