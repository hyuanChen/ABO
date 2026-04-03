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

### 与 AionUi 的关键差异

| AionUi (Electron) | ABO (Tauri + Python) |
|-------------------|---------------------|
| Rust 直接 spawn CLI | Python subprocess CLI |
| Rust IPC → 前端 | Python WebSocket → 前端 |
| 每个对话 Rust Agent | 每个对话 Python runner |
| SQLite 在 Rust | SQLite 在 Python (cards.db) |

---

## 实现策略

基于你已有 `claude_bridge/runner.py`，采用**扩展模式**而非重写：

### 方案 A：统一 Runner（推荐）

扩展 `claude_bridge/runner.py` 支持多 CLI：

```python
# abo/claude_bridge/runner.py 扩展

class CliRunner:
    """通用 CLI 运行器 - 支持 Claude/Gemini/OpenClaw"""

    CLI_CONFIGS = {
        'claude': {
            'command': ['claude', '--print'],
            'env': {},
            'json_mode': False,  # Claude 输出原始文本
        },
        'gemini': {
            'command': ['gemini', '--experimental-acp'],
            'env': {},
            'json_mode': True,   # ACP 协议
            'protocol': 'acp',
        },
        'openclaw': {
            'command': ['openclaw', 'gateway'],
            'env': {},
            'json_mode': True,
            'protocol': 'websocket',  # OpenClaw 用 WebSocket
        }
    }

    def __init__(self, cli_type: str, session_id: str):
        self.cli_type = cli_type
        self.config = self.CLI_CONFIGS[cli_type]
        self.session_id = session_id
        self.process = None

    async def stream_call(self, message: str, on_chunk: Callable):
        """流式调用 - 适配不同 CLI 协议"""

        if self.config.get('protocol') == 'acp':
            await self._stream_acp(message, on_chunk)
        elif self.config.get('protocol') == 'websocket':
            await self._stream_websocket(message, on_chunk)
        else:
            await self._stream_raw(message, on_chunk)  # Claude 现有模式

    async def _stream_acp(self, message: str, on_chunk: Callable):
        """ACP JSON-RPC 协议处理"""
        import asyncio
        from asyncio.subprocess import PIPE

        # 启动 ACP 模式
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

        self.process.stdin.write(json.dumps(acp_msg).encode() + b'\n')
        await self.process.stdin.drain()

        # 解析 JSON Lines 流
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        await asyncio.get_event_loop().connect_read_pipe(
            lambda: protocol, self.process.stdout
        )

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
                        'data': data['params'],
                        'msg_id': data.get('id', '')
                    })

            except json.JSONDecodeError:
                continue

    def _parse_acp_event(self, data: dict) -> str:
        """解析 ACP 事件类型"""
        method = data.get('method', '')
        if method == 'conversation/update':
            status = data.get('params', {}).get('status', '')
            return 'finish' if status == 'completed' else 'content'
        elif method == 'tool_call':
            return 'tool_call'
        return 'unknown'
```

---

## 后端实现

### 1. CLI 检测 Endpoint

在 `abo/main.py` 添加：

```python
# abo/main.py

from fastapi import APIRouter
import subprocess
import shutil

cli_router = APIRouter(prefix="/api/cli")

CLI_REGISTRY = {
    'claude': {'name': 'Claude Code', 'check': 'claude --version'},
    'gemini': {'name': 'Gemini CLI', 'check': 'gemini --version'},
    'openclaw': {'name': 'OpenClaw', 'check': 'openclaw --version'},
}

@cli_router.get("/detect")
async def detect_clis() -> list[dict]:
    """检测本地可用的 CLI 工具"""
    available = []

    for cli_id, config in CLI_REGISTRY.items():
        cmd = config['check'].split()[0]
        if shutil.which(cmd):
            # 验证实际可运行
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

# 注册路由
app.include_router(cli_router)
```

### 2. 对话管理扩展

复用现有的 `cards.db` 或新建 `conversations.db`：

