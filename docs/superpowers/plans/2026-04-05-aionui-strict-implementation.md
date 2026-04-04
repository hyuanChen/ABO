# AionUi 严格复刻实施计划

> **目标**: 100% 复刻 AionUi 设计文档，不接受任何妥协
> **策略**: 严格迭代 + 自动化测试验证
> **原则**: 每完成一个组件必须通过对应的自动化测试

---

## 项目结构

```
ABO/test-validation/          # 独立测试脚本目录
├── scripts/
│   ├── test-backend-api.sh   # 后端API测试
│   ├── test-websocket.sh     # WebSocket测试
│   └── test-ui-components.sh # UI组件测试
├── expectations/             # 预期结果文件
│   ├── cli-detect.json
│   ├── websocket-events.json
│   └── conversation-list.json
└── reports/                  # 测试报告

abo/routes/chat.py            # 后端路由 (完全重写)
src/modules/chat/             # 前端组件 (完全重写)
```

---

## 阶段1: 后端基础 (阻塞式 - 必须100%通过测试)

### 任务1.1: 重写 CLI Runner (Raw协议优先)

**要求**: 必须完美支持 `claude --print` 的流式输出

**文件**: `abo/cli/runner.py`

**实现要点**:
- 只实现 RawRunner (Claude协议)
- 严格流式: 每收到一行立即转发到WebSocket
- 进程生命周期管理: 必须确保进程完全终止

**测试脚本** (`test-validation/scripts/test-runner.py`):
```python
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
    # 创建模拟 CliInfo
    cli_info = CliInfo(
        id="claude",
        name="Claude Code",
        command="claude",
        check_cmd="claude --version",
        protocol="raw",
        acp_args=["--print"]
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
    expected_types = ["start", "content", "finish"]
    actual_types = [e.type for e in events]

    if actual_types[:3] != expected_types:
        print(f"❌ 失败: 期望 {expected_types}, 得到 {actual_types[:3]}")
        return False

    print("✅ 通过: 事件序列正确")

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
```

**通过标准**:
- [ ] 事件序列必须是: start → content → finish
- [ ] content 事件必须包含实际输出
- [ ] 进程必须完全终止
- [ ] 运行时间 < 30秒

---

### 任务1.2: 重写 WebSocket 路由

**要求**: 严格遵循 AionUi 的事件协议

**文件**: `abo/routes/chat.py`

**协议规范**:
```
客户端 -> 服务器:
  { "type": "message", "content": "...", "conversation_id": "..." }
  { "type": "pong" }
  { "type": "stop" }

服务器 -> 客户端:
  { "type": "connected" }
  { "type": "ping" }
  { "type": "start", "msg_id": "..." }
  { "type": "content", "data": "...", "msg_id": "..." }
  { "type": "tool_call", "data": {...}, "msg_id": "..." }
  { "type": "finish", "msg_id": "..." }
  { "type": "error", "data": "...", "msg_id": "..." }
```

**测试脚本** (`test-validation/scripts/test-websocket.py`):
```python
#!/usr/bin/env python3
"""严格测试 WebSocket 协议实现"""
import asyncio
import websockets
import json
import sys

async def test_websocket_protocol():
    uri = "ws://127.0.0.1:8765/api/chat/ws/claude/test-session-001"

    print("=" * 50)
    print("测试: WebSocket 协议")
    print("=" * 50)

    try:
        async with websockets.connect(uri) as ws:
            print("[1] 连接已建立")

            # 等待 connected 事件
            msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
            data = json.loads(msg)

            if data.get("type") != "connected":
                print(f"❌ 失败: 第一个消息必须是 'connected', 得到 {data.get('type')}")
                return False
            print("✅ [2] 收到 'connected' 事件")

            # 发送消息
            await ws.send(json.dumps({
                "type": "message",
                "content": "Say hi",
                "conversation_id": "conv-test-001"
            }))
            print("✅ [3] 已发送消息")

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
```

**通过标准**:
- [ ] 连接后第一个消息必须是 `connected`
- [ ] 发送消息后必须收到 `start`
- [ ] 必须收到至少一个 `content`
- [ ] 必须收到 `finish`
- [ ] 所有事件的 `msg_id` 必须一致

---

## 阶段2: 前端UI严格复刻 (阻塞式)

### UI 设计规范 (来自 AionUi 文档)

```
┌─────────────────────────────────────────────────────────────────┐
│  🔌 Claude Code              ● 在线               [设置] [关闭]  │  ← ChatHeader
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 你好，我是 Claude。有什么可以帮你的吗？                    │   │  ← Message (assistant)
│  │                                                         │   │
│  │                   10:23                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 帮我分析一下这个论文的创新点                              │   │  ← Message (user)
│  │                                          [你] 10:24    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐    │
│  │ 帮我分析一下这个论文的创新点...                          │ 🎤 │  ← ChatInput
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 颜色规范

```css
/* 背景 */
--bg: #FCFAF2;           /* 全局背景 - 暖白色 */
--surface: #FFFFFF;       /* 卡片背景 */
--surface-2: #F5F5F0;     /* 次级背景 */

/* 主要色 */
--primary: #7B5EA7;       /* 深紫色 - 按钮、强调 */
--primary-dim: #6B4E97;   /* 悬停状态 */
--primary-light: #F3EDFA; /* 浅紫色背景 */

/* 边框 */
--border: #E6DDF2;        /* 浅紫色边框 */
--border-focus: #D8B4E2;  /* 聚焦边框 */

