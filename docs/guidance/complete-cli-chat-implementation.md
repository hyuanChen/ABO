# 完整 CLI 聊天模块实现指南

完全复刻 AionUi 设计，包含前端、后端、UI、对话保留、自动连接 CLI。

---

## 目录

1. [最终效果预览](#1-最终效果预览)
2. [数据模型](#2-数据模型)
3. [后端完整实现](#3-后端完整实现)
4. [前端完整实现](#4-前端完整实现)
5. [UI 组件细节](#5-ui-组件细节)
6. [集成与测试](#6-集成与测试)

---

## 1. 最终效果预览

### 全局样式与布局 (Global Styles & Layout)

- **布局模型**：全屏高度 (`100vh`)，使用 Flexbox 左右分栏布局。左侧为固定宽度的侧边栏（Sidebar），右侧为自适应宽度的主要内容区（Main Content）。
- **背景色**：全局背景使用非常柔和的米黄色（类似 `#FCFAF2` 或纯白略带暖色调）。
- **强调色**：边框和选中状态主要使用浅紫色（类似 `#D8B4E2` 或 `#E0D4F5`），发送按钮使用深紫色（类似 `#7B5EA7`）。
- **字体**：现代无衬线字体（Sans-serif，如 PingFang SC, Inter），主文本颜色为深灰色/近黑色，次要文本为浅灰色。

------

### 1️⃣ 左侧边栏 (Sidebar Component)

- **容器属性**：宽度约 `260px`，高度 `100%`。右侧有一条浅紫色的细边框（`border-right: 1px solid #E6DDF2`）。
- **顶部 Logo 区 (Header)**：
  - Flex 横向排列，垂直居中。
  - 左侧是一个黑色的圆角矩形图标，里面有一个类似小皇冠或笑脸的白色图案。
  - 右侧是粗体文字 **"AionUi"**，字体大小约 `20px`。
- **操作栏 (Action Bar)**：
  - Flex 两端对齐 (`justify-between`)。
  - 左侧是一个 **"+ 新会话"** 的文字按钮（带有加号图标）。
  - 右侧是两个灰色图标：搜索图标（放大镜）和 菜单/列表图标。
- **历史记录列表 (History Lists)**：
  - 分为两个区块，带有灰色小标题标签，例如 **"最近7天"** 和 **"更早"**。标题字体较小（约 `12px`），颜色较浅。
  - **列表项 (List Item)**：Flex 横向排列，左侧是模型/Agent 的图标（如爆炸火花、四角星、游戏手柄、红色大脑），右侧是对话标题（如 "呢好", "你好", "写一个跳一跳的游戏"）。选中状态（如第一个"呢好"）可能有极浅的背景色或文字加粗。
- **底部操作区 (Footer)**：
  - 固定在侧边栏底部。
  - 包含一个带有齿轮图标的 **"设置"** 按钮。

------

### 2️⃣ 右侧主内容区 (Main Content Component)

- **容器属性**：占据剩余宽度 (`flex: 1`)，相对定位 (`position: relative`)，Flex 垂直居中布局（主要用于中间对话框的居中）。

#### 📌 悬浮卡片 (Top-Right Floating Widget)

- **位置**：绝对定位在主区域的右上角 (`position: absolute; top: 20px; right: 20px`)。
- **样式**：带有一点轻微阴影（`box-shadow`）的白色/浅灰色圆角矩形框。
- **内容**：
  - 右上角有一个 **Toggle Switch（开关）**，状态为打开（深色背景，白色滑块）。
  - 左侧为主标题 **"AionUi Skills Market"**（黑色）。
  - 下方为次要描述文本 **"按需搜索并调用社区 Skills，一次配置，所有Agent通用。 详情 >>"**（灰色，较小字体）。

#### 📌 中心内容区 (Center Container)

- **位置**：水平居中，偏向页面中上部。最大宽度约 `700px` - `800px`。
- **主标题 (Greeting)**：
  - 文本：**"Hi，今天有什么安排？"**
  - 样式：大号字体（约 `28px` - `32px`），水平居中，深色。
- **模型选择药丸 (Agent Selector Pill)**：
  - 位于标题下方和输入框上方。
  - 样式：胶囊形/药丸形（`border-radius: 999px`），浅紫色背景（类似 `#F3EDFA`）。
  - 内容：Flex 居中排列。从左到右依次是：四角星图标 -> **"Claude Code"** 文字 -> 竖线分隔符 -> 时钟/历史图标 -> 竖线分隔符 -> 红色大脑图标。
- **核心输入框 (Chat Input Box)**：
  - **外层容器**：大圆角矩形（`border-radius: 16px`），带有一圈浅紫色的边框（`border: 2px solid #E6DDF2`）。背景透明或纯白。
  - **文本域 (Textarea)**：占据上半部分，Placeholder 文本为浅灰色：**"Claude Code, 发消息、上传文件、打开文件夹或创建定时任务..."**。无边框，不可拖拽缩放。
  - **输入框底部工具栏 (Input Footer)**：Flex 两端对齐 (`justify-between`)。
    - **左侧工具**：一个加号 `+` 图标按钮；一个带大脑图标的药丸标签 **"默认模型"**；一个带盾牌图标和下拉箭头的药丸标签 **"权限·默认"**。这些药丸标签背景为浅米色，字体较小。
    - **右侧发送按钮**：一个正方形但四角圆润的按钮，背景为深紫色渐变或纯深紫色（具有立体感/内阴影），中间是一个白色的向上箭头（`↑`）。
- **推荐技能/快捷指令区 (Suggestion Chips)**：
  - 位于输入框正下方。
  - 布局：Flex wrap，多行居中排列，元素之间有合理的 gap（约 `10px`）。
  - **Chip 样式**：白色背景，非常淡的灰色边框，全圆角（药丸状），字体细小。
  - **内容**：包含图标+文字。例如：📖"故事角色扮演"、📈"Beautiful Mermaid"、🦀"moltbook"、⚡"Cowork"、🦀"OpenClaw 部署专家"、🖥️"Star Office 助手" 还有一个单独的加号 `+` 按钮用于添加更多。

#### 📌 底部悬浮图标栏 (Bottom Floating Icons)

- **位置**：固定或绝对定位在主内容区的正下方中央。
- **内容**：三个圆形的图标按钮，横向排列。
- **样式**：透明或白色背景，浅灰色细边框。从左到右分别是：
  1. **气泡/对话图标**
  2. **五角星图标**
  3. **地球/网络图标**

### 

---

## 2. 数据模型

### 2.1 数据库 Schema

```sql
-- conversations.db

-- 对话表
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    cli_type TEXT NOT NULL,           -- 'claude', 'gemini', 'openclaw'
    session_id TEXT NOT NULL UNIQUE,   -- WebSocket 会话标识
    title TEXT,
    workspace TEXT DEFAULT '',         -- 工作目录
    status TEXT DEFAULT 'active',      -- 'active', 'closed', 'error'
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 消息表
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    msg_id TEXT,                       -- 流式消息 ID (用于聚合)
    role TEXT NOT NULL,                -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    content_type TEXT DEFAULT 'text',  -- 'text', 'tool_call', 'error'
    metadata TEXT,                     -- JSON: tool_calls, tokens, etc.
    status TEXT DEFAULT 'completed',   -- 'streaming', 'completed', 'error'
    created_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_msgid ON messages(msg_id);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);

-- CLI 配置表（缓存检测结果）
CREATE TABLE cli_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    version TEXT,
    is_available INTEGER DEFAULT 0,
    last_check INTEGER,
    config_json TEXT                    -- 额外配置
);
```

### 2.2 TypeScript 类型

```typescript
// src/types/chat.ts

export type CliType = 'claude' | 'gemini' | 'openclaw' | 'custom';

export interface CliConfig {
  id: CliType;
  name: string;
  command: string;
  version?: string;
  isAvailable: boolean;
  acpArgs?: string[];
  protocol: 'raw' | 'acp' | 'websocket';
}

export interface Conversation {
  id: string;
  cliType: CliType;
  sessionId: string;
  title: string;
  workspace: string;
  status: 'active' | 'closed' | 'error';
  createdAt: number;
  updatedAt: number;
}

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'streaming' | 'completed' | 'error';

export interface Message {
  id: string;
  conversationId: string;
  msgId?: string;
  role: MessageRole;
  content: string;
  contentType: 'text' | 'tool_call' | 'error';
  metadata?: {
    toolName?: string;
    toolInput?: Record<string, unknown>;
    tokens?: number;
    latency?: number;
  };
  status: MessageStatus;
  createdAt: number;
}

export interface StreamEvent {
  type: 'start' | 'content' | 'tool_call' | 'error' | 'finish';
  data: string;
  msgId: string;
  metadata?: Record<string, unknown>;
}
```

---

## 3. 后端完整实现

### 3.1 CLI 检测与管理

**文件**: `abo/cli/detector.py`

```python
"""CLI 检测和管理模块"""

import shutil
import subprocess
import os
import json
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime


@dataclass
class CliInfo:
    id: str
    name: str
    command: str
    check_cmd: str
    version: str = ""
    is_available: bool = False
    acp_args: List[str] = None
    protocol: str = "raw"  # raw, acp, websocket

    def __post_init__(self):
        if self.acp_args is None:
            self.acp_args = []


class CliDetector:
    """CLI 工具检测器 - 自动发现和验证本地 CLI"""

    REGISTRY: Dict[str, CliInfo] = {
        "claude": CliInfo(
            id="claude",
            name="Claude Code",
            command="claude",
            check_cmd="claude --version",
            acp_args=["--experimental-acp"],
            protocol="raw"
        ),
        "gemini": CliInfo(
            id="gemini",
            name="Gemini CLI",
            command="gemini",
            check_cmd="gemini --version",
            acp_args=["--experimental-acp"],
            protocol="acp"
        ),
        "openclaw": CliInfo(
            id="openclaw",
            name="OpenClaw",
            command="openclaw",
            check_cmd="openclaw --version",
            acp_args=["gateway"],
            protocol="websocket"
        ),
        "codex": CliInfo(
            id="codex",
            name="OpenAI Codex",
            command="codex",
            check_cmd="codex --version",
            acp_args=["--acp"],
            protocol="acp"
        ),
    }

    def __init__(self, db_path: str = "~/.abo/data/cli_configs.json"):
        self.db_path = os.path.expanduser(db_path)
        self._cache: Dict[str, CliInfo] = {}
        self._load_cache()

    def _load_cache(self):
        """加载缓存的检测结果"""
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, 'r') as f:
                    data = json.load(f)
                    for item in data:
                        self._cache[item['id']] = CliInfo(**item)
            except Exception:
                pass

    def _save_cache(self):
        """保存检测结果到缓存"""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        with open(self.db_path, 'w') as f:
            json.dump([asdict(info) for info in self._cache.values()], f, indent=2)

    def detect_all(self, force: bool = False) -> List[CliInfo]:
        """
        检测所有已知的 CLI 工具

        Args:
            force: 强制重新检测，忽略缓存

        Returns:
            可用的 CLI 列表
        """
        available = []

        for cli_id, info in self.REGISTRY.items():
            # 检查缓存
            if not force and cli_id in self._cache:
                cached = self._cache[cli_id]
                # 缓存 5 分钟内有效
                if datetime.now().timestamp() - cached.last_check < 300:
                    if cached.is_available:
                        available.append(cached)
                    continue

            # 执行检测
            detected = self._detect_single(info)
            self._cache[cli_id] = detected

            if detected.is_available:
                available.append(detected)

        self._save_cache()
        return available

    def _detect_single(self, info: CliInfo) -> CliInfo:
        """检测单个 CLI"""
        result = CliInfo(
            id=info.id,
            name=info.name,
            command=info.command,
            check_cmd=info.check_cmd,
            acp_args=info.acp_args,
            protocol=info.protocol
        )
        result.last_check = int(datetime.now().timestamp())

        # 检查命令是否在 PATH 中
        if not shutil.which(info.command):
            return result

        # 尝试执行版本检查
        try:
            proc = subprocess.run(
                info.check_cmd.split(),
                capture_output=True,
                text=True,
                timeout=10,
                env=self._get_enhanced_env()
            )

            if proc.returncode == 0:
                result.is_available = True
                result.version = proc.stdout.strip()[:100]
            else:
                # 有些 CLI 返回非零但可用
                result.is_available = True
                result.version = "unknown"

        except subprocess.TimeoutExpired:
            result.version = "timeout"
        except Exception as e:
            result.version = f"error: {str(e)[:50]}"

        return result

    def _get_enhanced_env(self) -> dict:
        """获取增强的环境变量（包含 shell 配置）"""
        env = dict(os.environ)

        # 尝试加载 shell 环境
        shell = os.environ.get('SHELL', '/bin/zsh')
        try:
            result = subprocess.run(
                [shell, '-l', '-c', 'env'],
                capture_output=True,
                text=True,
                timeout=5
            )

            for line in result.stdout.strip().split('\n'):
                if '=' in line:
                    key, value = line.split('=', 1)
                    if key in ['PATH', 'HOME', 'ANTHROPIC_API_KEY',
                               'GEMINI_API_KEY', 'OPENAI_API_KEY']:
                        env[key] = value
        except Exception:
            pass

        return env

    def get_cli_info(self, cli_id: str) -> Optional[CliInfo]:
        """获取特定 CLI 的信息"""
        if cli_id in self._cache:
            return self._cache[cli_id]

        if cli_id in self.REGISTRY:
            return self._detect_single(self.REGISTRY[cli_id])

        return None

    def add_custom_cli(self, info: CliInfo):
        """添加自定义 CLI 配置"""
        self.REGISTRY[info.id] = info
        self._cache[info.id] = self._detect_single(info)
        self._save_cache()


# 全局检测器实例
detector = CliDetector()
```

### 3.2 CLI Runner - 多协议支持

**文件**: `abo/cli/runner.py`

```python
"""CLI 运行器 - 支持多种协议"""

import asyncio
import json
import os
import uuid
from typing import Callable, Optional, Dict, Any
from dataclasses import dataclass
from abc import ABC, abstractmethod
import logging

logger = logging.getLogger(__name__)


@dataclass
class StreamEvent:
    type: str  # start, content, tool_call, error, finish
    data: str
    msg_id: str
    metadata: Optional[Dict[str, Any]] = None


class BaseRunner(ABC):
    """CLI Runner 抽象基类"""

    def __init__(self, cli_info: 'CliInfo', session_id: str, workspace: str = ""):
        self.cli_info = cli_info
        self.session_id = session_id
        self.workspace = workspace or os.getcwd()
        self.process: Optional[asyncio.subprocess.Process] = None
        self._closed = False

    @abstractmethod
    async def send_message(self, message: str, msg_id: str,
                          on_event: Callable[[StreamEvent], None]) -> None:
        """发送消息并处理流式响应"""
        pass

    async def close(self):
        """关闭 Runner"""
        self._closed = True
        if self.process:
            try:
                self.process.terminate()
                await asyncio.wait_for(self.process.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                self.process.kill()
            self.process = None

    def _get_env(self) -> dict:
        """获取环境变量"""
        return dict(os.environ)


class RawRunner(BaseRunner):
    """原始文本协议 Runner (Claude --print)"""

    async def send_message(self, message: str, msg_id: str,
                          on_event: Callable[[StreamEvent], None]) -> None:
        """发送消息并接收流式响应"""

        # 发送开始事件
        await on_event(StreamEvent(type="start", data="", msg_id=msg_id))

        try:
            # 启动进程
            cmd = [self.cli_info.command] + self.cli_info.acp_args

            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.workspace,
                env=self._get_env()
            )

            # 发送消息
            assert self.process.stdin
            input_data = f"{message}\n".encode('utf-8')
            self.process.stdin.write(input_data)
            await self.process.stdin.drain()
            self.process.stdin.close()

            # 读取输出
            assert self.process.stdout
            chunks = []

            while True:
                chunk = await self.process.stdout.read(4096)
                if not chunk:
                    break

                text = chunk.decode('utf-8', errors='replace')
                chunks.append(text)

                await on_event(StreamEvent(
                    type="content",
                    data=text,
                    msg_id=msg_id
                ))

            # 检查错误
            assert self.process.stderr
            stderr = await self.process.stderr.read()
            if stderr:
                logger.warning(f"CLI stderr: {stderr.decode()[:200]}")

            # 等待进程结束
            await self.process.wait()

            # 发送完成事件
            await on_event(StreamEvent(
                type="finish",
                data="",
                msg_id=msg_id,
                metadata={"total_length": sum(len(c) for c in chunks)}
            ))

        except Exception as e:
            logger.exception("Raw runner error")
            await on_event(StreamEvent(
                type="error",
                data=str(e),
                msg_id=msg_id
            ))
            raise
        finally:
            await self.close()


class AcpRunner(BaseRunner):
    """ACP (Agent Communication Protocol) Runner (Gemini, Codex)"""

    async def send_message(self, message: str, msg_id: str,
                          on_event: Callable[[StreamEvent], None]) -> None:
        """使用 ACP 协议发送消息"""

        await on_event(StreamEvent(type="start", data="", msg_id=msg_id))

        try:
            # 启动 ACP 模式
            cmd = [self.cli_info.command] + self.cli_info.acp_args

            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.workspace,
                env=self._get_env()
            )

            # 发送 ACP 初始化消息
            init_msg = {
                "jsonrpc": "2.0",
                "method": "initialize",
                "params": {"sessionId": self.session_id},
                "id": str(uuid.uuid4())
            }

            await self._send_acp_message(init_msg)

            # 发送对话消息
            chat_msg = {
                "jsonrpc": "2.0",
                "method": "conversation/submit",
                "params": {
                    "sessionId": self.session_id,
                    "text": message
                },
                "id": msg_id
            }

            await self._send_acp_message(chat_msg)

            # 读取响应
            await self._read_acp_stream(on_event, msg_id)

        except Exception as e:
            logger.exception("ACP runner error")
            await on_event(StreamEvent(
                type="error",
                data=str(e),
                msg_id=msg_id
            ))
            raise

    async def _send_acp_message(self, msg: dict):
        """发送 ACP 消息"""
        assert self.process and self.process.stdin
        data = json.dumps(msg) + "\n"
        self.process.stdin.write(data.encode())
        await self.process.stdin.drain()

    async def _read_acp_stream(self, on_event: Callable, msg_id: str):
        """读取 ACP 流式响应"""
        assert self.process and self.process.stdout

        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        loop = asyncio.get_event_loop()

        # 将 stdout 连接到 StreamReader
        transport, _ = await loop.connect_read_pipe(
            lambda: protocol, self.process.stdout
        )

        buffer = b""

        try:
            while not self._closed:
                try:
                    chunk = await asyncio.wait_for(reader.read(4096), timeout=30.0)
                    if not chunk:
                        break

                    buffer += chunk

                    # 处理完整行
                    while b"\n" in buffer:
                        line, buffer = buffer.split(b"\n", 1)
                        await self._process_acp_line(line.decode(), on_event, msg_id)

                except asyncio.TimeoutError:
                    logger.warning("ACP read timeout")
                    break

        finally:
            transport.close()
            await on_event(StreamEvent(type="finish", data="", msg_id=msg_id))

    async def _process_acp_line(self, line: str, on_event: Callable, msg_id: str):
        """处理单行 ACP 消息"""
        line = line.strip()
        if not line:
            return

        try:
            data = json.loads(line)
            method = data.get("method", "")
            params = data.get("params", {})

            if method == "conversation/update":
                content = params.get("content", {})
                text = content.get("text", "")
                status = params.get("status", "")

                if text:
                    await on_event(StreamEvent(
                        type="content",
                        data=text,
                        msg_id=data.get("id", msg_id)
                    ))

                if status == "completed":
                    await on_event(StreamEvent(
                        type="finish",
                        data="",
                        msg_id=data.get("id", msg_id)
                    ))

            elif method == "tool_call":
                await on_event(StreamEvent(
                    type="tool_call",
                    data=json.dumps(params),
                    msg_id=data.get("id", msg_id),
                    metadata=params
                ))

            elif method == "error":
                await on_event(StreamEvent(
                    type="error",
                    data=params.get("message", "Unknown error"),
                    msg_id=data.get("id", msg_id)
                ))

        except json.JSONDecodeError:
            # 可能是非 JSON 输出，作为内容处理
            await on_event(StreamEvent(
                type="content",
                data=line,
                msg_id=msg_id
            ))


class WebSocketRunner(BaseRunner):
    """WebSocket 协议 Runner (OpenClaw Gateway)"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.ws = None
        self.ws_url = "ws://localhost:8080"  # OpenClaw 默认端口

    async def send_message(self, message: str, msg_id: str,
                          on_event: Callable[[StreamEvent], None]) -> None:
        """通过 WebSocket 发送消息"""
        import websockets

        await on_event(StreamEvent(type="start", data="", msg_id=msg_id))

        try:
            # 启动 gateway 进程
            cmd = [self.cli_info.command] + self.cli_info.acp_args
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            # 等待 gateway 启动
            await asyncio.sleep(2)

            # 连接 WebSocket
            async with websockets.connect(self.ws_url) as ws:
                self.ws = ws

                # 发送消息
                await ws.send(json.dumps({
                    "type": "message",
                    "sessionKey": self.session_id,
                    "content": message
                }))

                # 接收响应
                async for response in ws:
                    data = json.loads(response)

                    if data.get("type") == "chunk":
                        await on_event(StreamEvent(
                            type="content",
                            data=data.get("content", ""),
                            msg_id=msg_id
                        ))
                    elif data.get("type") == "complete":
                        await on_event(StreamEvent(
                            type="finish",
                            data="",
                            msg_id=msg_id
                        ))
                        break

        except Exception as e:
            logger.exception("WebSocket runner error")
            await on_event(StreamEvent(
                type="error",
                data=str(e),
                msg_id=msg_id
            ))
            raise


class RunnerFactory:
    """Runner 工厂"""

    RUNNERS = {
        "raw": RawRunner,
        "acp": AcpRunner,
        "websocket": WebSocketRunner,
    }

    @classmethod
    def create(cls, cli_info: 'CliInfo', session_id: str,
               workspace: str = "") -> BaseRunner:
        """创建对应协议的 Runner"""
        runner_class = cls.RUNNERS.get(cli_info.protocol, RawRunner)
        return runner_class(cli_info, session_id, workspace)
```

### 3.3 对话存储

**文件**: `abo/store/conversations.py`

```python
"""对话数据存储模块"""

import sqlite3
import json
import os
from typing import List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime
import threading


@dataclass
class Conversation:
    id: str
    cli_type: str
    session_id: str
    title: str
    workspace: str
    status: str
    created_at: int
    updated_at: int


@dataclass
class Message:
    id: str
    conversation_id: str
    msg_id: Optional[str]
    role: str
    content: str
    content_type: str
    metadata: Optional[str]
    status: str
    created_at: int


class ConversationStore:
    """
    对话存储管理器

    功能：
    - 对话 CRUD
    - 消息 CRUD + 流式更新
    - 历史记录查询
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, db_path: str = "~/.abo/data/conversations.db"):
        if hasattr(self, '_initialized'):
            return

        self.db_path = os.path.expanduser(db_path)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()
        self._initialized = True

    def _get_conn(self) -> sqlite3.Connection:
        """获取数据库连接"""
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """初始化数据库表"""
        with self._get_conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    cli_type TEXT NOT NULL,
                    session_id TEXT NOT NULL UNIQUE,
                    title TEXT DEFAULT '',
                    workspace TEXT DEFAULT '',
                    status TEXT DEFAULT 'active',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    msg_id TEXT,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    content_type TEXT DEFAULT 'text',
                    metadata TEXT,
                    status TEXT DEFAULT 'completed',
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_messages_conv_time
                    ON messages(conversation_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_messages_msgid
                    ON messages(msg_id);
                CREATE INDEX IF NOT EXISTS idx_conversations_updated
                    ON conversations(updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_conversations_session
                    ON conversations(session_id);
            """)

    # === 对话操作 ===

    def create_conversation(self, cli_type: str, session_id: str,
                           title: str = "", workspace: str = "") -> str:
        """创建新对话"""
        import uuid

        conv_id = str(uuid.uuid4())
        now = int(datetime.now().timestamp() * 1000)

        with self._get_conn() as conn:
            conn.execute(
                """INSERT INTO conversations
                   (id, cli_type, session_id, title, workspace, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 'active', ?, ?)""",
                (conv_id, cli_type, session_id, title, workspace, now, now)
            )

        return conv_id

    def get_conversation(self, conv_id: str) -> Optional[Conversation]:
        """获取对话信息"""
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM conversations WHERE id = ?",
                (conv_id,)
            ).fetchone()

            if row:
                return Conversation(**dict(row))
            return None

    def get_conversation_by_session(self, session_id: str) -> Optional[Conversation]:
        """通过 session_id 获取对话"""
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM conversations WHERE session_id = ?",
                (session_id,)
            ).fetchone()

            if row:
                return Conversation(**dict(row))
            return None

    def list_conversations(self, cli_type: Optional[str] = None,
                          limit: int = 50, offset: int = 0) -> List[Conversation]:
        """列出对话"""
        with self._get_conn() as conn:
            if cli_type:
                rows = conn.execute(
                    """SELECT * FROM conversations
                       WHERE cli_type = ? AND status = 'active'
                       ORDER BY updated_at DESC LIMIT ? OFFSET ?""",
                    (cli_type, limit, offset)
                ).fetchall()
            else:
                rows = conn.execute(
                    """SELECT * FROM conversations
                       WHERE status = 'active'
                       ORDER BY updated_at DESC LIMIT ? OFFSET ?""",
                    (limit, offset)
                ).fetchall()

            return [Conversation(**dict(row)) for row in rows]

    def update_conversation_title(self, conv_id: str, title: str):
        """更新对话标题"""
        now = int(datetime.now().timestamp() * 1000)

        with self._get_conn() as conn:
            conn.execute(
                "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
                (title, now, conv_id)
            )

    def close_conversation(self, conv_id: str):
        """关闭对话"""
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE conversations SET status = 'closed' WHERE id = ?",
                (conv_id,)
            )

    def delete_conversation(self, conv_id: str):
        """删除对话（级联删除消息）"""
        with self._get_conn() as conn:
            conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))

    # === 消息操作 ===

    def add_message(self, conv_id: str, role: str, content: str,
                   msg_id: Optional[str] = None,
                   content_type: str = "text",
                   metadata: Optional[dict] = None,
                   status: str = "completed") -> str:
        """添加消息"""
        import uuid

        message_id = str(uuid.uuid4())
        now = int(datetime.now().timestamp() * 1000)

        with self._get_conn() as conn:
            conn.execute(
                """INSERT INTO messages
                   (id, conversation_id, msg_id, role, content,
                    content_type, metadata, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (message_id, conv_id, msg_id, role, content,
                 content_type, json.dumps(metadata) if metadata else None,
                 status, now)
            )

            # 更新对话时间
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conv_id)
            )

        return message_id

    def update_message_content(self, msg_id: str, content: str):
        """更新消息内容（流式更新）"""
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE messages SET content = ? WHERE msg_id = ?",
                (content, msg_id)
            )

    def finalize_message(self, msg_id: str):
        """完成流式消息"""
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE messages SET status = 'completed' WHERE msg_id = ?",
                (msg_id,)
            )

    def get_messages(self, conv_id: str, limit: int = 100,
                    before_id: Optional[str] = None) -> List[Message]:
        """获取消息列表"""
        with self._get_conn() as conn:
            if before_id:
                # 分页加载
                before_time = conn.execute(
                    "SELECT created_at FROM messages WHERE id = ?",
                    (before_id,)
                ).fetchone()

                if before_time:
                    rows = conn.execute(
                        """SELECT * FROM messages
                           WHERE conversation_id = ? AND created_at < ?
                           ORDER BY created_at DESC LIMIT ?""",
                        (conv_id, before_time[0], limit)
                    ).fetchall()
                else:
                    rows = []
            else:
                rows = conn.execute(
                    """SELECT * FROM messages
                       WHERE conversation_id = ?
                       ORDER BY created_at DESC LIMIT ?""",
                    (conv_id, limit)
                ).fetchall()

            # 转为正序
            messages = [Message(**dict(row)) for row in rows]
            messages.reverse()
            return messages

    def search_messages(self, conv_id: str, query: str, limit: int = 20) -> List[Message]:
        """搜索消息"""
        with self._get_conn() as conn:
            rows = conn.execute(
                """SELECT * FROM messages
                   WHERE conversation_id = ? AND content LIKE ?
                   ORDER BY created_at DESC LIMIT ?""",
                (conv_id, f"%{query}%", limit)
            ).fetchall()

            messages = [Message(**dict(row)) for row in rows]
            messages.reverse()
            return messages


# 全局实例
conversation_store = ConversationStore()
```

### 3.4 FastAPI 路由

**文件**: `abo/routes/chat.py`

```python
"""聊天 API 路由"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import asyncio
import json
import logging

from ..cli.detector import detector
from ..cli.runner import RunnerFactory, StreamEvent
from ..store.conversations import conversation_store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat")


# === 请求/响应模型 ===

class CreateConversationRequest(BaseModel):
    cli_type: str
    title: Optional[str] = None
    workspace: Optional[str] = None


class SendMessageRequest(BaseModel):
    message: str
    conversation_id: str


class ConversationResponse(BaseModel):
    id: str
    cli_type: str
    session_id: str
    title: str
    workspace: str
    status: str
    created_at: int
    updated_at: int


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    content_type: str
    status: str
    created_at: int
    metadata: Optional[dict] = None


# === CLI 检测 API ===

@router.get("/cli/detect")
async def detect_clis(force: bool = False):
    """检测可用的 CLI 工具"""
    clis = detector.detect_all(force=force)
    return [
        {
            "id": cli.id,
            "name": cli.name,
            "command": cli.command,
            "version": cli.version,
            "is_available": cli.is_available,
            "protocol": cli.protocol
        }
        for cli in clis
    ]


@router.get("/cli/{cli_id}")
async def get_cli_info(cli_id: str):
    """获取 CLI 详细信息"""
    info = detector.get_cli_info(cli_id)
    if not info:
        raise HTTPException(status_code=404, detail="CLI not found")

    return {
        "id": info.id,
        "name": info.name,
        "command": info.command,
        "version": info.version,
        "is_available": info.is_available,
        "protocol": info.protocol
    }


# === 对话管理 API ===

@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(req: CreateConversationRequest):
    """创建新对话"""
    import uuid

    # 验证 CLI 可用
    cli_info = detector.get_cli_info(req.cli_type)
    if not cli_info or not cli_info.is_available:
        raise HTTPException(status_code=400, detail=f"CLI {req.cli_type} not available")

    session_id = str(uuid.uuid4())
    conv_id = conversation_store.create_conversation(
        cli_type=req.cli_type,
        session_id=session_id,
        title=req.title or f"New {cli_info.name} chat",
        workspace=req.workspace or ""
    )

    conv = conversation_store.get_conversation(conv_id)
    return ConversationResponse(**vars(conv))


@router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(cli_type: Optional[str] = None, limit: int = 50):
    """列出对话"""
    conversations = conversation_store.list_conversations(cli_type=cli_type, limit=limit)
    return [ConversationResponse(**vars(c)) for c in conversations]


@router.get("/conversations/{conv_id}", response_model=ConversationResponse)
async def get_conversation(conv_id: str):
    """获取对话详情"""
    conv = conversation_store.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationResponse(**vars(conv))


@router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    """删除对话"""
    conversation_store.delete_conversation(conv_id)
    return {"success": True}


@router.patch("/conversations/{conv_id}/title")
async def update_title(conv_id: str, title: str):
    """更新对话标题"""
    conversation_store.update_conversation_title(conv_id, title)
    return {"success": True}


# === 消息 API ===

@router.get("/conversations/{conv_id}/messages", response_model=List[MessageResponse])
async def get_messages(conv_id: str, limit: int = 100, before_id: Optional[str] = None):
    """获取消息列表"""
    messages = conversation_store.get_messages(conv_id, limit=limit, before_id=before_id)
    return [
        MessageResponse(
            id=m.id,
            role=m.role,
            content=m.content,
            content_type=m.content_type,
            status=m.status,
            created_at=m.created_at,
            metadata=json.loads(m.metadata) if m.metadata else None
        )
        for m in messages
    ]


@router.post("/conversations/{conv_id}/messages")
async def send_message_http(conv_id: str, req: SendMessageRequest):
    """HTTP 方式发送消息（非流式）"""
    conv = conversation_store.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    cli_info = detector.get_cli_info(conv.cli_type)
    if not cli_info:
        raise HTTPException(status_code=400, detail="CLI not found")

    # 保存用户消息
    conversation_store.add_message(
        conv_id=conv_id,
        role="user",
        content=req.message
    )

    # 创建 Runner
    runner = RunnerFactory.create(cli_info, conv.session_id, conv.workspace)

    # 收集响应
    chunks = []
    msg_id = str(uuid.uuid4())

    async def on_event(event: StreamEvent):
        if event.type == "content":
            chunks.append(event.data)

    try:
        await runner.send_message(req.message, msg_id, on_event)
        response_text = "".join(chunks)

        # 保存助手响应
        conversation_store.add_message(
            conv_id=conv_id,
            role="assistant",
            content=response_text,
            msg_id=msg_id
        )

        return {"message": response_text}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await runner.close()


# === WebSocket 实时通信 ===

class ConnectionManager:
    """WebSocket 连接管理器"""

    def __init__(self):
        self.active_connections: dict = {}
        self.runners: dict = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"Client {client_id} connected")

    def disconnect(self, client_id: str):
        self.active_connections.pop(client_id, None)
        if client_id in self.runners:
            runner = self.runners[client_id]
            asyncio.create_task(runner.close())
            del self.runners[client_id]
        logger.info(f"Client {client_id} disconnected")

    async def send_json(self, client_id: str, data: dict):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(data)
            except Exception as e:
                logger.error(f"Failed to send to {client_id}: {e}")


manager = ConnectionManager()


@router.websocket("/ws/{cli_type}/{session_id}")
async def chat_websocket(websocket: WebSocket, cli_type: str, session_id: str):
    """
    WebSocket 聊天接口

    消息格式:
    - 客户端 -> 服务器: {"message": "...", "conversation_id": "..."}
    - 服务器 -> 客户端: {"type": "start|content|tool_call|finish|error", "data": "...", "msg_id": "..."}
    """
    client_id = f"{cli_type}:{session_id}"
    await manager.connect(websocket, client_id)

    # 查找或创建对话
    conv = conversation_store.get_conversation_by_session(session_id)
    if not conv:
        # 自动创建对话
        cli_info = detector.get_cli_info(cli_type)
        if cli_info:
            conv_id = conversation_store.create_conversation(
                cli_type=cli_type,
                session_id=session_id,
                title=f"New {cli_info.name} chat"
            )
            conv = conversation_store.get_conversation(conv_id)

    if not conv:
        await websocket.send_json({
            "type": "error",
            "data": "Failed to create conversation",
            "msg_id": ""
        })
        manager.disconnect(client_id)
        return

    # 创建 Runner
    cli_info = detector.get_cli_info(cli_type)
    if cli_info:
        runner = RunnerFactory.create(cli_info, session_id, conv.workspace)
        manager.runners[client_id] = runner

    try:
        while True:
            # 接收客户端消息
            data = await websocket.receive_json()
            message = data.get("message", "")
            conv_id = data.get("conversation_id", conv.id)

            if not message:
                continue

            # 保存用户消息
            conversation_store.add_message(
                conv_id=conv_id,
                role="user",
                content=message
            )

            # 流式处理
            msg_id = str(uuid.uuid4())
            full_response = []

            async def on_event(event: StreamEvent):
                # 转发到客户端
                await manager.send_json(client_id, {
                    "type": event.type,
                    "data": event.data,
                    "msg_id": event.msg_id,
                    "metadata": event.metadata
                })

                # 收集内容
                if event.type == "content":
                    full_response.append(event.data)

            # 执行 Runner
            runner = manager.runners.get(client_id)
            if runner:
                try:
                    await runner.send_message(message, msg_id, on_event)

                    # 保存完整响应
                    conversation_store.add_message(
                        conv_id=conv_id,
                        role="assistant",
                        content="".join(full_response),
                        msg_id=msg_id
                    )
                except Exception as e:
                    logger.exception("Runner error")
                    await manager.send_json(client_id, {
                        "type": "error",
                        "data": str(e),
                        "msg_id": msg_id
                    })

    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        logger.exception("WebSocket error")
        manager.disconnect(client_id)
```

### 3.5 注册路由

**更新文件**: `abo/main.py`

```python
from .routes.chat import router as chat_router

app.include_router(chat_router)
```

---

## 4. 前端完整实现

### 4.1 类型定义

**文件**: `src/types/chat.ts`

```typescript
export type CliType = 'claude' | 'gemini' | 'openclaw' | 'custom';

export interface CliConfig {
  id: CliType;
  name: string;
  command: string;
  version?: string;
  isAvailable: boolean;
  protocol: 'raw' | 'acp' | 'websocket';
}

export interface Conversation {
  id: string;
  cliType: CliType;
  sessionId: string;
  title: string;
  workspace: string;
  status: 'active' | 'closed' | 'error';
  createdAt: number;
  updatedAt: number;
}

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'streaming' | 'completed' | 'error';

export interface Message {
  id: string;
  conversationId: string;
  msgId?: string;
  role: MessageRole;
  content: string;
  contentType: 'text' | 'tool_call' | 'error';
  metadata?: {
    toolName?: string;
    toolInput?: Record<string, unknown>;
    tokens?: number;
  };
  status: MessageStatus;
  createdAt: number;
}

export interface StreamEvent {
  type: 'start' | 'content' | 'tool_call' | 'error' | 'finish';
  data: string;
  msgId: string;
  metadata?: Record<string, unknown>;
}
```

### 4.2 API 客户端

**文件**: `src/api/chat.ts`

```typescript
import type { CliConfig, Conversation, Message, StreamEvent } from '../types/chat';

const API_BASE = 'http://127.0.0.1:8765/api/chat';

// === CLI 检测 ===

export async function detectClis(force = false): Promise<CliConfig[]> {
  const res = await fetch(`${API_BASE}/cli/detect?force=${force}`);
  if (!res.ok) throw new Error('Failed to detect CLIs');
  return res.json();
}

export async function getCliInfo(cliId: string): Promise<CliConfig> {
  const res = await fetch(`${API_BASE}/cli/${cliId}`);
  if (!res.ok) throw new Error('CLI not found');
  return res.json();
}

// === 对话管理 ===

export async function createConversation(
  cliType: string,
  title?: string,
  workspace?: string
): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cli_type: cliType, title, workspace }),
  });
  if (!res.ok) throw new Error('Failed to create conversation');
  return res.json();
}

export async function listConversations(cliType?: string): Promise<Conversation[]> {
  const url = cliType
    ? `${API_BASE}/conversations?cli_type=${cliType}`
    : `${API_BASE}/conversations`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to list conversations');
  return res.json();
}

export async function getConversation(convId: string): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations/${convId}`);
  if (!res.ok) throw new Error('Conversation not found');
  return res.json();
}

export async function deleteConversation(convId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${convId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete conversation');
}

export async function updateConversationTitle(convId: string, title: string): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${convId}/title?title=${encodeURIComponent(title)}`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error('Failed to update title');
}

// === 消息 ===

export async function getMessages(
  convId: string,
  limit = 100,
  beforeId?: string
): Promise<Message[]> {
  let url = `${API_BASE}/conversations/${convId}/messages?limit=${limit}`;
  if (beforeId) url += `&before_id=${beforeId}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to get messages');
  return res.json();
}

// === WebSocket ===

export interface ChatWebSocketOptions {
  cliType: string;
  sessionId: string;
  onEvent: (event: StreamEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export function createChatWebSocket({
  cliType,
  sessionId,
  onEvent,
  onConnect,
  onDisconnect,
  onError,
}: ChatWebSocketOptions): WebSocket {
  const ws = new WebSocket(`ws://127.0.0.1:8765/api/chat/ws/${cliType}/${sessionId}`);

  ws.onopen = () => onConnect?.();

  ws.onmessage = (event) => {
    try {
      const data: StreamEvent = JSON.parse(event.data);
      onEvent(data);
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  };

  ws.onclose = () => onDisconnect?.();
  ws.onerror = (error) => onError?.(error);

  return ws;
}
```

### 4.3 React Hooks

**文件**: `src/hooks/useChat.ts`

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Conversation, Message, StreamEvent, CliConfig } from '../types/chat';
import {
  detectClis,
  createConversation,
  getMessages,
  createChatWebSocket,
} from '../api/chat';

interface UseChatReturn {
  // CLI
  availableClis: CliConfig[];
  selectedCli: CliConfig | null;
  selectCli: (cli: CliConfig) => void;

  // 对话
  conversation: Conversation | null;
  createNewConversation: () => Promise<void>;
  loadConversation: (conv: Conversation) => Promise<void>;

  // 消息
  messages: Message[];
  sendMessage: (content: string) => void;
  isStreaming: boolean;

  // 连接状态
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useChat(): UseChatReturn {
  // CLI 状态
  const [availableClis, setAvailableClis] = useState<CliConfig[]>([]);
  const [selectedCli, setSelectedCli] = useState<CliConfig | null>(null);

  // 对话状态
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // 连接状态
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const currentMsgIdRef = useRef<string>('');

  // 检测 CLI
  useEffect(() => {
    detectClis()
      .then(setAvailableClis)
      .catch((e) => setError(e.message));
  }, []);

  // 清理 WebSocket
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // 选择 CLI
  const selectCli = useCallback((cli: CliConfig) => {
    setSelectedCli(cli);
    setError(null);
  }, []);

  // 创建新对话
  const createNewConversation = useCallback(async () => {
    if (!selectedCli) {
      setError('Please select a CLI first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 关闭现有连接
      wsRef.current?.close();

      // 创建新对话
      const conv = await createConversation(selectedCli.id);
      setConversation(conv);
      setMessages([]);

      // 建立 WebSocket 连接
      const ws = createChatWebSocket({
        cliType: selectedCli.id,
        sessionId: conv.sessionId,
        onConnect: () => setIsConnected(true),
        onDisconnect: () => setIsConnected(false),
        onEvent: handleStreamEvent,
        onError: () => setError('WebSocket connection failed'),
      });

      wsRef.current = ws;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCli]);

  // 加载已有对话
  const loadConversation = useCallback(async (conv: Conversation) => {
    setIsLoading(true);
    setError(null);

    try {
      // 关闭现有连接
      wsRef.current?.close();

      // 加载历史消息
      const history = await getMessages(conv.id);
      setMessages(history);
      setConversation(conv);

      // 找到 CLI 配置
      const cli = availableClis.find((c) => c.id === conv.cliType);
      if (cli) setSelectedCli(cli);

      // 建立 WebSocket 连接
      const ws = createChatWebSocket({
        cliType: conv.cliType,
        sessionId: conv.sessionId,
        onConnect: () => setIsConnected(true),
        onDisconnect: () => setIsConnected(false),
        onEvent: handleStreamEvent,
      });

      wsRef.current = ws;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [availableClis]);

  // 处理流式事件
  const handleStreamEvent = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case 'start':
        setIsStreaming(true);
        currentMsgIdRef.current = event.msgId;
        setMessages((prev) => [
          ...prev,
          {
            id: event.msgId,
            conversationId: conversation?.id || '',
            msgId: event.msgId,
            role: 'assistant',
            content: '',
            contentType: 'text',
            status: 'streaming',
            createdAt: Date.now(),
          },
        ]);
        break;

      case 'content':
        setMessages((prev) =>
          prev.map((m) =>
            m.msgId === event.msgId
              ? { ...m, content: m.content + event.data }
              : m
          )
        );
        break;

      case 'tool_call':
        const toolData = event.metadata || {};
        setMessages((prev) => [
          ...prev,
          {
            id: `tool-${Date.now()}`,
            conversationId: conversation?.id || '',
            role: 'assistant',
            content: `🔧 使用工具: ${toolData.toolName || 'unknown'}`,
            contentType: 'tool_call',
            metadata: toolData,
            status: 'completed',
            createdAt: Date.now(),
          },
        ]);
        break;

      case 'finish':
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.msgId === currentMsgIdRef.current
              ? { ...m, status: 'completed' }
              : m
          )
        );
        break;

      case 'error':
        setIsStreaming(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            conversationId: conversation?.id || '',
            role: 'system',
            content: `Error: ${event.data}`,
            contentType: 'error',
            status: 'error',
            createdAt: Date.now(),
          },
        ]);
        break;
    }
  }, [conversation]);

  // 发送消息
  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || !conversation) {
      setError('Not connected');
      return;
    }

    if (wsRef.current.readyState !== WebSocket.OPEN) {
      setError('WebSocket not connected');
      return;
    }

    // 添加用户消息到列表
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      conversationId: conversation.id,
      role: 'user',
      content,
      contentType: 'text',
      status: 'completed',
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // 发送消息
    wsRef.current.send(
      JSON.stringify({
        message: content,
        conversation_id: conversation.id,
      })
    );
  }, [conversation]);

  return {
    availableClis,
    selectedCli,
    selectCli,
    conversation,
    createNewConversation,
    loadConversation,
    messages,
    sendMessage,
    isStreaming,
    isConnected,
    isLoading,
    error,
  };
}
```

---

## 5. UI 完全复刻 AionUi 设计

### 5.1 布局架构（参考 AionUi ChatLayout）

AionUi 采用三栏布局：侧边栏（对话列表）+ 主聊天区 + 工作区（可选）。对于 ABO 简化版本：

```
┌─────────────────────────────────────────────────────────────┐
│  Header: CLI 选择器 + 连接状态 + 设置按钮                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Messages Area                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🤖 Claude Code                        ● 在线         │   │
│  │                                                     │   │
│  │ 我来帮您分析这篇论文的创新点...                       │   │
│  │                              10:23 ─────────────── │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 帮我写一个Python脚本                          [你] │   │
│  │ ─────────────────────────────────────────────────  │   │
│  │ 10:24                                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  SendBox（智能单行/多行切换）                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [附件] 输入消息...                           [发送] │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 SendBox 智能输入框

**参考**: `AionUi/src/renderer/components/chat/sendbox.tsx`

关键特性：
- **自动高度调整**：单/多行智能切换（基于内容长度和换行符）
- **粘贴上传**：支持图片/文件直接粘贴
- **拖拽上传**：拖拽文件到输入框
- **输入历史**：上下键浏览历史输入
- **斜杠命令**：/ 触发命令菜单
- **语音输入**：麦克风按钮（可选）

```tsx
// src/components/chat/SendBox.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, Loader2, Mic } from 'lucide-react';

interface SendBoxProps {
  onSend: (message: string, files?: File[]) => void;
  onStop?: () => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function SendBox({ onSend, onStop, loading, disabled, placeholder }: SendBoxProps) {
  const [input, setInput] = useState('');
  const [isSingleLine, setIsSingleLine] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 智能检测单行/多行
  useEffect(() => {
    if (input.includes('\n')) {
      setIsSingleLine(false);
      return;
    }
    // 超过800字符自动切换多行
    if (input.length > 800) {
      setIsSingleLine(false);
      return;
    }
    // 测量文本宽度
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx && textareaRef.current) {
      const style = getComputedStyle(textareaRef.current);
      ctx.font = `${style.fontSize} ${style.fontFamily}`;
      const width = ctx.measureText(input).width;
      const maxWidth = textareaRef.current.offsetWidth - 40;
      if (width > maxWidth && input.length > 50) {
        setIsSingleLine(false);
      }
    }
  }, [input]);

  // 自动调整高度
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`;
  }, [input, isSingleLine]);

  // 键盘快捷键
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !loading) {
        onSend(input);
        setInput('');
        setIsSingleLine(true);
      }
    }
    // Ctrl/Cmd + Enter 插入换行
    if (e.key === 'Enter' && e.shiftKey) {
      setIsSingleLine(false);
    }
  };

  // 粘贴处理
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      onSend(input, files);
    }
  };

  return (
    <div
      ref={containerRef}
      className="border-t border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <div className="mx-auto max-w-4xl relative">
        {/* 拖拽上传遮罩 */}
        <div
          className="absolute inset-0 bg-[var(--primary)]/10 border-2 border-dashed border-[var(--primary)]
                     rounded-xl pointer-events-none opacity-0 transition-opacity"
          id="drag-overlay"
        />

        <div className="flex items-end gap-2 bg-[var(--bg)] rounded-xl border border-[var(--border)]
                        focus-within:ring-2 focus-within:ring-[var(--primary)] transition-shadow p-2">
          {/* 附件按钮 */}
          <button
            className="p-2 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)]
                       transition-colors shrink-0"
            disabled={disabled}
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* 输入区 */}
          {isSingleLine ? (
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={placeholder || '输入消息...'}
              disabled={disabled}
              className="flex-1 bg-transparent px-2 py-2 text-[var(--text)] outline-none"
            />
          ) : (
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={placeholder || '输入消息... (Shift+Enter 换行)'}
              disabled={disabled}
              rows={1}
              className="flex-1 bg-transparent px-2 py-2 text-[var(--text)] outline-none
                         resize-none min-h-[44px] max-h-[300px]"
            />
          )}

          {/* 语音/发送按钮 */}
          {loading ? (
            <button
              onClick={onStop}
              className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20
                         transition-colors shrink-0"
            >
              <div className="w-5 h-5 rounded-sm bg-current" />
            </button>
          ) : (
            <button
              onClick={() => {
                if (input.trim()) {
                  onSend(input);
                  setInput('');
                  setIsSingleLine(true);
                }
              }}
              disabled={!input.trim() || disabled}
              className="p-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-dim)]
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 底部提示 */}
        <div className="flex justify-between mt-2 text-xs text-[var(--text-muted)] px-2">
          <span>按 Enter 发送，Shift+Enter 换行</span>
          <span>{input.length} 字符</span>
        </div>
      </div>
    </div>
  );
}
```

### 5.3 Message 消息组件

**参考**: `AionUi/src/renderer/pages/conversation/Messages/`

```tsx
// src/components/chat/Message.tsx
import { Bot, User, Copy, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface MessageProps {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status?: 'streaming' | 'completed' | 'error';
  timestamp?: string;
  onRegenerate?: () => void;
}

export function Message({
  role,
  content,
  status,
  timestamp,
  onRegenerate
}: MessageProps) {
  const isUser = role === 'user';
  const isStreaming = status === 'streaming';

  return (
    <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* 头像 */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
                      ${isUser ? 'bg-[var(--primary)]' : 'bg-[var(--surface-2)]'}`}>
        {isUser ? (
          <User className="w-5 h-5 text-white" />
        ) : (
          <Bot className="w-5 h-5 text-[var(--primary)]" />
        )}
      </div>

      {/* 内容 */}
      <div className={`max-w-[85%] group ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* 气泡 */}
        <div className={`relative px-4 py-3 rounded-2xl
                        ${isUser
                          ? 'bg-[var(--primary)] text-white rounded-tr-sm'
                          : 'bg-[var(--surface)] border border-[var(--border)] rounded-tl-sm'
                        }`}>
          {/* Markdown 内容 */}
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>

          {/* 流式光标 */}
          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse">
              ▋
            </span>
          )}
        </div>

        {/* 操作栏 */}
        <div className={`flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100
                        transition-opacity ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className="text-xs text-[var(--text-muted)]">
            {timestamp}
          </span>

          {!isUser && (
            <>
              <button
                onClick={() => navigator.clipboard.writeText(content)}
                className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-muted)]"
                title="复制"
              >
                <Copy className="w-3 h-3" />
              </button>
              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-muted)]"
                  title="重新生成"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

### 5.4 连接状态指示器

**关键**：显示 CLI 连接状态，支持断开重连

```tsx
// src/components/chat/ConnectionStatus.tsx
import { useEffect, useState } from 'react';
import { Wifi, WifiOff, AlertCircle, Loader2 } from 'lucide-react';

type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error';

interface ConnectionStatusProps {
  cliType: string;
  cliName: string;
  state: ConnectionState;
  error?: string;
  onReconnect: () => void;
}

export function ConnectionStatus({
  cliName,
  state,
  error,
  onReconnect
}: ConnectionStatusProps) {
  const configs = {
    connected: {
      icon: <Wifi className="w-4 h-4" />,
      text: '已连接',
      color: 'text-green-500',
      bg: 'bg-green-500/10'
    },
    connecting: {
      icon: <Loader2 className="w-4 h-4 animate-spin" />,
      text: '连接中...',
      color: 'text-yellow-500',
      bg: 'bg-yellow-500/10'
    },
    disconnected: {
      icon: <WifiOff className="w-4 h-4" />,
      text: '已断开',
      color: 'text-gray-400',
      bg: 'bg-gray-500/10'
    },
    error: {
      icon: <AlertCircle className="w-4 h-4" />,
      text: error || '连接错误',
      color: 'text-red-500',
      bg: 'bg-red-500/10'
    }
  };

  const config = configs[state];

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full
                    ${config.bg} ${config.color} text-sm`}>
      {config.icon}
      <span>{cliName} · {config.text}</span>
      {(state === 'disconnected' || state === 'error') && (
        <button
          onClick={onReconnect}
          className="ml-2 px-2 py-0.5 rounded bg-current/20 hover:bg-current/30
                     text-xs font-medium transition-colors"
        >
          重连
        </button>
      )}
    </div>
  );
}
```

---

## 6. 后端中断检测与连接机制

参考 AionUi 的 `AcpConnection` 设计，实现多层连接状态管理：

### 6.1 连接状态机

```
┌──────────┐    connect()     ┌────────────┐
│  IDLE    │ ────────────────>│ CONNECTING │
└──────────┘                  └────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
        ▼                            ▼                            ▼
┌──────────────┐            ┌──────────────┐            ┌──────────────┐
│  CONNECTED   │<──────────>│  STREAMING   │            │    ERROR     │
└──────────────┘            └──────────────┘            └──────────────┘
        │                            │                            │
        │ disconnect()               │ complete/error             │ retry
        ▼                            ▼                            ▼
┌──────────────┐            ┌──────────────┐            ┌──────────────┐
│ DISCONNECTED │            │   COMPLETED  │───────────>│  RECONNECTING│
└──────────────┘            └──────────────┘            └──────────────┘
```

### 6.2 增强版 ConnectionManager

**文件**: `abo/routes/chat.py`

```python
import asyncio
import logging
from typing import Dict, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class ConnectionState(Enum):
    IDLE = "idle"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    STREAMING = "streaming"
    DISCONNECTED = "disconnected"
    ERROR = "error"
    RECONNECTING = "reconnecting"

@dataclass
class ConnectionInfo:
    """连接信息"""
    client_id: str
    cli_type: str
    session_id: str
    state: ConnectionState = ConnectionState.IDLE
    websocket: Optional[WebSocket] = None
    runner: Optional[CliRunner] = None
    last_ping: datetime = field(default_factory=datetime.now)
    last_pong: datetime = field(default_factory=datetime.now)
    reconnect_count: int = 0
    error_message: Optional[str] = None
    connected_at: Optional[datetime] = None

    @property
    def is_alive(self) -> bool:
        """检查连接是否存活"""
        if self.state in [ConnectionState.DISCONNECTED, ConnectionState.ERROR]:
            return False
        # 检查心跳超时（30秒）
        if datetime.now() - self.last_pong > timedelta(seconds=30):
            return False
        return True

    @property
    def latency_ms(self) -> Optional[int]:
        """计算延迟"""
        if self.last_pong and self.last_ping:
            delta = self.last_pong - self.last_ping
            return int(delta.total_seconds() * 1000)
        return None


class EnhancedConnectionManager:
    """增强版连接管理器 - 支持心跳、重连、状态监控"""

    HEARTBEAT_INTERVAL = 15  # 心跳间隔（秒）
    HEARTBEAT_TIMEOUT = 30   # 心跳超时（秒）
    MAX_RECONNECT = 3        # 最大重连次数

    def __init__(self):
        self.connections: Dict[str, ConnectionInfo] = {}
        self._heartbeat_tasks: Dict[str, asyncio.Task] = {}
        self._state_callbacks: list[Callable] = []

    def on_state_change(self, callback: Callable[[str, ConnectionState, ConnectionState], None]):
        """注册状态变更回调 (client_id, old_state, new_state)"""
        self._state_callbacks.append(callback)

    def _set_state(self, client_id: str, new_state: ConnectionState, error: str = None):
        """设置连接状态并触发回调"""
        conn = self.connections.get(client_id)
        if not conn:
            return

        old_state = conn.state
        conn.state = new_state

        if error:
            conn.error_message = error

        logger.info(f"Connection {client_id}: {old_state.value} -> {new_state.value}")

        for callback in self._state_callbacks:
            try:
                callback(client_id, old_state, new_state)
            except Exception as e:
                logger.error(f"State callback error: {e}")

    async def connect(self, websocket: WebSocket, cli_type: str, session_id: str) -> ConnectionInfo:
        """建立新连接"""
        client_id = f"{cli_type}:{session_id}"

        # 如果已有连接，先断开
        if client_id in self.connections:
            await self.disconnect(client_id, "reconnecting")

        await websocket.accept()

        # 创建连接信息
        conn = ConnectionInfo(
            client_id=client_id,
            cli_type=cli_type,
            session_id=session_id,
            websocket=websocket,
            state=ConnectionState.CONNECTING
        )
        self.connections[client_id] = conn

        try:
            # 创建 Runner
            cli_info = detector.get_cli_info(cli_type)
            if cli_info:
                conn.runner = RunnerFactory.create(cli_info, session_id, "")
                conn.state = ConnectionState.CONNECTED
                conn.connected_at = datetime.now()
                conn.reconnect_count = 0

                # 启动心跳
                self._start_heartbeat(client_id)

                self._set_state(client_id, ConnectionState.CONNECTED)
                logger.info(f"Connection established: {client_id}")
            else:
                raise ValueError(f"CLI {cli_type} not found")

        except Exception as e:
            self._set_state(client_id, ConnectionState.ERROR, str(e))
            raise

        return conn

    async def disconnect(self, client_id: str, reason: str = "unknown"):
        """断开连接"""
        conn = self.connections.pop(client_id, None)
        if not conn:
            return

        logger.info(f"Disconnecting {client_id}: {reason}")

        # 停止心跳
        if client_id in self._heartbeat_tasks:
            self._heartbeat_tasks[client_id].cancel()
            del self._heartbeat_tasks[client_id]

        # 关闭 runner
        if conn.runner:
            try:
                await conn.runner.close()
            except Exception as e:
                logger.error(f"Error closing runner: {e}")

        # 关闭 websocket
        if conn.websocket:
            try:
                await conn.websocket.close()
            except Exception:
                pass

        self._set_state(client_id, ConnectionState.DISCONNECTED)

    def _start_heartbeat(self, client_id: str):
        """启动心跳检测"""
        task = asyncio.create_task(self._heartbeat_loop(client_id))
        self._heartbeat_tasks[client_id] = task

    async def _heartbeat_loop(self, client_id: str):
        """心跳循环"""
        try:
            while True:
                await asyncio.sleep(self.HEARTBEAT_INTERVAL)

                conn = self.connections.get(client_id)
                if not conn or conn.state == ConnectionState.DISCONNECTED:
                    break

                # 发送 ping
                conn.last_ping = datetime.now()
                try:
                    await conn.websocket.send_json({
                        "type": "ping",
                        "timestamp": conn.last_ping.isoformat()
                    })
                except Exception as e:
                    logger.warning(f"Heartbeat send failed for {client_id}: {e}")
                    await self._handle_connection_lost(client_id, "heartbeat_send_failed")
                    break

                # 检查上次 pong 是否超时
                if datetime.now() - conn.last_pong > timedelta(seconds=self.HEARTBEAT_TIMEOUT):
                    logger.warning(f"Heartbeat timeout for {client_id}")
                    await self._handle_connection_lost(client_id, "heartbeat_timeout")
                    break

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Heartbeat error for {client_id}: {e}")

    async def _handle_connection_lost(self, client_id: str, reason: str):
        """处理连接丢失"""
        conn = self.connections.get(client_id)
        if not conn:
            return

        if conn.reconnect_count < self.MAX_RECONNECT:
            # 尝试重连
            conn.reconnect_count += 1
            self._set_state(client_id, ConnectionState.RECONNECTING)

            logger.info(f"Attempting reconnect {conn.reconnect_count}/{self.MAX_RECONNECT} for {client_id}")

            try:
                # 重新创建 runner
                if conn.runner:
                    await conn.runner.close()

                cli_info = detector.get_cli_info(conn.cli_type)
                if cli_info:
                    conn.runner = RunnerFactory.create(cli_info, conn.session_id, "")
                    conn.last_pong = datetime.now()  # 重置心跳时间
                    self._set_state(client_id, ConnectionState.CONNECTED)
                    logger.info(f"Reconnected: {client_id}")

                    # 通知客户端重连成功
                    await self.send_json(client_id, {
                        "type": "reconnected",
                        "attempt": conn.reconnect_count
                    })
                    return

            except Exception as e:
                logger.error(f"Reconnect failed for {client_id}: {e}")

        # 重连失败或超过最大次数
        await self.disconnect(client_id, f"reconnect_failed_{reason}")

        # 通知客户端
        try:
            await conn.websocket.send_json({
                "type": "disconnected",
                "reason": reason,
                "reconnect_count": conn.reconnect_count
            })
        except:
            pass

    async def handle_pong(self, client_id: str, data: dict):
        """处理客户端 pong 响应"""
        conn = self.connections.get(client_id)
        if conn:
            conn.last_pong = datetime.now()
            # 可选：计算延迟
            latency = conn.latency_ms
            logger.debug(f"Pong from {client_id}, latency: {latency}ms")

    async def send_json(self, client_id: str, data: dict) -> bool:
        """发送 JSON 消息"""
        conn = self.connections.get(client_id)
        if not conn or not conn.websocket:
            return False

        try:
            await conn.websocket.send_json(data)
            return True
        except Exception as e:
            logger.error(f"Failed to send to {client_id}: {e}")
            await self._handle_connection_lost(client_id, "send_failed")
            return False

    def get_connection_status(self, client_id: str) -> Optional[dict]:
        """获取连接状态"""
        conn = self.connections.get(client_id)
        if not conn:
            return None

        return {
            "client_id": conn.client_id,
            "cli_type": conn.cli_type,
            "state": conn.state.value,
            "is_alive": conn.is_alive,
            "latency_ms": conn.latency_ms,
            "reconnect_count": conn.reconnect_count,
            "connected_at": conn.connected_at.isoformat() if conn.connected_at else None,
            "error": conn.error_message
        }

    def get_all_status(self) -> list[dict]:
        """获取所有连接状态"""
        return [self.get_connection_status(cid) for cid in self.connections.keys()]


# 全局实例
manager = EnhancedConnectionManager()
```

### 6.3 WebSocket 路由（增强版）

```python
@router.websocket("/ws/{cli_type}/{session_id}")
async def chat_websocket(websocket: WebSocket, cli_type: str, session_id: str):
    """
    增强版 WebSocket 聊天接口

    客户端消息格式:
    - { "type": "message", "content": "...", "conversation_id": "..." }
    - { "type": "pong", "timestamp": "..." }
    - { "type": "stop" }  # 停止生成

    服务器消息格式:
    - { "type": "ping", "timestamp": "..." }
    - { "type": "connected" }
    - { "type": "reconnected", "attempt": 1 }
    - { "type": "disconnected", "reason": "..." }
    - { "type": "start", "msg_id": "..." }
    - { "type": "content", "data": "...", "msg_id": "..." }
    - { "type": "tool_call", "data": {...}, "msg_id": "..." }
    - { "type": "finish", "msg_id": "..." }
    - { "type": "error", "data": "...", "msg_id": "..." }
    """
    client_id = f"{cli_type}:{session_id}"

    try:
        # 建立连接
        conn = await manager.connect(websocket, cli_type, session_id)

        # 发送连接成功消息
        await websocket.send_json({
            "type": "connected",
            "client_id": client_id,
            "timestamp": datetime.now().isoformat()
        })

        # 消息处理循环
        while True:
            try:
                # 接收消息（设置超时以允许心跳检查）
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=60.0
                )

                msg_type = data.get("type", "message")

                if msg_type == "pong":
                    # 心跳响应
                    await manager.handle_pong(client_id, data)

                elif msg_type == "stop":
                    # 停止生成
                    if conn.runner:
                        await conn.runner.stop()
                    await manager.send_json(client_id, {
                        "type": "stopped",
                        "timestamp": datetime.now().isoformat()
                    })

                elif msg_type == "message":
                    # 处理聊天消息
                    await _handle_chat_message(conn, data, client_id)

            except asyncio.TimeoutError:
                # 超时检查连接状态
                if not conn.is_alive:
                    logger.warning(f"Connection {client_id} timed out")
                    break

    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected")
    except Exception as e:
        logger.exception(f"WebSocket error for {client_id}")
        await manager.send_json(client_id, {
            "type": "error",
            "data": f"Server error: {str(e)}"
        })
    finally:
        await manager.disconnect(client_id, "cleanup")


async def _handle_chat_message(conn: ConnectionInfo, data: dict, client_id: str):
    """处理聊天消息"""
    message = data.get("content", "")
    conversation_id = data.get("conversation_id", "")

    if not message or not conversation_id:
        return

    # 更新状态
    conn.state = ConnectionState.STREAMING

    # 保存用户消息
    conversation_store.add_message(
        conv_id=conversation_id,
        role="user",
        content=message
    )

    msg_id = str(uuid.uuid4())
    full_response = []

    async def on_event(event: StreamEvent):
        # 转发到客户端
        await manager.send_json(client_id, {
            "type": event.type,
            "data": event.data,
            "msg_id": event.msg_id,
            "metadata": event.metadata
        })
        if event.type == "content":
            full_response.append(event.data)

    try:
        if conn.runner:
            await conn.runner.send_message(message, msg_id, on_event)

            # 保存完整响应
            conversation_store.add_message(
                conv_id=conversation_id,
                role="assistant",
                content="".join(full_response),
                msg_id=msg_id
            )

    except Exception as e:
        logger.exception("Message handling error")
        await manager.send_json(client_id, {
            "type": "error",
            "data": str(e),
            "msg_id": msg_id
        })
    finally:
        conn.state = ConnectionState.CONNECTED
```

### 6.4 HTTP 状态查询 API

```python
@router.get("/connections/status")
async def get_all_connection_status():
    """获取所有连接状态（用于前端状态同步）"""
    return {
        "connections": manager.get_all_status(),
        "timestamp": datetime.now().isoformat()
    }


@router.get("/connections/{client_id}/status")
async def get_connection_status(client_id: str):
    """获取单个连接状态"""
    status = manager.get_connection_status(client_id)
    if not status:
        raise HTTPException(status_code=404, detail="Connection not found")
    return status


@router.post("/connections/{client_id}/reconnect")
async def force_reconnect(client_id: str):
    """强制重连"""
    conn = manager.connections.get(client_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    await manager._handle_connection_lost(client_id, "forced")
    return {"success": True, "message": "Reconnect initiated"}
```

### 6.5 前端连接管理 Hook

```typescript
// src/hooks/useConnection.ts
import { useState, useEffect, useRef, useCallback } from 'react';

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'streaming'
  | 'disconnected'
  | 'error'
  | 'reconnecting';

interface ConnectionStatus {
  clientId: string;
  cliType: string;
  state: ConnectionState;
  isAlive: boolean;
  latencyMs?: number;
  reconnectCount: number;
  connectedAt?: string;
  error?: string;
}

interface UseConnectionOptions {
  cliType: string;
  sessionId: string;
  onStateChange?: (state: ConnectionState, prevState: ConnectionState) => void;
  onMessage?: (data: unknown) => void;
  onError?: (error: string) => void;
  autoReconnect?: boolean;
}

export function useConnection({
  cliType,
  sessionId,
  onStateChange,
  onMessage,
  onError,
  autoReconnect = true
}: UseConnectionOptions) {
  const [state, setState] = useState<ConnectionState>('idle');
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef<ConnectionState>('idle');

  // 更新状态并触发回调
  const updateState = useCallback((newState: ConnectionState) => {
    const prevState = stateRef.current;
    stateRef.current = newState;
    setState(newState);
    onStateChange?.(newState, prevState);
  }, [onStateChange]);

  // 连接 WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    updateState('connecting');

    const ws = new WebSocket(
      `ws://127.0.0.1:8765/api/chat/ws/${cliType}/${sessionId}`
    );

    ws.onopen = () => {
      updateState('connected');
      reconnectCountRef.current = 0;

      // 启动客户端心跳
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }));
        }
      }, 15000);
    };

    ws.onclose = (event) => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }

      if (!autoReconnect || reconnectCountRef.current >= 3) {
        updateState('disconnected');
        return;
      }

      // 自动重连
      updateState('reconnecting');
      reconnectCountRef.current++;

      setTimeout(() => {
        connect();
      }, 2000 * reconnectCountRef.current); // 指数退避
    };

    ws.onerror = (error) => {
      updateState('error');
      onError?.('WebSocket error');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'ping':
          // 响应服务器心跳
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: data.timestamp
          }));
          break;

        case 'connected':
          updateState('connected');
          break;

        case 'reconnected':
          updateState('connected');
          break;

        case 'disconnected':
          updateState('disconnected');
          break;

        case 'start':
          updateState('streaming');
          onMessage?.(data);
          break;

        case 'finish':
        case 'error':
          updateState('connected');
          onMessage?.(data);
          break;

        default:
          onMessage?.(data);
      }
    };

    wsRef.current = ws;
  }, [cliType, sessionId, autoReconnect, onMessage, onError, updateState]);

  // 断开连接
  const disconnect = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    wsRef.current?.close();
    updateState('disconnected');
  }, [updateState]);

  // 发送消息
  const send = useCallback((message: string, conversationId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'message',
        content: message,
        conversation_id: conversationId
      }));
      return true;
    }
    return false;
  }, []);

  // 停止生成
  const stop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
  }, []);

  // 获取状态
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `http://127.0.0.1:8765/api/chat/connections/${cliType}:${sessionId}/status`
      );
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.latency_ms) {
          setLatency(data.latency_ms);
        }
      }
    } catch (e) {
      console.error('Failed to fetch connection status:', e);
    }
  }, [cliType, sessionId]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    state,
    status,
    latency,
    connect,
    disconnect,
    send,
    stop,
    fetchStatus,
    isConnected: state === 'connected' || state === 'streaming',
    isStreaming: state === 'streaming',
    reconnectCount: reconnectCountRef.current
  };
}
```

### 6.6 CLI 进程健康检查

**文件**: `abo/cli/health.py`

```python
"""CLI 进程健康检查"""

