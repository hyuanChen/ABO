# Unified Chat Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the chat module to fully implement CLI-based AI conversation with auto-detection, persistent storage, WebSocket streaming, and AionUi-style design.

**Architecture:** Backend uses FastAPI with WebSocket support, SQLite for conversation persistence, and a runner pattern for CLI abstraction. Frontend uses React with custom hooks for state management and WebSocket communication.

**Tech Stack:** Python 3.11+, FastAPI, SQLite, React 18+, TypeScript, Tailwind CSS, WebSocket API

---

## Overview

This plan implements a complete CLI chat system that:
1. Auto-detects available CLI tools (claude, gemini, codex, etc.)
2. Creates persistent conversations stored in SQLite
3. Streams responses via WebSocket in real-time
4. Supports multiple CLI protocols (raw, ACP, WebSocket)
5. Follows AionUi design patterns for UI/UX

---

## Part 1: Backend Foundation

### Task 1: CLI Detection Module

**Files:**
- Create: `abo/cli/detector.py`
- Test: `tests/cli/test_detector.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from abo.cli.detector import CliDetector, CliInfo

def test_detector_initialization():
    detector = CliDetector()
    assert detector is not None

def test_detect_claude():
    detector = CliDetector()
    clis = detector.detect_all()
    # Should detect claude if installed
    claude_info = detector.get_cli_info("claude")
    if claude_info and claude_info.is_available:
        assert claude_info.name == "Claude Code"
        assert claude_info.protocol == "raw"

def test_cli_info_structure():
    info = CliInfo(
        id="test",
        name="Test CLI",
        command="echo",
        check_cmd="echo --version"
    )
    assert info.id == "test"
    assert info.name == "Test CLI"
    assert info.is_available is False
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/huanc/Desktop/ABO
python -m pytest tests/cli/test_detector.py -v
```
Expected: FAIL - module not found

- [ ] **Step 3: Implement the detector module**

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
    """CLI 信息"""
    id: str
    name: str
    command: str
    check_cmd: str
    version: str = ""
    is_available: bool = False
    acp_args: List[str] = None
    protocol: str = "raw"  # raw, acp, websocket
    last_check: int = 0

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
            acp_args=["--print"],
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
        """检测所有已知的 CLI 工具"""
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

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/huanc/Desktop/ABO
python -m pytest tests/cli/test_detector.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add abo/cli/detector.py tests/cli/test_detector.py
git commit -m "feat(cli): implement CLI detector with auto-discovery"
```

---

### Task 2: Conversation Store (SQLite)

**Files:**
- Create: `abo/store/conversations.py`
- Test: `tests/store/test_conversations.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
import os
import tempfile
from abo.store.conversations import ConversationStore, Conversation, Message

def test_conversation_store_init():
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        store = ConversationStore(db_path=tmp.name)
        assert store is not None
        os.unlink(tmp.name)

def test_create_conversation():
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        store = ConversationStore(db_path=tmp.name)
        conv_id = store.create_conversation("claude", "test-session-1")
        assert conv_id is not None
        assert len(conv_id) > 0

        conv = store.get_conversation(conv_id)
        assert conv is not None
        assert conv.cli_type == "claude"
        assert conv.session_id == "test-session-1"
        os.unlink(tmp.name)

def test_add_and_get_messages():
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        store = ConversationStore(db_path=tmp.name)
        conv_id = store.create_conversation("claude", "test-session-2")

        # Add user message
        msg_id = store.add_message(conv_id, "user", "Hello", msg_id="msg-1")
        assert msg_id is not None

        # Add assistant message
        msg_id2 = store.add_message(conv_id, "assistant", "Hi there", msg_id="msg-2")
        assert msg_id2 is not None

        # Get messages
        messages = store.get_messages(conv_id)
        assert len(messages) == 2
        assert messages[0].role == "user"
        assert messages[1].role == "assistant"
        os.unlink(tmp.name)

