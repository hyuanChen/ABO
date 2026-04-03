import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot, Send, Wifi, WifiOff, Plus, MessageSquare, Trash2, Edit2, Check, X,
} from "lucide-react";
import { useCliChat, type StreamEvent } from "../../hooks/useCliChat";
import {
  detectClis, createConversation, listConversations,
  getMessages, deleteConversation, updateConversationTitle,
  type CliConfig, type Conversation, type Message,
} from "../../core/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage extends Message {
  streaming?: boolean;
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
      style={{
        opacity: 0, padding: "4px", borderRadius: "6px",
        color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer"
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = "0"; e.currentTarget.style.background = "transparent"; }}
    >
      {copied ? <Check style={{ width: "14px", height: "14px", color: "#10B981" }} /> : <span style={{ fontSize: "12px" }}>复制</span>}
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
            }}>{children}</code>
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

      <div style={{ maxWidth: "82%", display: "flex", flexDirection: "column", gap: "4px", alignItems: isUser ? "flex-end" : "flex-start" }}>
        <div style={{
          padding: "10px 16px", borderRadius: "16px", fontSize: "14px", lineHeight: 1.6,
          background: isUser ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))" : "var(--bg-card)",
          color: isUser ? "white" : "var(--text-main)",
          border: isUser ? "none" : "1px solid var(--border-light)",
        }}>
          {isUser ? <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{msg.content}</p> : <MdContent content={msg.content} />}
          {msg.streaming && <span className="animate-pulse">▋</span>}
        </div>
        {!isUser && !msg.streaming && <CopyButton text={msg.content} />}
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

  // 加载 CLI 列表
  useEffect(() => { detectClis().then(setClis); }, []);

  // 加载对话列表
  const loadConversations = useCallback(async () => {
    setConversations(await listConversations());
  }, []);
  useEffect(() => { loadConversations(); }, [loadConversations]);

  // 创建新对话
  const createNewChat = async (cliType: string) => {
    const conv = await createConversation(cliType);
    await loadConversations();
    setActiveConv(conv);
    setMessages([]);
    setShowConvList(false);
  };

  // 加载对话消息
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
          setMessages(prev => [...prev, { id: event.msg_id, role: 'assistant', content: '', streaming: true }]);
          break;
        case 'content':
          setMessages(prev => prev.map(m => m.id === pendingMsgIdRef.current ? { ...m, content: m.content + event.data } : m));
          break;
        case 'finish':
          setMessages(prev => prev.map(m => m.id === pendingMsgIdRef.current ? { ...m, streaming: false } : m));
          pendingMsgIdRef.current = null;
          break;
        case 'error':
          setMessages(prev => prev.map(m => m.id === pendingMsgIdRef.current ? { ...m, streaming: false, content: m.content + '\n[Error]' } : m));
          pendingMsgIdRef.current = null;
          break;
      }
    },
  });
  const pendingMsgIdRef = useRef<string | null>(null);

  // 自动滚动
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // 发送消息
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !activeConv) return;
    const userMsgId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: trimmed }]);
    sendMessage(trimmed);
    setInput("");
  }, [input, isStreaming, activeConv, sendMessage]);

  // 删除对话
  const handleDeleteConv = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteConversation(convId);
    await loadConversations();
    if (activeConv?.id === convId) { setActiveConv(null); setMessages([]); }
  };

  // 更新标题
  const handleUpdateTitle = async (convId: string) => {
    if (!newTitle.trim()) { setEditingTitle(null); return; }
    await updateConversationTitle(convId, newTitle.trim());
    await loadConversations();
    setEditingTitle(null);
  };

  // 未选择对话 - 显示 CLI 选择
  if (!activeConv) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "24px", background: "var(--bg-app)" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-main)" }}>CLI 对话助手</h2>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}>
          {clis.map(cli => (
            <button key={cli.id} onClick={() => createNewChat(cli.id)}
              style={{ padding: "24px 32px", borderRadius: "16px", background: "var(--bg-card)", border: "1px solid var(--border-light)", cursor: "pointer" }}
            >
              <Bot style={{ width: "32px", height: "32px", color: "var(--color-primary)" }} />
              <p style={{ fontSize: "16px", fontWeight: 600 }}>{cli.name}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 对话界面
  return (
    <div style={{ height: "100%", display: "flex", background: "var(--bg-app)" }}>
      {/* Sidebar */}
      {showConvList && (
        <div style={{ width: "260px", borderRight: "1px solid var(--border-light)", background: "var(--bg-card)" }}>
          <div style={{ padding: "16px", borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 600 }}>对话历史</h3>
            <button onClick={() => setShowConvList(false)}><X style={{ width: "16px", height: "16px" }} /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {conversations.map(conv => (
              <div key={conv.id} onClick={() => loadMessages(conv)}
                style={{
                  padding: "12px", borderRadius: "8px", marginBottom: "4px",
                  background: activeConv?.id === conv.id ? "var(--bg-hover)" : "transparent",
                  cursor: "pointer"
                }}
              >
                {editingTitle === conv.id ? (
                  <input
                    value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                    onBlur={() => handleUpdateTitle(conv.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateTitle(conv.id); if (e.key === 'Escape') setEditingTitle(null); }}
                    autoFocus
                    style={{ fontSize: "13px", padding: "4px 8px", width: "100%" }}
                  />
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{conv.title}</span>
                    <div>
                      <button onClick={(e) => { e.stopPropagation(); setEditingTitle(conv.id); setNewTitle(conv.title); }}><Edit2 style={{ width: "12px" }} /></button>
                      <button onClick={(e) => handleDeleteConv(conv.id, e)}><Trash2 style={{ width: "12px" }} /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Chat */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{
          padding: "14px 24px", borderBottom: "1px solid var(--border-light)",
          background: "var(--bg-card)", display: "flex", alignItems: "center", gap: "12px"
        }}>
          <button onClick={() => setShowConvList(!showConvList)}><MessageSquare style={{ width: "16px" }} /></button>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600 }}>{activeConv.title}</h2>
            <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>{activeConv.cli_type} · {isConnected ? '已连接' : '未连接'}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: isConnected ? "#059669" : "var(--text-muted)" }}>
            {isConnected ? <Wifi style={{ width: "14px" }} /> : <WifiOff style={{ width: "14px" }} />}
            {isConnected ? '在线' : '离线'}
          </div>
          <button onClick={() => { setActiveConv(null); setMessages([]); }}><Plus style={{ width: "14px" }} /> 新对话</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <div style={{ maxWidth: "720px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "8px" }}>
            {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-light)", background: "var(--bg-card)" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", padding: "12px 16px", borderRadius: "16px", border: "1px solid var(--border-light)", background: "var(--bg-hover)" }}>
            <textarea
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={isConnected ? "输入消息..." : "等待连接..."}
              disabled={!isConnected || isStreaming}
              style={{ flex: 1, background: "transparent", fontSize: "14px", color: "var(--text-main)", border: "none", outline: "none", resize: "none", minHeight: "24px", maxHeight: "160px" }}
              onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; }}
            />
            <button onClick={handleSend} disabled={!isConnected || !input.trim() || isStreaming}
              style={{ width: "36px", height: "36px", borderRadius: "10px", background: "var(--color-primary)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", border: "none" }}
            >
              <Send style={{ width: "16px", height: "16px" }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
