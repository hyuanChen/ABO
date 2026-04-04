# CLI Chat Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a complete CLI chat module replicating AionUi design with auto CLI detection, WebSocket streaming, connection management, and full UI components.

**Architecture:** Backend uses FastAPI with WebSocket endpoints, multi-protocol runners (Raw/ACP/WebSocket), SQLite for persistence, and heartbeat-based connection management. Frontend uses React with Zustand, custom hooks for connection state, and AionUi-styled components.

**Tech Stack:** Python 3.11+, FastAPI, WebSocket, SQLite, React 18+, TypeScript, Tailwind CSS, Zustand

---

## File Structure Overview

### Backend Files
- `abo/cli/detector.py` - CLI auto-detection for claude/gemini/codex/openclaw
- `abo/cli/runner.py` - Multi-protocol runners (RawRunner, AcpRunner, WebSocketRunner)
- `abo/cli/health.py` - Process health monitoring
- `abo/store/conversations.py` - SQLite conversation/message storage
- `abo/routes/chat.py` - FastAPI routes + WebSocket endpoint
- `abo/main.py` - Router registration

### Frontend Files
- `src/types/chat.ts` - TypeScript type definitions
- `src/api/chat.ts` - API client + WebSocket factory
- `src/hooks/useChat.ts` - Main chat hook
- `src/hooks/useConnection.ts` - Enhanced connection hook with reconnection
- `src/hooks/useConnectionRecovery.ts` - Connection recovery after refresh
- `src/modules/chat/ChatPanel.tsx` - Main chat panel
- `src/modules/chat/CliSelector.tsx` - CLI selection UI
- `src/modules/chat/MessageList.tsx` - Message list display
- `src/modules/chat/ChatInput.tsx` - Chat input component
- `src/modules/chat/ChatHeader.tsx` - Chat header with status
- `src/modules/MainContent.tsx` - Add chat route
- `src/modules/nav/NavSidebar.tsx` - Add chat nav item

---

## Phase 1: Backend Foundation

### Task 1: Create CLI Detector

**Files:**
- Create: `abo/cli/__init__.py`
- Create: `abo/cli/detector.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_cli_detector.py`:
```python
import pytest
from abo.cli.detector import CliDetector, CliInfo


def test_cli_info_creation():
    """Test CliInfo dataclass creation"""
    info = CliInfo(
        id="claude",
        name="Claude Code",
        command="claude",
        check_cmd="claude --version",
        version="",
        is_available=False,
        acp_args=["--experimental-acp"],
        protocol="raw"
    )
    assert info.id == "claude"
    assert info.name == "Claude Code"
    assert info.acp_args == ["--experimental-acp"]


def test_detector_initialization():
    """Test CliDetector can be initialized"""
    detector = CliDetector(db_path="/tmp/test_cli_config.json")
    assert detector is not None
    assert "claude" in detector.REGISTRY
    assert "gemini" in detector.REGISTRY


def test_detect_single_mocked(mocker):
    """Test single CLI detection with mocked subprocess"""
    from unittest.mock import patch, MagicMock

    detector = CliDetector(db_path="/tmp/test_cli_config2.json")
    cli_info = detector.REGISTRY["claude"]

    # Mock subprocess.run
    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = "claude 1.0.0"

    with patch('shutil.which', return_value='/usr/bin/claude'):
        with patch('subprocess.run', return_value=mock_result):
            result = detector._detect_single(cli_info)
            assert result.is_available is True
            assert "1.0.0" in result.version
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_cli_detector.py -v`
Expected: FAIL with module not found

- [ ] **Step 3: Write minimal implementation**

Create `abo/cli/__init__.py`:
```python
"""CLI module for chat integration"""
from .detector import CliDetector, CliInfo, detector
from .runner import RunnerFactory, BaseRunner, RawRunner, AcpRunner, WebSocketRunner, StreamEvent

__all__ = [
    'CliDetector', 'CliInfo', 'detector',
    'RunnerFactory', 'BaseRunner', 'RawRunner', 'AcpRunner', 'WebSocketRunner', 'StreamEvent'
]
```

Create `abo/cli/detector.py`:
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
            json.dump([asdict(info) for info in self._cache.values()], f, indent=2, default=str)

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_cli_detector.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/test_cli_detector.py abo/cli/__init__.py abo/cli/detector.py
git commit -m "feat(cli): add CLI detector with auto-discovery"
```

---

### Task 2: Create Multi-Protocol Runners

**Files:**
- Create: `abo/cli/runner.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_cli_runner.py`:
```python
import pytest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from abo.cli.runner import RunnerFactory, RawRunner, AcpRunner, StreamEvent


@pytest.mark.asyncio
async def test_stream_event_creation():
    """Test StreamEvent dataclass"""
    event = StreamEvent(
        type="content",
        data="Hello",
        msg_id="msg-123",
        metadata={"key": "value"}
    )
    assert event.type == "content"
    assert event.data == "Hello"
    assert event.msg_id == "msg-123"


