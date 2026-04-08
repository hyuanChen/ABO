# CLI Chat Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completely redevelop the AI dialogue module to support multi-CLI (Claude/Gemini/Codex), persistent conversations, WebSocket streaming, connection management with heartbeat, auto-reconnect, and AionUi-style UI.

**Architecture:** FastAPI backend with WebSocket support, SQLite for conversation persistence, multi-protocol CLI runners (raw/ACP/WebSocket), React frontend with Zustand state management, real-time streaming with connection recovery.

**Tech Stack:** Python + FastAPI + SQLite + WebSocket, React + TypeScript + Tailwind + Zustand, Claude CLI subprocess via `claude --print`

---

## File Structure Overview

### Backend
- `abo/cli/detector.py` - CLI auto-detection (Claude, Gemini, Codex)
- `abo/cli/runner.py` - Multi-protocol runners (Raw, ACP, WebSocket)
- `abo/cli/health.py` - Process health monitoring
- `abo/store/conversations.py` - SQLite conversation/message storage
- `abo/routes/chat.py` - FastAPI WebSocket + HTTP routes
- `abo/main.py` - Route registration

### Frontend
- `src/types/chat.ts` - TypeScript type definitions
- `src/api/chat.ts` - API client functions
- `src/hooks/useConnection.ts` - Enhanced WebSocket connection hook with heartbeat
- `src/hooks/useChat.ts` - Main chat state management hook
- `src/modules/chat/ChatPanel.tsx` - Main chat panel component
- `src/modules/chat/CliSelector.tsx` - CLI selection UI
- `src/modules/chat/MessageList.tsx` - Message list with Markdown
- `src/modules/chat/ChatInput.tsx` - Smart input with auto-resize
- `src/modules/chat/ChatHeader.tsx` - Header with connection status
- `src/modules/nav/NavSidebar.tsx` - Add chat navigation entry

---

## Phase 1: Backend - CLI Detection & Multi-Protocol Runners

### Task 1: CLI Detector Module

**Files:**
- Create: `abo/cli/__init__.py`
- Create: `abo/cli/detector.py`
- Test: `tests/cli/test_detector.py`

- [ ] **Step 1: Create CLI package init**

```python
# abo/cli/__init__.py
"""CLI tools detection and runner package."""
from .detector import detector, CliInfo
from .runner import CliRunner, stream_call, batch_call

__all__ = ['detector', 'CliInfo', 'CliRunner', 'stream_call', 'batch_call']
```

- [ ] **Step 2: Write failing test for CLI detection**

```python
# tests/cli/test_detector.py
import pytest
from abo.cli.detector import CliDetector, CliInfo


def test_cli_info_creation():
    """Test CliInfo dataclass creation."""
    info = CliInfo(
        id="claude",
        name="Claude Code",
        command="claude",
        check_cmd="claude --version"
    )
    assert info.id == "claude"
    assert info.is_available is False


def test_detector_registry():
    """Test detector has registered CLIs."""
    from abo.cli.detector import detector
    assert "claude" in detector.REGISTRY
    assert "gemini" in detector.REGISTRY
    assert "codex" in detector.REGISTRY


def test_detect_single_not_found():
    """Test detection of non-existent CLI."""
    from abo.cli.detector import CliDetector
    detector = CliDetector(db_path="/tmp/test_cli_config.json")

    # Test with fake CLI
    fake_info = CliInfo(
        id="fake",
        name="Fake CLI",
        command="this_command_does_not_exist_12345",
        check_cmd="this_command_does_not_exist_12345 --version"
    )

    result = detector._detect_single(fake_info)
    assert result.is_available is False
```

Run: `pytest tests/cli/test_detector.py -v`
Expected: FAIL - module not found

- [ ] **Step 3: Implement CLI detector**

```python
# abo/cli/detector.py
"""CLI detection and management module."""

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
    """CLI tool detector - auto-discover and validate local CLIs."""

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
        """Load cached detection results."""
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, 'r') as f:
                    data = json.load(f)
                    for item in data:
                        self._cache[item['id']] = CliInfo(**item)
            except Exception:
                pass

    def _save_cache(self):
        """Save detection results to cache."""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        with open(self.db_path, 'w') as f:
            json.dump([asdict(info) for info in self._cache.values()], f, indent=2)

    def detect_all(self, force: bool = False) -> List[CliInfo]:
        """Detect all known CLI tools."""
        available = []

        for cli_id, info in self.REGISTRY.items():
            # Check cache
            if not force and cli_id in self._cache:
                cached = self._cache[cli_id]
                # Cache valid for 5 minutes
                if hasattr(cached, 'last_check'):
                    if datetime.now().timestamp() - cached.last_check < 300:
                        if cached.is_available:
                            available.append(cached)
                        continue

            # Execute detection
            detected = self._detect_single(info)
            self._cache[cli_id] = detected

            if detected.is_available:
                available.append(detected)

        self._save_cache()
        return available

    def _detect_single(self, info: CliInfo) -> CliInfo:
        """Detect single CLI."""
        result = CliInfo(
            id=info.id,
            name=info.name,
            command=info.command,
            check_cmd=info.check_cmd,
            acp_args=info.acp_args,
            protocol=info.protocol
        )
        result.last_check = int(datetime.now().timestamp())

        # Check if command is in PATH
        if not shutil.which(info.command):
            return result

        # Try version check
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
                # Some CLIs return non-zero but are available
                result.is_available = True
                result.version = "unknown"

        except subprocess.TimeoutExpired:
            result.version = "timeout"
        except Exception as e:
            result.version = f"error: {str(e)[:50]}"

        return result

    def _get_enhanced_env(self) -> dict:
        """Get enhanced environment variables (including shell config)."""
        env = dict(os.environ)

        # Try loading shell environment
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
        """Get specific CLI info."""
        if cli_id in self._cache:
            return self._cache[cli_id]

        if cli_id in self.REGISTRY:
            return self._detect_single(self.REGISTRY[cli_id])

        return None


# Global detector instance
detector = CliDetector()
```

- [ ] **Step 4: Run tests to verify**

Run: `pytest tests/cli/test_detector.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add abo/cli/__init__.py abo/cli/detector.py tests/cli/test_detector.py
git commit -m "feat(cli): add CLI detector with multi-CLI support (Claude, Gemini, Codex)"
```

---

### Task 2: Multi-Protocol CLI Runner

**Files:**
- Create: `abo/cli/runner.py`
- Test: `tests/cli/test_runner.py`

- [ ] **Step 1: Write failing test for runner**

