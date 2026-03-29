import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot, Send, Zap, BookOpen, Lightbulb, Target,
  RotateCcw, Wifi, WifiOff, ChevronDown, Copy, Check,
  Cpu, Sparkles, Brain, FlaskConical,
} from "lucide-react";
import { useStore } from "../../core/store";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  ts: number; // timestamp ms
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
    label: "总结文献",
    desc: "核心贡献、方法、局限性",
    prompt: "请总结当前文献的核心贡献、方法论和局限性。",
    Icon: BookOpen,
    color: "text-indigo-500 dark:text-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-900/30",
    border: "border-indigo-200 dark:border-indigo-700/50",
  },
  {
    id: "hypothesis",
    label: "生成假设",
    desc: "3个可探索的研究假设",
    prompt: "基于当前文献和研究背景，生成3个具体可探索的研究假设，并说明验证方法。",
    Icon: Lightbulb,
    color: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/30",
    border: "border-amber-200 dark:border-amber-700/50",
  },
  {
    id: "critique",
    label: "批判分析",
    desc: "方法漏洞与改进方向",
    prompt: "请对当前文献进行批判性分析，指出方法论漏洞、样本局限性和可改进之处。",
    Icon: Target,
    color: "text-rose-500 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-900/30",
    border: "border-rose-200 dark:border-rose-700/50",
  },
  {
    id: "plan",
    label: "研究规划",
    desc: "下一步可执行的科研计划",
    prompt: "根据我当前的研究进展，帮我制定下周可执行的3个科研任务，每个任务需明确目标和成功标准。",
    Icon: FlaskConical,
    color: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    border: "border-emerald-200 dark:border-emerald-700/50",
  },
  {
    id: "energy",
    label: "精力引导",
    desc: "低能量状态的高效任务",
    prompt: "我现在精力较低，请给我一个高效率、短时间（30分钟内）可完成的科研任务建议。",
    Icon: Zap,
    color: "text-violet-500 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/30",
    border: "border-violet-200 dark:border-violet-700/50",
  },
  {
    id: "insight",
    label: "灵感激发",
    desc: "跨学科创新思路",
    prompt: "请从跨学科的视角，给我当前研究领域一个意想不到的创新思路，并说明其可行性。",
    Icon: Brain,
    color: "text-cyan-500 dark:text-cyan-400",
    bg: "bg-cyan-50 dark:bg-cyan-900/30",
    border: "border-cyan-200 dark:border-cyan-700/50",
  },
];

// ── Stream chunk parser ───────────────────────────────────────────────────────

function extractText(raw: string): string {
  const lines = raw.split("\n").filter(Boolean);
  let text = "";
  for (const line of lines) {
    try {
      const chunk: StreamChunk = JSON.parse(line);
      if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
        text += chunk.delta.text ?? "";
      } else if (chunk.type === "result" && chunk.result) {
        text = chunk.result;
      } else if (chunk.content) {
        text += chunk.content;
      }
    } catch {
      if (line && !line.startsWith("{")) text += line;
    }
  }
  return text;
}

