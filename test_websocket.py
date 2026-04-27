#!/usr/bin/env python3
"""WebSocket 测试脚本 - 验证聊天功能"""

import asyncio
import json
import requests
import uuid
import pytest
import websockets

pytestmark = pytest.mark.skip(reason="manual websocket integration script, not part of automated pytest suite")

BASE_URL = "http://127.0.0.1:8765"
WS_URL = "ws://127.0.0.1:8765"


def test_detect_clis():
    """测试 CLI 检测"""
    print("\n[1] 测试 CLI 检测...")
    try:
        resp = requests.get(f"{BASE_URL}/api/chat/cli/detect", timeout=5)
        if resp.status_code == 200:
            clis = resp.json()
            print(f"  ✓ 检测到 {len(clis)} 个 CLI:")
            for cli in clis:
                is_avail = cli.get('is_available') or cli.get('isAvailable')
                print(f"    - {cli['name']} ({cli['id']}): {is_avail}")
            return clis
        else:
            print(f"  ✗ 失败: HTTP {resp.status_code}")
            return None
    except Exception as e:
        print(f"  ✗ 错误: {e}")
        return None


def test_create_conversation(cli_type="claude"):
    """测试创建对话"""
    print(f"\n[2] 测试创建对话 (CLI: {cli_type})...")
    try:
        resp = requests.post(
            f"{BASE_URL}/api/chat/conversations",
            json={"cli_type": cli_type, "title": "测试对话"},
            timeout=5
        )
        if resp.status_code == 200:
            conv = resp.json()
            print(f"  ✓ 创建成功:")
            print(f"    - ID: {conv['id']}")
            print(f"    - Session ID: {conv['session_id']}")
            print(f"    - CLI Type: {conv['cli_type']}")
            return conv
        else:
            print(f"  ✗ 失败: HTTP {resp.status_code}")
            print(f"    响应: {resp.text}")
            return None
    except Exception as e:
        print(f"  ✗ 错误: {e}")
        return None


async def test_websocket(cli_type, session_id, message="你好"):
    """测试 WebSocket 连接和消息发送"""
    print(f"\n[3] 测试 WebSocket ({cli_type}/{session_id})...")

    ws_url = f"{WS_URL}/api/chat/ws/{cli_type}/{session_id}"
    print(f"  连接: {ws_url}")

    try:
        async with websockets.connect(ws_url, ping_interval=None) as ws:
            print("  ✓ WebSocket 已连接")

            # 等待 connected 消息
            response = await asyncio.wait_for(ws.recv(), timeout=5)
            data = json.loads(response)
            print(f"  ← 收到: {data}")

            if data.get('type') != 'connected':
                print("  ✗ 未收到 connected 消息")
                return False

            # 发送消息 (conversation_id 是可选的，后端会通过 session_id 查找)
            msg = {
                "type": "message",
                "content": message
            }
            print(f"  → 发送: {msg}")
            await ws.send(json.dumps(msg))

            # 接收响应
            print("  ← 等待响应 (最多30秒)...")
            received_start = False
            received_content = []
            received_finish = False

            try:
                while True:
                    response = await asyncio.wait_for(ws.recv(), timeout=30)
                    data = json.loads(response)
                    print(f"  ← 收到: {data.get('type')} - {data.get('data', '')[:50]}...")

                    if data.get('type') == 'start':
                        received_start = True
                    elif data.get('type') == 'content':
                        received_content.append(data.get('data', ''))
                    elif data.get('type') == 'finish':
                        received_finish = True
                        break
                    elif data.get('type') == 'error':
                        print(f"  ✗ 收到错误: {data.get('data')}")
                        return False

            except asyncio.TimeoutError:
                print("  ✗ 等待响应超时")
                return False

            print(f"\n  ✓ 测试结果:")
            print(f"    - start: {received_start}")
            print(f"    - content chunks: {len(received_content)}")
            print(f"    - finish: {received_finish}")
            print(f"    - full response: {''.join(received_content)[:100]}...")

            return received_start and len(received_content) > 0 and received_finish

    except websockets.exceptions.ConnectionRefused:
        print("  ✗ 连接被拒绝 - 后端可能没有运行")
        return False
    except Exception as e:
        print(f"  ✗ 错误: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_get_messages(conv_id):
    """测试获取消息列表"""
    print(f"\n[4] 测试获取消息列表 ({conv_id[:8]}...)...")
    try:
        resp = requests.get(f"{BASE_URL}/api/chat/conversations/{conv_id}/messages", timeout=5)
        if resp.status_code == 200:
            msgs = resp.json()
            print(f"  ✓ 获取到 {len(msgs)} 条消息")
            for msg in msgs:
                print(f"    - [{msg['role']}] {msg['content'][:50]}...")
            return msgs
        else:
            print(f"  ✗ 失败: HTTP {resp.status_code}")
            return None
    except Exception as e:
        print(f"  ✗ 错误: {e}")
        return None


async def main():
    print("=" * 60)
    print("ABO Chat WebSocket 测试")
    print("=" * 60)

    # 测试1: 检测 CLI
    clis = test_detect_clis()
    if not clis:
        print("\n✗ 无法检测到 CLI，测试中止")
        print("  请确保后端已启动: python -m abo.main")
        return

    # 找到一个可用的 CLI
    available_cli = None
    for cli in clis:
        is_avail = cli.get('is_available') or cli.get('isAvailable')
        if is_avail:
            available_cli = cli['id']
            break

    if not available_cli:
        print("\n✗ 没有可用的 CLI")
        return

    # 测试2: 创建对话
    conv = test_create_conversation(available_cli)
    if not conv:
        print("\n✗ 无法创建对话，测试中止")
        return

    # 测试3: WebSocket
    ws_success = await test_websocket(
        conv['cli_type'],
        conv['session_id'],
        "你好，请介绍一下自己"
    )

    # 测试4: 获取消息
    test_get_messages(conv['id'])

    # 总结
    print("\n" + "=" * 60)
    if ws_success:
        print("✓ 所有测试通过！WebSocket 工作正常")
    else:
        print("✗ 测试失败，请检查后端日志")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