```python
# tests/cli/test_runner.py
import pytest
import asyncio
from unittest.mock import patch, MagicMock
from abo.cli.runner import CliRunner, StreamEvent


@pytest.mark.asyncio
async def test_stream_event_creation():
    """Test StreamEvent dataclass."""
    event = StreamEvent(
        type="content",
        data="Hello",
        msg_id="test-123"
    )
    assert event.type == "content"
    assert event.data == "Hello"
    assert event.msg_id == "test-123"


def test_runner_initialization():
    """Test CliRunner initialization."""
    runner = CliRunner('claude', 'session-123')
    assert runner.cli_type == 'claude'
    assert runner.session_id == 'session-123'
    assert runner.process is None


def test_runner_unknown_cli_defaults_to_claude():
    """Test unknown CLI type defaults to Claude."""
    runner = CliRunner('unknown', 'session-123')
    assert runner.cli_type == 'unknown'
    assert runner.config['command'] == ['claude', '--print']
```

Run: `pytest tests/cli/test_runner.py -v`
Expected: FAIL - module not found

- [ ] **Step 2: Implement multi-protocol runner**

```python
# abo/cli/runner.py
"""CLI runner with multi-protocol support (raw, ACP, WebSocket)."""

import asyncio
import json
import os
import uuid
from typing import Callable, Optional, Dict, Any, Awaitable
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
    """CLI Runner abstract base class."""

    def __init__(self, cli_info: 'CliInfo', session_id: str, workspace: str = ""):
        self.cli_info = cli_info
        self.session_id = session_id
        self.workspace = workspace or os.getcwd()
        self.process: Optional[asyncio.subprocess.Process] = None
        self._closed = False

    @abstractmethod
    async def send_message(self, message: str, msg_id: str,
                          on_event: Callable[[StreamEvent], Awaitable[None]]) -> None:
        """Send message and handle streaming response."""
        pass

    async def close(self):
        """Close runner."""
        self._closed = True
        if self.process:
            try:
                self.process.terminate()
                await asyncio.wait_for(self.process.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                self.process.kill()
            self.process = None

    def _get_env(self) -> dict:
        """Get environment variables."""
        return dict(os.environ)


class RawRunner(BaseRunner):
    """Raw text protocol runner (Claude --print)."""

    async def send_message(self, message: str, msg_id: str,
                          on_event: Callable[[StreamEvent], Awaitable[None]]) -> None:
        """Send message and receive streaming response."""

        await on_event(StreamEvent(type="start", data="", msg_id=msg_id))

        try:
            # Build command
            cmd = [self.cli_info.command] + self.cli_info.acp_args

            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.workspace,
                env=self._get_env()
            )

            # Send message
            assert self.process.stdin
            input_data = f"{message}\n".encode('utf-8')
            self.process.stdin.write(input_data)
            await self.process.stdin.drain()
            self.process.stdin.close()

            # Read output
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

            # Check stderr
            assert self.process.stderr
            stderr = await self.process.stderr.read()
            if stderr:
                logger.warning(f"CLI stderr: {stderr.decode()[:200]}")

            # Wait for process
            await self.process.wait()

            # Send finish event
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
    """ACP (Agent Communication Protocol) runner (Gemini, Codex)."""

    async def send_message(self, message: str, msg_id: str,
                          on_event: Callable[[StreamEvent], Awaitable[None]]) -> None:
        """Send message using ACP protocol."""

        await on_event(StreamEvent(type="start", data="", msg_id=msg_id))

        try:
            # Start ACP mode
            cmd = [self.cli_info.command] + self.cli_info.acp_args

            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.workspace,
                env=self._get_env()
            )

            # Send ACP init message
            init_msg = {
                "jsonrpc": "2.0",
                "method": "initialize",
                "params": {"sessionId": self.session_id},
                "id": str(uuid.uuid4())
            }

            await self._send_acp_message(init_msg)

            # Send chat message
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

            # Read response
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
        """Send ACP message."""
        assert self.process and self.process.stdin
        data = json.dumps(msg) + "\n"
        self.process.stdin.write(data.encode())
        await self.process.stdin.drain()

    async def _read_acp_stream(self, on_event: Callable, msg_id: str):
        """Read ACP streaming response."""
        assert self.process and self.process.stdout

        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        loop = asyncio.get_event_loop()

        # Connect stdout to StreamReader
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

                    # Process complete lines
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
        """Process single ACP message."""
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
            # Non-JSON output, treat as content
            await on_event(StreamEvent(
                type="content",
                data=line,
                msg_id=msg_id
            ))


class RunnerFactory:
    """Runner factory."""

    RUNNERS = {
        "raw": RawRunner,
        "acp": AcpRunner,
    }

    @classmethod
    def create(cls, cli_info: 'CliInfo', session_id: str,
               workspace: str = "") -> BaseRunner:
        """Create runner for protocol."""
        runner_class = cls.RUNNERS.get(cli_info.protocol, RawRunner)
        return runner_class(cli_info, session_id, workspace)


class CliRunner:
    """Universal CLI runner - supports Claude/Gemini multi-CLI."""

    CLI_CONFIGS = {
        'claude': {
            'command': ['claude', '--print'],
            'env': {},
            'protocol': 'raw',
        },
        'gemini': {
            'command': ['gemini', '--experimental-acp'],
            'env': {},
            'protocol': 'acp',
        },
        'codex': {
            'command': ['codex', '--acp'],
            'env': {},
            'protocol': 'acp',
        },
    }

    def __init__(self, cli_type: str, session_id: str):
        self.cli_type = cli_type
        self.config = self.CLI_CONFIGS.get(cli_type, self.CLI_CONFIGS['claude'])
        self.session_id = session_id
        self.process: Optional[asyncio.subprocess.Process] = None

    async def stream_call(self, message: str, on_chunk: Callable[[dict], Awaitable[None]], timeout: float = 300.0):
        protocol = self.config.get('protocol', 'raw')
        coro = self._stream_acp(message, on_chunk) if protocol == 'acp' else self._stream_raw(message, on_chunk)
        await asyncio.wait_for(coro, timeout=timeout)

    async def _stream_acp(self, message: str, on_chunk: Callable[[dict], Awaitable[None]]):
        self.process = await asyncio.create_subprocess_exec(
            *self.config['command'],
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            env={**os.environ, **self.config['env']}
        )
        acp_msg = {
            "jsonrpc": "2.0",
            "method": "conversation/submit",
            "params": {"sessionId": self.session_id, "text": message},
            "id": str(uuid.uuid4())
        }
        if self.process.stdin is None:
            raise RuntimeError("Process stdin is not available")
        self.process.stdin.write(json.dumps(acp_msg).encode() + b'\n')
        await self.process.stdin.drain()

        if self.process.stdout is None:
            raise RuntimeError("Process stdout is not available")
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        loop = asyncio.get_event_loop()
        await loop.connect_read_pipe(lambda: protocol, self.process.stdout)

        try:
            while True:
                line = await reader.readline()
                if not line:
                    break
                try:
                    data = json.loads(line.decode())
                    event_type = self._parse_acp_event(data)
                    if event_type == 'content':
                        await on_chunk({'type': 'content', 'data': data['params']['content']['text'], 'msg_id': data.get('id', '')})
                    elif event_type == 'finish':
                        await on_chunk({'type': 'finish', 'data': '', 'msg_id': ''})
                        break
                    elif event_type == 'tool_call':
                        await on_chunk({'type': 'tool_call', 'data': json.dumps(data['params']), 'msg_id': data.get('id', '')})
                except json.JSONDecodeError:
                    continue
        finally:
            if self.process:
                await self.process.wait()

    async def _stream_raw(self, message: str, on_chunk: Callable[[dict], Awaitable[None]]):
        self.process = await asyncio.create_subprocess_exec(
            *self.config['command'],
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        if self.process.stdin is None:
            raise RuntimeError("Process stdin is not available")
        self.process.stdin.write(message.encode() + b'\n')
        await self.process.stdin.drain()
        self.process.stdin.close()

        if self.process.stdout is None:
            raise RuntimeError("Process stdout is not available")
        try:
            buffer = b''
            while True:
                chunk = await self.process.stdout.read(4096)
                if not chunk:
                    break
                buffer += chunk
                lines = buffer.split(b'\n')
                buffer = lines.pop() if lines else b''
                for line in lines:
                    if line:
                        await on_chunk({'type': 'content', 'data': line.decode('utf-8', errors='replace'), 'msg_id': ''})
            if buffer:
                await on_chunk({'type': 'content', 'data': buffer.decode('utf-8', errors='replace'), 'msg_id': ''})
            await on_chunk({'type': 'finish', 'data': '', 'msg_id': ''})
        finally:
            if self.process:
                await self.process.wait()

    def _parse_acp_event(self, data: dict) -> str:
        method = data.get('method', '')
        if method == 'conversation/update':
            status = data.get('params', {}).get('status', '')
            return 'finish' if status == 'completed' else 'content'
        elif method == 'tool_call':
            return 'tool_call'
        return 'unknown'

    def cleanup(self):
        if self.process:
            try:
                self.process.kill()
            except ProcessLookupError:
                pass
            self.process = None


async def stream_call(prompt: str, context: str, websocket):
    """Stream call wrapper for WebSocket."""
    from ..cli.detector import detector

    runner = CliRunner('claude', str(uuid.uuid4()))
    full_prompt = f"{context}\n\n---\n\n{prompt}" if context else prompt

    async def on_chunk(event: dict):
        await websocket.send_text(json.dumps(event))

    try:
        await runner.stream_call(full_prompt, on_chunk)
    finally:
        runner.cleanup()


async def batch_call(prompt: str, context: str = "") -> str:
    """Batch call wrapper - returns complete text."""
    runner = CliRunner('claude', str(uuid.uuid4()))
    full_prompt = f"{context}\n\n---\n\n{prompt}" if context else prompt
    chunks = []

    async def on_chunk(event: dict):
        if event['type'] == 'content':
            chunks.append(event['data'])

    try:
        await runner.stream_call(full_prompt, on_chunk)
    finally:
        runner.cleanup()

    if runner.process and runner.process.returncode != 0:
        raise RuntimeError(f"CLI process exited with code {runner.process.returncode}")

    return ''.join(chunks)
```

