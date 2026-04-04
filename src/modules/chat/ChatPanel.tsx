import { useEffect, useRef, useState } from 'react';
import { useChat } from '../../hooks/useChat';
import { Send, Bot, User, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ChatPanel() {
  const {
    selectedCli,
    messages,
    sendMessage,
    isStreaming,
    isConnecting,
    isConnected,
    error,
    clearError,
  } = useChat();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const content = input.trim();
    setInput('');

    // 重置 textarea 高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await sendMessage(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-app)',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-light)',
          background: 'var(--bg-panel)',
          backdropFilter: 'blur(16px) saturate(160%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, #BCA4E3, #9D7BDB)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(188, 164, 227, 0.3)',
            }}
          >
            <Bot size={20} color="white" />
          </div>
          <div>
            <h2
              style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text-main)',
                margin: 0,
              }}
            >
              AI 助手
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: isConnected ? '#7DD3C0' : isConnecting ? '#F5C88C' : '#FFB7B2',
                  transition: 'background 0.3s ease',
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {isConnected ? selectedCli?.name || '已连接' : isConnecting ? '连接中...' : '未连接'}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255, 183, 178, 0.2)',
              border: '1px solid rgba(255, 183, 178, 0.4)',
            }}
          >
            <AlertCircle size={16} color="#D48984" />
            <span style={{ fontSize: '13px', color: '#D48984' }}>{error}</span>
            <button
              onClick={clearError}
              style={{
                marginLeft: '8px',
                padding: '2px 8px',
                fontSize: '12px',
                border: 'none',
                background: 'rgba(212, 137, 132, 0.2)',
                borderRadius: '4px',
                color: '#D48984',
                cursor: 'pointer',
              }}
            >
              重试
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(188, 164, 227, 0.2), rgba(188, 164, 227, 0.05))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <Sparkles size={32} color="#BCA4E3" />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
              开始你的第一次对话
            </h3>
            <p style={{ fontSize: '14px', maxWidth: '400px', lineHeight: 1.6 }}>
              输入消息，我会自动检测可用的 AI 助手并为你连接。支持 Claude Code、Gemini CLI 等工具。
            </p>
          </div>
        )}

        {messages.map((msg, index) => (
          <MessageItem
            key={msg.id}
            message={msg}
            isStreaming={isStreaming && index === messages.length - 1}
          />
        ))}

        {isConnecting && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 20px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-light)',
              alignSelf: 'flex-start',
            }}
          >
            <Loader2 size={18} color="#BCA4E3" style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              正在检测并连接 AI 助手...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: '16px 24px 24px',
          borderTop: '1px solid var(--border-light)',
          background: 'var(--bg-panel)',
          backdropFilter: 'blur(16px) saturate(160%)',
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder={isConnecting ? '连接中...' : '输入消息，按 Enter 发送...'}
              disabled={isConnecting || isStreaming}
              rows={1}
              style={{
                width: '100%',
                resize: 'none',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-medium)',
                background: 'var(--bg-card)',
                padding: '14px 48px 14px 16px',
                fontSize: '14px',
                lineHeight: 1.5,
                color: 'var(--text-main)',
                outline: 'none',
                transition: 'all 0.2s ease',
                minHeight: '48px',
                maxHeight: '200px',
                fontFamily: 'inherit',
              }}
            />
            <Sparkles
              size={18}
              style={{
                position: 'absolute',
                right: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                opacity: 0.5,
              }}
            />
          </div>

          <button
            type="submit"
            disabled={!input.trim() || isStreaming || isConnecting}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background:
                !input.trim() || isStreaming || isConnecting
                  ? 'var(--bg-disabled)'
                  : 'linear-gradient(135deg, #BCA4E3, #9D7BDB)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: !input.trim() || isStreaming || isConnecting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow:
                !input.trim() || isStreaming || isConnecting
                  ? 'none'
                  : '0 4px 12px rgba(188, 164, 227, 0.4)',
            }}
          >
            {isStreaming ? (
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Send size={20} />
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            AI 生成的内容可能不准确，请核实重要信息
          </span>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

interface MessageItemProps {
  message: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    contentType: string;
    createdAt: number;
  };
  isStreaming?: boolean;
}

function MessageItem({ message, isStreaming }: MessageItemProps) {
  const isUser = message.role === 'user';
  const isError = message.contentType === 'error';
  const isTool = message.contentType === 'tool_call';

  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: 'var(--radius-sm)',
          background: isUser
            ? 'linear-gradient(135deg, #A8E6CF, #7DD3C0)'
            : isError
            ? 'linear-gradient(135deg, #FFB7B2, #FF9E9A)'
            : isTool
            ? 'linear-gradient(135deg, #FFE4B5, #F5C88C)'
            : 'linear-gradient(135deg, #BCA4E3, #9D7BDB)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        }}
      >
        {isUser ? (
          <User size={18} color="white" />
        ) : isError ? (
          <AlertCircle size={18} color="white" />
        ) : (
          <Bot size={18} color="white" />
        )}
      </div>

      {/* Content */}
      <div
        style={{
          maxWidth: '70%',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          alignItems: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderRadius: isUser ? 'var(--radius-md) 4px var(--radius-md) var(--radius-md)' : '4px var(--radius-md) var(--radius-md) var(--radius-md)',
            background: isUser
              ? 'linear-gradient(135deg, #A8E6CF, #7DD3C0)'
              : isError
              ? 'rgba(255, 183, 178, 0.2)'
              : isTool
              ? 'rgba(255, 228, 181, 0.3)'
              : 'var(--bg-card)',
            border: isUser
              ? 'none'
              : isError
              ? '1px solid rgba(255, 183, 178, 0.4)'
              : '1px solid var(--border-light)',
            boxShadow: isUser ? '0 4px 12px rgba(125, 211, 192, 0.3)' : 'var(--shadow-soft)',
            color: isUser ? 'white' : isError ? '#D48984' : 'var(--text-main)',
          }}
        >
          {isUser || isError || isTool ? (
            <span style={{ fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {message.content}
            </span>
          ) : (
            <div style={{ fontSize: '14px', lineHeight: 1.7 }} className="markdown-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p style={{ margin: '0 0 10px 0' }}>{children}</p>,
                  pre: ({ children }) => (
                    <pre
                      style={{
                        background: 'var(--bg-code)',
                        padding: '12px',
                        borderRadius: 'var(--radius-sm)',
                        overflowX: 'auto',
                        fontSize: '13px',
                        margin: '10px 0',
                      }}
                    >
                      {children}
                    </pre>
                  ),
                  code: ({ children }) => (
                    <code style={{ fontFamily: 'monospace', fontSize: '13px' }}>{children}</code>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span
                  style={{
                    display: 'inline-block',
                    width: '2px',
                    height: '16px',
                    background: '#BCA4E3',
                    marginLeft: '4px',
                    animation: 'blink 1s infinite',
                  }}
                />
              )}
            </div>
          )}
        </div>

        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
