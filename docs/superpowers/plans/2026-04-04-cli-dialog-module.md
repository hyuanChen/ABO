# CLI 对话框模块实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现通用的 CLI 对话框系统，支持 Claude/Gemini CLI 的流式对话，包含对话历史存储和多会话管理。

**Architecture:** 基于已有的 `claude_bridge/runner.py` 扩展为通用 `CliRunner` 类，通过 WebSocket 实现前后端实时通信，使用 SQLite 存储对话历史。前端复用现有的 `ClaudePanel.tsx` 但改为新的 WebSocket 协议。

**Tech Stack:** Python FastAPI + WebSocket + SQLite, React + TypeScript + Zustand

---

## 文件结构

### 后端文件

| 文件 | 职责 |
|------|------|
| `abo/claude_bridge/runner.py` | 扩展 `CliRunner` 类，支持多 CLI 协议 (raw/acp) |
| `abo/routes/cli.py` | CLI 检测和诊断 API |
| `abo/store/conversations.py` | 对话历史存储 (SQLite) |
| `abo/routes/chat.py` | WebSocket + HTTP API 路由 |
| `abo/main.py` | 注册所有路由 |

### 前端文件

| 文件 | 职责 |
|------|------|
| `src/hooks/useCliChat.ts` | 通用 CLI 对话 WebSocket Hook |
| `src/core/api.ts` | 扩展 API 客户端 (检测 CLI、创建对话、获取历史) |
| `src/modules/claude-panel/ChatPanel.tsx` | 更新为新的 WebSocket 协议 |

---

## Task 1: 扩展 CliRunner 支持多 CLI

**Files:**
- Create: `abo/claude_bridge/runner.py` (完全重写)
- Test: `curl http://127.0.0.1:8765/api/cli/detect`

- [ ] **Step 1: 备份现有 runner.py**

```bash
cp /Users/huanc/Desktop/ABO/abo/claude_bridge/runner.py /Users/huanc/Desktop/ABO/abo/claude_bridge/runner.py.backup
```

- [ ] **Step 2: 重写 runner.py 实现 CliRunner 类**

```python
"""Claude CLI bridge — Universal CLI Runner with multi-protocol support."""
import asyncio
import json
import os
import uuid
from typing import Callable, Optional
from asyncio.subprocess import PIPE


class CliRunner:
    """通用 CLI 运行器 - 支持 Claude/Gemini 等多 CLI"""

    CLI_CONFIGS = {
        'claude': {
            'command': ['claude', '--print', '--output-format', 'stream-json'],
            'env': {},
            'protocol': 'raw',  # 直接文本/JSON 流输出
        },
        'gemini': {
            'command': ['gemini', '--experimental-acp'],
            'env': {},
            'protocol': 'acp',  # ACP JSON-RPC 协议
        },
    }

    def __init__(self, cli_type: str, session_id: str):
        self.cli_type = cli_type
        self.config = self.CLI_CONFIGS.get(cli_type, self.CLI_CONFIGS['claude'])
        self.session_id = session_id
        self.process: Optional[asyncio.subprocess.Process] = None

    async def stream_call(self, message: str, on_chunk: Callable[[dict], None]):
        """流式调用 CLI"""
        protocol = self.config.get('protocol', 'raw')

        if protocol == 'acp':
            await self._stream_acp(message, on_chunk)
        else:
            await self._stream_raw(message, on_chunk)

    async def _stream_acp(self, message: str, on_chunk: Callable):
        """ACP 协议处理 (Gemini 等)"""
        self.process = await asyncio.create_subprocess_exec(
            *self.config['command'],
            stdin=PIPE,
            stdout=PIPE,
            stderr=PIPE,
            env={**os.environ, **self.config['env']}
        )

        # 发送 ACP 消息
        acp_msg = {
            "jsonrpc": "2.0",
            "method": "conversation/submit",
            "params": {"sessionId": self.session_id, "text": message},
            "id": str(uuid.uuid4())
        }

        assert self.process.stdin
        self.process.stdin.write(json.dumps(acp_msg).encode() + b'\n')
        await self.process.stdin.drain()

        # 读取响应
        assert self.process.stdout
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        loop = asyncio.get_event_loop()
        await loop.connect_read_pipe(lambda: protocol, self.process.stdout)

        while True:
            line = await reader.readline()
            if not line:
                break

            try:
                data = json.loads(line.decode())
                event_type = self._parse_acp_event(data)

                if event_type == 'content':
                    await on_chunk({
                        'type': 'content',
                        'data': data['params']['content']['text'],
                        'msg_id': data.get('id', '')
                    })
                elif event_type == 'finish':
                    await on_chunk({'type': 'finish', 'data': '', 'msg_id': ''})
                    break
                elif event_type == 'tool_call':
                    await on_chunk({
                        'type': 'tool_call',
                        'data': json.dumps(data['params']),
                        'msg_id': data.get('id', '')
                    })
            except json.JSONDecodeError:
                continue

    async def _stream_raw(self, message: str, on_chunk: Callable):
        """原始文本协议 (Claude --print)"""
        # 构建完整 prompt
        full_prompt = message

        self.process = await asyncio.create_subprocess_exec(
            *self.config['command'],
            stdin=PIPE,
            stdout=PIPE,
            stderr=PIPE,
        )

        assert self.process.stdin
        self.process.stdin.write(full_prompt.encode() + b'\n')
        await self.process.stdin.drain()
        self.process.stdin.close()

        assert self.process.stdout
        buffer = b''
        while True:
            chunk = await self.process.stdout.read(4096)
            if not chunk:
                break
            buffer += chunk
            # 按行分割处理
            lines = buffer.split(b'\n')
            buffer = lines.pop() if lines else b''  # 保留不完整的行
            for line in lines:
                if line:
                    await on_chunk({'type': 'content', 'data': line.decode('utf-8', errors='replace'), 'msg_id': ''})

        # 处理剩余缓冲区
        if buffer:
            await on_chunk({'type': 'content', 'data': buffer.decode('utf-8', errors='replace'), 'msg_id': ''})

        await on_chunk({'type': 'finish', 'data': '', 'msg_id': ''})

    def _parse_acp_event(self, data: dict) -> str:
        """解析 ACP 事件类型"""
        method = data.get('method', '')
        if method == 'conversation/update':
            status = data.get('params', {}).get('status', '')
            return 'finish' if status == 'completed' else 'content'
        elif method == 'tool_call':
            return 'tool_call'
        return 'unknown'

    def cleanup(self):
        """清理进程"""
        if self.process:
            try:
                self.process.kill()
            except ProcessLookupError:
                pass
            self.process = None


# 向后兼容的 API
async def stream_call(prompt: str, context: str, websocket):
    """Legacy API: Stream mode for existing code."""
    runner = CliRunner('claude', str(uuid.uuid4()))
    full_prompt = f"{context}\n\n---\n\n{prompt}" if context else prompt

    async def on_chunk(event: dict):
        await websocket.send_text(json.dumps(event))

    try:
        await runner.stream_call(full_prompt, on_chunk)
    finally:
        runner.cleanup()


async def batch_call(prompt: str, context: str = "") -> str:
    """Legacy API: Batch mode for existing code."""
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

    return ''.join(chunks)
```