import asyncio
import psutil
from typing import Optional
from dataclasses import dataclass
from datetime import datetime


@dataclass
class ProcessHealth:
    pid: int
    status: str  # running, sleeping, zombie, dead
    cpu_percent: float
    memory_mb: float
    create_time: datetime
    is_responsive: bool  # 是否能响应信号


class CliHealthMonitor:
    """CLI 进程健康监控"""

    def __init__(self):
        self._monitored: dict[str, int] = {}  # session_id -> pid

    def register(self, session_id: str, process: asyncio.subprocess.Process):
        """注册进程监控"""
        if process.pid:
            self._monitored[session_id] = process.pid

    def unregister(self, session_id: str):
        """取消监控"""
        self._monitored.pop(session_id, None)

    def check_health(self, session_id: str) -> Optional[ProcessHealth]:
        """检查进程健康状态"""
        pid = self._monitored.get(session_id)
        if not pid:
            return None

        try:
            proc = psutil.Process(pid)

            # 检查进程是否响应
            is_responsive = True
            try:
                proc.status()
            except psutil.NoSuchProcess:
                return None

            return ProcessHealth(
                pid=pid,
                status=proc.status(),
                cpu_percent=proc.cpu_percent(interval=0.1),
                memory_mb=proc.memory_info().rss / 1024 / 1024,
                create_time=datetime.fromtimestamp(proc.create_time()),
                is_responsive=is_responsive
            )

        except psutil.NoSuchProcess:
            self.unregister(session_id)
            return None
        except Exception as e:
            print(f"Health check error: {e}")
            return None

    def is_healthy(self, session_id: str) -> bool:
        """快速健康检查"""
        health = self.check_health(session_id)
        if not health:
            return False

        # 进程僵死或无响应视为不健康
        if health.status in ['zombie', 'dead']:
            return False
        if not health.is_responsive:
            return False

        return True


