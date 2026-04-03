# CLI 对话框模块开发指南

针对 ABO 项目架构（Tauri 2.x + React + Python FastAPI）的 CLI 对话框实现指南。

---

## 架构理解

### 已有基础

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React 19 + Tauri 2.x)                        │
│  ├── src/modules/claude-panel/ClaudePanel.tsx           │
│  └── WebSocket client → ws://127.0.0.1:8765/ws/claude   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Backend (Python FastAPI :8765)                         │
│  ├── abo/claude_bridge/runner.py  ← 已有基础            │
│  ├── runtime/broadcaster.py       ← WebSocket 广播      │
│  └── main.py                      ← 路由注册            │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼ subprocess
┌─────────────────────────────────────────────────────────┐
│  CLI Process                                            │
│  └── claude --print (已有) / gemini / openclaw          │
└─────────────────────────────────────────────────────────┘
```

### 实现策略

基于已有 `claude_bridge/runner.py`，采用**扩展模式**：

- **后端**: Python subprocess 调用 CLI → WebSocket 推送前端
- **前端**: React Hook 管理 WebSocket + 复用 ABO 设计系统
- **存储**: 新建 `conversations.db` 或使用现有 `cards.db`

---

## 后端实现

### 1. 扩展 CliRunner 支持多 CLI

**文件**: `abo/claude_bridge/runner.py`

```python
import asyncio
import json
import os
import uuid
from typing import Callable, Optional
from asyncio.subprocess import PIPE

class CliRunner:
    """通用 CLI 运行器 - 支持 Claude/Gemini/OpenClaw"""

    CLI_CONFIGS = {
        'claude': {
            'command': ['claude', '--print'],
            'env': {},
            'protocol': 'raw',  # 直接文本输出
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
        # 复用现有实现或保持简单
        self.process = await asyncio.create_subprocess_exec(
            *self.config['command'],
            stdin=PIPE,
            stdout=PIPE,
            stderr=PIPE,
        )

        assert self.process.stdin
        self.process.stdin.write(message.encode() + b'\n')
        await self.process.stdin.drain()
        self.process.stdin.close()

        assert self.process.stdout
        while True:
            chunk = await self.process.stdout.read(1024)
            if not chunk:
                break
            await on_chunk({'type': 'content', 'data': chunk.decode(), 'msg_id': ''})

        await on_chunk({'type': 'finish', 'data': '', 'msg_id': ''})

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
            self.process.kill()
            self.process = None
```

### 2. CLI 检测

**文件**: `abo/routes/cli.py`

```python
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

### 3. 对话存储

**文件**: `abo/store/conversations.py`

```python
import sqlite3
import json
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class Message:
    id: str
    conversation_id: str
    role: str
    content: str
    msg_id: Optional[str] = None
    metadata: Optional[str] = None
    created_at: Optional[datetime] = None


class ConversationStore:
    def __init__(self, db_path: str = "~/.abo/data/conversations.db"):
        self.db_path = os.path.expanduser(db_path)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()

    def _init_db(self):
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
            """)

    def create_conversation(self, cli_type: str, session_id: str, title: str = "") -> str:
        conv_id = str(uuid.uuid4())
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO conversations (id, cli_type, session_id, title) VALUES (?, ?, ?, ?)",
                (conv_id, cli_type, session_id, title or f"New {cli_type} chat")
            )
        return conv_id

    def add_message(self, conv_id: str, role: str, content: str,
                    msg_id: Optional[str] = None, metadata: Optional[dict] = None):
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

    def get_messages(self, conv_id: str, limit: int = 100) -> list[Message]:
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

    def list_conversations(self) -> list[dict]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM conversations ORDER BY updated_at DESC"
            ).fetchall()
            return [dict(r) for r in rows]
```

### 4. WebSocket 与 HTTP API

**文件**: `abo/routes/chat.py`

```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict
import uuid
import json
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

            # 保存用户消息
            store.add_message(conv_id, 'user', message)

            # 流式调用
            full_response = []
            current_msg_id = str(uuid.uuid4())

            async def on_chunk(event: dict):
                await manager.send_json(client_id, {
                    'type': event['type'],
                    'data': event['data'],
                    'msg_id': event.get('msg_id', current_msg_id)
                })
                if event['type'] == 'content':
                    full_response.append(event['data'])

            await runner.stream_call(message, on_chunk)

            # 保存助手响应
            store.add_message(conv_id, 'assistant', ''.join(full_response),
                            msg_id=current_msg_id)

    except WebSocketDisconnect:
        manager.disconnect(client_id)


# HTTP API
from pydantic import BaseModel

class CreateConversationRequest(BaseModel):
    cli_type: str
    title: Optional[str] = None


@chat_router.post("/conversations")
async def create_conversation(req: CreateConversationRequest):
    session_id = str(uuid.uuid4())
    conv_id = store.create_conversation(req.cli_type, session_id, req.title)
    return {"id": conv_id, "session_id": session_id, "cli_type": req.cli_type}


@chat_router.get("/conversations")
async def list_conversations():
    return store.list_conversations()


@chat_router.get("/conversations/{conv_id}/messages")
async def get_messages(conv_id: str, limit: int = 100):
    messages = store.get_messages(conv_id, limit)
    return {
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at.isoformat() if m.created_at else None
            }
            for m in messages
        ]
    }
```

### 5. 注册路由

**文件**: `abo/main.py`

```python
from .routes.cli import cli_router
from .routes.chat import chat_router

app.include_router(cli_router)
app.include_router(chat_router)
```

---

## 前端实现

### 1. API 层

**文件**: `src/core/api.ts`

```typescript
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
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

const API_BASE = 'http://127.0.0.1:8765/api';

export async function detectClis(): Promise<CliConfig[]> {
  const res = await fetch(`${API_BASE}/cli/detect`);
  return res.json();
}

export async function debugCli(cliType: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/cli/debug/${cliType}`);
  return res.json();
}

