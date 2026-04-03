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

```
┌─────────────────────────────────────────────────────────────────┐
│  🔌 Claude Code              ● 在线               [设置] [关闭]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 你好，我是 Claude。有什么可以帮你的吗？                    │   │
│  │                                                         │   │
│  │                   10:23                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 帮我分析一下这个论文的创新点                              │   │
│  │                                          [你] 10:24    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 我来帮您分析这篇论文的创新点：                           │   │
│  │                                                         │   │
│  │ 1. 方法创新                                              │   │
│  │    提出了一种新的...                                     │   │
│  │                                                         │   │
│  │ 2. 实验设计                                              │   │
│  │    在多个数据集上进行...                                  │   │
│  │                                                         │   │
│  │ 3. 理论贡献                                              │   │
│  │    证明了... ▋                                          │   │
│  │                   Claude 10:24                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  🔧 使用工具: read_file                                      │   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐    │
│  │ 帮我分析一下这个论文的创新点...                          │ 🎤 │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

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

## 5. UI 组件细节

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

*完整实现版本 1.0*