# 全局实例
health_monitor = CliHealthMonitor()
```

### 6.7 状态同步与恢复

前端在页面刷新后需要恢复连接状态：

```typescript
// src/hooks/useConnectionRecovery.ts
import { useEffect, useState } from 'react';
import { useConnection } from './useConnection';

export function useConnectionRecovery(conversationId: string, cliType: string) {
  const [isRecovering, setIsRecovering] = useState(true);

  const {
    state,
    connect,
    status,
    fetchStatus
  } = useConnection({
    cliType,
    sessionId: conversationId,
    autoReconnect: true
  });

  // 页面加载时尝试恢复连接
  useEffect(() => {
    const recover = async () => {
      // 1. 查询后端是否有活跃连接
      await fetchStatus();

      // 2. 如果有连接，尝试重新连接
      if (status?.isAlive) {
        connect();
      }

      setIsRecovering(false);
    };

    recover();
  }, []);

  return {
    isRecovering,
    state,
    status,
    connect
  };
}
```

### 5.1 主聊天面板

**文件**: `src/modules/chat/ChatPanel.tsx`

```tsx
import { useEffect, useRef } from 'react';
import { useChat } from '../../hooks/useChat';
import { CliSelector } from './CliSelector';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { ChatHeader } from './ChatHeader';
import { Loader2 } from 'lucide-react';