```python
# abo/store/conversations.py

import sqlite3
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

@dataclass
class Conversation:
    id: str
    cli_type: str  # 'claude' | 'gemini' | 'openclaw'
    session_id: str
    title: str
    created_at: datetime
    updated_at: datetime

@dataclass
class Message:
    id: str
    conversation_id: str
    role: str  # 'user' | 'assistant' | 'system'
    content: str
    msg_id: Optional[str]  # 流式消息 ID
    metadata: Optional[str]  # JSON: tool_calls, etc.
    created_at: datetime

class ConversationStore:
    """对话存储 - 使用现有 cards.db 或独立数据库"""

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
        import uuid
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
        import uuid

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
                """SELECT * FROM messages
                   WHERE conversation_id = ?
                   ORDER BY created_at ASC
                   LIMIT ?""",
                (conv_id, limit)
            ).fetchall()

            return [Message(
                id=r['id'],
                conversation_id=r['conversation_id'],
                role=r['role'],
                content=r['content'],
                msg_id=r['msg_id'],
                metadata=r['metadata'],
                created_at=datetime.fromisoformat(r['created_at'])
            ) for r in rows]

    def update_message_content(self, msg_id: str, content: str):
        """流式更新消息内容"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "UPDATE messages SET content = ? WHERE msg_id = ?",
                (content, msg_id)
            )
```

### 3. WebSocket 扩展

扩展现有 WebSocket 支持多 CLI：

```python
# abo/routes/websocket.py

from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict
import asyncio
import json

# 存储活跃连接
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

@router.websocket("/ws/chat/{cli_type}/{session_id}")
async def chat_websocket(websocket: WebSocket, cli_type: str, session_id: str):
    """通用 CLI 对话 WebSocket"""
    client_id = f"{cli_type}:{session_id}"
    await manager.connect(websocket, client_id)

    # 初始化 Runner
    runner = CliRunner(cli_type, session_id)
    manager.cli_runners[client_id] = runner

    try:
        while True:
            # 接收前端消息
            data = await websocket.receive_json()
            message = data.get('message', '')
            conv_id = data.get('conversation_id', '')

            # 保存用户消息
            conversation_store.add_message(conv_id, 'user', message)

            # 流式调用 CLI
            full_response = []
            current_msg_id = str(uuid.uuid4())

            async def on_chunk(event):
                await manager.send_json(client_id, {
                    'type': event['type'],
                    'data': event['data'],
                    'msg_id': event.get('msg_id', current_msg_id)
                })

                if event['type'] == 'content':
                    full_response.append(event['data'])

            await runner.stream_call(message, on_chunk)

            # 保存完整响应
            conversation_store.add_message(
                conv_id, 'assistant', ''.join(full_response),
                msg_id=current_msg_id
            )

    except WebSocketDisconnect:
        manager.disconnect(client_id)
```

### 4. HTTP API 补充

```python
# abo/routes/conversations.py

from fastapi import APIRouter
from typing import List

conversation_router = APIRouter(prefix="/api/conversations")

@conversation_router.post("/")
async def create_conversation(request: CreateConversationRequest):
    """创建新对话"""
    session_id = str(uuid.uuid4())
    conv_id = conversation_store.create_conversation(
        cli_type=request.cli_type,
        session_id=session_id,
        title=request.title
    )

    return {
        "id": conv_id,
        "session_id": session_id,
        "cli_type": request.cli_type
    }

@conversation_router.get("/{conv_id}/messages")
async def get_messages(conv_id: str, limit: int = 100):
    """获取对话历史"""
    messages = conversation_store.get_messages(conv_id, limit)
    return {
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at.isoformat()
            }
            for m in messages
        ]
    }

@conversation_router.get("/")
async def list_conversations():
    """列出所有对话"""
    # 实现列表查询
    pass
```

---

## 前端实现

### 1. API 层

```typescript
// src/core/api.ts 扩展

export interface CliConfig {
  id: string;
  name: string;
  version: string;
}

export interface Conversation {
  id: string;
  cliType: string;
  sessionId: string;
  title: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

// 检测可用 CLI
export async function detectClis(): Promise<CliConfig[]> {
  const res = await fetch('http://127.0.0.1:8765/api/cli/detect');
  return res.json();
}

// 创建对话
export async function createConversation(
  cliType: string,
  title?: string
): Promise<Conversation> {
  const res = await fetch('http://127.0.0.1:8765/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cli_type: cliType, title }),
  });
  return res.json();
}

// 获取消息历史
export async function getMessages(convId: string): Promise<Message[]> {
  const res = await fetch(
    `http://127.0.0.1:8765/api/conversations/${convId}/messages`
  );
  const data = await res.json();
  return data.messages;
}
```

### 2. WebSocket Hook

```typescript
// src/hooks/useCliChat.ts

