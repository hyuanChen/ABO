#!/usr/bin/env python3
"""测试 RawRunner 严格行为"""
import asyncio
import sys
sys.path.insert(0, '/Users/huanc/Desktop/ABO')

from abo.cli.runner import RawRunner, StreamEvent
from abo.cli.detector import CliInfo

events = []

async def on_event(event: StreamEvent):
    events.append(event)
    print(f"[EVENT] {event.type}: {event.data[:50] if event.data else '(empty)'}")

async def test_raw_runner():
    # 使用 cat 命令模拟 claude --print 行为
    # 因为在 Claude Code 会话中无法嵌套运行 claude
    cli_info = CliInfo(
        id="cat",
        name="Cat Test",
        command="cat",
        check_cmd="cat --version",
        protocol="raw",
        acp_args=[]
    )

    runner = RawRunner(cli_info, "test-session", "/tmp")

    print("=" * 50)
    print("测试: RawRunner.send_message()")
    print("=" * 50)

    try:
        await runner.send_message("Say 'hello' and nothing else", "msg-001", on_event)
    except Exception as e:
        print(f"[ERROR] {e}")
        return False

    # 验证事件序列
    print("\n验证事件序列:")
    actual_types = [e.type for e in events]
    print(f"实际序列: {actual_types}")

    # 检查必需事件
    if actual_types[0] != "start":
        print(f"❌ 失败: 第一个事件必须是 'start', 得到 {actual_types[0]}")
        return False
    print("✅ 通过: 以 start 开始")

    if "content" not in actual_types:
        print("❌ 失败: 缺少 content 事件")
        return False
    print("✅ 通过: 包含 content 事件")

    if actual_types[-1] != "finish":
        print(f"❌ 失败: 最后一个事件必须是 'finish', 得到 {actual_types[-1]}")
        return False
    print("✅ 通过: 以 finish 结束")

    # 验证内容非空
    content_event = events[1]
    if not content_event.data or len(content_event.data) < 2:
        print(f"❌ 失败: 内容太短: '{content_event.data}'")
        return False

    print(f"✅ 通过: 内容接收正常 ({len(content_event.data)} 字符)")

    # 验证进程已终止
    if runner.process and runner.process.returncode is None:
        print("❌ 失败: 进程仍在运行")
        return False

    print("✅ 通过: 进程已正确终止")

    return True

if __name__ == "__main__":
    result = asyncio.run(test_raw_runner())
    sys.exit(0 if result else 1)
