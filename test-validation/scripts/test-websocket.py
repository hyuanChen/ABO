#!/usr/bin/env python3
"""严格测试 WebSocket 协议实现"""
import asyncio
import websockets
import json
import sys

async def test_websocket_protocol():
    # 使用 cat 命令测试 WebSocket 协议 (因为 claude 不能在嵌套会话中运行)

    # 先创建对话获取 session_id
    print("=" * 50)
    print("测试: WebSocket 协议")
    print("=" * 50)

    print("[1] 创建对话获取 session_id...")
    import subprocess
    import json as json_mod
    result = subprocess.run([
        "curl", "-s", "-X", "POST",
        "http://127.0.0.1:8765/api/chat/conversations",
        "-H", "Content-Type: application/json",
        "-d", '{"cli_type": "echo", "title": "Test"}'
    ], capture_output=True, text=True)

    try:
        conv_data = json_mod.loads(result.stdout)
        session_id = conv_data['session_id']
        conv_id = conv_data['id']
        print(f"✅ 对话创建成功: {conv_id[:8]}... session_id: {session_id[:8]}...")
    except Exception as e:
        print(f"❌ 创建对话失败: {result.stdout}")
        return False

    uri = f"ws://127.0.0.1:8765/api/chat/ws/echo/{session_id}"

    try:
        async with websockets.connect(uri) as ws:
            print("[2] WebSocket 连接已建立")

            # 等待 connected 事件
            msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
            data = json.loads(msg)

            if data.get("type") != "connected":
                print(f"❌ 失败: 第一个消息必须是 'connected', 得到 {data.get('type')}")
                return False
            print("✅ [3] 收到 'connected' 事件")

            # 发送消息
            await ws.send(json.dumps({
                "type": "message",
                "content": "hello world",
                "conversation_id": conv_id
            }))
            print("✅ [4] 已发送消息")

            # 收集事件
            events = []
            try:
                while True:
                    msg = await asyncio.wait_for(ws.recv(), timeout=10.0)
                    data = json.loads(msg)
                    events.append(data)
                    print(f"   收到: {data.get('type')}")

                    if data.get("type") == "finish":
                        break
                    if data.get("type") == "error":
                        print(f"❌ 服务器返回错误: {data.get('data')}")
                        return False

            except asyncio.TimeoutError:
                print("❌ 超时: 未收到 finish 事件")
                return False

            # 验证事件序列
            event_types = [e.get("type") for e in events]
            print(f"\n事件序列: {event_types}")

            # 检查必需事件
            if "start" not in event_types:
                print("❌ 失败: 缺少 'start' 事件")
                return False
            if "content" not in event_types:
                print("❌ 失败: 缺少 'content' 事件")
                return False
            if "finish" not in event_types:
                print("❌ 失败: 缺少 'finish' 事件")
                return False

            print("✅ [4] 事件序列完整")

            # 验证 msg_id 一致性
            msg_ids = set(e.get("msg_id") for e in events if e.get("msg_id"))
            if len(msg_ids) != 1:
                print(f"❌ 失败: msg_id 不一致: {msg_ids}")
                return False
            print(f"✅ [5] msg_id 一致: {msg_ids.pop()}")

    except Exception as e:
        print(f"❌ 异常: {e}")
        return False

    print("\n✅ 所有测试通过")
    return True

if __name__ == "__main__":
    result = asyncio.run(test_websocket_protocol())
    sys.exit(0 if result else 1)