import { useState, useEffect, useRef, useCallback } from 'react';

interface StreamEvent {
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

export function useCliChat({
  cliType,
  sessionId,
  conversationId,
  onEvent,
}: UseCliChatOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(
      `ws://127.0.0.1:8765/ws/chat/${cliType}/${sessionId}`
    );

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);

    ws.onmessage = (event) => {
      const data: StreamEvent = JSON.parse(event.data);

      switch (data.type) {
        case 'start':
          setIsStreaming(true);
          break;
        case 'finish':
          setIsStreaming(false);
          break;
      }

      onEvent?.(data);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [cliType, sessionId]);

  const sendMessage = useCallback(
    (message: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            message,
            conversation_id: conversationId,
          })
        );
      }
    },
    [conversationId]
  );

  return {
    isConnected,
    isStreaming,
    sendMessage,
  };
}
```

### 3. UI 组件

复用 ABO 设计系统（Tailwind v4 + CSS vars）：

```tsx
// src/modules/claude-panel/UniversalChatPanel.tsx

import { useState, useEffect, useRef } from 'react';
import { useCliChat } from '../../hooks/useCliChat';
import { detectClis, createConversation, getMessages } from '../../core/api';
import { Bot, Send, Loader2 } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export function UniversalChatPanel() {
  const [availableClis, setAvailableClis] = useState([]);
  const [selectedCli, setSelectedCli] = useState('claude');
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 检测可用 CLI
  useEffect(() => {
    detectClis().then(setAvailableClis);
  }, []);

  // 创建对话
  const startConversation = async (cliType: string) => {
    const conv = await createConversation(cliType);
    setConversation(conv);
    setSelectedCli(cliType);
    setMessages([]);
  };

  // WebSocket 连接
  const { isConnected, isStreaming, sendMessage } = useCliChat({
    cliType: selectedCli,
    sessionId: conversation?.sessionId || '',
    conversationId: conversation?.id || '',
    onEvent: (event) => {
      switch (event.type) {
        case 'start':
          setMessages((prev) => [
            ...prev,
            {
              id: event.msg_id,
              role: 'assistant',
              content: '',
              isStreaming: true,
            },
          ]);
          break;

        case 'content':
          setMessages((prev) =>
            prev.map((m) =>
              m.id === event.msg_id
                ? { ...m, content: m.content + event.data }
                : m
            )
          );
          break;

        case 'finish':
          setMessages((prev) =>
            prev.map((m) =>
              m.id === event.msg_id ? { ...m, isStreaming: false } : m
            )
          );
          break;

        case 'tool_call':
          // 显示工具调用
          const toolData = JSON.parse(event.data);
          setMessages((prev) => [
            ...prev,
            {
              id: `tool-${Date.now()}`,
              role: 'assistant',
              content: `🔧 使用工具: ${toolData.tool_name}`,
              isStreaming: false,
            },
          ]);
          break;
      }
    },
  });

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    // 添加用户消息
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: input },
    ]);

    sendMessage(input);
    setInput('');
  };

  // CLI 选择器
  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <h2 className="text-xl font-semibold text-[var(--text)]">
          选择 CLI 工具开始对话
        </h2>
        <div className="flex gap-3">
          {availableClis.map((cli) => (
            <button
              key={cli.id}
              onClick={() => startConversation(cli.id)}
              className="flex items-center gap-2 rounded-xl bg-[var(--surface)] px-6 py-3
                         text-[var(--text)] shadow-sm transition-all
                         hover:bg-[var(--surface-2)] hover:shadow-md"
            >
              <Bot className="h-5 w-5 text-[var(--primary)]" />
              <span>{cli.name}</span>
              <span className="text-xs text-[var(--text-muted)]">
                {cli.version}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-[var(--primary)]" />
          <span className="font-medium text-[var(--text)]">
            {availableClis.find((c) => c.id === selectedCli)?.name}
          </span>
          <span
            className={`h-2 w-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                  msg.role === 'user'
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]'
                }`}
              >
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {msg.content}
                  {msg.isStreaming && (
                    <span className="ml-1 inline-block animate-pulse">▋</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区 */}
      <div className="border-t border-[var(--border)] bg-[var(--surface)] p-4">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-3xl gap-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息..."
            disabled={isStreaming}
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)]
                       px-4 py-3 text-[var(--text)] outline-none
                       focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3
                       text-white transition-all hover:bg-[var(--primary-dim)]
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
    </div>
  );
}
```

---

## 调试流程

### 1. 后端诊断

```python
# abo/main.py 添加诊断端点

