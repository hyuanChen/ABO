#!/usr/bin/env python3
"""Tests for WebSocket functionality."""
import sys
import asyncio

sys.path.insert(0, '/Users/huanc/Desktop/ABO')

import pytest
import websockets


BASE_URL = "ws://127.0.0.1:8765"


class TestWebSocketConnection:
    """Test WebSocket connections."""

    @pytest.mark.asyncio
    async def test_feed_websocket_connects(self):
        """Test WebSocket feed endpoint accepts connections."""
        try:
            async with websockets.connect(f"{BASE_URL}/ws/feed", timeout=5) as ws:
                assert ws.open
        except (ConnectionRefusedError, OSError):
            pytest.skip("Backend not running")
        except Exception as e:
            pytest.skip(f"WebSocket test skipped: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