def test_update_message_content():
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        store = ConversationStore(db_path=tmp.name)
        conv_id = store.create_conversation("claude", "test-session-3")

        store.add_message(conv_id, "assistant", "Hello", msg_id="msg-stream")
        store.update_message_content("msg-stream", "Hello World")

        messages = store.get_messages(conv_id)
        assert messages[0].content == "Hello World"
        os.unlink(tmp.name)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/huanc/Desktop/ABO
python -m pytest tests/store/test_conversations.py -v
```
Expected: FAIL

- [ ] **Step 3: Implement the conversation store**

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

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/huanc/Desktop/ABO
python -m pytest tests/store/test_conversations.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add abo/store/conversations.py tests/store/test_conversations.py
git commit -m "feat(store): implement SQLite conversation store"
```

---

### Task 3: CLI Runner with Protocol Support

**Files:**
- Create: `abo/cli/runner.py`
- Test: `tests/cli/test_runner.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
import asyncio
from unittest.mock import Mock, patch
from abo.cli.runner import RawRunner, RunnerFactory, StreamEvent
from abo.cli.detector import CliInfo

def test_stream_event_creation():
    event = StreamEvent(type="content", data="Hello", msg_id="123")
    assert event.type == "content"
    assert event.data == "Hello"
    assert event.msg_id == "123"

def test_runner_factory():
    cli_info = CliInfo(
        id="claude",
        name="Claude",
        command="echo",
        check_cmd="echo --version",
        protocol="raw"
    )
    runner = RunnerFactory.create(cli_info, "session-1")
    assert runner is not None
    assert isinstance(runner, RawRunner)

@pytest.mark.asyncio
async def test_raw_runner_lifecycle():
    cli_info = CliInfo(
        id="echo",
        name="Echo",
        command="cat",
        check_cmd="cat --version",
        protocol="raw",
        acp_args=[]
    )
    runner = RawRunner(cli_info, "session-1")

    events = []
    async def on_event(event):
        events.append(event)

    # Test with echo (just echoes input)
    await runner.send_message("Hello", "msg-1", on_event)

    # Should have start, content, finish events
    assert len(events) >= 2
    assert events[0].type == "start"
    assert events[-1].type == "finish"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/huanc/Desktop/ABO
python -m pytest tests/cli/test_runner.py -v
```
Expected: FAIL

- [ ] **Step 3: Implement the runner module**

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
    """流式事件"""
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
                if self.process.returncode is None:
                    self.process.terminate()
                    try:
                        await asyncio.wait_for(self.process.wait(), timeout=2.0)
                    except asyncio.TimeoutError:
                        self.process.kill()
                        await self.process.wait()
            except Exception as e:
                logger.warning(f"Error closing process: {e}")
            finally:
                self.process = None

    def _get_env(self) -> dict:
        """获取环境变量"""
        return dict(os.environ)


