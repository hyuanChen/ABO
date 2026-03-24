import { useEffect, useRef, useState, useCallback } from "react";
import {
  Bot, Send, Zap, BookOpen, Lightbulb, Target,
  RotateCcw, Cpu, Wifi, WifiOff,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface StreamChunk {
  type: string;
  delta?: { type: string; text?: string };
  content?: string;
  result?: string;
}

// ── Quick actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    id: "summarize",
    label: "总结当前文献",
    prompt: "请总结当前文献的核心贡献、方法论和局限性。",
    Icon: BookOpen,
    color: "text-indigo-500 dark:text-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-900/30",
  },
  {
    id: "hypothesis",
    label: "生成研究假设",
    prompt: "基于当前文献和研究背景，生成3个可能的研究假设。",
    Icon: Lightbulb,
    color: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/30",
  },
  {
    id: "critique",
    label: "批判性分析",
    prompt: "请对当前文献进行批判性分析，指出方法论漏洞和可改进之处。",
    Icon: Target,
    color: "text-rose-500 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-900/30",
  },
  {
    id: "energy",
    label: "精力引导",
    prompt: "我现在精力较低，请给我一个高效率、短时间的科研任务建议。",
    Icon: Zap,
    color: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
  },
];

// ── Stream chunk parser ───────────────────────────────────────────────────────

function extractText(raw: string): string {
  // Handle stream-json format from claude CLI
  const lines = raw.split("\n").filter(Boolean);
  let text = "";
  for (const line of lines) {
    try {
      const chunk: StreamChunk = JSON.parse(line);
      if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
        text += chunk.delta.text ?? "";
      } else if (chunk.type === "result" && chunk.result) {
        // batch response fallback
        text = chunk.result;
      } else if (chunk.content) {
        text += chunk.content;
      }
    } catch {
      // plain text fallback
      if (line && !line.startsWith("{")) text += line;
    }
  }
  return text;
}

// ── Context badge ─────────────────────────────────────────────────────────────

function ContextBadge({ file }: { file: string | null }) {
  if (!file) return null;
  const name = file.split("/").pop()?.replace(/\.md$/, "") ?? file;
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700/50 text-xs text-indigo-600 dark:text-indigo-400">
      <BookOpen className="w-3 h-3" aria-hidden />
      <span className="truncate max-w-32">{name}</span>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isUser
          ? "bg-indigo-100 dark:bg-indigo-900/40"
          : "bg-violet-100 dark:bg-violet-900/40"
      }`}>
        {isUser
          ? <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">You</span>
          : <Bot className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" aria-hidden />
        }
      </div>

      {/* Bubble */}
      <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
        isUser
          ? "bg-indigo-500 text-white rounded-tr-sm"
          : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tl-sm"
      }`}>
        {msg.content}
        {msg.streaming && (
          <span className="inline-flex ml-1 gap-0.5 translate-y-0.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-1 h-1 rounded-full bg-current opacity-60 animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ClaudePanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [currentFile] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingIdRef = useRef<string | null>(null);

  // ── WebSocket lifecycle ──────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setConnecting(true);
    const url = currentFile
      ? `ws://127.0.0.1:8765/ws/claude?current_file=${encodeURIComponent(currentFile)}`
      : "ws://127.0.0.1:8765/ws/claude";
    const ws = new WebSocket(url);

    ws.onopen = () => { setConnected(true); setConnecting(false); };
    ws.onclose = () => { setConnected(false); setConnecting(false); };
    ws.onerror = () => { setConnected(false); setConnecting(false); };

    ws.onmessage = (e: MessageEvent) => {
      const raw: string = e.data;
      // Sentinel: end of assistant turn
      if (raw.trim() === '{"type":"done"}') {
        setMessages((prev) => prev.map((m) =>
          m.id === pendingIdRef.current ? { ...m, streaming: false } : m
        ));
        pendingIdRef.current = null;
        return;
      }
      const text = extractText(raw);
      if (!text) return;

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.id === pendingIdRef.current && last.role === "assistant") {
          return prev.map((m) =>
            m.id === pendingIdRef.current ? { ...m, content: m.content + text } : m
          );
        }
        // New assistant message
        const id = crypto.randomUUID();
        pendingIdRef.current = id;
        return [...prev, { id, role: "assistant", content: text, streaming: true }];
      });
    };

    wsRef.current = ws;
  }, [currentFile]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send ─────────────────────────────────────────────────────────────────
  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const id = crypto.randomUUID();
    setMessages((prev) => [...prev, { id, role: "user", content: trimmed }]);
    wsRef.current.send(trimmed);
    setInput("");
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function clearHistory() {
    setMessages([]);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
          <Bot className="w-5 h-5 text-violet-500 dark:text-violet-400" aria-hidden />
        </div>
        <div className="flex-1">
          <h2 className="font-heading text-lg text-slate-800 dark:text-slate-100">Claude 面板</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">AI 科研助手 · 本地 Claude CLI</p>
        </div>

        {/* Connection status */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium ${
          connected
            ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
            : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
        }`}>
          {connected
            ? <Wifi className="w-3 h-3" aria-hidden />
            : <WifiOff className="w-3 h-3" aria-hidden />
          }
          {connecting ? "连接中…" : connected ? "已连接" : "未连接"}
        </div>

        {!connected && !connecting && (
          <button onClick={connect} aria-label="重新连接"
            className="p-2 rounded-xl text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors cursor-pointer">
            <Cpu className="w-4 h-4" aria-hidden />
          </button>
        )}

        <button onClick={clearHistory} aria-label="清空对话"
          className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer">
          <RotateCcw className="w-4 h-4" aria-hidden />
        </button>
      </div>

      {/* Context badge row */}
      {(currentFile) && (
        <div className="px-6 py-2 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <span className="text-xs text-slate-400">上下文：</span>
          <ContextBadge file={currentFile} />
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center">
              <Bot className="w-8 h-8 text-violet-400" aria-hidden />
            </div>
            <div>
              <p className="font-heading text-lg text-slate-700 dark:text-slate-200">Claude 科研助手</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {connected ? "已连接，输入问题或使用快捷指令" : "正在连接本地 Claude CLI…"}
              </p>
            </div>

            {/* Quick action grid */}
            <div className="grid grid-cols-2 gap-3 w-full max-w-md">
              {QUICK_ACTIONS.map(({ id, label, prompt, Icon, color, bg }) => (
                <button key={id} onClick={() => send(prompt)} disabled={!connected}
                  className={`flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors cursor-pointer disabled:opacity-40 text-left group`}>
                  <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${color}`} aria-hidden />
                  </div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      {/* Quick actions compact (when there are messages) */}
      {messages.length > 0 && (
        <div className="px-6 py-2 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-slate-400 shrink-0">快捷：</span>
          {QUICK_ACTIONS.map(({ id, label, prompt, Icon, color }) => (
            <button key={id} onClick={() => send(prompt)} disabled={!connected}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer disabled:opacity-40 shrink-0`}>
              <Icon className={`w-3 h-3 ${color}`} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex items-end gap-3 p-3 rounded-2xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected ? "输入问题… (Enter 发送，Shift+Enter 换行)" : "等待 Claude CLI 连接…"}
            disabled={!connected}
            rows={1}
            className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 resize-none focus:outline-none min-h-[20px] max-h-40 disabled:cursor-not-allowed"
            style={{ height: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 160) + "px";
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={!connected || !input.trim()}
            aria-label="发送"
            className="w-8 h-8 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Send className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 px-1">
          Enter 发送 · Shift+Enter 换行 · 上下文自动注入
        </p>
      </div>
    </div>
  );
}