/* 文字 */
--text: #1a1a1a;          /* 主文字 */
--text-muted: #666666;    /* 次要文字 */
```

### 任务2.1: ChatHeader 组件

**文件**: `src/modules/chat/ChatHeader.tsx`

**要求**:
- 左侧: 插头图标 + "Claude Code" + 在线状态圆点
- 右侧: 设置按钮 + 关闭按钮
- 在线状态: 绿色圆点 + "在线"文字
- 高度: 60px
- 底部边框: 1px solid var(--border)

**测试脚本** (`test-validation/scripts/test-ui-header.sh`):
```bash
#!/bin/bash
# 测试 ChatHeader UI

echo "测试 ChatHeader 组件..."

# 检查文件存在
if [ ! -f "src/modules/chat/ChatHeader.tsx" ]; then
    echo "❌ 失败: ChatHeader.tsx 不存在"
    exit 1
fi

# 检查必需元素
echo "检查必需元素..."

# 检查在线状态圆点
if ! grep -q "bg-green-500" src/modules/chat/ChatHeader.tsx; then
    echo "❌ 失败: 缺少在线状态圆点样式"
    exit 1
fi

# 检查设置按钮
if ! grep -q "Settings" src/modules/chat/ChatHeader.tsx; then
    echo "❌ 失败: 缺少设置按钮"
    exit 1
fi

# 检查关闭按钮
if ! grep -q "X" src/modules/chat/ChatHeader.tsx || ! grep -q "Close" src/modules/chat/ChatHeader.tsx; then
    echo "❌ 失败: 缺少关闭按钮"
    exit 1
fi

echo "✅ ChatHeader UI 测试通过"
```

---

### 任务2.2: Message 组件

**要求**:
- 用户消息: 右对齐, 白色背景, 圆角
- 助手消息: 左对齐, 带边框, 圆角
- Markdown 渲染 (代码块、列表等)
- 流式光标: 闪烁的 `▋` 字符
- 时间戳显示

**测试脚本** (`test-validation/scripts/test-ui-message.sh`):
```bash
#!/bin/bash
# 测试 Message UI

echo "测试 Message 组件..."

if [ ! -f "src/modules/chat/MessageList.tsx" ]; then
    echo "❌ 失败: MessageList.tsx 不存在"
    exit 1
fi

# 检查 Markdown 支持
if ! grep -q "ReactMarkdown" src/modules/chat/MessageList.tsx; then
    echo "❌ 失败: 缺少 ReactMarkdown"
    exit 1
fi

# 检查流式光标
if ! grep -q "animate-pulse" src/modules/chat/MessageList.tsx; then
    echo "❌ 失败: 缺少流式光标动画"
    exit 1
fi

# 检查用户消息样式 (右对齐)
if ! grep -q "flex-row-reverse" src/modules/chat/MessageList.tsx; then
    echo "❌ 失败: 用户消息未右对齐"
    exit 1
fi

echo "✅ Message UI 测试通过"
```

---

### 任务2.3: ChatInput 组件

**要求**:
- 圆角输入框, 浅紫色边框
- 占位文字: "输入消息..."
- Enter 发送, Shift+Enter 换行
- 麦克风图标 (右侧)
- 自适应高度

**测试脚本** (`test-validation/scripts/test-ui-input.sh`):
```bash
#!/bin/bash
# 测试 ChatInput UI

echo "测试 ChatInput 组件..."

if [ ! -f "src/modules/chat/ChatInput.tsx" ]; then
    echo "❌ 失败: ChatInput.tsx 不存在"
    exit 1
fi

# 检查 Enter 键处理
if ! grep -q "Enter" src/modules/chat/ChatInput.tsx; then
    echo "❌ 失败: 缺少 Enter 键处理"
    exit 1
fi

# 检查 Shift+Enter 处理
if ! grep -q "shiftKey" src/modules/chat/ChatInput.tsx; then
    echo "❌ 失败: 缺少 Shift+Enter 处理"
    exit 1
fi

# 检查自适应高度
if ! grep -q "scrollHeight" src/modules/chat/ChatInput.tsx; then
    echo "❌ 失败: 缺少自适应高度"
    exit 1
fi

echo "✅ ChatInput UI 测试通过"
```

---

## 阶段3: 集成测试 (阻塞式)

### 任务3.1: 端到端流式测试

**测试脚本** (`test-validation/scripts/test-e2e-streaming.sh`):
```bash
#!/bin/bash
# 端到端流式测试

echo "="
echo "端到端流式测试"
echo "="

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
echo "="
echo "✅ 所有端到端测试通过"
echo "="
```

---

## 实施检查清单

### 后端检查项

- [ ] RawRunner 能正确运行 `claude --print`
- [ ] WebSocket 严格遵循事件协议
- [ ] 消息持久化到 SQLite
- [ ] 进程完全终止无残留

### 前端检查项

- [ ] ChatHeader 与设计图一致
- [ ] Message 组件支持 Markdown
- [ ] ChatInput 支持 Enter/Shift+Enter
- [ ] 流式光标动画正常
- [ ] 颜色方案符合规范

### 集成检查项

- [ ] 创建对话 → WebSocket 连接 → 发送消息 → 流式接收
- [ ] 刷新页面后对话保留
- [ ] 多轮对话正常

---

## 执行流程

```
对每个任务:
  1. 删除旧实现 (如果有)
  2. 按文档严格实现
  3. 运行对应的测试脚本
  4. 如果失败 → 修复 → 回到步骤3
  5. 如果通过 → git commit
  6. 进入下一个任务
```

**失败处理**: 任何测试失败必须立即修复，不允许跳过。