- [ ] **Step 3: 验证 runner.py 语法**

```bash
cd /Users/huanc/Desktop/ABO
python -m py_compile abo/claude_bridge/runner.py
echo $?  # Expected: 0
```

- [ ] **Step 4: Commit**

```bash
git add abo/claude_bridge/runner.py
git commit -m "feat(cli): add CliRunner class with multi-protocol support"
```

---

## Task 2: 创建 CLI 检测和诊断路由

**Files:**
- Create: `abo/routes/cli.py`
- Create: `abo/routes/__init__.py`
- Modify: `abo/main.py` (在底部添加路由注册)

- [ ] **Step 1: 创建 routes 目录结构**

```bash
mkdir -p /Users/huanc/Desktop/ABO/abo/routes
touch /Users/huanc/Desktop/ABO/abo/routes/__init__.py
```

- [ ] **Step 2: 创建 cli.py**

```python
"""CLI 检测和诊断路由"""
import shutil
import subprocess
from fastapi import APIRouter

cli_router = APIRouter(prefix="/api/cli")

CLI_REGISTRY = {
    'claude': {'name': 'Claude Code', 'check': 'claude --version'},
    'gemini': {'name': 'Gemini CLI', 'check': 'gemini --version'},
}


@cli_router.get("/detect")
async def detect_clis() -> list[dict]:
    """检测本地可用的 CLI 工具"""
    available = []

    for cli_id, config in CLI_REGISTRY.items():
        cmd = config['check'].split()[0]
        if not shutil.which(cmd):
            continue

        try:
            result = subprocess.run(
                config['check'].split(),
                capture_output=True,
                timeout=5
            )
            if result.returncode == 0:
                available.append({
                    'id': cli_id,
                    'name': config['name'],
                    'version': result.stdout.decode().strip()[:50]
                })
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

    return available


@cli_router.get("/debug/{cli_type}")
async def debug_cli(cli_type: str) -> dict:
    """诊断 CLI 连接"""
    config = CLI_REGISTRY.get(cli_type, {})
    cmd = config.get('check', '').split()[0] if config else cli_type

    result = {
        "cli_type": cli_type,
        "in_path": shutil.which(cmd) is not None,
        "path_location": shutil.which(cmd),
    }

    if result["in_path"]:
        try:
            proc = subprocess.run(
                config.get('check', f'{cmd} --version').split(),
                capture_output=True,
                text=True,
                timeout=10
            )
            result["version_check"] = {
                "returncode": proc.returncode,
                "stdout": proc.stdout[:200],
                "stderr": proc.stderr[:200],
            }
        except Exception as e:
            result["error"] = str(e)

    return result
```

- [ ] **Step 3: 创建 routes/__init__.py**

```python
"""ABO API Routes"""
from .cli import cli_router
from .chat import chat_router

__all__ = ['cli_router', 'chat_router']
```

- [ ] **Step 4: 在 main.py 注册 CLI 路由**

在 `abo/main.py` 底部添加（在 `if __name__ == "__main__":` 之前）：

```python
# ── 注册 CLI 和 Chat 路由 ─────────────────────────────────────────
from .routes.cli import cli_router
from .routes.chat import chat_router

app.include_router(cli_router)
app.include_router(chat_router)
```

- [ ] **Step 5: 启动后端并测试**

```bash
# 终端 1: 启动后端
cd /Users/huanc/Desktop/ABO
python -m abo.main

# 终端 2: 测试 API (在另一个终端)
curl http://127.0.0.1:8765/api/cli/detect
# Expected: [{"id":"claude","name":"Claude Code","version":"..."}]

curl http://127.0.0.1:8765/api/cli/debug/claude
# Expected: {"cli_type":"claude","in_path":true,...}
```

- [ ] **Step 6: Commit**

