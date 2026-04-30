# 07 — Claude Panel

> Read this for Claude chat interface, streaming, or quick action changes.

---

## Overview

Full-featured Claude chat interface with WebSocket streaming, markdown rendering, quick actions, and context injection.

---

## Frontend (`src/modules/claude-panel/ClaudePanel.tsx`)

### Architecture

```
ClaudePanel
├── Header (connection status, clear button)
├── Messages area
│   ├── WelcomeHero (shown when no messages)
│   │   └── Quick action grid (6 cards)
│   └── MessageBubble list
│       ├── User bubble (indigo, right-aligned)
│       └── Assistant bubble (white, left-aligned, markdown rendered)
├── Quick actions bar (compact, when conversation active)
└── Input bar (textarea + send button)
```

### WebSocket Connection

```typescript
// Connect to Claude WebSocket
const ws = new WebSocket("ws://127.0.0.1:8765/ws/claude");

// Send user message
ws.send(userText);

// Receive stream chunks
ws.onmessage = (e) => {
  const raw = e.data;
  if (raw === '{"type":"done"}') {
    // Stream complete
  } else {
    const text = extractText(raw);  // Parse stream-json format
    // Append to current assistant message
  }
};
```

### Stream Chunk Parser

Claude CLI outputs `--output-format stream-json`. The parser handles:

```typescript
function extractText(raw: string): string {
  // Handles multiple JSON formats:
  // {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
  // {"type":"result","result":"..."}
  // {"content":"..."}
  // Plain text lines (fallback)
}
```

### Message Types

```typescript
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;   // True while receiving chunks
  ts: number;            // Timestamp in ms
}
```

### Quick Actions (6 presets)

| ID | Label | Prompt |
|----|-------|--------|
| summarize | 总结文献 | 核心贡献、方法论、局限性 |
| hypothesis | 生成假设 | 3个可探索的研究假设 |
| critique | 批判分析 | 方法漏洞与改进方向 |
| plan | 研究规划 | 下周可执行的3个科研任务 |
| energy | 精力引导 | 低能量状态的30分钟任务 |
| insight | 灵感激发 | 跨学科创新思路 |

### UI Features

- **Auto-scroll**: Scrolls to bottom during streaming, unless user scrolled up
- **Scroll-to-bottom button**: Appears when >200px from bottom
- **Copy button**: Per-message (assistant only), copies raw markdown
- **Markdown rendering**: Full ReactMarkdown with GFM support (tables, code blocks, blockquotes)
- **Keyboard**: Enter to send, Shift+Enter for newline
- **Textarea auto-resize**: Grows up to max-h-40

---

## Backend: Claude WebSocket

### `ws://127.0.0.1:8765/ws/claude`

```python
# abo/claude_bridge/runner.py

async def stream_call(prompt: str, context: str, websocket: WebSocket):
    """Pipe claude CLI stream-json output to WebSocket."""
    full_prompt = f"{context}\n\n---\n\n{prompt}" if context else prompt
    process = await asyncio.create_subprocess_exec(
        "claude", "--print", "--output-format", "stream-json", full_prompt,
        stdout=asyncio.subprocess.PIPE,
    )
    async for line in process.stdout:
        await websocket.send_text(line.decode())

async def batch_call(prompt: str, context: str = "") -> str:
    """Wait for full output (used by motto generation, A+B collision, etc)."""
    proc = await asyncio.create_subprocess_exec(
        "claude", "--print", full_prompt,
        stdout=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode().strip()
```

### Context Injection (planned)

The WebSocket accepts optional `current_file` query param for context injection:
```
ws://127.0.0.1:8765/ws/claude?current_file=/path/to/paper.md
```

---

## Extending

### Adding a New Quick Action

Add to `QUICK_ACTIONS` array in ClaudePanel.tsx:
```typescript
{
  id: "new-action",
  label: "新指令",
  desc: "一句话描述",
  prompt: "完整的 prompt 文本...",
  Icon: SomeLucideIcon,
  color: "text-color-500 dark:text-color-400",
  bg: "bg-color-50 dark:bg-color-900/30",
  border: "border-color-200 dark:border-color-700/50",
}
```

### Adding Context Sources

To inject Vault data into Claude prompts, modify the WebSocket handler to read relevant files and prepend as context.