def test_runner_factory_create():
    """Test RunnerFactory creates correct runner type"""
    from abo.cli.detector import CliInfo

    # Test raw protocol
    raw_info = CliInfo(
        id="claude", name="Claude", command="claude",
        check_cmd="claude --version", protocol="raw"
    )
    runner = RunnerFactory.create(raw_info, "session-123", "/tmp")
    assert isinstance(runner, RawRunner)

    # Test acp protocol
    acp_info = CliInfo(
        id="gemini", name="Gemini", command="gemini",
        check_cmd="gemini --version", protocol="acp"
    )
    runner = RunnerFactory.create(acp_info, "session-123", "/tmp")
    assert isinstance(runner, AcpRunner)


@pytest.mark.asyncio
async def test_raw_runner_initialization():
    """Test RawRunner can be initialized"""
    from abo.cli.detector import CliInfo

    info = CliInfo(
        id="claude", name="Claude", command="claude",
        check_cmd="claude --version", protocol="raw"
    )
    runner = RawRunner(info, "session-123", "/tmp")
    assert runner.cli_info == info
    assert runner.session_id == "session-123"
    assert runner.workspace == "/tmp"
    assert runner._closed is False
    await runner.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_cli_runner.py -v`
Expected: FAIL with module not found

- [ ] **Step 3: Write minimal implementation**

Create `abo/cli/runner.py`:
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

        buffer = b""

        try:
            while not self._closed:
                try:
                    chunk = await asyncio.wait_for(
                        self.process.stdout.read(4096), timeout=30.0
                    )
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
        try:
            import websockets
        except ImportError:
            await on_event(StreamEvent(
                type="error",
                data="websockets package not installed",
                msg_id=msg_id
            ))
            return

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_cli_runner.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/test_cli_runner.py abo/cli/runner.py
git commit -m "feat(cli): add multi-protocol runners (raw/acp/websocket)"
```

---

### Task 3: Create Conversation Storage

**Files:**
- Create: `abo/store/conversations.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_conversation_store.py`:
```python
import pytest
import os
import tempfile
from abo.store.conversations import ConversationStore, Conversation, Message


@pytest.fixture
def temp_db():
    """Create a temporary database"""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    yield path
    os.unlink(path)


def test_conversation_creation(temp_db):
    """Test creating a conversation"""
    store = ConversationStore(db_path=temp_db)

    conv_id = store.create_conversation(
        cli_type="claude",
        session_id="session-123",
        title="Test Chat",
        workspace="/tmp"
    )

    assert conv_id is not None
    conv = store.get_conversation(conv_id)
    assert conv is not None
    assert conv.cli_type == "claude"
    assert conv.session_id == "session-123"
    assert conv.title == "Test Chat"


def test_message_operations(temp_db):
    """Test adding and retrieving messages"""
    store = ConversationStore(db_path=temp_db)

    # Create conversation
    conv_id = store.create_conversation(
        cli_type="claude", session_id="session-456"
    )

    # Add messages
    msg1_id = store.add_message(
        conv_id=conv_id,
        role="user",
        content="Hello",
        msg_id="msg-1"
    )

    msg2_id = store.add_message(
        conv_id=conv_id,
        role="assistant",
        content="Hi there!",
        msg_id="msg-2"
    )

    # Get messages
    messages = store.get_messages(conv_id)
    assert len(messages) == 2
    assert messages[0].role == "user"
    assert messages[0].content == "Hello"
    assert messages[1].role == "assistant"


def test_update_message_content(temp_db):
    """Test updating message content (for streaming)"""
    store = ConversationStore(db_path=temp_db)

    conv_id = store.create_conversation(
        cli_type="claude", session_id="session-789"
    )

    msg_id = store.add_message(
        conv_id=conv_id,
        role="assistant",
        content="",
        msg_id="stream-msg",
        status="streaming"
    )

    # Update content
    store.update_message_content("stream-msg", "Hello")
    store.update_message_content("stream-msg", "Hello World")

    messages = store.get_messages(conv_id)
    assert messages[0].content == "Hello World"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_conversation_store.py -v`
Expected: FAIL with module not found

- [ ] **Step 3: Write minimal implementation**

Create `abo/store/conversations.py`:
```python
"""对话数据存储模块"""

import sqlite3
import json
import os
from typing import List, Optional
from dataclasses import dataclass
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
    """对话存储管理器"""

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_conversation_store.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/test_conversation_store.py abo/store/conversations.py
git commit -m "feat(store): add conversation storage with SQLite"
```

---

### Task 4: Create Chat Routes and WebSocket

**Files:**
- Create: `abo/routes/chat.py`
- Modify: `abo/main.py` (add router registration)