- [ ] **Step 3: Run tests**

Run: `pytest tests/cli/test_runner.py -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add abo/cli/runner.py tests/cli/test_runner.py
git commit -m "feat(cli): add multi-protocol runner (Raw, ACP) for Claude/Gemini/Codex"
```

---

### Task 3: Process Health Monitor

**Files:**
- Create: `abo/cli/health.py`
- Test: `tests/cli/test_health.py`

- [ ] **Step 1: Write failing test**

```python
# tests/cli/test_health.py
import pytest
from unittest.mock import MagicMock, patch
from abo.cli.health import CliHealthMonitor, ProcessHealth


def test_health_monitor_creation():
    """Test CliHealthMonitor creation."""
    monitor = CliHealthMonitor()
    assert monitor is not None
    assert len(monitor._monitored) == 0


def test_register_unregister():
    """Test process registration."""
    monitor = CliHealthMonitor()

    # Mock process
    mock_process = MagicMock()
    mock_process.pid = 12345

    monitor.register("session-1", mock_process)
    assert "session-1" in monitor._monitored
    assert monitor._monitored["session-1"] == 12345

    monitor.unregister("session-1")
    assert "session-1" not in monitor._monitored
```

- [ ] **Step 2: Implement health monitor**

```python
# abo/cli/health.py
"""CLI process health monitoring."""

import psutil
from typing import Optional
from dataclasses import dataclass
from datetime import datetime
import asyncio


@dataclass
class ProcessHealth:
    pid: int
    status: str  # running, sleeping, zombie, dead
    cpu_percent: float
    memory_mb: float
    create_time: datetime
    is_responsive: bool  # Can respond to signals


class CliHealthMonitor:
    """CLI process health monitor."""

    def __init__(self):
        self._monitored: dict[str, int] = {}  # session_id -> pid

    def register(self, session_id: str, process: asyncio.subprocess.Process):
        """Register process for monitoring."""
        if process.pid:
            self._monitored[session_id] = process.pid

    def unregister(self, session_id: str):
        """Unregister from monitoring."""
        self._monitored.pop(session_id, None)

    def check_health(self, session_id: str) -> Optional[ProcessHealth]:
        """Check process health status."""
        pid = self._monitored.get(session_id)
        if not pid:
            return None

        try:
            proc = psutil.Process(pid)

            # Check if process responds
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
        """Quick health check."""
        health = self.check_health(session_id)
        if not health:
            return False

        # Zombie or dead process is unhealthy
        if health.status in ['zombie', 'dead']:
            return False
        if not health.is_responsive:
            return False

        return True


# Global instance
health_monitor = CliHealthMonitor()
```

- [ ] **Step 3: Run tests**

Run: `pytest tests/cli/test_health.py -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add abo/cli/health.py tests/cli/test_health.py
git commit -m "feat(cli): add process health monitor with psutil"
```

---

### Task 4: Conversation Store (SQLite)