@router.get("/debug/cli/{cli_type}")
async def debug_cli(cli_type: str):
    """诊断 CLI 连接"""
    import shutil
    import subprocess

    config = CLI_REGISTRY.get(cli_type, {})
    cmd = config.get('check', '').split()[0] if config else cli_type

    result = {
        "cli_type": cli_type,
        "in_path": shutil.which(cmd) is not None,
        "path_location": shutil.which(cmd),
        "version_check": None,
        "error": None,
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

### 2. 前端诊断面板

```tsx
// src/components/CliDebugPanel.tsx

import { useState } from 'react';

export function CliDebugPanel() {
  const [results, setResults] = useState<Record<string, any>>({});

  const runDiagnostics = async () => {
    const clis = ['claude', 'gemini', 'openclaw'];
    const newResults: Record<string, any> = {};

    for (const cli of clis) {
      const res = await fetch(
        `http://127.0.0.1:8765/api/debug/cli/${cli}`
      );
      newResults[cli] = await res.json();
    }

    // WebSocket 测试
    const wsTest = await testWebSocket();
    newResults['websocket'] = wsTest;

    setResults(newResults);
  };

  const testWebSocket = (): Promise<any> => {
    return new Promise((resolve) => {
      const ws = new WebSocket('ws://127.0.0.1:8765/ws/chat/claude/test');
      const startTime = Date.now();

      ws.onopen = () => {
        resolve({
          status: 'connected',
          latency: Date.now() - startTime,
        });
        ws.close();
      };

      ws.onerror = (e) => {
        resolve({ status: 'error', error: String(e) });
      };

      setTimeout(() => {
        resolve({ status: 'timeout' });
      }, 5000);
    });
  };

  return (
    <div className="p-6">
      <button
        onClick={runDiagnostics}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-white"
      >
        运行诊断
      </button>
      <pre className="mt-4 rounded-lg bg-slate-900 p-4 text-sm text-white">
        {JSON.stringify(results, null, 2)}
      </pre>
    </div>
  );
}
```

---

## 实施检查清单

### Phase 1: 后端基础
- [ ] 创建 `abo/claude_bridge/runner.py` 的 `CliRunner` 类
- [ ] 实现 `detect_clis` API 端点
- [ ] 创建 `ConversationStore` 数据库操作
- [ ] 扩展 WebSocket 路由支持 `/ws/chat/{cli_type}/{session_id}`
- [ ] 添加对话管理 HTTP API

### Phase 2: 前端基础
- [ ] 扩展 `src/core/api.ts` 添加 CLI 相关 API
- [ ] 创建 `useCliChat` hook
- [ ] 实现 CLI 选择器 UI
- [ ] 实现消息列表和输入组件

### Phase 3: 集成测试
- [ ] 验证 CLI 检测正常工作
- [ ] 验证 WebSocket 连接和流式输出
- [ ] 验证消息持久化到 SQLite
- [ ] 验证多 CLI 切换

### Phase 4: 优化
- [ ] 添加消息虚拟滚动（大量消息时）
- [ ] 添加对话历史搜索
- [ ] 添加导出对话到 Vault Markdown

---

## 与现有 ClaudePanel 的关系

你可以选择：

1. **扩展现有 ClaudePanel** - 添加 CLI 选择器，复用大部分 UI
2. **新建 UniversalChatPanel** - 并排展示，ClaudePanel 保持不变
3. **完全替换** - 移除 ClaudePanel，使用新的通用组件

建议采用方案 1（扩展），因为：
- 保持用户习惯
- 减少代码重复
- 可以渐进式添加新 CLI 支持

---

## 参考代码位置

| 功能 | 文件路径 |
|-----|---------|
| 现有 Claude 调用 | `abo/claude_bridge/runner.py` |
| WebSocket 广播 | `abo/runtime/broadcaster.py` |
| 现有 ClaudePanel | `src/modules/claude-panel/ClaudePanel.tsx` |
| API 客户端 | `src/core/api.ts` |
| 数据存储 | `abo/store/cards.py` (参考模式) |

---

*基于 ABO 架构 v1.0*