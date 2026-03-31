import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot, Send, Zap, BookOpen, Target,
  RotateCcw, Wifi, WifiOff, ChevronDown, Copy, Check,
  Cpu, Sparkles,
} from "lucide-react";
import { useStore } from "../../core/store";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  ts: number;
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
    id: "summarize-diary",
    label: "总结日记",
    desc: "分析日记内容，提取关键思考",
    prompt: "请帮我总结最近的日记内容，提取关键思考、情绪变化和成长轨迹。",
    Icon: BookOpen,
    color: "var(--color-primary)",
    bg: "rgba(188, 164, 227, 0.15)",
    border: "rgba(188, 164, 227, 0.3)",
  },
  {
    id: "generate-todo",
    label: "生成todo",
    desc: "基于当前状态生成待办",
    prompt: "根据我的研究进展和当前精力状态，帮我生成3个优先级最高的待办事项。",
    Icon: Target,
    color: "#10B981",
    bg: "rgba(168, 230, 207, 0.15)",
    border: "rgba(168, 230, 207, 0.3)",
  },
  {
    id: "energy",
    label: "精力引导",
    desc: "低能量状态的高效任务",
    prompt: "我现在精力较低，请给我一个高效率、短时间（30分钟内）可完成的科研任务建议。",
    Icon: Zap,
    color: "#8B5CF6",
    bg: "rgba(139, 92, 246, 0.15)",
    border: "rgba(139, 92, 246, 0.3)",
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
        h1: ({ children }) => <h1 style={{ fontSize: "18px", fontWeight: 700, marginTop: "12px", marginBottom: "6px", color: "var(--text-main)" }}>{children}</h1>,
        h2: ({ children }) => <h2 style={{ fontSize: "16px", fontWeight: 600, marginTop: "12px", marginBottom: "4px", color: "var(--text-main)" }}>{children}</h2>,
        h3: ({ children }) => <h3 style={{ fontSize: "14px", fontWeight: 600, marginTop: "8px", marginBottom: "4px", color: "var(--text-secondary)" }}>{children}</h3>,
        ul: ({ children }) => <ul style={{ listStyle: "disc", paddingLeft: "16px", marginBottom: "8px" }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ listStyle: "decimal", paddingLeft: "16px", marginBottom: "8px" }}>{children}</ol>,
        li: ({ children }) => <li style={{ fontSize: "14px", lineHeight: 1.6 }}>{children}</li>,
        code: ({ className, children, ...props }) => {
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            const lang = className?.replace("language-", "") ?? "";
            return (
              <div style={{ margin: "8px 0", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--border-light)" }}>
                {lang && (
                  <div style={{
                    padding: "6px 12px", background: "var(--bg-hover)",
                    borderBottom: "1px solid var(--border-light)", display: "flex", alignItems: "center", justifyContent: "space-between"
                  }}>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "monospace" }}>{lang}</span>
                    <CopyButton text={String(children).replace(/\n$/, "")} />
                  </div>
                )}
                <pre style={{
                  padding: "12px", overflowX: "auto", background: "var(--bg-hover)",
                  fontSize: "12px", fontFamily: "monospace", color: "var(--text-main)", lineHeight: 1.6, margin: 0
                }}>
                  <code>{children}</code>
                </pre>
              </div>
            );
          }
          return (
            <code style={{
              padding: "2px 6px", borderRadius: "6px", background: "var(--bg-hover)",
              fontSize: "12px", fontFamily: "monospace", color: "var(--color-primary)"
            }} {...props}>
              {children}
            </code>
          );
        },
        blockquote: ({ children }) => (
          <blockquote style={{
            borderLeft: "2px solid var(--color-primary)", paddingLeft: "12px",
            margin: "8px 0", color: "var(--text-secondary)", fontStyle: "italic"
          }}>
            {children}
          </blockquote>
        ),
        strong: ({ children }) => <strong style={{ fontWeight: 600, color: "var(--text-main)" }}>{children}</strong>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            style={{ color: "var(--color-primary)", textDecoration: "underline" }}>
            {children}
          </a>
        ),
        hr: () => <hr style={{ margin: "12px 0", border: "none", borderTop: "1px solid var(--border-light)" }} />,
        table: ({ children }) => (
          <div style={{ margin: "8px 0", overflowX: "auto", borderRadius: "12px", border: "1px solid var(--border-light)" }}>
            <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>{children}</table>
          </div>
        ),
        th: ({ children }) => <th style={{ padding: "10px 12px", background: "var(--bg-hover)", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", borderBottom: "1px solid var(--border-light)" }}>{children}</th>,
        td: ({ children }) => <td style={{ padding: "10px 12px", fontSize: "12px", color: "var(--text-main)", borderBottom: "1px solid var(--border-light)" }}>{children}</td>,
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
    <div style={{
      display: "flex", gap: "12px", padding: "4px 0",
      flexDirection: isUser ? "row-reverse" : "row"
    }}>
      {/* Avatar */}
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
        {/* Role label + timestamp */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexDirection: isUser ? "row-reverse" : "row" }}>
          <span style={{
            fontSize: "12px", fontWeight: 500,
            color: isUser ? "var(--color-primary)" : "#8B5CF6"
          }}>
            {isUser ? "我" : "Claude"}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{formatTime(msg.ts)}</span>
        </div>

        {/* Bubble */}
        <div style={{
          padding: "10px 16px", borderRadius: "16px", fontSize: "14px", lineHeight: 1.6,
          background: isUser ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))" : "var(--bg-card)",
          color: isUser ? "white" : "var(--text-main)",
          border: isUser ? "none" : "1px solid var(--border-light)",
          borderTopRightRadius: isUser ? "4px" : "16px",
          borderTopLeftRadius: isUser ? "16px" : "4px"
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

        {/* Copy button (assistant only) */}
        {!isUser && !msg.streaming && (
          <div style={{ display: "flex" }}>
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
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100%", gap: "24px", padding: "32px 24px", textAlign: "center"
    }}>
      {/* Logo */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
        <div style={{
          width: "64px", height: "64px", borderRadius: "16px",
          background: "linear-gradient(135deg, #8B5CF6, var(--color-primary))",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px rgba(139, 92, 246, 0.3)"
        }}>
          <Sparkles style={{ width: "32px", height: "32px", color: "white" }} />
        </div>
        <div>
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-main)" }}>Claude 科研助手</h2>
          <p style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "4px" }}>
            {connected
              ? `${config?.vault_path ? "Vault 已连接" : ""} · 本地 Claude CLI 已连接`
              : "正在连接本地 Claude CLI…"}
          </p>
        </div>
      </div>

      {/* Connection badge */}
      {!connected && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderRadius: "12px",
          background: "rgba(251, 191, 36, 0.1)", border: "1px solid rgba(251, 191, 36, 0.3)",
          fontSize: "14px", color: "#D97706"
        }}>
          <WifiOff style={{ width: "16px", height: "16px" }} />
          <span>等待 Claude CLI 连接，请确保后端已启动</span>
        </div>
      )}

      {/* Quick action grid */}
      <div style={{ width: "100%", maxWidth: "500px" }}>
        <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>快捷指令</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
          {QUICK_ACTIONS.map(({ id, label, desc, prompt, Icon, color, bg, border }) => (
            <button key={id} onClick={() => onSend(prompt)} disabled={!connected}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "8px",
                padding: "14px", borderRadius: "16px", background: bg, border: `1px solid ${border}`,
                cursor: connected ? "pointer" : "not-allowed", opacity: connected ? 1 : 0.4,
                transition: "all 0.2s ease", textAlign: "left"
              }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "10px", background: bg,
                display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${border}`
              }}>
                <Icon style={{ width: "14px", height: "14px", color }} />
              </div>
              <div>
                <p style={{ fontSize: "12px", fontWeight: 600, color }}>{label}</p>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px", lineHeight: 1.4 }}>{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
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
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-app)" }}>
      {/* Header */}
      <div style={{
        padding: "14px 24px", borderBottom: "1px solid var(--border-light)", background: "var(--bg-card)",
        display: "flex", alignItems: "center", gap: "12px", flexShrink: 0
      }}>
        <div style={{
          width: "36px", height: "36px", borderRadius: "10px",
          background: "linear-gradient(135deg, #8B5CF6, var(--color-primary))",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <Bot style={{ width: "18px", height: "18px", color: "white" }} />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-main)", lineHeight: 1.3 }}>Claude 面板</h2>
          <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>本地 Claude CLI · 上下文自动注入</p>
        </div>

        {/* Status */}
        <div style={{
          display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "8px",
          fontSize: "12px", fontWeight: 500,
          background: connected ? "rgba(168, 230, 207, 0.15)" : connecting ? "rgba(251, 191, 36, 0.15)" : "var(--bg-hover)",
          color: connected ? "#059669" : connecting ? "#D97706" : "var(--text-muted)"
        }}>
          {connected
            ? <><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10B981", animation: "pulse 2s infinite" }} /><Wifi style={{ width: "14px", height: "14px" }} />已连接</>
            : connecting
            ? <><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#FBBF24", animation: "pulse 2s infinite" }} />连接中…</>
            : <><WifiOff style={{ width: "14px", height: "14px" }} />未连接</>
          }
        </div>

        {!connected && !connecting && (
          <button onClick={connect} aria-label="重连"
            style={{
              padding: "6px", borderRadius: "8px", color: "var(--text-muted)",
              background: "transparent", border: "none", cursor: "pointer"
            }}>
            <Cpu style={{ width: "16px", height: "16px" }} />
          </button>
        )}

        {messages.length > 0 && (
          <button onClick={() => setMessages([])} aria-label="清空对话"
            style={{
              padding: "6px", borderRadius: "8px", color: "var(--text-muted)",
              background: "transparent", border: "none", cursor: "pointer"
            }}>
            <RotateCcw style={{ width: "16px", height: "16px" }} />
          </button>
        )}
      </div>

      {/* Messages + scroll area */}
      <div
        ref={scrollAreaRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: "auto", position: "relative" }}
      >
        {messages.length === 0 ? (
          <WelcomeHero connected={connected} onSend={send} />
        ) : (
          <div style={{ maxWidth: "720px", margin: "0 auto", padding: "16px 24px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Scroll-to-bottom button */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            aria-label="滚动到底部"
            style={{
              position: "absolute", bottom: "16px", right: "24px",
              width: "32px", height: "32px", borderRadius: "50%",
              background: "var(--bg-card)", border: "1px solid var(--border-light)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-muted)", cursor: "pointer", boxShadow: "var(--shadow-soft)", zIndex: 10
            }}
          >
            <ChevronDown style={{ width: "16px", height: "16px" }} />
          </button>
        )}
      </div>

      {/* Quick actions compact bar (when conversation active) */}
      {messages.length > 0 && (
        <div style={{
          padding: "8px 16px", borderTop: "1px solid var(--border-light)", background: "var(--bg-card)",
          display: "flex", alignItems: "center", gap: "6px", overflowX: "auto", flexShrink: 0
        }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)", flexShrink: 0, marginRight: "4px" }}>快捷：</span>
          {QUICK_ACTIONS.map(({ id, label, prompt, Icon, color }) => (
            <button key={id} onClick={() => send(prompt)} disabled={!connected || streaming}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 500,
                color: "var(--text-secondary)", background: "var(--bg-hover)", border: "1px solid var(--border-light)",
                cursor: connected && !streaming ? "pointer" : "not-allowed", opacity: connected && !streaming ? 1 : 0.4,
                flexShrink: 0
              }}>
              <Icon style={{ width: "14px", height: "14px", color }} />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div style={{
        padding: "12px 16px", borderTop: "1px solid var(--border-light)", background: "var(--bg-card)", flexShrink: 0
      }}>
        <div style={{
          display: "flex", alignItems: "flex-end", gap: "8px",
          padding: "10px 14px", borderRadius: "16px",
          border: "1px solid var(--border-light)", background: "var(--bg-hover)"
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected ? "输入问题… (Enter 发送，Shift+Enter 换行)" : "等待 Claude CLI 连接…"}
            disabled={!connected}
            rows={1}
            style={{
              flex: 1, background: "transparent", fontSize: "14px",
              color: "var(--text-main)", border: "none", outline: "none", resize: "none",
              minHeight: "22px", maxHeight: "160px", padding: "2px 0"
            }}
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
            style={{
              width: "32px", height: "32px", borderRadius: "10px",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
              color: "white", display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", cursor: connected && input.trim() && !streaming ? "pointer" : "not-allowed",
              opacity: connected && input.trim() && !streaming ? 1 : 0.4, flexShrink: 0
            }}
          >
            <Send style={{ width: "14px", height: "14px" }} />
          </button>
        </div>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px", paddingLeft: "4px" }}>
          Enter 发送 · Shift+Enter 换行 · 上下文自动注入
        </p>
      </div>
    </div>
  );
}