export async function createConversation(cliType: string, title?: string): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/chat/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cli_type: cliType, title }),
  });
  return res.json();
}

export async function listConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_BASE}/chat/conversations`);
  return res.json();
}

export async function getMessages(convId: string, limit = 100): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/chat/conversations/${convId}/messages?limit=${limit}`);
  const data = await res.json();
  return data.messages;
}
```

### 2. WebSocket Hook

**文件**: `src/hooks/useCliChat.ts`

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
}

export function useCliChat({ cliType, sessionId, conversationId, onEvent }: UseCliChatOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://127.0.0.1:8765/api/chat/ws/${cliType}/${sessionId}`);

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);

    ws.onmessage = (event) => {
      const data: StreamEvent = JSON.parse(event.data);
      if (data.type === 'start') setIsStreaming(true);
      if (data.type === 'finish') setIsStreaming(false);
      onEvent?.(data);
    };

    wsRef.current = ws;
    return () => ws.close();
  }, [cliType, sessionId]);

  const sendMessage = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ message, conversation_id: conversationId }));
    }
  }, [conversationId]);

  return { isConnected, isStreaming, sendMessage };
}
```

### 3. UI 组件

**文件**: `src/modules/claude-panel/ChatPanel.tsx`

```tsx
import { useState, useEffect, useRef } from 'react';
import { useCliChat, type StreamEvent } from '../../hooks/useCliChat';
import { detectClis, createConversation, getMessages, type CliConfig, type Message } from '../../core/api';
import { Bot, Send, Loader2 } from 'lucide-react';

