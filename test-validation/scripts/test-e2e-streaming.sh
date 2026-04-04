#!/bin/bash
# 端到端流式测试

echo "==================================="
echo "端到端流式测试"
echo "==================================="

# 1. 启动后端
echo "[1] 启动后端..."
python -m abo.main > /tmp/abo-test.log 2>&1 &
BACKEND_PID=$!
sleep 3

# 检查后端是否启动
if ! curl -s http://127.0.0.1:8765/api/health > /dev/null; then
    echo "❌ 后端启动失败"
    cat /tmp/abo-test.log
    exit 1
fi
echo "✅ 后端启动成功 (PID: $BACKEND_PID)"

# 2. 创建对话
echo "[2] 创建对话..."
CONV_RESPONSE=$(curl -s -X POST http://127.0.0.1:8765/api/chat/conversations \
    -H "Content-Type: application/json" \
    -d '{"cli_type": "claude", "title": "Test"}')

CONV_ID=$(echo $CONV_RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
SESSION_ID=$(echo $CONV_RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['session_id'])")

echo "✅ 对话创建成功 (ID: $CONV_ID)"

# 3. WebSocket 流式测试
echo "[3] WebSocket 流式测试..."
python3 << PYTHON_EOF
import asyncio
import websockets
import json
import sys

async def test_streaming():
    uri = "ws://127.0.0.1:8765/api/chat/ws/claude/${SESSION_ID}"

    async with websockets.connect(uri) as ws:
        # 等待 connected
        msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
        assert json.loads(msg)['type'] == 'connected', "未收到 connected"

        # 发送消息
        await ws.send(json.dumps({
            "type": "message",
            "content": "Count to 3",
            "conversation_id": "${CONV_ID}"
        }))

        # 收集所有内容
        contents = []
        start_time = asyncio.get_event_loop().time()

        while True:
            msg = await asyncio.wait_for(ws.recv(), timeout=15.0)
            data = json.loads(msg)

            if data['type'] == 'content':
                contents.append(data['data'])
                # 检查是否是流式 (收到内容的时间差)
                elapsed = asyncio.get_event_loop().time() - start_time
                if len(contents) == 1:
                    print(f"   首次内容接收时间: {elapsed:.2f}s")

            if data['type'] == 'finish':
                break

        full_content = ''.join(contents)
        print(f"✅ 流式接收完成")
        print(f"   总字符数: {len(full_content)}")
        print(f"   内容片段数: {len(contents)}")

        # 验证内容合理
        assert len(full_content) > 10, "内容太短"
        assert '1' in full_content or '2' in full_content or '3' in full_content, "内容不包含预期数字"

asyncio.run(test_streaming())
PYTHON_EOF

if [ $? -ne 0 ]; then
    echo "❌ WebSocket 流式测试失败"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo "✅ 流式测试通过"

# 清理
kill $BACKEND_PID 2>/dev/null
echo ""
echo "==================================="
echo "✅ 所有端到端测试通过"
echo "==================================="