export function ChatPanel() {
  const {
    availableClis,
    selectedCli,
    selectCli,
    conversation,
    createNewConversation,
    messages,
    sendMessage,
    isStreaming,
    isConnected,
    isLoading,
    error,
  } = useChat();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 错误提示
  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-xl bg-red-50 p-6 text-red-600 dark:bg-red-900/20 dark:text-red-400">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // 加载中
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  // 选择 CLI 界面
  if (!conversation || !selectedCli) {
    return (
      <CliSelector
        clis={availableClis}
        selected={selectedCli}
        onSelect={selectCli}
        onStart={createNewConversation}
      />
    );
  }

  // 聊天界面
  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <ChatHeader
        cli={selectedCli}
        conversation={conversation}
        isConnected={isConnected}
      />

      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        messagesEndRef={messagesEndRef}
      />

      <ChatInput
        onSend={sendMessage}
        isStreaming={isStreaming}
        disabled={!isConnected}
      />
    </div>
  );
}
```

### 5.2 CLI 选择器

**文件**: `src/modules/chat/CliSelector.tsx`

```tsx
import type { CliConfig } from '../../types/chat';
import { Bot, Check, ChevronRight } from 'lucide-react';

interface CliSelectorProps {
  clis: CliConfig[];
  selected: CliConfig | null;
  onSelect: (cli: CliConfig) => void;
  onStart: () => void;
}