- [ ] **Step 1: Write the failing test**

Create `tests/test_chat_routes.py`:
```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


def test_cli_detect_endpoint(client):
    """Test CLI detection endpoint"""
    # Mock the detector
    mock_cli = MagicMock()
    mock_cli.id = "claude"
    mock_cli.name = "Claude Code"
    mock_cli.command = "claude"
    mock_cli.version = "1.0.0"
    mock_cli.is_available = True
    mock_cli.protocol = "raw"

    with patch('abo.routes.chat.detector') as mock_detector:
        mock_detector.detect_all.return_value = [mock_cli]

        response = client.get("/api/chat/cli/detect")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == "claude"


def test_create_conversation_endpoint(client):
    """Test creating a conversation"""
    mock_cli = MagicMock()
    mock_cli.is_available = True
    mock_cli.name = "Claude Code"

    with patch('abo.routes.chat.detector') as mock_detector:
        mock_detector.get_cli_info.return_value = mock_cli

        with patch('abo.routes.chat.conversation_store') as mock_store:
            mock_conv = MagicMock()
            mock_conv.id = "conv-123"
            mock_conv.cli_type = "claude"
            mock_conv.session_id = "session-123"
            mock_conv.title = "Test Chat"
            mock_conv.workspace = ""
            mock_conv.status = "active"
            mock_conv.created_at = 1234567890
            mock_conv.updated_at = 1234567890

            mock_store.create_conversation.return_value = "conv-123"
            mock_store.get_conversation.return_value = mock_conv

            response = client.post(
                "/api/chat/conversations",
                json={"cli_type": "claude", "title": "Test Chat"}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["cli_type"] == "claude"


def test_list_conversations_endpoint(client):
    """Test listing conversations"""
    with patch('abo.routes.chat.conversation_store') as mock_store:
        mock_conv = MagicMock()
        mock_conv.id = "conv-123"
        mock_conv.cli_type = "claude"
        mock_conv.session_id = "session-123"
        mock_conv.title = "Test Chat"
        mock_conv.workspace = ""
        mock_conv.status = "active"
        mock_conv.created_at = 1234567890
        mock_conv.updated_at = 1234567890

        mock_store.list_conversations.return_value = [mock_conv]

        response = client.get("/api/chat/conversations")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_chat_routes.py -v`
Expected: FAIL with module not found

- [ ] **Step 3: Write minimal implementation**

