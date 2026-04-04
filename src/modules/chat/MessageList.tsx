import { useEffect, useRef } from 'react';
import { Bot, User, AlertCircle, Wrench } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '../../types/chat';

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  isConnecting: boolean;
}

export function MessageList({
  messages,
  isStreaming,
  isConnecting,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  if (messages.length === 0 && !isConnecting) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-8"
        style={{ color: 'var(--text-muted)' }}
      >
        <div
          className="flex items-center justify-center w-20 h-20 mb-6 rounded-full"
          style={{
            background:
              'linear-gradient(135deg, rgba(188, 164, 227, 0.2), rgba(188, 164, 227, 0.05))',
          }}
        >
          <Bot size={36} color="#BCA4E3" />
        </div>
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: 'var(--text-main)' }}
        >
          开始你的第一次对话
        </h3>
        <p
          className="text-sm text-center max-w-md"
          style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}
        >
          输入消息，我会自动检测可用的 AI 助手并为你连接。支持 Claude
          Code、Gemini CLI 等工具。
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 p-6 overflow-y-auto"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          isStreaming={isStreaming && index === messages.length - 1}
        />
      ))}

      {isConnecting && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl self-start"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-light)',
          }}
        >
          <div
            className="w-5 h-5 rounded-full animate-pulse"
            style={{ background: '#BCA4E3' }}
          />
          <span
            className="text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            正在连接 AI 助手...
          </span>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
}

function MessageItem({ message, isStreaming }: MessageItemProps) {
  const isUser = message.role === 'user';
  const isError = message.contentType === 'error';
  const isTool = message.contentType === 'tool_call';

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className="flex gap-3"
      style={{
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
      }}
    >
      {/* Avatar */}
      <div
        className="flex items-center justify-center flex-shrink-0 w-9 h-9 rounded-lg"
        style={{
          background: isUser
            ? 'linear-gradient(135deg, #A8E6CF, #7DD3C0)'
            : isError
            ? 'linear-gradient(135deg, #FFB7B2, #FF9E9A)'
            : isTool
            ? 'linear-gradient(135deg, #FFE4B5, #F5C88C)'
            : 'linear-gradient(135deg, #BCA4E3, #9D7BDB)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        }}
      >
        {isUser ? (
          <User size={18} color="white" />
        ) : isError ? (
          <AlertCircle size={18} color="white" />
        ) : isTool ? (
          <Wrench size={18} color="white" />
        ) : (
          <Bot size={18} color="white" />
        )}
      </div>

      {/* Content */}
      <div
        className="flex flex-col gap-1"
        style={{
          maxWidth: '75%',
          alignItems: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        <div
          className="px-4 py-3"
          style={{
            borderRadius: isUser
              ? 'var(--radius-md) 4px var(--radius-md) var(--radius-md)'
              : '4px var(--radius-md) var(--radius-md) var(--radius-md)',
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
              : isTool
              ? '1px solid rgba(255, 228, 181, 0.5)'
              : '1px solid var(--border-light)',
            boxShadow: isUser
              ? '0 4px 12px rgba(125, 211, 192, 0.3)'
              : 'var(--shadow-soft)',
            color: isUser
              ? 'white'
              : isError
              ? '#D48984'
              : 'var(--text-main)',
          }}
        >
          {isUser || isError || isTool ? (
            <span
              className="text-sm whitespace-pre-wrap"
              style={{ lineHeight: 1.6 }}
            >
              {message.content}
            </span>
          ) : (
            <div className="text-sm markdown-content" style={{ lineHeight: 1.7 }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => (
                    <p style={{ margin: '0 0 10px 0' }}>{children}</p>
                  ),
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
                    <code
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '13px',
                      }}
                    >
                      {children}
                    </code>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span
                  className="inline-block w-0.5 h-4 ml-1 align-middle"
                  style={{
                    background: '#BCA4E3',
                    animation: 'blink 1s infinite',
                  }}
                />
              )}
            </div>
          )}
        </div>

        <span
          className="text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          {formatTime(message.createdAt)}
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