**Files:**
- Create: `abo/store/conversations.py`
- Test: `tests/store/test_conversations.py`

- [ ] **Step 1: Write failing test**

```python
# tests/store/test_conversations.py
import pytest
import os
import tempfile
from abo.store.conversations import ConversationStore, Conversation, Message


@pytest.fixture
def temp_db():
    """Create temporary database."""
    fd, path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    yield path
    os.unlink(path)


def test_conversation_store_creation(temp_db):
    """Test ConversationStore creation."""
    store = ConversationStore(db_path=temp_db)
    assert store is not None


def test_create_conversation(temp_db):
    """Test creating conversation."""
    store = ConversationStore(db_path=temp_db)

    conv_id = store.create_conversation(
        cli_type="claude",
        session_id="test-session-123",
        title="Test Chat",
        workspace="/tmp"
    )

    assert conv_id is not None
    assert len(conv_id) > 0

    # Retrieve
    conv = store.get_conversation(conv_id)
    assert conv is not None
    assert conv.cli_type == "claude"
    assert conv.session_id == "test-session-123"
    assert conv.title == "Test Chat"


def test_add_and_get_messages(temp_db):
    """Test adding and retrieving messages."""
    store = ConversationStore(db_path=temp_db)

    conv_id = store.create_conversation("claude", "session-123")

    # Add messages
    msg1_id = store.add_message(conv_id, "user", "Hello")
    msg2_id = store.add_message(conv_id, "assistant", "Hi there!")

    # Get messages
    messages = store.get_messages(conv_id)
    assert len(messages) == 2
    assert messages[0].role == "user"
    assert messages[0].content == "Hello"
    assert messages[1].role == "assistant"
    assert messages[1].content == "Hi there!"
```

- [ ] **Step 2: Implement conversation store**

```python
# abo/store/conversations.py
"""Conversation data storage module."""

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
    """Conversation storage manager."""

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
        """Get database connection."""
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """Initialize database tables."""
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

    # === Conversation Operations ===

    def create_conversation(self, cli_type: str, session_id: str,
                           title: str = "", workspace: str = "") -> str:
        """Create new conversation."""
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
        """Get conversation info."""
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM conversations WHERE id = ?",
                (conv_id,)
            ).fetchone()

            if row:
                return Conversation(**dict(row))
            return None

    def get_conversation_by_session(self, session_id: str) -> Optional[Conversation]:
        """Get conversation by session_id."""
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
        """List conversations."""
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
        """Update conversation title."""
        now = int(datetime.now().timestamp() * 1000)

        with self._get_conn() as conn:
            conn.execute(
                "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
                (title, now, conv_id)
            )

    def close_conversation(self, conv_id: str):
        """Close conversation."""
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE conversations SET status = 'closed' WHERE id = ?",
                (conv_id,)
            )

    def delete_conversation(self, conv_id: str):
        """Delete conversation (cascade delete messages)."""
        with self._get_conn() as conn:
            conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))

    # === Message Operations ===

    def add_message(self, conv_id: str, role: str, content: str,
                   msg_id: Optional[str] = None,
                   content_type: str = "text",
                   metadata: Optional[dict] = None,
                   status: str = "completed") -> str:
        """Add message."""
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

            # Update conversation time
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conv_id)
            )

        return message_id

    def update_message_content(self, msg_id: str, content: str):
        """Update message content (streaming update)."""
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE messages SET content = ? WHERE msg_id = ?",
                (content, msg_id)
            )

    def finalize_message(self, msg_id: str):
        """Finalize streaming message."""
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE messages SET status = 'completed' WHERE msg_id = ?",
                (msg_id,)
            )

    def get_messages(self, conv_id: str, limit: int = 100,
                    before_id: Optional[str] = None) -> List[Message]:
        """Get message list."""
        with self._get_conn() as conn:
            if before_id:
                # Paginated loading
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

            # Return in chronological order
            messages = [Message(**dict(row)) for row in rows]
            messages.reverse()
            return messages

    def search_messages(self, conv_id: str, query: str, limit: int = 20) -> List[Message]:
        """Search messages."""
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


# Global instance
conversation_store = ConversationStore()
```

- [ ] **Step 3: Run tests**

Run: `pytest tests/store/test_conversations.py -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add abo/store/conversations.py tests/store/test_conversations.py
git commit -m "feat(store): add SQLite conversation storage with CRUD operations"
```

---

### Task 5: Chat API Routes (WebSocket + HTTP)

**Files:**
- Create: `abo/routes/chat.py`
- Modify: `abo/main.py`
- Test: `tests/routes/test_chat.py`

- [ ] **Step 1: Write failing test for chat routes**

```python
# tests/routes/test_chat.py
import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI
from abo.routes.chat import router as chat_router


@pytest.fixture
def client():
    """Create test client."""
    app = FastAPI()
    app.include_router(chat_router)
    return TestClient(app)


def test_detect_clis(client):
    """Test CLI detection endpoint."""
    response = client.get("/api/chat/cli/detect")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_list_conversations(client):
    """Test list conversations endpoint."""
    response = client.get("/api/chat/conversations")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
```

- [ ] **Step 2: Implement chat routes**