// ── Timestamp helper ─────────────────────────────────────────────────────────

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
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
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-emerald-500" />
        : <Copy className="w-3.5 h-3.5" />
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
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        h1: ({ children }) => <h1 className="text-lg font-heading font-bold mt-3 mb-1.5 text-slate-800 dark:text-slate-100">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-heading font-semibold mt-3 mb-1 text-slate-800 dark:text-slate-100">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1 text-slate-700 dark:text-slate-200">{children}</h3>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
        code: ({ className, children, ...props }) => {
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            const lang = className?.replace("language-", "") ?? "";
            return (
              <div className="my-2 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                {lang && (
                  <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{lang}</span>
                    <CopyButton text={String(children).replace(/\n$/, "")} />
                  </div>
                )}
                <pre className="p-3 overflow-x-auto bg-slate-50 dark:bg-slate-900/80 text-xs font-mono text-slate-800 dark:text-slate-200 leading-relaxed">
                  <code>{children}</code>
                </pre>
              </div>
            );
          }
          return (
            <code className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-mono text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700" {...props}>
              {children}
            </code>
          );
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-indigo-400 pl-3 my-2 text-slate-600 dark:text-slate-400 italic">
            {children}
          </blockquote>
        ),
        strong: ({ children }) => <strong className="font-semibold text-slate-800 dark:text-slate-100">{children}</strong>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-indigo-500 dark:text-indigo-400 underline underline-offset-2 hover:text-indigo-600">
            {children}
          </a>
        ),
        hr: () => <hr className="my-3 border-slate-200 dark:border-slate-700" />,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">{children}</th>,
        td: ({ children }) => <td className="px-3 py-2 text-xs text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-700/50 last:border-0">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`group flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} py-1`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1 ${
        isUser
          ? "bg-indigo-100 dark:bg-indigo-900/40"
          : "bg-violet-100 dark:bg-violet-900/40"
      }`}>
        {isUser
          ? <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">我</span>
          : <Bot className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" aria-hidden />
        }
      </div>

      <div className={`flex flex-col gap-1 max-w-[82%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Role label + timestamp */}
        <div className={`flex items-center gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          <span className={`text-xs font-medium ${isUser ? "text-indigo-500 dark:text-indigo-400" : "text-violet-500 dark:text-violet-400"}`}>
            {isUser ? "我" : "Claude"}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">{formatTime(msg.ts)}</span>
        </div>

        {/* Bubble */}
        <div className={`relative px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? "bg-indigo-500 text-white rounded-tr-sm"
            : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tl-sm"
        }`}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          ) : (
            <MdContent content={msg.content} />
          )}
          {msg.streaming && (
            <span className="inline-flex ml-1 gap-0.5 translate-y-0.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1 h-1 rounded-full bg-current opacity-60 animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </span>
          )}
        </div>

        {/* Copy button (assistant only) */}
        {!isUser && !msg.streaming && (
          <div className="flex">
            <CopyButton text={msg.content} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Welcome hero ──────────────────────────────────────────────────────────────

function WelcomeHero({
  connected, onSend,
}: {
  connected: boolean;
  onSend: (text: string) => void;
}) {
  const config = useStore((s) => s.config);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-6 py-8 text-center">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Sparkles className="w-8 h-8 text-white" aria-hidden />
        </div>
        <div>
          <h2 className="font-heading text-2xl font-bold text-slate-800 dark:text-slate-100">Claude 科研助手</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {connected
              ? `${config?.vault_path ? "Vault 已连接" : ""} · 本地 Claude CLI 已连接`
              : "正在连接本地 Claude CLI…"}
          </p>
        </div>
      </div>

      {/* Connection badge */}
      {!connected && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 text-sm text-amber-600 dark:text-amber-400">
          <WifiOff className="w-4 h-4" aria-hidden />
          <span>等待 Claude CLI 连接，请确保后端已启动</span>
        </div>
      )}

      {/* Quick action grid */}
      <div className="w-full max-w-xl">
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">快捷指令</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {QUICK_ACTIONS.map(({ id, label, desc, prompt, Icon, color, bg, border }) => (
            <button key={id} onClick={() => onSend(prompt)} disabled={!connected}
              className={`flex flex-col items-start gap-2 p-3.5 rounded-2xl border ${bg} ${border} hover:opacity-90 transition-all cursor-pointer disabled:opacity-40 text-left group`}>
              <div className={`w-7 h-7 rounded-xl ${bg} flex items-center justify-center border ${border}`}>
                <Icon className={`w-3.5 h-3.5 ${color}`} aria-hidden />
              </div>
              <div>
                <p className={`text-xs font-semibold ${color}`}>{label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight mt-0.5">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        直接在下方输入问题，或选择快捷指令开始
      </p>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ClaudePanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [currentFile] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
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
    ws.onclose = () => { setConnected(false); setConnecting(false); setStreaming(false); };
    ws.onerror = () => { setConnected(false); setConnecting(false); setStreaming(false); };

    ws.onmessage = (e: MessageEvent) => {
      const raw: string = e.data;
      if (raw.trim() === '{"type":"done"}') {
        setMessages((prev) => prev.map((m) =>
          m.id === pendingIdRef.current ? { ...m, streaming: false } : m
        ));
        pendingIdRef.current = null;
        setStreaming(false);
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
        const id = crypto.randomUUID();
        pendingIdRef.current = id;
        return [...prev, { id, role: "assistant", content: text, streaming: true, ts: Date.now() }];
      });
    };

    wsRef.current = ws;
  }, [currentFile]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);

  // Scroll management
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    // Auto-scroll only if near bottom
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (atBottom || streaming) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streaming]);

  function handleScroll() {
    const el = scrollAreaRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollBtn(false);
  }

  // ── Send ─────────────────────────────────────────────────────────────────
  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || streaming) return;
    const id = crypto.randomUUID();
    setMessages((prev) => [...prev, { id, role: "user", content: trimmed, ts: Date.now() }]);
    wsRef.current.send(trimmed);
    setInput("");
    setStreaming(true);
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [streaming]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
          <Bot className="w-4 h-4 text-white" aria-hidden />
        </div>
        <div className="flex-1">
          <h2 className="font-heading text-base font-semibold text-slate-800 dark:text-slate-100 leading-tight">Claude 面板</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">本地 Claude CLI · 上下文自动注入</p>
        </div>

        {/* Status */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
          connected
            ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
            : connecting
            ? "bg-amber-50 dark:bg-amber-900/20 text-amber-500"
            : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
        }`}>
          {connected
            ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /><Wifi className="w-3 h-3" aria-hidden />已连接</>
            : connecting
            ? <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />连接中…</>
            : <><WifiOff className="w-3 h-3" aria-hidden />未连接</>
          }
        </div>

        {!connected && !connecting && (
          <button onClick={connect} aria-label="重连"
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors cursor-pointer">
            <Cpu className="w-4 h-4" aria-hidden />
          </button>
        )}

        {messages.length > 0 && (
          <button onClick={() => setMessages([])} aria-label="清空对话"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer">
            <RotateCcw className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Messages + scroll area */}
      <div
        ref={scrollAreaRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto relative"
      >
        {messages.length === 0 ? (
          <WelcomeHero connected={connected} onSend={send} />
        ) : (
          <div className="max-w-3xl mx-auto px-6 pt-4 pb-4 flex flex-col gap-2">
            {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Scroll-to-bottom button */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            aria-label="滚动到底部"
            className="absolute bottom-4 right-6 w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md flex items-center justify-center text-slate-500 hover:text-indigo-500 hover:border-indigo-300 transition-colors cursor-pointer z-10"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Quick actions compact bar (when conversation active) */}
      {messages.length > 0 && (
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-1.5 overflow-x-auto shrink-0">
          <span className="text-xs text-slate-400 shrink-0 mr-1">快捷：</span>
          {QUICK_ACTIONS.map(({ id, label, prompt, Icon, color }) => (
            <button key={id} onClick={() => send(prompt)} disabled={!connected || streaming}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer disabled:opacity-40 shrink-0">
              <Icon className={`w-3 h-3 ${color}`} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-end gap-2 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected ? "输入问题… (Enter 发送，Shift+Enter 换行)" : "等待 Claude CLI 连接…"}
            disabled={!connected}
            rows={1}
            className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 resize-none focus:outline-none min-h-[22px] max-h-40 disabled:cursor-not-allowed py-0.5"
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 160) + "px";
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={!connected || !input.trim() || streaming}
            aria-label="发送"
            className="w-8 h-8 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Send className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 px-1">
          <kbd className="text-xs">Enter</kbd> 发送 · <kbd className="text-xs">Shift+Enter</kbd> 换行 · 上下文自动注入
        </p>
      </div>
    </div>
  );
}