export function CliSelector({ clis, selected, onSelect, onStart }: CliSelectorProps) {
  const availableClis = clis.filter((c) => c.isAvailable);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-[var(--text)]">
          选择 AI 助手
        </h2>
        <p className="mt-2 text-[var(--text-muted)]">
          选择一个 CLI 工具开始对话
        </p>
      </div>

      {availableClis.length === 0 ? (
        <div className="rounded-xl bg-amber-50 p-6 text-amber-600 dark:bg-amber-900/20">
          <p>未检测到可用的 CLI 工具</p>
          <p className="mt-2 text-sm">
            请安装 Claude Code、Gemini CLI 或 OpenClaw
          </p>
        </div>
      ) : (
        <div className="grid w-full max-w-md gap-3">
          {availableClis.map((cli) => (
            <button
              key={cli.id}
              onClick={() => onSelect(cli)}
              className={`flex items-center gap-4 rounded-xl border p-4 transition-all
                ${
                  selected?.id === cli.id
                    ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary-dim)]'
                }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-2)]">
                <Bot className="h-5 w-5 text-[var(--primary)]" />
              </div>

              <div className="flex-1 text-left">
                <p className="font-medium text-[var(--text)]">{cli.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{cli.version}</p>
              </div>

              {selected?.id === cli.id && (
                <Check className="h-5 w-5 text-[var(--primary)]" />
              )}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <button
          onClick={onStart}
          className="flex items-center gap-2 rounded-xl bg-[var(--primary)] px-8 py-3
            text-white transition-all hover:bg-[var(--primary-dim)]"
        >
          <span>开始对话</span>
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
```

### 5.3 消息列表

**文件**: `src/modules/chat/MessageList.tsx`

```tsx
import type { Message } from '../../types/chat';
import { User, Bot, Wrench } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export function MessageList({ messages, isStreaming, messagesEndRef }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-6">
        {messages.length === 0 && (
          <div className="py-12 text-center text-[var(--text-muted)]">
            <p>开始你的第一次对话</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <MessageItem
            key={msg.id}
            message={msg}
            isLast={index === messages.length - 1}
            isStreaming={isStreaming && index === messages.length - 1}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

interface MessageItemProps {
  message: Message;
  isLast: boolean;
  isStreaming: boolean;
}

function MessageItem({ message, isStreaming }: MessageItemProps) {
  const isUser = message.role === 'user';
  const isTool = message.contentType === 'tool_call';
  const isError = message.contentType === 'error';

  return (
    <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* 头像 */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
          ${isUser ? 'bg-[var(--primary)]' : 'bg-[var(--surface-2)]'}
          ${isError ? 'bg-red-500' : ''}`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : isTool ? (
          <Wrench className="h-4 w-4 text-[var(--primary)]" />
        ) : (
          <Bot className="h-4 w-4 text-[var(--primary)]" />
        )}
      </div>

      {/* 内容 */}
      <div
        className={`max-w-[80%] rounded-2xl px-5 py-3
          ${
            isUser
              ? 'bg-[var(--primary)] text-white'
              : isError
              ? 'bg-red-50 text-red-600 dark:bg-red-900/20'
              : 'bg-[var(--surface)] border border-[var(--border)]'
          }`}
      >
        {isTool ? (
          <p className="text-sm font-medium text-[var(--primary)]">{message.content}</p>
        ) : isUser ? (
          <p className="text-sm leading-relaxed">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
            {isStreaming && (
              <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-[var(--primary)]" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

### 5.4 聊天输入

**文件**: `src/modules/chat/ChatInput.tsx`

```tsx
import { useState, useRef, useCallback } from 'react';
import { Send, Loader2, Mic } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, isStreaming, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isStreaming || disabled) return;

      onSend(input.trim());
      setInput('');

      // 重置高度
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    },
    [input, isStreaming, disabled, onSend]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit]
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
  }, []);

  return (
    <div className="border-t border-[var(--border)] bg-[var(--surface)] p-4">
      <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl gap-3">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={disabled ? '连接中...' : '输入消息...'}
            disabled={disabled || isStreaming}
            rows={1}
            className="w-full resize-none rounded-xl border border-[var(--border)]
              bg-[var(--bg)] px-4 py-3 pr-12 text-[var(--text)]
              outline-none transition-all
              focus:ring-2 focus:ring-[var(--primary)]
              disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: '48px', maxHeight: '200px' }}
          />

          {/* 语音输入按钮（可选） */}
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]
              hover:text-[var(--text)]"
          >
            <Mic className="h-5 w-5" />
          </button>
        </div>

        <button
          type="submit"
          disabled={!input.trim() || isStreaming || disabled}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl
            bg-[var(--primary)] text-white transition-all
            hover:bg-[var(--primary-dim)]
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isStreaming ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </form>
    </div>
  );
}
```

### 5.5 聊天头部

**文件**: `src/modules/chat/ChatHeader.tsx`

```tsx
import type { CliConfig, Conversation } from '../../types/chat';
import { Bot, X, Settings, MoreVertical } from 'lucide-react';

interface ChatHeaderProps {
  cli: CliConfig;
  conversation: Conversation;
  isConnected: boolean;
}

export function ChatHeader({ cli, conversation, isConnected }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-2)]">
          <Bot className="h-5 w-5 text-[var(--primary)]" />
        </div>

        <div>
          <h3 className="font-medium text-[var(--text)]">{cli.name}</h3>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span>{isConnected ? '已连接' : '未连接'}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="rounded-lg p-2 text-[var(--text-muted)]
            hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <Settings className="h-5 w-5" />
        </button>

        <button
          className="rounded-lg p-2 text-[var(--text-muted)]
            hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <MoreVertical className="h-5 w-5" />
        </button>

        <button
          className="rounded-lg p-2 text-[var(--text-muted)]
            hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
```

---

## 6. 集成与测试

### 6.1 路由注册

**更新**: `src/modules/MainContent.tsx`

```typescript
// 添加聊天路由
import { ChatPanel } from './chat/ChatPanel';

// 在 router 中添加
case 'chat':
  return <ChatPanel />;
```

### 6.2 侧边栏入口

**更新**: `src/modules/nav/NavSidebar.tsx`

```tsx
import { MessageSquare } from 'lucide-react';

// 在导航项中添加
{
  id: 'chat',
  label: 'AI 对话',
  icon: MessageSquare,
}
```

### 6.3 测试检查清单

#### 后端测试

```bash
# 1. 启动后端
python -m abo.main

# 2. 测试 CLI 检测
curl http://127.0.0.1:8765/api/chat/cli/detect

# 3. 创建对话
curl -X POST http://127.0.0.1:8765/api/chat/conversations \
  -H "Content-Type: application/json" \
  -d '{"cli_type": "claude"}'

# 4. 获取消息列表
curl http://127.0.0.1:8765/api/chat/conversations/{conv_id}/messages

# 5. WebSocket 测试（使用 wscat）
npm install -g wscat
wscat -c ws://127.0.0.1:8765/api/chat/ws/claude/test-session
> {"message": "Hello", "conversation_id": "test"}
```

#### 前端测试

```typescript
// 在浏览器控制台测试
const ws = new WebSocket('ws://127.0.0.1:8765/api/chat/ws/claude/test');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.send(JSON.stringify({message: "Hello", conversation_id: "test"}));
```

### 6.4 常见问题排查

| 问题 | 原因 | 解决方案 |
|-----|------|---------|
| CLI 检测为空 | PATH 未继承 | 检查 shell 环境变量 |
| WebSocket 连接失败 | 路由未注册 | 检查 main.py 中 router.include |
| 消息不显示 | 事件类型不匹配 | 检查 StreamEvent.type 处理 |
| 流式输出卡顿 | 缓冲问题 | 检查 ACP runner 的 line 处理 |

---

## 7. 完整文件清单

### 后端文件

```
abo/
├── cli/
│   ├── __init__.py
│   ├── detector.py      # CLI 检测
│   └── runner.py        # 多协议 Runner
├── store/
│   └── conversations.py # 对话存储
├── routes/
│   └── chat.py          # API 路由
└── main.py              # 注册路由
```

### 前端文件

```
src/
├── types/
│   └── chat.ts          # 类型定义
├── api/
│   └── chat.ts          # API 客户端
├── hooks/
│   └── useChat.ts       # React Hook
└── modules/
    └── chat/
        ├── ChatPanel.tsx      # 主面板
        ├── CliSelector.tsx    # CLI 选择
        ├── MessageList.tsx    # 消息列表
        ├── ChatInput.tsx      # 输入框
        └── ChatHeader.tsx     # 头部
```

---

## 8. 更新后的实施检查清单

### Phase 1: 后端基础 ✅
- [ ] 扩展 `abo/cli/runner.py` - 添加 `CliRunner` 多协议支持
- [ ] 创建 `abo/cli/detector.py` - CLI 自动检测
- [ ] 创建 `abo/store/conversations.py` - SQLite 对话存储
- [ ] 创建 `abo/routes/chat.py` - WebSocket + HTTP API
- [ ] 在 `abo/main.py` 注册路由

### Phase 2: 后端增强（新增）⚠️
- [ ] **连接状态机** - 实现 `ConnectionState` 枚举和转换
- [ ] **心跳机制** - 15秒间隔 ping/pong
- [ ] **自动重连** - 最多3次重连，指数退避
- [ ] **进程健康检查** - `CliHealthMonitor` 监控子进程
- [ ] **状态查询 API** - `/connections/status` 端点
- [ ] **错误恢复** - 连接断开时的优雅降级

### Phase 3: 前端基础 ✅
- [ ] `src/types/chat.ts` - TypeScript 类型定义
- [ ] `src/api/chat.ts` - API 客户端
- [ ] `src/hooks/useChat.ts` - 基础 WebSocket Hook

### Phase 4: 前端增强（新增）⚠️
- [ ] **SendBox 智能输入框** - 单/多行自动切换
- [ ] **Message 组件** - Markdown 渲染 + 代码高亮
- [ ] **ConnectionStatus 组件** - 实时连接状态指示
- [ ] **useConnection Hook** - 增强版连接管理（支持重连）
- [ ] **心跳保活** - 客户端心跳维持
- [ ] **连接恢复** - 页面刷新后状态恢复

### Phase 5: 集成测试
- [ ] CLI 检测 API 返回正确结果
- [ ] WebSocket 连接建立成功
- [ ] 心跳消息正常收发（15秒间隔）
- [ ] 断网后自动重连（最多3次）
- [ ] 消息流式显示无卡顿
- [ ] 连接状态 UI 实时更新

---

## 9. 调试指南（详细版）

### 9.1 后端调试

#### 启用详细日志

```python
# abo/main.py
import logging

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# 特定模块日志
logging.getLogger('abo.cli.runner').setLevel(logging.DEBUG)
logging.getLogger('abo.routes.chat').setLevel(logging.DEBUG)
```

#### WebSocket 测试命令

```bash
# 1. 基础连接测试
wscat -c ws://127.0.0.1:8765/api/chat/ws/claude/test-session

# 2. 心跳测试（发送 pong 响应）
> {"type": "pong", "timestamp": "2024-01-01T00:00:00Z"}

# 3. 完整对话测试
> {"type": "message", "content": "Hello", "conversation_id": "test-123"}

# 4. 停止生成测试
> {"type": "stop"}
```

#### 进程监控

```bash
# 查看 Python 子进程
ps aux | grep "claude --print"
ps aux | grep "gemini --experimental-acp"

# 监控进程资源
watch -n 1 'ps -o pid,cpu,mem,comm -p $(pgrep -f "claude")'
```

### 9.2 前端调试

#### WebSocket 监控

```typescript
// 浏览器控制台
const ws = new WebSocket('ws://127.0.0.1:8765/api/chat/ws/claude/test');

// 监控所有消息
ws.addEventListener('message', (e) => {
  console.log('[WS Receive]', JSON.parse(e.data));
});

ws.addEventListener('send', (e) => {
  console.log('[WS Send]', e);
});

// 模拟断网测试重连
ws.close();
```

#### 连接状态检查

```typescript
// 检查当前连接状态
fetch('http://127.0.0.1:8765/api/chat/connections/status')
  .then(r => r.json())
  .then(console.log);

// 强制重连
fetch('http://127.0.0.1:8765/api/chat/connections/claude:test/reconnect', {
  method: 'POST'
});
```

#### React DevTools 检查点

1. **useConnection Hook 状态**：
   - `state`: 当前连接状态
   - `latency`: 延迟（ms）
   - `reconnectCount`: 重连次数

2. **ChatPanel 组件状态**：
   - `messages`: 消息数组
   - `isStreaming`: 是否正在生成

### 9.3 常见问题速查

| 现象 | 检查项 | 命令/方法 |
|-----|-------|----------|
| CLI 检测为空 | shell 环境 | `echo $PATH`, `which claude` |
| WebSocket 连不上 | 端口占用 | `lsof -i :8765` |
| 心跳超时 | 防火墙 | 检查 ws 连接是否被代理 |
| 消息不显示 | 事件类型 | 浏览器 console 查看 receive |
| 重连失败 | 后端状态 | 查看后端进程是否存活 |
| 流式卡顿 | 缓冲区 | 检查 runner 的 read buffer |

---

## 10. 关键设计决策

### 10.1 为什么选择 WebSocket 而非 SSE？

| 特性 | WebSocket | SSE |
|-----|-----------|-----|
| 双向通信 | ✅ | ❌（需要额外 HTTP） |
| 心跳检测 | ✅ 原生支持 | ⚠️ 需额外实现 |
| 重连机制 | ✅ 客户端控制 | ⚠️ 浏览器自动 |
| 工具调用 | ✅ 双向 | ❌ 复杂 |
| 断线检测 | ✅ 快速 | ⚠️ 延迟高 |

### 10.2 心跳机制设计

```
客户端 ←────────────→ 服务器
        ←─ ping ─
        ─ pong ─→
        （15秒间隔）

超时判定：30秒无 pong 响应 = 断开
```

### 10.3 重连策略

```
第1次断开 ──→ 等待 2秒 ──→ 重连
第2次断开 ──→ 等待 4秒 ──→ 重连
第3次断开 ──→ 等待 6秒 ──→ 重连
第4次断开 ──→ 放弃，显示"连接失败"
```

### 10.4 与 AionUi 的差异

| 功能 | AionUi | ABO 简化版 |
|-----|--------|-----------|
| 传输协议 | ACP JSON-RPC | 简化 StreamEvent |
| 连接管理 | AcpConnection | EnhancedConnectionManager |
| 心跳 | 应用层 ping | WebSocket ping/pong |
| 重连 | 自动 + 手动 | 自动（3次） |
| 多 CLI | ✅ | ✅ |
| 工具调用 | ✅ 完整 | ✅ 简化版 |
| 文件上传 | ✅ | ✅ |

---

*完整实现版本 2.0 - 包含 UI 复刻和连接中断检测*