```python
# abo/routes/chat.py
"""Chat API routes with WebSocket support."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta
from enum import Enum
from dataclasses import dataclass, field

from ..cli.detector import detector, CliInfo
from ..cli.runner import RunnerFactory, StreamEvent, CliRunner
from ..cli.health import health_monitor
from ..store.conversations import conversation_store, Conversation, Message

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat")


# === Request/Response Models ===

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


# === Connection State Management ===

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
    """Connection information."""
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
        """Check if connection is alive."""
        if self.state in [ConnectionState.DISCONNECTED, ConnectionState.ERROR]:
            return False
        # Check heartbeat timeout (30 seconds)
        if datetime.now() - self.last_pong > timedelta(seconds=30):
            return False
        return True

    @property
    def latency_ms(self) -> Optional[int]:
        """Calculate latency."""
        if self.last_pong and self.last_ping:
            delta = self.last_pong - self.last_ping
            return int(delta.total_seconds() * 1000)
        return None


class EnhancedConnectionManager:
    """Enhanced connection manager - supports heartbeat, reconnect, status monitoring."""

    HEARTBEAT_INTERVAL = 15  # seconds
    HEARTBEAT_TIMEOUT = 30   # seconds
    MAX_RECONNECT = 3        # max reconnect attempts

    def __init__(self):
        self.connections: dict[str, ConnectionInfo] = {}
        self._heartbeat_tasks: dict[str, asyncio.Task] = {}
        self._state_callbacks: list = []

    def on_state_change(self, callback):
        """Register state change callback (client_id, old_state, new_state)."""
        self._state_callbacks.append(callback)

    def _set_state(self, client_id: str, new_state: ConnectionState, error: str = None):
        """Set connection state and trigger callbacks."""
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
        """Establish new connection."""
        client_id = f"{cli_type}:{session_id}"

        # Disconnect existing
        if client_id in self.connections:
            await self.disconnect(client_id, "reconnecting")

        await websocket.accept()

        # Create connection info
        conn = ConnectionInfo(
            client_id=client_id,
            cli_type=cli_type,
            session_id=session_id,
            websocket=websocket,
            state=ConnectionState.CONNECTING
        )
        self.connections[client_id] = conn

        try:
            # Create runner
            cli_info = detector.get_cli_info(cli_type)
            if cli_info:
                conn.runner = RunnerFactory.create(cli_info, session_id, "")
                conn.state = ConnectionState.CONNECTED
                conn.connected_at = datetime.now()
                conn.reconnect_count = 0

                # Start heartbeat
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
        """Disconnect."""
        conn = self.connections.pop(client_id, None)
        if not conn:
            return

        logger.info(f"Disconnecting {client_id}: {reason}")

        # Stop heartbeat
        if client_id in self._heartbeat_tasks:
            self._heartbeat_tasks[client_id].cancel()
            del self._heartbeat_tasks[client_id]

        # Close runner
        if conn.runner:
            try:
                await conn.runner.close()
            except Exception as e:
                logger.error(f"Error closing runner: {e}")

        # Close websocket
        if conn.websocket:
            try:
                await conn.websocket.close()
            except Exception:
                pass

        self._set_state(client_id, ConnectionState.DISCONNECTED)

    def _start_heartbeat(self, client_id: str):
        """Start heartbeat detection."""
        task = asyncio.create_task(self._heartbeat_loop(client_id))
        self._heartbeat_tasks[client_id] = task

    async def _heartbeat_loop(self, client_id: str):
        """Heartbeat loop."""
        try:
            while True:
                await asyncio.sleep(self.HEARTBEAT_INTERVAL)

                conn = self.connections.get(client_id)
                if not conn or conn.state == ConnectionState.DISCONNECTED:
                    break

                # Send ping
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

                # Check last pong timeout
                if datetime.now() - conn.last_pong > timedelta(seconds=self.HEARTBEAT_TIMEOUT):
                    logger.warning(f"Heartbeat timeout for {client_id}")
                    await self._handle_connection_lost(client_id, "heartbeat_timeout")
                    break

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Heartbeat error for {client_id}: {e}")

    async def _handle_connection_lost(self, client_id: str, reason: str):
        """Handle connection loss."""
        conn = self.connections.get(client_id)
        if not conn:
            return

        if conn.reconnect_count < self.MAX_RECONNECT:
            # Attempt reconnect
            conn.reconnect_count += 1
            self._set_state(client_id, ConnectionState.RECONNECTING)

            logger.info(f"Attempting reconnect {conn.reconnect_count}/{self.MAX_RECONNECT} for {client_id}")

            try:
                # Recreate runner
                if conn.runner:
                    await conn.runner.close()

                cli_info = detector.get_cli_info(conn.cli_type)
                if cli_info:
                    conn.runner = RunnerFactory.create(cli_info, conn.session_id, "")
                    conn.last_pong = datetime.now()  # Reset heartbeat time
                    self._set_state(client_id, ConnectionState.CONNECTED)
                    logger.info(f"Reconnected: {client_id}")

                    # Notify client
                    await self.send_json(client_id, {
                        "type": "reconnected",
                        "attempt": conn.reconnect_count
                    })
                    return

            except Exception as e:
                logger.error(f"Reconnect failed for {client_id}: {e}")

        # Reconnect failed or exceeded max attempts
        await self.disconnect(client_id, f"reconnect_failed_{reason}")

        # Notify client
        try:
            await conn.websocket.send_json({
                "type": "disconnected",
                "reason": reason,
                "reconnect_count": conn.reconnect_count
            })
        except:
            pass

    async def handle_pong(self, client_id: str, data: dict):
        """Handle client pong response."""
        conn = self.connections.get(client_id)
        if conn:
            conn.last_pong = datetime.now()
            latency = conn.latency_ms
            logger.debug(f"Pong from {client_id}, latency: {latency}ms")

    async def send_json(self, client_id: str, data: dict) -> bool:
        """Send JSON message."""
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
        """Get connection status."""
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
        """Get all connection statuses."""
        return [self.get_connection_status(cid) for cid in self.connections.keys()]


# Global instance
manager = EnhancedConnectionManager()


# === CLI Detection API ===

@router.get("/cli/detect")
async def detect_clis(force: bool = False):
    """Detect available CLI tools."""
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
    """Get CLI detailed info."""
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


# === Conversation Management API ===

@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(req: CreateConversationRequest):
    """Create new conversation."""
    # Validate CLI availability
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
    """List conversations."""
    conversations = conversation_store.list_conversations(cli_type=cli_type, limit=limit)
    return [ConversationResponse(**vars(c)) for c in conversations]


@router.get("/conversations/{conv_id}", response_model=ConversationResponse)
async def get_conversation(conv_id: str):
    """Get conversation details."""
    conv = conversation_store.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationResponse(**vars(conv))


@router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    """Delete conversation."""
    conversation_store.delete_conversation(conv_id)
    return {"success": True}


@router.patch("/conversations/{conv_id}/title")
async def update_title(conv_id: str, title: str):
    """Update conversation title."""
    conversation_store.update_conversation_title(conv_id, title)
    return {"success": True}


# === Message API ===

@router.get("/conversations/{conv_id}/messages", response_model=List[MessageResponse])
async def get_messages(conv_id: str, limit: int = 100, before_id: Optional[str] = None):
    """Get message list."""
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
    """HTTP method to send message (non-streaming)."""
    conv = conversation_store.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    cli_info = detector.get_cli_info(conv.cli_type)
    if not cli_info:
        raise HTTPException(status_code=400, detail="CLI not found")

    # Save user message
    conversation_store.add_message(
        conv_id=conv_id,
        role="user",
        content=req.message
    )

    # Create runner
    runner = RunnerFactory.create(cli_info, conv.session_id, conv.workspace)

    # Collect response
    chunks = []
    msg_id = str(uuid.uuid4())

    async def on_event(event: StreamEvent):
        if event.type == "content":
            chunks.append(event.data)

    try:
        await runner.send_message(req.message, msg_id, on_event)
        response_text = "".join(chunks)

        # Save assistant response
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


# === Connection Status API ===

@router.get("/connections/status")
async def get_all_connection_status():
    """Get all connection statuses (for frontend sync)."""
    return {
        "connections": manager.get_all_status(),
        "timestamp": datetime.now().isoformat()
    }


@router.get("/connections/{client_id}/status")
async def get_connection_status(client_id: str):
    """Get single connection status."""
    status = manager.get_connection_status(client_id)
    if not status:
        raise HTTPException(status_code=404, detail="Connection not found")
    return status


@router.post("/connections/{client_id}/reconnect")
async def force_reconnect(client_id: str):
    """Force reconnect."""
    conn = manager.connections.get(client_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    await manager._handle_connection_lost(client_id, "forced")
    return {"success": True, "message": "Reconnect initiated"}


# === WebSocket Real-time Communication ===

@router.websocket("/ws/{cli_type}/{session_id}")
async def chat_websocket(websocket: WebSocket, cli_type: str, session_id: str):
    """
    Enhanced WebSocket chat interface.

    Client -> Server:
    - { "type": "message", "content": "...", "conversation_id": "..." }
    - { "type": "pong", "timestamp": "..." }
    - { "type": "stop" }

    Server -> Client:
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
        # Establish connection
        conn = await manager.connect(websocket, cli_type, session_id)

        # Send connected message
        await websocket.send_json({
            "type": "connected",
            "client_id": client_id,
            "timestamp": datetime.now().isoformat()
        })

        # Find or create conversation
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

        # Message processing loop
        while True:
            try:
                # Receive message (with timeout for heartbeat check)
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=60.0
                )

                msg_type = data.get("type", "message")

                if msg_type == "pong":
                    # Heartbeat response
                    await manager.handle_pong(client_id, data)

                elif msg_type == "stop":
                    # Stop generation
                    if conn.runner:
                        await conn.runner.close()
                    await manager.send_json(client_id, {
                        "type": "stopped",
                        "timestamp": datetime.now().isoformat()
                    })

                elif msg_type == "message":
                    # Process chat message
                    await _handle_chat_message(conn, data, client_id, conv.id if conv else "")

            except asyncio.TimeoutError:
                # Timeout check connection status
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


async def _handle_chat_message(conn: ConnectionInfo, data: dict, client_id: str, conv_id: str):
    """Handle chat message."""
    message = data.get("content", "")
    conversation_id = data.get("conversation_id", conv_id)

    if not message or not conversation_id:
        return

    # Update state
    conn.state = ConnectionState.STREAMING

    # Save user message
    conversation_store.add_message(
        conv_id=conversation_id,
        role="user",
        content=message
    )

    msg_id = str(uuid.uuid4())
    full_response = []

    async def on_event(event: StreamEvent):
        # Forward to client
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

            # Save complete response
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

- [ ] **Step 3: Register routes in main.py**

```python
# abo/main.py - Add these lines
from .routes.chat import router as chat_router

