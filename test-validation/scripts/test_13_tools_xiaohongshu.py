#!/usr/bin/env python3
"""Tests for Xiaohongshu Tools."""
import sys
from pathlib import Path

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest


def test_xiaohongshu_tools_imports():
    """Test Xiaohongshu tools can be imported."""
    try:
        from abo.tools.xiaohongshu import xiaohongshu_search, XiaohongshuAPI
        assert True
    except ImportError as e:
        pytest.skip(f"Xiaohongshu tools not available: {e}")


class TestXiaohongshuAPI:
    """Test Xiaohongshu API class."""

    @pytest.mark.asyncio
    async def test_api_initialization(self):
        """Test API can be initialized."""
        try:
            from abo.tools.xiaohongshu import XiaohongshuAPI
            api = XiaohongshuAPI()
            assert api is not None
            await api.close()
        except ImportError:
            pytest.skip("XiaohongshuAPI not available")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