```bash
git add abo/routes/__init__.py abo/routes/cli.py abo/main.py
git commit -m "feat(cli): add CLI detection and diagnostic routes"
```

---

## Task 3: 创建对话历史存储

**Files:**
- Create: `abo/store/conversations.py`
- Create: `abo/store/__init__.py` (如果不存在)

- [ ] **Step 1: 创建 store/__init__.py (如果不存在)**

```bash
if [ ! -f /Users/huanc/Desktop/ABO/abo/store/__init__.py ]; then
  touch /Users/huanc/Desktop/ABO/abo/store/__init__.py
fi
```

- [ ] **Step 2: 创建 conversations.py**

```python
"""对话历史存储 - SQLite"""
import sqlite3
import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List


@dataclass
class Message:
    id: str
    conversation_id: str
    role: str
    content: str
    msg_id: Optional[str] = None
    metadata: Optional[str] = None
    created_at: Optional[datetime] = None


@dataclass
class Conversation:
    id: str
    cli_type: str
    session_id: str
    title: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ConversationStore:
    def __init__(self, db_path: str = "~/.abo/data/conversations.db"):
        self.db_path = os.path.expanduser(db_path)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()

    def _init_db(self):
        """初始化数据库表"""
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    cli_type TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    title TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    msg_id TEXT,
                    metadata TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
                );

                CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);
                CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at);
            """)

    def create_conversation(self, cli_type: str, session_id: str, title: str = "") -> str:
        """创建新对话"""
        conv_id = str(uuid.uuid4())
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT INTO conversations (id, cli_type, session_id, title)
                   VALUES (?, ?, ?, ?)""",
                (conv_id, cli_type, session_id, title or f"New {cli_type} chat")
            )
        return conv_id

    def add_message(self, conv_id: str, role: str, content: str,
                    msg_id: Optional[str] = None, metadata: Optional[dict] = None):
        """添加消息"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT INTO messages (id, conversation_id, role, content, msg_id, metadata)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), conv_id, role, content, msg_id,
                 json.dumps(metadata) if metadata else None)
            )
            conn.execute(
                "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (conv_id,)
            )

    def get_messages(self, conv_id: str, limit: int = 100) -> List[Message]:
        """获取对话消息"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT * FROM messages WHERE conversation_id = ?
                   ORDER BY created_at ASC LIMIT ?""",
                (conv_id, limit)
            ).fetchall()

            return [Message(
                id=r['id'],
                conversation_id=r['conversation_id'],
                role=r['role'],
                content=r['content'],
                msg_id=r['msg_id'],
                metadata=r['metadata'],
                created_at=datetime.fromisoformat(r['created_at']) if r['created_at'] else None
            ) for r in rows]

    def list_conversations(self, cli_type: Optional[str] = None) -> List[Conversation]:
        """列出所有对话"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            if cli_type:
                rows = conn.execute(
                    """SELECT * FROM conversations WHERE cli_type = ?
                       ORDER BY updated_at DESC""",
                    (cli_type,)
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM conversations ORDER BY updated_at DESC"
                ).fetchall()

            return [Conversation(
                id=r['id'],
                cli_type=r['cli_type'],
                session_id=r['session_id'],
                title=r['title'],
                created_at=datetime.fromisoformat(r['created_at']) if r['created_at'] else None,
                updated_at=datetime.fromisoformat(r['updated_at']) if r['updated_at'] else None
            ) for r in rows]

    def get_conversation(self, conv_id: str) -> Optional[Conversation]:
        """获取单个对话"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM conversations WHERE id = ?",
                (conv_id,)
            ).fetchone()

            if not row:
                return None

            return Conversation(
                id=row['id'],
                cli_type=row['cli_type'],
                session_id=row['session_id'],
                title=row['title'],
                created_at=datetime.fromisoformat(row['created_at']) if row['created_at'] else None,
                updated_at=datetime.fromisoformat(row['updated_at']) if row['updated_at'] else None
            )

    def delete_conversation(self, conv_id: str) -> bool:
        """删除对话及其消息"""
        with sqlite3.connect(self.db_path) as conn:
            # 先删除消息
            conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
            # 再删除对话
            cursor = conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
            return cursor.rowcount > 0

    def update_title(self, conv_id: str, title: str):
        """更新对话标题"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (title, conv_id)
            )
```

- [ ] **Step 3: 验证语法**

```bash
cd /Users/huanc/Desktop/ABO
python -m py_compile abo/store/conversations.py
echo $?  # Expected: 0
```

- [ ] **Step 4: Commit**

```bash
git add abo/store/conversations.py abo/store/__init__.py
git commit -m "feat(store): add ConversationStore for chat history"
```

---

## Task 4: 创建 Chat WebSocket + HTTP API

**Files:**
- Create: `abo/routes/chat.py`

- [ ] **Step 1: 创建 chat.py**