export function ChatPanel() {
  const [clis, setClis] = useState<CliConfig[]>([]);
  const [conversation, setConversation] = useState<{ id: string; cli_type: string; session_id: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    detectClis().then(setClis);
  }, []);

  const startChat = async (cliType: string) => {
    const conv = await createConversation(cliType);
    setConversation(conv);
    setMessages([]);
  };

  const { isConnected, isStreaming, sendMessage } = useCliChat({
    cliType: conversation?.cli_type || '',
    sessionId: conversation?.session_id || '',
    conversationId: conversation?.id || '',
    onEvent: (event: StreamEvent) => {
      switch (event.type) {
        case 'start':
          setMessages(prev => [...prev, { id: event.msg_id, role: 'assistant', content: '' }]);
          break;
        case 'content':
          setMessages(prev => prev.map(m => m.id === event.msg_id ? { ...m, content: m.content + event.data } : m));
          break;
        case 'finish':
          // 可选：标记完成状态
          break;
        case 'tool_call':
          const tool = JSON.parse(event.data);
          setMessages(prev => [...prev, { id: `tool-${Date.now()}`, role: 'assistant', content: `🔧 ${tool.tool_name}` }]);
          break;
      }
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || !conversation) return;

    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: input }]);
    sendMessage(input);
    setInput('');
  };

  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <h2 className="text-xl font-semibold text-[var(--text)]">选择 CLI 开始对话</h2>
        <div className="flex gap-3">
          {clis.map(cli => (
            <button
              key={cli.id}
              onClick={() => startChat(cli.id)}
              className="flex items-center gap-2 rounded-xl bg-[var(--surface)] px-6 py-3 text-[var(--text)] shadow-sm hover:bg-[var(--surface-2)]"
            >
              <Bot className="h-5 w-5 text-[var(--primary)]" />
              <span>{cli.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-6 py-4">
        <Bot className="h-5 w-5 text-[var(--primary)]" />
        <span className="font-medium text-[var(--text)]">{clis.find(c => c.id === conversation.cli_type)?.name}</span>
        <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                msg.role === 'user'
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]'
              }`}>
                {msg.content}
                {msg.role === 'assistant' && isStreaming && messages[messages.length - 1]?.id === msg.id && (
                  <span className="ml-1 animate-pulse">▋</span>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mx-auto flex max-w-3xl gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="输入消息..."
            disabled={isStreaming}
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="flex items-center rounded-xl bg-[var(--primary)] px-6 py-3 text-white hover:bg-[var(--primary-dim)] disabled:opacity-50"
          >
            {isStreaming ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## 实施检查清单

### Phase 1: 后端
- [ ] 扩展 `abo/claude_bridge/runner.py` 添加 `CliRunner` 类
- [ ] 创建 `abo/routes/cli.py` 实现 `detect_clis` 和 `debug_cli`
- [ ] 创建 `abo/store/conversations.py` 实现 `ConversationStore`
- [ ] 创建 `abo/routes/chat.py` 实现 WebSocket 和 HTTP API
- [ ] 在 `abo/main.py` 注册所有路由

### Phase 2: 前端
- [ ] 扩展 `src/core/api.ts` 添加 CLI API
- [ ] 创建 `src/hooks/useCliChat.ts`
- [ ] 创建/更新 `src/modules/claude-panel/ChatPanel.tsx`

### Phase 3: 验证
- [ ] 访问 `http://127.0.0.1:8765/api/cli/detect` 返回 CLI 列表
- [ ] 访问 `http://127.0.0.1:8765/api/cli/debug/claude` 返回诊断信息
- [ ] WebSocket 连接 `ws://127.0.0.1:8765/api/chat/ws/claude/{session_id}` 成功
- [ ] 发送消息后收到流式响应
- [ ] 对话历史保存到 `~/.abo/data/conversations.db`

---

## 快速调试

### 后端诊断
```bash
# 检测 CLI
curl http://127.0.0.1:8765/api/cli/detect

# 调试特定 CLI
curl http://127.0.0.1:8765/api/cli/debug/claude
curl http://127.0.0.1:8765/api/cli/debug/gemini
```

### 前端诊断组件
```tsx
function DebugPanel() {
  const [results, setResults] = useState({});

  const runTest = async () => {
    setResults({
      clis: await detectClis(),
      claude: await debugCli('claude'),
    });
  };

  return <pre>{JSON.stringify(results, null, 2)}</pre>;
}
```

---

## 参考文件

| 功能 | 路径 |
|-----|------|
| 现有 Claude | `abo/claude_bridge/runner.py` |
| WebSocket | `abo/runtime/broadcaster.py` |
| 现有面板 | `src/modules/claude-panel/ClaudePanel.tsx` |
| API 客户端 | `src/core/api.ts` |