# ... after other router includes
app.include_router(chat_router)
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/routes/test_chat.py -v`
Expected: PASS

- [ ] **Step 5: Integration test - start backend and verify**

Run:
```bash
# Terminal 1: Start backend
python -m abo.main

# Terminal 2: Test CLI detection
curl http://127.0.0.1:8765/api/chat/cli/detect
```

Expected: JSON array with detected CLIs

- [ ] **Step 6: Commit**

```bash
git add abo/routes/chat.py tests/routes/test_chat.py
git commit -m "feat(chat): add WebSocket + HTTP API with heartbeat and auto-reconnect"
```

---

## Phase 2: Frontend - Types, API, Hooks

### Task 6: TypeScript Types

**Files:**
- Create: `src/types/chat.ts`

- [ ] **Step 1: Create chat types**

```typescript
// src/types/chat.ts

export type CliType = 'claude' | 'gemini' | 'codex' | 'custom';

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
  type: 'start' | 'content' | 'tool_call' | 'error' | 'finish' | 'ping' | 'pong' | 'connected' | 'disconnected' | 'reconnected';
  data: string;
  msgId: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  attempt?: number;
  reason?: string;
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

- [ ] **Step 2: Commit**

```bash
git add src/types/chat.ts
git commit -m "feat(types): add chat module TypeScript types"
```

---

### Task 7: API Client

**Files:**
- Create: `src/api/chat.ts`

- [ ] **Step 1: Create API client**

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

// === Connection Status ===

export async function getConnectionStatus(clientId: string): Promise<ConnectionStatus> {
  const res = await fetch(`${API_BASE}/connections/${clientId}/status`);
  if (!res.ok) throw new Error('Failed to get connection status');
  return res.json();
}

export async function getAllConnectionStatus(): Promise<{ connections: ConnectionStatus[]; timestamp: string }> {
  const res = await fetch(`${API_BASE}/connections/status`);
  if (!res.ok) throw new Error('Failed to get all connection statuses');
  return res.json();
}

export async function forceReconnect(clientId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/connections/${clientId}/reconnect`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to force reconnect');
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

- [ ] **Step 2: Commit**

```bash
git add src/api/chat.ts
git commit -m "feat(api): add chat API client with HTTP and WebSocket support"
```

---

### Task 8: useConnection Hook (Enhanced WebSocket)

**Files:**
- Create: `src/hooks/useConnection.ts`

- [ ] **Step 1: Create useConnection hook**

```typescript
// src/hooks/useConnection.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import type { ConnectionState, ConnectionStatus, StreamEvent } from '../types/chat';

interface UseConnectionOptions {
  cliType: string;
  sessionId: string;
  onStateChange?: (state: ConnectionState, prevState: ConnectionState) => void;
  onMessage?: (data: StreamEvent) => void;
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

      // Auto reconnect
      updateState('reconnecting');
      reconnectCountRef.current++;

      setTimeout(() => {
        connect();
      }, 2000 * reconnectCountRef.current); // Exponential backoff
    };

    ws.onerror = (error) => {
      updateState('error');
      onError?.('WebSocket error');
    };

    ws.onmessage = (event) => {
      const data: StreamEvent = JSON.parse(event.data);

      switch (data.type) {
        case 'ping':
          // Respond to server heartbeat
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

  // Disconnect
  const disconnect = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    wsRef.current?.close();
    updateState('disconnected');
  }, [updateState]);

  // Send message
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

  // Stop generation
  const stop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
  }, []);

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
    isConnected: state === 'connected' || state === 'streaming',
    isStreaming: state === 'streaming',
    reconnectCount: reconnectCountRef.current
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useConnection.ts
git commit -m "feat(hooks): add useConnection hook with heartbeat and auto-reconnect"
```

---

### Task 9: useChat Hook

**Files:**
- Create: `src/hooks/useChat.ts`

- [ ] **Step 1: Create useChat hook**

```typescript
// src/hooks/useChat.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Conversation, Message, StreamEvent, CliConfig } from '../types/chat';
import {
  detectClis,
  createConversation,
  getMessages,
} from '../api/chat';
import { useConnection } from './useConnection';

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

  // Connection state
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  connectionState: string;

  // Actions
  clearError: () => void;
}