Create `abo/routes/chat.py`:
```python
"""聊天 API 路由"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
from enum import Enum
from dataclasses import dataclass, field
import asyncio
import json
import logging
import uuid

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


# === 连接状态管理 ===

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
    client_id: str
    cli_type: str
    session_id: str
    state: ConnectionState = ConnectionState.IDLE
    websocket: Optional[WebSocket] = None
    runner: Optional = None
    last_ping: datetime = field(default_factory=datetime.now)
    last_pong: datetime = field(default_factory=datetime.now)
    reconnect_count: int = 0
    error_message: Optional[str] = None
    connected_at: Optional[datetime] = None

    @property
    def is_alive(self) -> bool:
        if self.state in [ConnectionState.DISCONNECTED, ConnectionState.ERROR]:
            return False
        if datetime.now() - self.last_pong > timedelta(seconds=30):
            return False
        return True


class EnhancedConnectionManager:
    """增强版连接管理器"""

    HEARTBEAT_INTERVAL = 15
    HEARTBEAT_TIMEOUT = 30
    MAX_RECONNECT = 3

    def __init__(self):
        self.connections: dict = {}
        self._heartbeat_tasks: dict = {}

    async def connect(self, websocket: WebSocket, cli_type: str, session_id: str) -> ConnectionInfo:
        """建立新连接"""
        client_id = f"{cli_type}:{session_id}"

        if client_id in self.connections:
            await self.disconnect(client_id, "reconnecting")

        await websocket.accept()

        conn = ConnectionInfo(
            client_id=client_id,
            cli_type=cli_type,
            session_id=session_id,
            websocket=websocket,
            state=ConnectionState.CONNECTING
        )
        self.connections[client_id] = conn

        try:
            cli_info = detector.get_cli_info(cli_type)
            if cli_info:
                conn.runner = RunnerFactory.create(cli_info, session_id, "")
                conn.state = ConnectionState.CONNECTED
                conn.connected_at = datetime.now()
                conn.reconnect_count = 0
                self._start_heartbeat(client_id)
                logger.info(f"Connection established: {client_id}")
            else:
                raise ValueError(f"CLI {cli_type} not found")

        except Exception as e:
            conn.state = ConnectionState.ERROR
            conn.error_message = str(e)
            raise

        return conn

    async def disconnect(self, client_id: str, reason: str = "unknown"):
        """断开连接"""
        conn = self.connections.pop(client_id, None)
        if not conn:
            return

        logger.info(f"Disconnecting {client_id}: {reason}")

        if client_id in self._heartbeat_tasks:
            self._heartbeat_tasks[client_id].cancel()
            del self._heartbeat_tasks[client_id]

        if conn.runner:
            try:
                await conn.runner.close()
            except Exception as e:
                logger.error(f"Error closing runner: {e}")

        if conn.websocket:
            try:
                await conn.websocket.close()
            except Exception:
                pass

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

                conn.last_ping = datetime.now()
                try:
                    await conn.websocket.send_json({
                        "type": "ping",
                        "timestamp": conn.last_ping.isoformat()
                    })
                except Exception as e:
                    logger.warning(f"Heartbeat send failed for {client_id}: {e}")
                    break

                if datetime.now() - conn.last_pong > timedelta(seconds=self.HEARTBEAT_TIMEOUT):
                    logger.warning(f"Heartbeat timeout for {client_id}")
                    break

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Heartbeat error for {client_id}: {e}")

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
            "reconnect_count": conn.reconnect_count,
            "connected_at": conn.connected_at.isoformat() if conn.connected_at else None,
            "error": conn.error_message
        }

    def get_all_status(self) -> list:
        """获取所有连接状态"""
        return [self.get_connection_status(cid) for cid in self.connections.keys()]


manager = EnhancedConnectionManager()


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


# === 连接状态 API ===

@router.get("/connections/status")
async def get_all_connection_status():
    """获取所有连接状态"""
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


# === WebSocket 实时通信 ===

@router.websocket("/ws/{cli_type}/{session_id}")
async def chat_websocket(websocket: WebSocket, cli_type: str, session_id: str):
    """
    WebSocket 聊天接口

    客户端消息格式:
    - { "type": "message", "content": "...", "conversation_id": "..." }
    - { "type": "pong", "timestamp": "..." }
    - { "type": "stop" }

    服务器消息格式:
    - { "type": "ping", "timestamp": "..." }
    - { "type": "connected" }
    - { "type": "start", "msg_id": "..." }
    - { "type": "content", "data": "...", "msg_id": "..." }
    - { "type": "finish", "msg_id": "..." }
    - { "type": "error", "data": "...", "msg_id": "..." }
    """
    client_id = f"{cli_type}:{session_id}"

    try:
        # 建立连接
        conn = await manager.connect(websocket, cli_type, session_id)

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

        if not conv:
            await websocket.send_json({
                "type": "error",
                "data": "Failed to create conversation",
                "msg_id": ""
            })
            await manager.disconnect(client_id)
            return

        # 发送连接成功消息
        await websocket.send_json({
            "type": "connected",
            "client_id": client_id,
            "timestamp": datetime.now().isoformat()
        })

        # 消息处理循环
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=60.0
                )

                msg_type = data.get("type", "message")

                if msg_type == "pong":
                    conn.last_pong = datetime.now()

                elif msg_type == "stop":
                    # 停止生成 - runner 需要实现 stop 方法
                    await manager.send_json(client_id, {
                        "type": "stopped",
                        "timestamp": datetime.now().isoformat()
                    })

                elif msg_type == "message":
                    await _handle_chat_message(conn, data, client_id, conv.id)

            except asyncio.TimeoutError:
                if not conn.is_alive:
                    logger.warning(f"Connection {client_id} timed out")
                    break

    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected")
    except Exception as e:
        logger.exception(f"WebSocket error for {client_id}")
        try:
            await websocket.send_json({
                "type": "error",
                "data": f"Server error: {str(e)}"
            })
        except:
            pass
    finally:
        await manager.disconnect(client_id, "cleanup")


async def _handle_chat_message(conn: ConnectionInfo, data: dict, client_id: str, conv_id: str):
    """处理聊天消息"""
    message = data.get("content", "")

    if not message:
        return

    conn.state = ConnectionState.STREAMING

    # 保存用户消息
    conversation_store.add_message(
        conv_id=conv_id,
        role="user",
        content=message
    )

    msg_id = str(uuid.uuid4())
    full_response = []

    async def on_event(event: StreamEvent):
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
                conv_id=conv_id,
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

- [ ] **Step 4: Register router in main.py**

Modify `abo/main.py`:
```python
# Add near other imports
from .routes.chat import router as chat_router

# Add after app creation
app.include_router(chat_router)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/test_chat_routes.py -v`
Expected: PASS (3 tests)

- [ ] **Step 6: Test CLI detection endpoint manually**

```bash
# Start backend
python -m abo.main &