```python
"""Chat WebSocket 和 HTTP API"""
import json
import uuid
from typing import Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ..claude_bridge.runner import CliRunner
from ..store.conversations import ConversationStore

chat_router = APIRouter(prefix="/api/chat")
store = ConversationStore()

# WebSocket 连接管理
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.cli_runners: Dict[str, CliRunner] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket

    def disconnect(self, client_id: str):
        self.active_connections.pop(client_id, None)
        if client_id in self.cli_runners:
            self.cli_runners[client_id].cleanup()
            del self.cli_runners[client_id]

    async def send_json(self, client_id: str, data: dict):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_json(data)

manager = ConnectionManager()


@chat_router.websocket("/ws/{cli_type}/{session_id}")
async def chat_websocket(websocket: WebSocket, cli_type: str, session_id: str):
    """通用 CLI 对话 WebSocket"""
    client_id = f"{cli_type}:{session_id}"
    await manager.connect(websocket, client_id)

    runner = CliRunner(cli_type, session_id)
    manager.cli_runners[client_id] = runner

    try:
        while True:
            data = await websocket.receive_json()
            message = data.get('message', '')
            conv_id = data.get('conversation_id', '')

            if not message or not conv_id:
                await manager.send_json(client_id, {
                    'type': 'error',
                    'data': 'Missing message or conversation_id'
                })
                continue

            # 保存用户消息
            store.add_message(conv_id, 'user', message)

            # 流式调用
            full_response = []
            current_msg_id = str(uuid.uuid4())

            # 发送开始标记
            await manager.send_json(client_id, {
                'type': 'start',
                'data': '',
                'msg_id': current_msg_id
            })

            async def on_chunk(event: dict):
                await manager.send_json(client_id, {
                    'type': event['type'],
                    'data': event['data'],
                    'msg_id': event.get('msg_id', current_msg_id)
                })
                if event['type'] == 'content':
                    full_response.append(event['data'])

            try:
                await runner.stream_call(message, on_chunk)
            except Exception as e:
                await manager.send_json(client_id, {
                    'type': 'error',
                    'data': str(e),
                    'msg_id': current_msg_id
                })

            # 保存助手响应
            if full_response:
                store.add_message(conv_id, 'assistant', ''.join(full_response),
                                msg_id=current_msg_id)

    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(client_id)


# HTTP API Models
class CreateConversationRequest(BaseModel):
    cli_type: str
    title: Optional[str] = None


class CreateConversationResponse(BaseModel):
    id: str
    session_id: str
    cli_type: str
    title: str


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: Optional[str] = None


# HTTP API Endpoints
@chat_router.post("/conversations", response_model=CreateConversationResponse)
async def create_conversation(req: CreateConversationRequest):
    """创建新对话"""
    session_id = str(uuid.uuid4())
    conv_id = store.create_conversation(req.cli_type, session_id, req.title)
    return CreateConversationResponse(
        id=conv_id,
        session_id=session_id,
        cli_type=req.cli_type,
        title=req.title or f"New {req.cli_type} chat"
    )


@chat_router.get("/conversations")
async def list_conversations(cli_type: Optional[str] = None):
    """列出所有对话"""
    conversations = store.list_conversations(cli_type)
    return [
        {
            "id": c.id,
            "cli_type": c.cli_type,
            "session_id": c.session_id,
            "title": c.title,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in conversations
    ]


@chat_router.get("/conversations/{conv_id}/messages")
async def get_messages(conv_id: str, limit: int = 100):
    """获取对话消息"""
    messages = store.get_messages(conv_id, limit)
    return {
        "messages": [
            MessageResponse(
                id=m.id,
                role=m.role,
                content=m.content,
                created_at=m.created_at.isoformat() if m.created_at else None
            )
            for m in messages
        ]
    }


@chat_router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    """获取单个对话信息"""
    conv = store.get_conversation(conv_id)
    if not conv:
        return {"error": "Conversation not found"}, 404
    return {
        "id": conv.id,
        "cli_type": conv.cli_type,
        "session_id": conv.session_id,
        "title": conv.title,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
    }


@chat_router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    """删除对话"""
    success = store.delete_conversation(conv_id)
    return {"success": success}


@chat_router.patch("/conversations/{conv_id}/title")
async def update_title(conv_id: str, body: dict):
    """更新对话标题"""
    title = body.get('title', '')
    store.update_title(conv_id, title)
    return {"success": True}
```

- [ ] **Step 2: 验证语法**

```bash
cd /Users/huanc/Desktop/ABO
python -m py_compile abo/routes/chat.py
echo $?  # Expected: 0
```

- [ ] **Step 3: 更新 routes/__init__.py**

```python
"""ABO API Routes"""
from .cli import cli_router
from .chat import chat_router

__all__ = ['cli_router', 'chat_router']
```

- [ ] **Step 4: 确保 main.py 包含 chat_router**

确认 `abo/main.py` 底部已有：

```python
# ── 注册 CLI 和 Chat 路由 ─────────────────────────────────────────
from .routes.cli import cli_router
from .routes.chat import chat_router

app.include_router(cli_router)
app.include_router(chat_router)
```

- [ ] **Step 5: 启动后端并测试 HTTP API**

```bash
# 终端 1: 启动后端
cd /Users/huanc/Desktop/ABO
python -m abo.main

# 终端 2: 测试创建对话
curl -X POST http://127.0.0.1:8765/api/chat/conversations \
  -H 'Content-Type: application/json' \
  -d '{"cli_type":"claude","title":"Test Chat"}'
# Expected: {"id":"...","session_id":"...","cli_type":"claude","title":"Test Chat"}

# 获取对话列表
curl http://127.0.0.1:8765/api/chat/conversations
```

- [ ] **Step 6: Commit**

```bash
git add abo/routes/chat.py abo/routes/__init__.py
git commit -m "feat(chat): add WebSocket and HTTP API for CLI chat"
```

---

## Task 5: 创建前端 useCliChat Hook

**Files:**
- Create: `src/hooks/useCliChat.ts`
- Create: `src/hooks/index.ts`

- [ ] **Step 1: 创建 hooks 目录**