export function useChat(): UseChatReturn {
  // CLI state
  const [availableClis, setAvailableClis] = useState<CliConfig[]>([]);
  const [selectedCli, setSelectedCli] = useState<CliConfig | null>(null);

  // Conversation state
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const currentMsgIdRef = useRef<string>('');

  // Detect CLIs on mount
  useEffect(() => {
    detectClis()
      .then(setAvailableClis)
      .catch((e) => setError(e.message));
  }, []);

  // Connection handling
  const handleStreamEvent = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case 'start':
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
            content: `Using tool: ${toolData.toolName || 'unknown'}`,
            contentType: 'tool_call',
            metadata: toolData,
            status: 'completed',
            createdAt: Date.now(),
          },
        ]);
        break;

      case 'finish':
        setMessages((prev) =>
          prev.map((m) =>
            m.msgId === currentMsgIdRef.current
              ? { ...m, status: 'completed' }
              : m
          )
        );
        break;

      case 'error':
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

  // Connection hook
  const {
    state: connectionState,
    isConnected,
    isStreaming,
    send,
    connect,
    disconnect,
  } = useConnection({
    cliType: selectedCli?.id || 'claude',
    sessionId: conversation?.sessionId || '',
    onMessage: handleStreamEvent,
    autoReconnect: true,
  });

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
      disconnect();

      // Create new conversation
      const conv = await createConversation(selectedCli.id);
      setConversation(conv);
      setMessages([]);

      // Establish connection
      connect();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCli, connect, disconnect]);

  // Load existing conversation
  const loadConversation = useCallback(async (conv: Conversation) => {
    setIsLoading(true);
    setError(null);

    try {
      // Close existing connection
      disconnect();

      // Load history
      const history = await getMessages(conv.id);
      setMessages(history);
      setConversation(conv);

      // Find CLI config
      const cli = availableClis.find((c) => c.id === conv.cliType);
      if (cli) setSelectedCli(cli);

      // Establish connection
      connect();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [availableClis, connect, disconnect]);

  // Send message
  const sendMessage = useCallback((content: string) => {
    if (!conversation) {
      setError('No active conversation');
      return;
    }

    // Add user message
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

    // Send via connection
    const sent = send(content, conversation.id);
    if (!sent) {
      setError('Failed to send message - not connected');
    }
  }, [conversation, send]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

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
    connectionState,
    clearError,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useChat.ts
git commit -m "feat(hooks): add useChat hook with conversation management"
```

---

## Phase 3: Frontend - UI Components

### Task 10: Chat Panel Layout

**Files:**
- Create: `src/modules/chat/ChatPanel.tsx`

- [ ] **Step 1: Create ChatPanel component**

```tsx
// src/modules/chat/ChatPanel.tsx
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
    connectionState,
    clearError,
  } = useChat();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Error display
  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-xl bg-red-50 p-6 text-red-600 dark:bg-red-900/20 dark:text-red-400">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={clearError}
            className="mt-4 rounded-lg bg-red-100 px-4 py-2 text-sm font-medium hover:bg-red-200 dark:bg-red-800/50 dark:hover:bg-red-800"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  // CLI selection
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
        connectionState={connectionState}
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

- [ ] **Step 2: Commit**

```bash
git add src/modules/chat/ChatPanel.tsx
git commit -m "feat(chat): add ChatPanel main component with state management"
```

---

### Task 11: CLI Selector

**Files:**
- Create: `src/modules/chat/CliSelector.tsx`

- [ ] **Step 1: Create CliSelector**

```tsx
// src/modules/chat/CliSelector.tsx
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

  const getCliIcon = (cliId: string) => {
    switch (cliId) {
      case 'claude':
        return <span className="text-lg"> Claude</span>;
      case 'gemini':
        return <span className="text-lg">✦ Gemini</span>;
      case 'codex':
        return <span className="text-lg">◇ Codex</span>;
      default:
        return <Terminal className="h-5 w-5" />;
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-[var(--text)]">
          Choose AI Assistant
        </h2>
        <p className="mt-2 text-[var(--text-muted)]">
          Select a CLI tool to start chatting
        </p>
      </div>

      {availableClis.length === 0 ? (
        <div className="rounded-xl bg-amber-50 p-6 text-amber-600 dark:bg-amber-900/20">
          <p>No CLI tools detected</p>
          <p className="mt-2 text-sm">
            Please install Claude Code, Gemini CLI, or Codex
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
          <span>Start Chat</span>
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/chat/CliSelector.tsx
git commit -m "feat(chat): add CLI selector component"
```

---

### Task 12: Message List

**Files:**
- Create: `src/modules/chat/MessageList.tsx`

- [ ] **Step 1: Create MessageList**

```tsx
// src/modules/chat/MessageList.tsx
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
            <p>Start your first conversation</p>
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

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

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
      <div className={`max-w-[80%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Role label + timestamp */}
        <div className={`flex items-center gap-2 mb-1 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className={`text-xs font-medium ${isUser ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}>
            {isUser ? 'You' : isTool ? 'Tool' : 'Assistant'}
          </span>
          <span className="text-xs text-[var(--text-muted)]">{formatTime(message.createdAt)}</span>
        </div>

        {/* Bubble */}
        <div className={`rounded-2xl px-5 py-3
          ${isUser
            ? 'bg-[var(--primary)] text-white'
            : isError
            ? 'bg-red-50 text-red-600 dark:bg-red-900/20'
            : 'bg-[var(--surface)] border border-[var(--border)]'
          }`}>
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
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/chat/MessageList.tsx
git commit -m "feat(chat): add MessageList with Markdown rendering"
```

---

### Task 13: Chat Input

**Files:**
- Create: `src/modules/chat/ChatInput.tsx`

- [ ] **Step 1: Create ChatInput**

```tsx
// src/modules/chat/ChatInput.tsx
import { useState, useRef, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';

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
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={disabled ? 'Connecting...' : 'Type a message...'}
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

      <div className="mx-auto max-w-3xl mt-2 text-center">
        <p className="text-xs text-[var(--text-muted)]">
          <kbd className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">Enter</kbd> to send
          {' · '}
          <kbd className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">Shift + Enter</kbd> for new line
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/chat/ChatInput.tsx
git commit -m "feat(chat): add ChatInput with auto-resize textarea"
```

---

### Task 14: Chat Header

**Files:**
- Create: `src/modules/chat/ChatHeader.tsx`

- [ ] **Step 1: Create ChatHeader**

```tsx
// src/modules/chat/ChatHeader.tsx
import type { CliConfig, Conversation } from '../../types/chat';
import { Bot, Wifi, WifiOff, Loader2, AlertCircle } from 'lucide-react';

interface ChatHeaderProps {
  cli: CliConfig;
  conversation: Conversation;
  isConnected: boolean;
  connectionState: string;
}

export function ChatHeader({ cli, conversation, isConnected, connectionState }: ChatHeaderProps) {
  const getStatusIcon = () => {
    if (connectionState === 'connecting' || connectionState === 'reconnecting') {
      return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />;
    }
    if (isConnected) {
      return <Wifi className="h-4 w-4 text-green-500" />;
    }
    if (connectionState === 'error') {
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
    return <WifiOff className="h-4 w-4 text-gray-400" />;
  };

  const getStatusText = () => {
    if (connectionState === 'connecting') return 'Connecting...';
    if (connectionState === 'reconnecting') return 'Reconnecting...';
    if (isConnected) return 'Connected';
    if (connectionState === 'error') return 'Error';
    return 'Disconnected';
  };

  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-2)]">
          <Bot className="h-5 w-5 text-[var(--primary)]" />
        </div>

        <div>
          <h3 className="font-medium text-[var(--text)]">{cli.name}</h3>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            {getStatusIcon()}
            <span>{getStatusText()}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-muted)] truncate max-w-[200px]">
          {conversation.title}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/chat/ChatHeader.tsx
git commit -m "feat(chat): add ChatHeader with connection status"
```

---

### Task 15: Navigation Integration

**Files:**
- Modify: `src/modules/nav/NavSidebar.tsx`
- Modify: `src/App.tsx` or main routing file

- [ ] **Step 1: Add chat navigation item**

```typescript
// src/modules/nav/NavSidebar.tsx
// Add to navigation items array:
import { MessageSquare } from 'lucide-react';

const navItems = [
  // ... existing items
  {
    id: 'chat',
    label: 'AI Chat',
    icon: MessageSquare,
  },
];
```

- [ ] **Step 2: Register ChatPanel in App.tsx**

```typescript
// src/App.tsx or main routing
import { ChatPanel } from './modules/chat/ChatPanel';

// In routing/switch:
case 'chat':
  return <ChatPanel />;
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/nav/NavSidebar.tsx src/App.tsx
git commit -m "feat(nav): add AI Chat navigation entry and routing"
```

---

## Phase 4: Testing & Integration

### Task 16: Backend Tests

- [ ] **Step 1: Run all backend tests**

```bash
pytest tests/cli/ -v
pytest tests/store/ -v
pytest tests/routes/ -v
```

Expected: All PASS

- [ ] **Step 2: Manual API test**

```bash
# Start backend
python -m abo.main

# Test CLI detection
curl http://127.0.0.1:8765/api/chat/cli/detect

# Create conversation
curl -X POST http://127.0.0.1:8765/api/chat/conversations \
  -H "Content-Type: application/json" \
  -d '{"cli_type": "claude", "title": "Test Chat"}'

# WebSocket test with wscat
npm install -g wscat
wscat -c ws://127.0.0.1:8765/api/chat/ws/claude/test-session
> {"type": "message", "content": "Hello", "conversation_id": "test"}
```

- [ ] **Step 3: Commit test results/fixes**

```bash
git commit -m "test(chat): verify backend API and WebSocket endpoints"
```

---

### Task 17: Frontend Build Test

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 2: Build test**

```bash
npm run build
```

Expected: Build successful

- [ ] **Step 3: Commit**

```bash
git commit -m "test(chat): verify TypeScript and build"
```

---

### Task 18: End-to-End Integration Test

- [ ] **Step 1: Full integration test**

```bash
# Terminal 1: Start backend
python -m abo.main

# Terminal 2: Start frontend
npm run dev
```

Test checklist:
- [ ] CLI detection shows available CLIs
- [ ] Can select CLI and create conversation
- [ ] WebSocket connects successfully
- [ ] Can send message and receive streaming response
- [ ] Messages persist in database
- [ ] Can reload conversation history
- [ ] Connection status updates correctly
- [ ] Auto-reconnect works on disconnect

- [ ] **Step 2: Final commit**

```bash
git add -A
git commit -m "feat(chat): complete CLI chat module with multi-CLI support, WebSocket streaming, and persistent conversations"
```

---

## Summary

### Files Created/Modified

**Backend:**
1. `abo/cli/__init__.py`
2. `abo/cli/detector.py`
3. `abo/cli/runner.py`
4. `abo/cli/health.py`
5. `abo/store/conversations.py`
6. `abo/routes/chat.py`
7. `abo/main.py` (modified - add router)

**Frontend:**
1. `src/types/chat.ts`
2. `src/api/chat.ts`
3. `src/hooks/useConnection.ts`
4. `src/hooks/useChat.ts`
5. `src/modules/chat/ChatPanel.tsx`
6. `src/modules/chat/CliSelector.tsx`
7. `src/modules/chat/MessageList.tsx`
8. `src/modules/chat/ChatInput.tsx`
9. `src/modules/chat/ChatHeader.tsx`
10. `src/modules/nav/NavSidebar.tsx` (modified)
11. `src/App.tsx` (modified)

**Tests:**
1. `tests/cli/test_detector.py`
2. `tests/cli/test_runner.py`
3. `tests/cli/test_health.py`
4. `tests/store/test_conversations.py`
5. `tests/routes/test_chat.py`

### Features Implemented

1. **Multi-CLI Support**: Claude (raw), Gemini (ACP), Codex (ACP)
2. **CLI Auto-Detection**: Automatic detection with caching
3. **WebSocket Streaming**: Real-time bidirectional communication
4. **Persistent Conversations**: SQLite storage with CRUD operations
5. **Connection Management**: Heartbeat, auto-reconnect (3 attempts), state machine
6. **Process Health Monitoring**: psutil-based process monitoring
7. **Modern React UI**: TypeScript, Tailwind, Zustand-ready
8. **Markdown Rendering**: Full message formatting with code blocks
9. **Connection Status UI**: Real-time status indicators