# Test CLI detection
curl http://127.0.0.1:8765/api/chat/cli/detect
```

Expected: Returns list of available CLIs

- [ ] **Step 7: Commit**

```bash
git add tests/test_chat_routes.py abo/routes/chat.py abo/main.py
git commit -m "feat(chat): add chat routes with WebSocket and connection management"
```

---

## Phase 2: Frontend Foundation

### Task 5: Create TypeScript Types

**Files:**
- Create: `src/types/chat.ts`

- [ ] **Step 1: Write the type definitions**

Create `src/types/chat.ts`:
```typescript
export type CliType = 'claude' | 'gemini' | 'openclaw' | 'codex' | 'custom';

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
    latency?: number;
  };
  status: MessageStatus;
  createdAt: number;
}

export interface StreamEvent {
  type: 'start' | 'content' | 'tool_call' | 'error' | 'finish' | 'ping' | 'pong' | 'connected' | 'stopped';
  data: string;
  msgId: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'streaming'
  | 'disconnected'
  | 'error'
  | 'reconnecting';

export interface ConnectionStatus {
  clientId: string;
  cliType: string;
  state: ConnectionState;
  isAlive: boolean;
  latencyMs?: number;
  reconnectCount: number;
  connectedAt?: string;
  error?: string;
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/types/chat.ts
git commit -m "feat(types): add chat module TypeScript types"
```

---

### Task 6: Create API Client

**Files:**
- Create: `src/api/chat.ts`

- [ ] **Step 1: Write the API client**

Create `src/api/chat.ts`:
```typescript
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
  const res = await fetch(
    `${API_BASE}/conversations/${convId}/title?title=${encodeURIComponent(title)}`,
    { method: 'PATCH' }
  );
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

// === Connection Status ===

export async function getAllConnectionStatus(): Promise<{
  connections: unknown[];
  timestamp: string;
}> {
  const res = await fetch(`${API_BASE}/connections/status`);
  if (!res.ok) throw new Error('Failed to get connection status');
  return res.json();
}

export async function getConnectionStatus(clientId: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/connections/${clientId}/status`);
  if (!res.ok) throw new Error('Connection not found');
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

// Send message through WebSocket
export function sendWebSocketMessage(
  ws: WebSocket,
  message: string,
  conversationId: string
): boolean {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: 'message',
        content: message,
        conversation_id: conversationId,
      })
    );
    return true;
  }
  return false;
}

// Send pong response
export function sendPong(ws: WebSocket): boolean {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString(),
      })
    );
    return true;
  }
  return false;
}

// Send stop signal
export function sendStop(ws: WebSocket): boolean {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'stop' }));
    return true;
  }
  return false;
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/api/chat.ts
git commit -m "feat(api): add chat API client with WebSocket support"
```

---

### Task 7: Create React Hooks

**Files:**
- Create: `src/hooks/useChat.ts`
- Create: `src/hooks/useConnection.ts`
- Create: `src/hooks/useConnectionRecovery.ts`

- [ ] **Step 1: Write useChat hook**

Create `src/hooks/useChat.ts`:
```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Conversation, Message, StreamEvent, CliConfig } from '../types/chat';
import {
  detectClis,
  createConversation,
  getMessages,
  createChatWebSocket,
  sendWebSocketMessage,
  sendPong,
} from '../api/chat';

interface UseChatReturn {
  // CLI
  availableClis: CliConfig[];
  selectedCli: CliConfig | null;
  selectCli: (cli: CliConfig) => void;

  // Conversation
  conversation: Conversation | null;
  createNewConversation: () => Promise<void>;
  loadConversation: (conv: Conversation) => Promise<void>;

  // Messages
  messages: Message[];
  sendMessage: (content: string) => void;
  isStreaming: boolean;

  // Connection
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
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Detect CLIs on mount
  useEffect(() => {
    detectClis()
      .then(setAvailableClis)
      .catch((e) => setError(e.message));
  }, []);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

  // Select CLI
  const selectCli = useCallback((cli: CliConfig) => {
    setSelectedCli(cli);
    setError(null);
  }, []);

  // Handle stream events
  const handleStreamEvent = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case 'connected':
        setIsConnected(true);
        break;

      case 'ping':
        // Respond with pong
        if (wsRef.current) {
          sendPong(wsRef.current);
        }
        break;

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
            content: `🔧 Using tool: ${toolData.toolName || 'unknown'}`,
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
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
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
  }, [selectedCli, handleStreamEvent]);

  // Load existing conversation
  const loadConversation = useCallback(async (conv: Conversation) => {
    setIsLoading(true);
    setError(null);

    try {
      // Close existing connection
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      wsRef.current?.close();

      // Load history
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
        onError: () => setError('WebSocket connection failed'),
      });

      wsRef.current = ws;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [availableClis, handleStreamEvent]);

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
    sendWebSocketMessage(wsRef.current, content, conversation.id);
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

- [ ] **Step 2: Write useConnection hook**

Create `src/hooks/useConnection.ts`:
```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import type { ConnectionState, ConnectionStatus, StreamEvent } from '../types/chat';
import { createChatWebSocket, sendPong, getConnectionStatus } from '../api/chat';

interface UseConnectionOptions {
  cliType: string;
  sessionId: string;
  onStateChange?: (state: ConnectionState, prevState: ConnectionState) => void;
  onMessage?: (data: StreamEvent) => void;
  onError?: (error: string) => void;
  autoReconnect?: boolean;
  maxReconnect?: number;
}

interface UseConnectionReturn {
  state: ConnectionState;
  status: ConnectionStatus | null;
  latency: number | null;
  connect: () => void;
  disconnect: () => void;
  send: (message: string, conversationId: string) => boolean;
  stop: () => void;
  fetchStatus: () => Promise<void>;
  isConnected: boolean;
  isStreaming: boolean;
  reconnectCount: number;
}

export function useConnection({
  cliType,
  sessionId,
  onStateChange,
  onMessage,
  onError,
  autoReconnect = true,
  maxReconnect = 3,
}: UseConnectionOptions): UseConnectionReturn {
  const [state, setState] = useState<ConnectionState>('idle');
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef<ConnectionState>('idle');

  // Update state and trigger callback
  const updateState = useCallback((newState: ConnectionState) => {
    const prevState = stateRef.current;
    stateRef.current = newState;
    setState(newState);
    onStateChange?.(newState, prevState);
  }, [onStateChange]);

  // Connect WebSocket
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

      // Start client heartbeat
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          sendPong(ws);
        }
      }, 15000);
    };

    ws.onclose = () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }

      if (!autoReconnect || reconnectCountRef.current >= maxReconnect) {
        updateState('disconnected');
        return;
      }

      // Auto reconnect with exponential backoff
      updateState('reconnecting');
      reconnectCountRef.current++;

      setTimeout(() => {
        connect();
      }, 2000 * reconnectCountRef.current);
    };

    ws.onerror = () => {
      updateState('error');
      onError?.('WebSocket error');
    };

    ws.onmessage = (event) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);

        switch (data.type) {
          case 'ping':
            // Respond with pong
            sendPong(ws);
            break;

          case 'connected':
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
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    wsRef.current = ws;
  }, [cliType, sessionId, autoReconnect, maxReconnect, onMessage, onError, updateState]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    wsRef.current?.close();
    updateState('disconnected');
  }, [updateState]);

  // Send message
  const send = useCallback((message: string, conversationId: string): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'message',
          content: message,
          conversation_id: conversationId,
        })
      );
      return true;
    }
    return false;
  }, []);

  // Stop generation
  const stop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
  }, []);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const clientId = `${cliType}:${sessionId}`;
      const data = await getConnectionStatus(clientId);
      setStatus(data as ConnectionStatus);
      if ((data as ConnectionStatus).latencyMs) {
        setLatency((data as ConnectionStatus).latencyMs!);
      }
    } catch (e) {
      console.error('Failed to fetch connection status:', e);
    }
  }, [cliType, sessionId]);

  // Cleanup on unmount
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
    reconnectCount: reconnectCountRef.current,
  };
}
```

- [ ] **Step 3: Write useConnectionRecovery hook**

Create `src/hooks/useConnectionRecovery.ts`:
```typescript
import { useEffect, useState, useCallback } from 'react';
import { useConnection } from './useConnection';
import type { ConnectionState } from '../types/chat';