class RawRunner(BaseRunner):
    """原始文本协议 Runner (Claude --print)

    严格按AionUi设计:
    1. 启动进程时发送 prompt 到 stdin
    2. 实时读取 stdout 流式输出
    3. 每收到一行立即触发 content 事件
    4. 进程结束时触发 finish 事件
    5. 确保进程完全终止
    """

    async def send_message(self, message: str, msg_id: str,
                          on_event: Callable[[StreamEvent], None]) -> None:
        """发送消息并接收流式响应"""

        # 发送开始事件
        await on_event(StreamEvent(type="start", data="", msg_id=msg_id))

        try:
            # 构建命令
            cmd = [self.cli_info.command] + getattr(self.cli_info, 'acp_args', [])

            logger.info(f"Starting process: {' '.join(cmd)}")

            # 启动进程
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.workspace,
                env=self._get_env()
            )

            # 发送消息到 stdin
            assert self.process.stdin
            input_data = f"{message}\n\n".encode('utf-8')
            self.process.stdin.write(input_data)
            await self.process.stdin.drain()
            self.process.stdin.close()

            # 实时读取 stdout 流式输出
            assert self.process.stdout
            full_content = []

            while True:
                try:
                    line = await asyncio.wait_for(
                        self.process.stdout.readline(),
                        timeout=60.0
                    )
                    if not line:
                        break

                    text = line.decode('utf-8', errors='replace')
                    full_content.append(text)

                    # 立即发送 content 事件 (流式)
                    await on_event(StreamEvent(
                        type="content",
                        data=text,
                        msg_id=msg_id
                    ))

                except asyncio.TimeoutError:
                    logger.warning("Read timeout, breaking")
                    break

            # 等待进程结束
            try:
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning("Process didn't exit, forcing kill")
                self.process.kill()
                await self.process.wait()

            # 读取 stderr (用于调试)
            assert self.process.stderr
            stderr_data = await self.process.stderr.read()
            if stderr_data:
                logger.debug(f"Process stderr: {stderr_data.decode()[:200]}")

            # 发送完成事件
            total_length = sum(len(c) for c in full_content)
            await on_event(StreamEvent(
                type="finish",
                data="",
                msg_id=msg_id,
                metadata={"total_length": total_length}
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
            cmd = [self.cli_info.command] + getattr(self.cli_info, 'acp_args', [])

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
            await on_event(StreamEvent(
                type="content",
                data=line,
                msg_id=msg_id
            ))


class RunnerFactory:
    """Runner 工厂"""

    RUNNERS = {
        "raw": RawRunner,
        "acp": AcpRunner,
    }

    @classmethod
    def create(cls, cli_info: 'CliInfo', session_id: str,
               workspace: str = "") -> BaseRunner:
        """创建对应协议的 Runner"""
        runner_class = cls.RUNNERS.get(cli_info.protocol, RawRunner)
        return runner_class(cli_info, session_id, workspace)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/huanc/Desktop/ABO
python -m pytest tests/cli/test_runner.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add abo/cli/runner.py tests/cli/test_runner.py
git commit -m "feat(cli): implement multi-protocol CLI runner"
```

---

### Task 4: FastAPI Chat Routes

**Files:**
- Create: `abo/routes/chat.py`
- Test: `tests/routes/test_chat.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, Mock

def test_cli_detect_endpoint(client: TestClient):
    response = client.get("/api/chat/cli/detect")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

def test_create_conversation(client: TestClient):
    # Mock CLI availability
    with patch('abo.routes.chat.detector.get_cli_info') as mock_get:
        mock_cli = Mock()
        mock_cli.is_available = True
        mock_cli.name = "Test CLI"
        mock_get.return_value = mock_cli

        response = client.post("/api/chat/conversations", json={
            "cli_type": "test-cli"
        })
        assert response.status_code in [200, 400]  # 400 if CLI not actually available

def test_list_conversations(client: TestClient):
    response = client.get("/api/chat/conversations")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/huanc/Desktop/ABO
python -m pytest tests/routes/test_chat.py -v
```
Expected: FAIL

- [ ] **Step 3: Implement the chat routes**

```python
"""聊天 API 路由 - 严格遵循 AionUi 协议"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import asyncio
import json
import logging
import uuid

from ..cli.detector import detector
from ..cli.runner import RunnerFactory, StreamEvent
from ..store.conversations import conversation_store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat")
chat_router = router  # 导出别名


# === 请求/响应模型 ===

class CreateConversationRequest(BaseModel):
    cli_type: str
    title: Optional[str] = None
    workspace: Optional[str] = None


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


class SendMessageRequest(BaseModel):
    message: str
    conversation_id: str


# === 连接管理器 ===

class ConnectionManager:
    """WebSocket 连接管理器 - 严格遵循 AionUi 协议"""

    def __init__(self):
        self.active_connections: dict = {}  # session_id -> WebSocket
        self.runners: dict = {}  # session_id -> runner

    async def connect(self, websocket: WebSocket, session_id: str):
        """建立连接"""
        await websocket.accept()
        self.active_connections[session_id] = websocket
        logger.info(f"WebSocket connected: {session_id}")

    def disconnect(self, session_id: str):
        """断开连接"""
        self.active_connections.pop(session_id, None)
        if session_id in self.runners:
            runner = self.runners.pop(session_id)
            asyncio.create_task(runner.close())
        logger.info(f"WebSocket disconnected: {session_id}")

    async def send_json(self, session_id: str, data: dict):
        """发送 JSON 消息"""
        if session_id in self.active_connections:
            try:
                await self.active_connections[session_id].send_json(data)
            except Exception as e:
                logger.error(f"Failed to send to {session_id}: {e}")


manager = ConnectionManager()


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
    return ConversationResponse(
        id=conv.id,
        cli_type=conv.cli_type,
        session_id=conv.session_id,
        title=conv.title,
        workspace=conv.workspace,
        status=conv.status,
        created_at=conv.created_at,
        updated_at=conv.updated_at
    )


@router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(cli_type: Optional[str] = None, limit: int = 50):
    """列出对话"""
    convs = conversation_store.list_conversations(cli_type=cli_type, limit=limit)
    return [
        ConversationResponse(
            id=c.id,
            cli_type=c.cli_type,
            session_id=c.session_id,
            title=c.title,
            workspace=c.workspace,
            status=c.status,
            created_at=c.created_at,
            updated_at=c.updated_at
        )
        for c in convs
    ]


@router.get("/conversations/{conv_id}", response_model=ConversationResponse)
async def get_conversation(conv_id: str):
    """获取对话详情"""
    conv = conversation_store.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationResponse(
        id=conv.id,
        cli_type=conv.cli_type,
        session_id=conv.session_id,
        title=conv.title,
        workspace=conv.workspace,
        status=conv.status,
        created_at=conv.created_at,
        updated_at=conv.updated_at
    )


@router.get("/conversations/{conv_id}/messages", response_model=List[MessageResponse])
async def get_messages(conv_id: str, limit: int = 100, before_id: Optional[str] = None):
    """获取消息列表"""
    msgs = conversation_store.get_messages(conv_id, limit=limit, before_id=before_id)
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
        for m in msgs
    ]


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

@router.websocket("/ws/{cli_type}/{session_id}")
async def chat_websocket(websocket: WebSocket, cli_type: str, session_id: str):
    """
    WebSocket 聊天接口 - 严格遵循 AionUi 协议

    客户端消息格式:
    - { "type": "message", "content": "...", "conversation_id": "..." }
    - { "type": "pong" }
    - { "type": "stop" }

    服务器消息格式:
    - { "type": "connected" }
    - { "type": "ping" }
    - { "type": "start", "msg_id": "..." }
    - { "type": "content", "data": "...", "msg_id": "..." }
    - { "type": "tool_call", "data": {...}, "msg_id": "..." }
    - { "type": "finish", "msg_id": "..." }
    - { "type": "error", "data": "...", "msg_id": "..." }
    """
    await manager.connect(websocket, session_id)

    # 查找或创建对话
    conv = conversation_store.get_conversation_by_session(session_id)
    if not conv:
        cli_info = detector.get_cli_info(cli_type)
        if cli_info:
            conv_id = conversation_store.create_conversation(
                cli_type=cli_type,
                session_id=session_id,
                title=f"New {cli_info.name} chat"
            )
            conv = conversation_store.get_conversation(conv_id)

    # 发送连接成功消息
    await websocket.send_json({"type": "connected"})

    # 创建 Runner
    cli_info = detector.get_cli_info(cli_type)
    runner = None
    if cli_info:
        workspace = conv.workspace if conv else ""
        runner = RunnerFactory.create(cli_info, session_id, workspace)
        manager.runners[session_id] = runner

    try:
        while True:
            # 接收客户端消息
            data = await websocket.receive_json()
            msg_type = data.get("type", "message")

            if msg_type == "pong":
                logger.debug(f"Pong from {session_id}")
                continue

            elif msg_type == "stop":
                if session_id in manager.runners:
                    await manager.runners[session_id].close()
                await manager.send_json(session_id, {"type": "stopped"})

            elif msg_type == "message":
                message = data.get("content", "")
                conv_id = data.get("conversation_id", conv.id if conv else None)

                if not message or not conv_id:
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
                    await manager.send_json(session_id, {
                        "type": event.type,
                        "data": event.data,
                        "msg_id": event.msg_id,
                        "metadata": event.metadata
                    })
                    if event.type == "content":
                        full_response.append(event.data)

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
                        await manager.send_json(session_id, {
                            "type": "error",
                            "data": str(e),
                            "msg_id": msg_id
                        })

    except WebSocketDisconnect:
        logger.info(f"Client {session_id} disconnected")
    except Exception as e:
        logger.exception(f"WebSocket error for {session_id}")
        try:
            await websocket.send_json({
                "type": "error",
                "data": f"Server error: {str(e)}"
            })
        except:
            pass
    finally:
        manager.disconnect(session_id)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/huanc/Desktop/ABO
python -m pytest tests/routes/test_chat.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add abo/routes/chat.py tests/routes/test_chat.py
git commit -m "feat(api): implement FastAPI chat routes with WebSocket"
```

---

## Part 2: Frontend Implementation

### Task 5: Chat Types

**Files:**
- Create: `src/types/chat.ts`
- Test: Verify TypeScript compilation

- [ ] **Step 1: Write the types file**

```typescript
// src/types/chat.ts

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

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd /Users/huanc/Desktop/ABO
npx tsc --noEmit src/types/chat.ts
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/types/chat.ts
git commit -m "feat(types): add chat module TypeScript types"
```

---

### Task 6: Chat API Client

**Files:**
- Create: `src/api/chat.ts`
- Test: Verify TypeScript compilation

- [ ] **Step 1: Write the API client**

```typescript
// src/api/chat.ts

import type { CliConfig, Conversation, Message, StreamEvent } from '../types/chat';

const API_BASE = 'http://127.0.0.1:8765/api/chat';

// === CLI Detection ===

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

// === Conversation Management ===

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

// === Messages ===

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

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd /Users/huanc/Desktop/ABO
npx tsc --noEmit src/api/chat.ts
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/api/chat.ts
git commit -m "feat(api): add chat API client with WebSocket support"
```

---

### Task 7: useChat Hook

**Files:**
- Create: `src/hooks/useChat.ts`
- Test: Verify TypeScript compilation

- [ ] **Step 1: Write the useChat hook**

```typescript
// src/hooks/useChat.ts

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
  // CLI state
  const [availableClis, setAvailableClis] = useState<CliConfig[]>([]);
  const [selectedCli, setSelectedCli] = useState<CliConfig | null>(null);

  // Conversation state
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const currentMsgIdRef = useRef<string>('');

  // Detect CLI on mount
  useEffect(() => {
    detectClis()
      .then(setAvailableClis)
      .catch((e) => setError(e.message));
  }, []);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Select CLI
  const selectCli = useCallback((cli: CliConfig) => {
    setSelectedCli(cli);
    setError(null);
  }, []);

  // Create new conversation
  const createNewConversation = useCallback(async () => {
    if (!selectedCli) {
      setError('Please select a CLI first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Close existing connection
      wsRef.current?.close();

      // Create new conversation
      const conv = await createConversation(selectedCli.id);
      setConversation(conv);
      setMessages([]);

      // Establish WebSocket connection
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

  // Load existing conversation
  const loadConversation = useCallback(async (conv: Conversation) => {
    setIsLoading(true);
    setError(null);

    try {
      // Close existing connection
      wsRef.current?.close();

      // Load history messages
      const history = await getMessages(conv.id);
      setMessages(history);
      setConversation(conv);

      // Find CLI config
      const cli = availableClis.find((c) => c.id === conv.cliType);
      if (cli) setSelectedCli(cli);

      // Establish WebSocket connection
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

  // Handle stream events
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

      case 'tool_call': {
        const toolData = event.metadata || {};
        setMessages((prev) => [
          ...prev,
          {
            id: `tool-${Date.now()}`,
            conversationId: conversation?.id || '',
            role: 'assistant',
            content: `Tool: ${toolData.toolName || 'unknown'}`,
            contentType: 'tool_call',
            metadata: toolData,
            status: 'completed',
            createdAt: Date.now(),
          },
        ]);
        break;
      }

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

  // Send message
  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || !conversation) {
      setError('Not connected');
      return;
    }

    if (wsRef.current.readyState !== WebSocket.OPEN) {
      setError('WebSocket not connected');
      return;
    }

    // Add user message to list
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

    // Send message
    wsRef.current.send(
      JSON.stringify({
        type: 'message',
        content,
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

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd /Users/huanc/Desktop/ABO
npx tsc --noEmit src/hooks/useChat.ts
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useChat.ts
git commit -m "feat(hooks): implement useChat hook with WebSocket"
```

---

### Task 8: Chat Components

**Files:**
- Create: `src/modules/chat/MessageList.tsx`
- Create: `src/modules/chat/ChatInput.tsx`
- Create: `src/modules/chat/ChatPanel.tsx`

- [ ] **Step 1: Implement MessageList component**

```tsx
// src/modules/chat/MessageList.tsx

import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#FCFAF2]">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} gap-3`}
        >
          {/* 消息气泡 */}
          <div
            className={`max-w-[80%] rounded-lg px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-white shadow-sm'
                : 'bg-white border border-[#E6DDF2]'
            }`}
          >
            {/* 消息内容 */}
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={oneLight}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className="bg-[#F5F5F0] px-1.5 py-0.5 rounded text-sm" {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {msg.content}
              </ReactMarkdown>
              {/* 流式光标 */}
              {msg.isStreaming && (
                <span className="inline-block w-2 h-5 ml-1 bg-[#7B5EA7] animate-pulse">
                  ▋
                </span>
              )}
            </div>

            {/* 时间戳 */}
            <div
              className={`mt-2 text-xs text-[#666666] ${
                msg.role === 'user' ? 'text-right' : 'text-left'
              }`}
            >
              {msg.role === 'user' && <span className="mr-1">[你]</span>}
              {msg.timestamp}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default MessageList;
```

- [ ] **Step 2: Implement ChatInput component**

```tsx
// src/modules/chat/ChatInput.tsx

import { useState, useRef, KeyboardEvent } from 'react';
import { Mic, Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = '输入消息...',
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!message.trim() || disabled) return;
    onSend(message.trim());
    setMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  return (
    <div className="px-4 py-3 bg-[#FCFAF2] border-t border-[#E6DDF2]">
      <div className="flex items-end gap-2">
        {/* 输入框容器 */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className="w-full px-4 py-3 pr-12 rounded-lg border border-[#E6DDF2]
                       bg-white text-[#1a1a1a] placeholder-[#999999]
                       focus:outline-none focus:border-[#D8B4E2] focus:ring-1 focus:ring-[#D8B4E2]
                       resize-none overflow-hidden transition-all"
            style={{ minHeight: '48px', maxHeight: '200px' }}
          />
          {/* 麦克风图标 */}
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5
                       text-[#7B5EA7] hover:bg-[#F3EDFA] rounded-md transition-colors"
            aria-label="语音输入"
          >
            <Mic className="w-5 h-5" />
          </button>
        </div>

        {/* 发送按钮 */}
        <button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          className="p-3 rounded-lg bg-[#7B5EA7] text-white
                     hover:bg-[#6B4E97] disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors flex-shrink-0"
          aria-label="发送"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export default ChatInput;
```

- [ ] **Step 3: Implement ChatPanel component**

```tsx
// src/modules/chat/ChatPanel.tsx

import { useEffect, useRef, useCallback } from 'react';
import { Plus, AlertCircle, Loader2 } from 'lucide-react';
import { MessageList, Message as MessageListMessage } from './MessageList';
import { ChatInput } from './ChatInput';
import { useChat } from '../../hooks/useChat';
import type { Message } from '../../types/chat';

function convertMessages(messages: Message[]): MessageListMessage[] {
  return messages.map((msg) => ({
    id: msg.id,
    role: msg.role === 'system' ? 'assistant' : msg.role,
    content: msg.content,
    timestamp: new Date(msg.createdAt).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    isStreaming: msg.status === 'streaming',
  }));
}

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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleCliSelect = useCallback(
    (cliId: string) => {
      const cli = availableClis.find((c) => c.id === cliId);
      if (cli) {
        selectCli(cli);
      }
    },
    [availableClis, selectCli]
  );

  const handleNewChat = useCallback(async () => {
    await createNewConversation();
  }, [createNewConversation]);

  const handleSend = useCallback(
    (content: string) => {
      sendMessage(content);
    },
    [sendMessage]
  );

  const availableCliList = availableClis.filter((cli) => cli.isAvailable);

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between px-4 h-[60px] border-b border-[#E6DDF2] bg-[#FCFAF2]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <select
              value={selectedCli?.id || ''}
              onChange={(e) => handleCliSelect(e.target.value)}
              disabled={isLoading || availableCliList.length === 0}
              className="px-3 py-1.5 rounded-md border border-[#E6DDF2] bg-white
                         text-sm text-[#1a1a1a] focus:outline-none focus:border-[#D8B4E2]
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">
                {availableCliList.length === 0 ? '无可用 CLI' : '选择 CLI'}
              </option>
              {availableCliList.map((cli) => (
                <option key={cli.id} value={cli.id}>
                  {cli.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleNewChat}
              disabled={!selectedCli || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md
                         bg-[#7B5EA7] text-white text-sm
                         hover:bg-[#6B4E97] disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors"
            >
              <Plus className="w-4 h-4" />
              新对话
            </button>
          </div>

          {conversation && (
            <div className="flex items-center gap-1.5 ml-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />
              <span className="text-sm text-[#666666]">
                {isConnected ? '已连接' : '未连接'}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => console.log('Settings clicked')}
            className="p-2 rounded-md hover:bg-[#F5F5F0] transition-colors"
            aria-label="Settings"
          >
            <svg
              className="w-5 h-5 text-[#666666]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  const renderError = () => {
    if (!error) return null;

    return (
      <div className="px-4 py-2 bg-red-50 border-b border-red-100">
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      </div>
    );
  };

  const renderLoading = () => {
    if (!isLoading) return null;

    return (
      <div className="absolute inset-0 bg-[#FCFAF2]/80 flex items-center justify-center z-10">
        <div className="flex items-center gap-2 text-[#7B5EA7]">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">连接中...</span>
        </div>
      </div>
    );
  };

  const renderEmptyState = () => {
    if (conversation || isLoading) return null;

    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#F3EDFA] flex items-center justify-center">
            <svg
              className="w-8 h-8 text-[#7B5EA7]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <p className="text-[#666666] text-sm mb-2">选择一个 CLI 开始新对话</p>
          {availableCliList.length === 0 && (
            <p className="text-[#999999] text-xs">未检测到可用的 CLI</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#FCFAF2] relative">
      {renderHeader()}
      {renderError()}
      {renderLoading()}

      {conversation ? (
        <>
          <div className="flex-1 overflow-hidden relative">
            <div className="absolute inset-0 overflow-y-auto">
              <MessageList messages={convertMessages(messages)} />
              <div ref={messagesEndRef} />
            </div>
          </div>

          <ChatInput
            onSend={handleSend}
            disabled={!isConnected || isStreaming}
            placeholder={isConnected ? '输入消息...' : '等待连接...'}
          />
        </>
      ) : (
        renderEmptyState()
      )}
    </div>
  );
}

export default ChatPanel;
```

- [ ] **Step 4: Verify TypeScript compilation**

```bash
cd /Users/huanc/Desktop/ABO
npx tsc --noEmit src/modules/chat/MessageList.tsx src/modules/chat/ChatInput.tsx src/modules/chat/ChatPanel.tsx
```
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/modules/chat/
git commit -m "feat(chat): implement chat UI components"
```

---

## Part 3: Integration & Testing

### Task 9: Register Routes in Main App

**Files:**
- Modify: `abo/main.py`

- [ ] **Step 1: Verify chat router is imported and registered**

Check that `abo/main.py` contains:

```python
from .routes.chat import router as chat_router

# ... in app setup ...
app.include_router(chat_router)
```

- [ ] **Step 2: Run backend integration test**

```bash
cd /Users/huanc/Desktop/ABO
python -c "
from abo.main import app
from fastapi.testclient import TestClient
client = TestClient(app)

# Test CLI detection endpoint
response = client.get('/api/chat/cli/detect')
print(f'CLI detect status: {response.status_code}')
print(f'CLI detect response: {response.json()}')

# Test conversations list
response = client.get('/api/chat/conversations')
print(f'Conversations status: {response.status_code}')
print(f'Conversations response: {response.json()}')

print('Integration test passed!')
"
```
Expected: 200 status codes, valid JSON responses

- [ ] **Step 3: Commit**

```bash
git add abo/main.py
git commit -m "feat(api): register chat router in main app"
```

---

### Task 10: End-to-End Test

**Files:**
- Test: Full workflow

- [ ] **Step 1: Start backend server**

```bash
cd /Users/huanc/Desktop/ABO
python -m abo.main &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"
sleep 3
```

- [ ] **Step 2: Test CLI detection**

```bash
curl -s http://127.0.0.1:8765/api/chat/cli/detect | python -m json.tool
```
Expected: JSON array of CLI info

- [ ] **Step 3: Create a conversation**

```bash
curl -s -X POST http://127.0.0.1:8765/api/chat/conversations \
  -H "Content-Type: application/json" \
  -d '{"cli_type": "claude", "title": "Test Conversation"}' | python -m json.tool
```
Expected: Conversation object with id, session_id, etc.

- [ ] **Step 4: Test WebSocket connection**

```python
import asyncio
import websockets
import json

async def test_websocket():
    uri = "ws://127.0.0.1:8765/api/chat/ws/claude/test-session-123"
    async with websockets.connect(uri) as ws:
        # Wait for connected message
        response = await ws.recv()
        data = json.loads(response)
        print(f"Received: {data}")
        assert data['type'] == 'connected'
        print("WebSocket test passed!")

asyncio.run(test_websocket())
```

- [ ] **Step 5: Stop backend**

```bash
kill $BACKEND_PID 2>/dev/null || true
```

- [ ] **Step 6: Commit**

```bash
git commit -m "test(e2e): verify end-to-end chat functionality"
```

---

## Summary

This implementation plan creates a complete CLI chat system with:

1. **Backend**:
   - CLI auto-detection (`abo/cli/detector.py`)
   - Multi-protocol runner (`abo/cli/runner.py`)
   - SQLite conversation store (`abo/store/conversations.py`)
   - FastAPI routes with WebSocket (`abo/routes/chat.py`)

2. **Frontend**:
   - TypeScript types (`src/types/chat.ts`)
   - API client with WebSocket (`src/api/chat.ts`)
   - React hook for state management (`src/hooks/useChat.ts`)
   - UI components (`src/modules/chat/`)

3. **Testing**:
   - Unit tests for each module
   - Integration tests for API
   - End-to-end test for full workflow

---

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/2026-04-05-unified-chat-module.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**