```bash
mkdir -p /Users/huanc/Desktop/ABO/src/hooks
```

- [ ] **Step 2: 创建 useCliChat.ts**

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';

export interface StreamEvent {
  type: 'start' | 'content' | 'tool_call' | 'finish' | 'error';
  data: string;
  msg_id: string;
}

interface UseCliChatOptions {
  cliType: string;
  sessionId: string;
  conversationId: string;
  onEvent?: (event: StreamEvent) => void;
  onError?: (error: string) => void;
}

export function useCliChat({
  cliType,
  sessionId,
  conversationId,
  onEvent,
  onError,
}: UseCliChatOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 建立 WebSocket 连接
  useEffect(() => {
    if (!cliType || !sessionId) return;

    const connect = () => {
      const wsUrl = `ws://127.0.0.1:8765/api/chat/ws/${cliType}/${sessionId}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log(`[CliChat] Connected to ${cliType}:${sessionId}`);
        setIsConnected(true);
      };

      ws.onclose = () => {
        console.log(`[CliChat] Disconnected from ${cliType}:${sessionId}`);
        setIsConnected(false);
        setIsStreaming(false);
      };

      ws.onerror = (error) => {
        console.error('[CliChat] WebSocket error:', error);
        setIsConnected(false);
        onError?.('WebSocket connection error');
      };

      ws.onmessage = (event) => {
        try {
          const data: StreamEvent = JSON.parse(event.data);

          if (data.type === 'start') {
            setIsStreaming(true);
          } else if (data.type === 'finish') {
            setIsStreaming(false);
          } else if (data.type === 'error') {
            setIsStreaming(false);
            onError?.(data.data);
          }

          onEvent?.(data);
        } catch (err) {
          console.error('[CliChat] Failed to parse message:', err);
        }
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [cliType, sessionId, onEvent, onError]);

  // 发送消息
  const sendMessage = useCallback(
    (message: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            message,
            conversation_id: conversationId,
          })
        );
        return true;
      }
      console.warn('[CliChat] WebSocket not connected');
      return false;
    },
    [conversationId]
  );

  // 手动重连
  const reconnect = useCallback(() => {
    wsRef.current?.close();
    // useEffect 会自动重连
  }, []);

  return {
    isConnected,
    isStreaming,
    sendMessage,
    reconnect,
  };
}
```

- [ ] **Step 3: 创建 hooks/index.ts**

```typescript
export { useCliChat, type StreamEvent } from './useCliChat';
```

- [ ] **Step 4: 验证 TypeScript**

```bash
cd /Users/huanc/Desktop/ABO
npx tsc --noEmit src/hooks/useCliChat.ts
echo $?  # Expected: 0
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCliChat.ts src/hooks/index.ts
git commit -m "feat(hooks): add useCliChat hook for WebSocket chat"
```

---

## Task 6: 扩展 API 客户端

**Files:**
- Modify: `src/core/api.ts`

- [ ] **Step 1: 在 api.ts 添加 CLI 对话 API**

在文件末尾添加：

```typescript
// ── CLI Chat API ─────────────────────────────────────────────────

export interface CliConfig {
  id: string;
  name: string;
  version: string;
}

export interface Conversation {
  id: string;
  cli_type: string;
  session_id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export async function detectClis(): Promise<CliConfig[]> {
  return api.get<CliConfig[]>('/api/cli/detect');
}

export async function debugCli(cliType: string): Promise<unknown> {
  return api.get(`/api/cli/debug/${cliType}`);
}

export async function createConversation(
  cliType: string,
  title?: string
): Promise<Conversation> {
  return api.post<Conversation>('/api/chat/conversations', {
    cli_type: cliType,
    title,
  });
}

export async function listConversations(cliType?: string): Promise<Conversation[]> {
  const query = cliType ? `?cli_type=${cliType}` : '';
  return api.get<Conversation[]>(`/api/chat/conversations${query}`);
}

export async function getMessages(convId: string, limit = 100): Promise<Message[]> {
  const data = await api.get<{ messages: Message[] }>(
    `/api/chat/conversations/${convId}/messages?limit=${limit}`
  );
  return data.messages;
}

export async function deleteConversation(convId: string): Promise<{ success: boolean }> {
  return api.delete(`/api/chat/conversations/${convId}`);
}

export async function updateConversationTitle(
  convId: string,
  title: string
): Promise<{ success: boolean }> {
  return api.patch(`/api/chat/conversations/${convId}/title`, { title });
}
```

- [ ] **Step 2: 验证 TypeScript**

```bash
cd /Users/huanc/Desktop/ABO
npx tsc --noEmit src/core/api.ts
echo $?  # Expected: 0
```

- [ ] **Step 3: Commit**

```bash
git add src/core/api.ts
git commit -m "feat(api): add CLI chat API functions"
```

---

## Task 7: 更新 ClaudePanel 组件

**Files:**
- Modify: `src/modules/claude-panel/ClaudePanel.tsx`

- [ ] **Step 1: 更新 ClaudePanel 使用新协议**

用新的基于 `useCliChat` 的实现替换现有组件：

```typescript
import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot, Send, Wifi, WifiOff, ChevronDown, Copy, Check,
  Plus, MessageSquare, Trash2, Edit2, CheckCircle2, X,
} from "lucide-react";
import { useCliChat, type StreamEvent } from "../../hooks/useCliChat";
import {
  detectClis, createConversation, listConversations,
  getMessages, deleteConversation, updateConversationTitle,
  type CliConfig, type Conversation, type Message,
} from "../../core/api";
import { useStore } from "../../core/store";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage extends Message {
  streaming?: boolean;
}

// ── Stream chunk parser ───────────────────────────────────────────────────────

function extractText(raw: string): string {
  // 尝试解析 JSON 流
  try {
    const data = JSON.parse(raw);
    if (data.type === 'content') {
      return data.data || '';
    }
  } catch {
    // 如果不是 JSON，直接返回原文
    return raw;
  }
  return '';
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button
      onClick={handleCopy}
      aria-label="复制消息"
      style={{
        opacity: 0, padding: "4px", borderRadius: "6px",
        color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = "1";
        e.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = "0";
        e.currentTarget.style.background = "transparent";
      }}
    >
      {copied
        ? <Check style={{ width: "14px", height: "14px", color: "#10B981" }} />
        : <Copy style={{ width: "14px", height: "14px" }} />
      }
    </button>
  );
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MdContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p style={{ marginBottom: "8px", lineHeight: 1.6 }}>{children}</p>,
        code: ({ className, children }) => {
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            return (
              <pre style={{
                padding: "12px", overflowX: "auto", background: "var(--bg-hover)",
                fontSize: "12px", fontFamily: "monospace", borderRadius: "8px", margin: "8px 0"
              }}>
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code style={{
              padding: "2px 6px", borderRadius: "6px", background: "var(--bg-hover)",
              fontSize: "12px", fontFamily: "monospace", color: "var(--color-primary)"
            }}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";

  return (
    <div style={{
      display: "flex", gap: "12px", padding: "4px 0",
      flexDirection: isUser ? "row-reverse" : "row"
    }}>
      <div style={{
        width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0, marginTop: "4px",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: isUser ? "rgba(99, 102, 241, 0.15)" : "rgba(139, 92, 246, 0.15)"
      }}>
        {isUser
          ? <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-primary)" }}>我</span>
          : <Bot style={{ width: "16px", height: "16px", color: "#8B5CF6" }} />
        }
      </div>

      <div style={{
        display: "flex", flexDirection: "column", gap: "4px", maxWidth: "82%",
        alignItems: isUser ? "flex-end" : "flex-start"
      }}>
        <div style={{
          padding: "10px 16px", borderRadius: "16px", fontSize: "14px", lineHeight: 1.6,
          background: isUser ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))" : "var(--bg-card)",
          color: isUser ? "white" : "var(--text-main)",
          border: isUser ? "none" : "1px solid var(--border-light)",
        }}>
          {isUser ? (
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{msg.content}</p>
          ) : (
            <MdContent content={msg.content} />
          )}
          {msg.streaming && (
            <span style={{ display: "inline-flex", marginLeft: "4px", gap: "2px" }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{
                  width: "4px", height: "4px", borderRadius: "50%", background: "currentColor", opacity: 0.6,
                  animation: "bounce 1s infinite", animationDelay: `${i * 150}ms`
                }} />
              ))}
            </span>
          )}
        </div>

        {!isUser && !msg.streaming && (
          <div style={{ display: "flex" }}>
            <CopyButton text={msg.content} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ClaudePanel() {
  const [clis, setClis] = useState<CliConfig[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [showConvList, setShowConvList] = useState(false);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingMsgIdRef = useRef<string | null>(null);

  const config = useStore((s) => s.config);

  // 加载可用的 CLI
  useEffect(() => {
    detectClis().then(setClis);
  }, []);

  // 加载对话列表
  const loadConversations = useCallback(async () => {
    const convs = await listConversations();
    setConversations(convs);
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // 创建新对话
  const createNewChat = async (cliType: string) => {
    const conv = await createConversation(cliType);
    await loadConversations();
    setActiveConv(conv);
    setMessages([]);
    setShowConvList(false);
  };

  // 加载对话历史
  const loadMessages = async (conv: Conversation) => {
    const msgs = await getMessages(conv.id);
    setMessages(msgs.map(m => ({ ...m, streaming: false })));
    setActiveConv(conv);
    setShowConvList(false);
  };

  // WebSocket 连接
  const { isConnected, isStreaming, sendMessage } = useCliChat({
    cliType: activeConv?.cli_type || '',
    sessionId: activeConv?.session_id || '',
    conversationId: activeConv?.id || '',
    onEvent: (event: StreamEvent) => {
      switch (event.type) {
        case 'start':
          pendingMsgIdRef.current = event.msg_id;
          setMessages(prev => [...prev, {
            id: event.msg_id,
            role: 'assistant',
            content: '',
            streaming: true,
          }]);
          break;
        case 'content':
          const text = extractText(event.data);
          if (text) {
            setMessages(prev => prev.map(m =>
              m.id === pendingMsgIdRef.current
                ? { ...m, content: m.content + text }
                : m
            ));
          }
          break;
        case 'finish':
          setMessages(prev => prev.map(m =>
            m.id === pendingMsgIdRef.current
              ? { ...m, streaming: false }
              : m
          ));
          pendingMsgIdRef.current = null;
          break;
        case 'error':
          console.error('Chat error:', event.data);
          setMessages(prev => prev.map(m =>
            m.id === pendingMsgIdRef.current
              ? { ...m, streaming: false, content: m.content + '\n\n[Error: ' + event.data + ']' }
              : m
          ));
          pendingMsgIdRef.current = null;
          break;
      }
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
    },
  });

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 发送消息
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !activeConv) return;

    // 添加用户消息
    const userMsgId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: userMsgId,
      role: 'user',
      content: trimmed,
      streaming: false,
    }]);

    // 发送到后端
    sendMessage(trimmed);
    setInput("");

    // 重置输入框高度
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [input, isStreaming, activeConv, sendMessage]);

  // 删除对话
  const handleDeleteConv = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteConversation(convId);
    await loadConversations();
    if (activeConv?.id === convId) {
      setActiveConv(null);
      setMessages([]);
    }
  };

  // 更新标题
  const handleUpdateTitle = async (convId: string) => {
    if (!newTitle.trim()) {
      setEditingTitle(null);
      return;
    }
    await updateConversationTitle(convId, newTitle.trim());
    await loadConversations();
    setEditingTitle(null);
    setNewTitle("");
  };

  // 选择 CLI 界面
  if (!activeConv) {
    return (
      <div style={{
        height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "24px",
        background: "var(--bg-app)", padding: "32px"
      }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-main)" }}>
            CLI 对话助手
          </h2>
          <p style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "8px" }}>
            选择 CLI 工具开始对话
          </p>
        </div>

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}>
          {clis.map(cli => (
            <button
              key={cli.id}
              onClick={() => createNewChat(cli.id)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: "12px",
                padding: "24px 32px", borderRadius: "16px",
                background: "var(--bg-card)", border: "1px solid var(--border-light)",
                cursor: "pointer", transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--color-primary)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-light)";
                e.currentTarget.style.transform = "none";
              }}
            >
              <Bot style={{ width: "32px", height: "32px", color: "var(--color-primary)" }} />
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-main)" }}>
                  {cli.name}
                </p>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                  {cli.version}
                </p>
              </div>
            </button>
          ))}
        </div>

        {clis.length === 0 && (
          <div style={{
            padding: "16px 24px", borderRadius: "12px",
            background: "rgba(251, 191, 36, 0.1)", border: "1px solid rgba(251, 191, 36, 0.3)",
          }}>
            <p style={{ fontSize: "14px", color: "#D97706" }}>
              未检测到可用的 CLI 工具。请确保 claude 或 gemini 已安装并在 PATH 中。
            </p>
          </div>
        )}
      </div>
    );
  }

  // 对话界面
  return (
    <div style={{ height: "100%", display: "flex", background: "var(--bg-app)" }}>
      {/* Sidebar - Conversation List */}
      {showConvList && (
        <div style={{
          width: "260px", borderRight: "1px solid var(--border-light)",
          background: "var(--bg-card)", display: "flex", flexDirection: "column"
        }}>
          <div style={{
            padding: "16px", borderBottom: "1px solid var(--border-light)",
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-main)" }}>
              对话历史
            </h3>
            <button
              onClick={() => setShowConvList(false)}
              style={{ padding: "4px", borderRadius: "6px", background: "transparent", border: "none", cursor: "pointer" }}
            >
              <X style={{ width: "16px", height: "16px", color: "var(--text-muted)" }} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => loadMessages(conv)}
                style={{
                  padding: "12px", borderRadius: "8px", marginBottom: "4px",
                  background: activeConv?.id === conv.id ? "var(--bg-hover)" : "transparent",
                  cursor: "pointer", border: "1px solid transparent",
                  borderColor: activeConv?.id === conv.id ? "var(--border-light)" : "transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  {editingTitle === conv.id ? (
                    <input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onBlur={() => handleUpdateTitle(conv.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdateTitle(conv.id);
                        if (e.key === 'Escape') setEditingTitle(null);
                      }}
                      autoFocus
                      style={{
                        fontSize: "13px", padding: "4px 8px", borderRadius: "4px",
                        border: "1px solid var(--border-light)", background: "var(--bg-app)",
                        color: "var(--text-main)", width: "140px"
                      }}
                    />
                  ) : (
                    <span style={{
                      fontSize: "13px", fontWeight: 500, color: "var(--text-main)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                    }}>
                      {conv.title}
                    </span>
                  )}

                  <div style={{ display: "flex", gap: "4px" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingTitle(conv.id); setNewTitle(conv.title); }}
                      style={{ padding: "2px", borderRadius: "4px", background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      <Edit2 style={{ width: "12px", height: "12px", color: "var(--text-muted)" }} />
                    </button>
                    <button
                      onClick={(e) => handleDeleteConv(conv.id, e)}
                      style={{ padding: "2px", borderRadius: "4px", background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      <Trash2 style={{ width: "12px", height: "12px", color: "var(--text-muted)" }} />
                    </button>
                  </div>
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {conv.cli_type} · {conv.updated_at ? new Date(conv.updated_at).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>

          <div style={{ padding: "12px", borderTop: "1px solid var(--border-light)" }}>
            <button
              onClick={() => setShowConvList(false)}
              style={{
                width: "100%", padding: "10px", borderRadius: "8px",
                background: "var(--color-primary)", color: "white",
                border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 500
              }}
            >
              <Plus style={{ width: "14px", height: "14px", display: "inline", marginRight: "6px" }} />
              新对话
            </button>
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{
          padding: "14px 24px", borderBottom: "1px solid var(--border-light)",
          background: "var(--bg-card)", display: "flex", alignItems: "center", gap: "12px"
        }}>
          <button
            onClick={() => setShowConvList(!showConvList)}
            style={{
              padding: "8px", borderRadius: "8px",
              background: "var(--bg-hover)", border: "none", cursor: "pointer"
            }}
          >
            <MessageSquare style={{ width: "16px", height: "16px", color: "var(--text-muted)" }} />
          </button>

          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-main)", lineHeight: 1.3 }}>
              {activeConv.title}
            </h2>
            <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {activeConv.cli_type} · {isConnected ? '已连接' : '未连接'}
            </p>
          </div>

          {/* Status */}
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            fontSize: "12px", color: isConnected ? "#059669" : "var(--text-muted)"
          }}>
            {isConnected ? <Wifi style={{ width: "14px", height: "14px" }} /> : <WifiOff style={{ width: "14px", height: "14px" }} />}
            {isConnected ? '在线' : '离线'}
          </div>

          <button
            onClick={() => { setActiveConv(null); setMessages([]); }}
            style={{
              padding: "8px 16px", borderRadius: "8px",
              background: "var(--bg-hover)", border: "1px solid var(--border-light)",
              cursor: "pointer", fontSize: "13px", color: "var(--text-main)"
            }}
          >
            <Plus style={{ width: "14px", height: "14px", display: "inline", marginRight: "4px" }} />
            新对话
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <div style={{ maxWidth: "720px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "8px" }}>
            {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div style={{
          padding: "16px 24px", borderTop: "1px solid var(--border-light)",
          background: "var(--bg-card)"
        }}>
          <div style={{
            display: "flex", alignItems: "flex-end", gap: "12px",
            padding: "12px 16px", borderRadius: "16px",
            border: "1px solid var(--border-light)", background: "var(--bg-hover)"
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isConnected ? "输入消息... (Enter 发送，Shift+Enter 换行)" : "等待连接..."}
              disabled={!isConnected || isStreaming}
              rows={1}
              style={{
                flex: 1, background: "transparent", fontSize: "14px",
                color: "var(--text-main)", border: "none", outline: "none", resize: "none",
                minHeight: "24px", maxHeight: "160px", padding: "4px 0"
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 160) + "px";
              }}
            />
            <button
              onClick={handleSend}
              disabled={!isConnected || !input.trim() || isStreaming}
              style={{
                width: "36px", height: "36px", borderRadius: "10px",
                background: "var(--color-primary)", color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "none", cursor: isConnected && input.trim() && !isStreaming ? "pointer" : "not-allowed",
                opacity: isConnected && input.trim() && !isStreaming ? 1 : 0.5
              }}
            >
              <Send style={{ width: "16px", height: "16px" }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证 TypeScript**

```bash
cd /Users/huanc/Desktop/ABO
npx tsc --noEmit src/modules/claude-panel/ClaudePanel.tsx
echo $?  # Expected: 0
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/claude-panel/ClaudePanel.tsx
git commit -m "feat(claude-panel): update to use new CLI chat protocol"
```

---

## Task 8: 集成测试

**Files:**
- 所有已创建/修改的文件

- [ ] **Step 1: 启动后端**

```bash
cd /Users/huanc/Desktop/ABO
python -m abo.main
```

- [ ] **Step 2: 测试 CLI 检测 API**

```bash
curl http://127.0.0.1:8765/api/cli/detect
curl http://127.0.0.1:8765/api/cli/debug/claude
```

- [ ] **Step 3: 测试对话 API**

```bash
# 创建对话
CONV=$(curl -s -X POST http://127.0.0.1:8765/api/chat/conversations \
  -H 'Content-Type: application/json' \
  -d '{"cli_type":"claude","title":"Test"}')
echo $CONV

# 获取对话列表
curl http://127.0.0.1:8765/api/chat/conversations

# 获取消息 (替换为实际 conv_id)
# curl http://127.0.0.1:8765/api/chat/conversations/{conv_id}/messages
```

- [ ] **Step 4: 启动前端**

```bash
cd /Users/huanc/Desktop/ABO
npm run dev
```

- [ ] **Step 5: 测试 WebSocket 连接**

在浏览器中打开 `http://localhost:1420`，切换到 Claude 面板，创建对话并发送消息。

- [ ] **Step 6: 验证数据库**

```bash
sqlite3 ~/.abo/data/conversations.db ".schema"
sqlite3 ~/.abo/data/conversations.db "SELECT * FROM conversations;"
sqlite3 ~/.abo/data/conversations.db "SELECT * FROM messages;"
```

- [ ] **Step 7: Commit 最终版本**

```bash
git add -A
git commit -m "feat(cli-dialog): complete CLI chat module with multi-CLI support"
```

---

## 验证检查清单

- [ ] `GET /api/cli/detect` 返回可用的 CLI 列表
- [ ] `GET /api/cli/debug/claude` 返回诊断信息
- [ ] `POST /api/chat/conversations` 创建对话
- [ ] `GET /api/chat/conversations` 列出对话
- [ ] `GET /api/chat/conversations/{id}/messages` 获取消息
- [ ] WebSocket `ws://127.0.0.1:8765/api/chat/ws/{cli_type}/{session_id}` 连接成功
- [ ] 发送消息后收到流式响应
- [ ] 对话历史保存到 `~/.abo/data/conversations.db`
- [ ] 前端可以创建新对话
- [ ] 前端可以查看对话历史
- [ ] 前端可以发送和接收消息

---

## 架构总结

```
Frontend (React)
├── useCliChat hook ← WebSocket 客户端
├── api.ts ← HTTP API 客户端
└── ClaudePanel.tsx ← UI 组件

Backend (FastAPI)
├── routes/cli.py ← CLI 检测/诊断
├── routes/chat.py ← WebSocket + HTTP API
├── claude_bridge/runner.py ← CliRunner 类
└── store/conversations.py ← SQLite 存储

CLI Process
└── claude --print (subprocess)
```