interface UseConnectionRecoveryReturn {
  isRecovering: boolean;
  state: ConnectionState;
  connect: () => void;
  disconnect: () => void;
}

export function useConnectionRecovery(
  cliType: string,
  sessionId: string
): UseConnectionRecoveryReturn {
  const [isRecovering, setIsRecovering] = useState(true);

  const {
    state,
    connect,
    disconnect,
    status,
    fetchStatus,
  } = useConnection({
    cliType,
    sessionId,
    autoReconnect: true,
  });

  // Recover connection on mount
  useEffect(() => {
    const recover = async () => {
      // Query backend for active connection
      await fetchStatus();

      // If there's an active connection, reconnect
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
    connect,
    disconnect,
  };
}
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useChat.ts src/hooks/useConnection.ts src/hooks/useConnectionRecovery.ts
git commit -m "feat(hooks): add chat React hooks with connection management"
```

---

## Phase 3: UI Components

### Task 8: Create Chat UI Components

**Files:**
- Create: `src/modules/chat/ChatPanel.tsx`
- Create: `src/modules/chat/CliSelector.tsx`
- Create: `src/modules/chat/MessageList.tsx`
- Create: `src/modules/chat/ChatInput.tsx`
- Create: `src/modules/chat/ChatHeader.tsx`

- [ ] **Step 1: Write ChatPanel component**

Create `src/modules/chat/ChatPanel.tsx`:
```typescript
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

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Error state
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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  // CLI selection screen
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

  // Chat interface
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

- [ ] **Step 2: Write CliSelector component**

Create `src/modules/chat/CliSelector.tsx`:
```typescript
import type { CliConfig } from '../../types/chat';
import { Bot, Check, ChevronRight, Terminal } from 'lucide-react';

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
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--primary)]/10">
          <Terminal className="h-8 w-8 text-[var(--primary)]" />
        </div>
        <h2 className="text-2xl font-semibold text-[var(--text)]">
          选择 AI 助手
        </h2>
        <p className="mt-2 text-[var(--text-muted)]">
          选择一个 CLI 工具开始对话
        </p>
      </div>

      {availableClis.length === 0 ? (
        <div className="rounded-xl bg-amber-50 p-6 text-amber-600 dark:bg-amber-900/20">
          <p className="font-medium">未检测到可用的 CLI 工具</p>
          <p className="mt-2 text-sm">
            请安装 Claude Code、Gemini CLI 或 OpenAI Codex
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

- [ ] **Step 3: Write MessageList component**

Create `src/modules/chat/MessageList.tsx`:
```typescript
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
      {/* Avatar */}
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

      {/* Content */}
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

- [ ] **Step 4: Write ChatInput component**

Create `src/modules/chat/ChatInput.tsx`:
```typescript
import { useState, useRef, useCallback } from 'react';
import { Send, Loader2, Paperclip } from 'lucide-react';

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

      // Reset height
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
        {/* Attachment button */}
        <button
          type="button"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl
            border border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)]
            transition-colors hover:text-[var(--text)]"
          disabled={disabled || isStreaming}
        >
          <Paperclip className="h-5 w-5" />
        </button>

        {/* Input area */}
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
        </div>

        {/* Send button */}
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

      {/* Hint */}
      <p className="mt-2 text-center text-xs text-[var(--text-muted)]">
        按 Enter 发送，Shift+Enter 换行
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Write ChatHeader component**

Create `src/modules/chat/ChatHeader.tsx`:
```typescript
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

- [ ] **Step 6: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/modules/chat/
git commit -m "feat(ui): add chat UI components (ChatPanel, CliSelector, MessageList, ChatInput, ChatHeader)"
```

---

### Task 9: Integrate Chat Module

**Files:**
- Modify: `src/modules/MainContent.tsx`
- Modify: `src/modules/nav/NavSidebar.tsx`

- [ ] **Step 1: Add chat route to MainContent**

Modify `src/modules/MainContent.tsx`:
```typescript
// Add import
import { ChatPanel } from './chat/ChatPanel';

// In the router/switch statement, add:
case 'chat':
  return <ChatPanel />;
```

- [ ] **Step 2: Add chat nav item to NavSidebar**

Modify `src/modules/nav/NavSidebar.tsx`:
```typescript
// Add import
import { MessageSquare } from 'lucide-react';

// In the navigation items array, add:
{
  id: 'chat',
  label: 'AI 对话',
  icon: MessageSquare,
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/modules/MainContent.tsx src/modules/nav/NavSidebar.tsx
git commit -m "feat(integration): integrate chat module into main app"
```

---

## Phase 4: Testing & Verification

### Task 10: Backend Integration Tests

**Files:**
- Create: `tests/test_integration.py`

- [ ] **Step 1: Write integration tests**

Create `tests/test_integration.py`:
```python
import pytest
import asyncio
import websockets
import json
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock


@pytest.mark.asyncio
async def test_websocket_chat_flow():
    """Test complete WebSocket chat flow"""
    # This test requires running server
    # Skip if server not running
    try:
        ws = await websockets.connect('ws://127.0.0.1:8765/api/chat/ws/claude/test-session')
    except:
        pytest.skip("Server not running")

    try:
        # Wait for connected message
        msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
        data = json.loads(msg)
        assert data['type'] == 'connected'

        # Send a message
        await ws.send(json.dumps({
            'type': 'message',
            'content': 'Hello',
            'conversation_id': 'test-conv'
        }))

        # Wait for start event
        msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
        data = json.loads(msg)
        assert data['type'] == 'start'

    finally:
        await ws.close()


def test_cli_detect_api(client):
    """Test CLI detection API"""
    response = client.get('/api/chat/cli/detect')
    assert response.status_code == 200
    data = response.json()
    # Should return a list
    assert isinstance(data, list)


def test_conversation_lifecycle(client):
    """Test conversation creation and retrieval"""
    # Mock CLI availability
    mock_cli = MagicMock()
    mock_cli.is_available = True
    mock_cli.name = "Test CLI"

    with patch('abo.routes.chat.detector') as mock_detector:
        mock_detector.get_cli_info.return_value = mock_cli

        # Create conversation
        response = client.post('/api/chat/conversations', json={
            'cli_type': 'test-cli',
            'title': 'Test Conversation'
        })
        assert response.status_code == 200
        conv = response.json()
        conv_id = conv['id']

        # Get conversation
        response = client.get(f'/api/chat/conversations/{conv_id}')
        assert response.status_code == 200
        assert response.json()['id'] == conv_id

        # List conversations
        response = client.get('/api/chat/conversations')
        assert response.status_code == 200
        assert len(response.json()) > 0

        # Delete conversation
        response = client.delete(f'/api/chat/conversations/{conv_id}')
        assert response.status_code == 200
```

- [ ] **Step 2: Run integration tests**

Run: `pytest tests/test_integration.py -v`
Expected: Tests pass (some may be skipped if server not running)

- [ ] **Step 3: Manual API test**

```bash
# Start backend
python -m abo.main &

# Test CLI detection
curl http://127.0.0.1:8765/api/chat/cli/detect

# Create conversation
curl -X POST http://127.0.0.1:8765/api/chat/conversations \
  -H "Content-Type: application/json" \
  -d '{"cli_type": "claude", "title": "Test Chat"}'

# List conversations
curl http://127.0.0.1:8765/api/chat/conversations
```

- [ ] **Step 4: WebSocket test**

```bash
# Install wscat if needed
npm install -g wscat

# Test WebSocket
wscat -c ws://127.0.0.1:8765/api/chat/ws/claude/test-session

# In the wscat prompt, send:
{"type": "message", "content": "Hello", "conversation_id": "test"}
```

Expected: Receive connected, start, content, finish events

- [ ] **Step 5: Commit**

```bash
git add tests/test_integration.py
git commit -m "test(integration): add chat module integration tests"
```

---

### Task 11: Frontend Testing

**Files:**
- Run: Frontend dev server and manual testing

- [ ] **Step 1: Start frontend dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify UI renders**

Open http://localhost:1420 in browser

Expected:
- Sidebar shows "AI 对话" navigation item
- Clicking "AI 对话" shows CLI selector
- Available CLIs are listed

- [ ] **Step 3: Test CLI selection and connection**

Steps:
1. Click on "AI 对话" in sidebar
2. Select an available CLI (e.g., Claude)
3. Click "开始对话"

Expected:
- Connection established
- Chat interface appears
- Connection status shows "已连接"

- [ ] **Step 4: Test sending messages**

Steps:
1. Type a message in the input box
2. Press Enter or click send

Expected:
- User message appears in chat
- Assistant response streams in
- Message is saved to database

- [ ] **Step 5: Commit**

```bash
git commit -m "test(frontend): verify chat UI and WebSocket functionality"
```

---

## Phase 5: Final Verification

### Task 12: End-to-End Testing

- [ ] **Step 1: Full workflow test**

Test complete workflow:
1. Start backend: `python -m abo.main`
2. Start frontend: `npm run dev`
3. Open browser to http://localhost:1420
4. Navigate to AI 对话
5. Select CLI and start conversation
6. Send multiple messages
7. Refresh page and verify persistence
8. Close and reopen conversation

- [ ] **Step 2: Verify all features**

Checklist:
- [ ] CLI auto-detection works
- [ ] WebSocket connection establishes
- [ ] Messages stream correctly
- [ ] Connection status displays
- [ ] Messages persist in database
- [ ] Reconnection works on disconnect
- [ ] UI matches AionUi design

- [ ] **Step 3: Type check and build**

```bash
# Type check
npx tsc --noEmit

# Build frontend
npx vite build

# Verify build succeeds
ls -la dist/
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(chat): complete CLI chat module implementation"
```

---

## Summary

### Backend Components
1. **CLI Detector** (`abo/cli/detector.py`) - Auto-discovers local CLIs
2. **Multi-Protocol Runners** (`abo/cli/runner.py`) - Raw, ACP, WebSocket protocols
3. **Conversation Store** (`abo/store/conversations.py`) - SQLite persistence
4. **Chat Routes** (`abo/routes/chat.py`) - WebSocket + HTTP API

### Frontend Components
1. **Types** (`src/types/chat.ts`) - TypeScript definitions
2. **API Client** (`src/api/chat.ts`) - HTTP + WebSocket client
3. **Hooks** (`src/hooks/useChat.ts`, `useConnection.ts`) - React state management
4. **UI Components** (`src/modules/chat/`) - ChatPanel, CliSelector, MessageList, ChatInput, ChatHeader

### Key Features Implemented
- Auto CLI detection for claude, gemini, codex, openclaw
- Multi-protocol support (raw, ACP, WebSocket)
- Real-time streaming via WebSocket
- Connection state management with heartbeat
- Auto-reconnection (3 attempts with exponential backoff)
- Message persistence in SQLite
- AionUi-style interface

### Testing Checklist
- [ ] Backend unit tests pass
- [ ] Frontend TypeScript compiles
- [ ] WebSocket connections work
- [ ] Message streaming works
- [ ] Connection recovery works
- [ ] UI renders correctly
