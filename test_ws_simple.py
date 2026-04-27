#!/usr/bin/env python3
"""简化版 WebSocket 测试"""
import asyncio
import json
import pytest
import websockets

pytestmark = pytest.mark.skip(reason="manual websocket smoke script, not part of automated pytest suite")

async def test():
    uri = "ws://127.0.0.1:8765/api/chat/ws/claude/test-session-123"
    print(f"Connecting to {uri}...")

    try:
        async with websockets.connect(uri) as ws:
            print("Connected!")

            # Receive connected message
            msg = await asyncio.wait_for(ws.recv(), timeout=5)
            print(f"<- {msg}")

            # Send a message
            await ws.send(json.dumps({
                "type": "message",
                "content": "Hello"
            }))
            print("-> Sent message")

            # Wait for response with timeout
            try:
                while True:
                    msg = await asyncio.wait_for(ws.recv(), timeout=10)
                    data = json.loads(msg)
                    print(f"<- {data.get('type')}: {data.get('data', '')[:50]}")

                    if data.get('type') in ('finish', 'error'):
                        break
            except asyncio.TimeoutError:
                print("Timeout waiting for response")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
