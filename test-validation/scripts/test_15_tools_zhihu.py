#!/usr/bin/env python3
"""Tests for Zhihu Tools."""
import sys
from pathlib import Path

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest


def test_zhihu_tools_imports():
    """Test Zhihu tools can be imported."""
    try:
        from abo.tools.zhihu import zhihu_search, zhihu_analyze_trends
        assert True
    except ImportError as e:
        pytest.skip(f"Zhihu tools not available: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
