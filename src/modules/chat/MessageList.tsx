import type { Message } from '../../types/chat';
import { User, Bot, Wrench, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function MessageList({ messages, isStreaming, messagesEndRef }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {messages.length === 0 && (
          <div className="flex h-64 flex-col items-center justify-center text-[var(--text-muted)]">
            <Bot className="mb-4 h-12 w-12 opacity-20" />
            <p className="text-lg font-medium">开始你的第一次对话</p>
            <p className="mt-2 text-sm">输入消息与 AI 助手交流</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <MessageItem
            key={msg.id}
            message={msg}
            isLast={index === messages.length - 1}
            isStreaming={isStreaming && index === messages.length - 1}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

interface MessageItemProps {
  message: Message;
  isLast: boolean;
  isStreaming: boolean;
}

function MessageItem({ message, isStreaming }: MessageItemProps) {
  const isUser = message.role === 'user';
  const isTool = message.contentType === 'tool_call';
  const isError = message.contentType === 'error';

  return (
    <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full
          ${isUser
            ? 'bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dim)]'
            : isError
            ? 'bg-red-500'
            : 'bg-[var(--surface-2)] border border-[var(--border)]'}`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : isTool ? (
          <Wrench className="h-4 w-4 text-[var(--primary)]" />
        ) : isError ? (
          <AlertCircle className="h-4 w-4 text-white" />
        ) : (
          <Bot className="h-4 w-4 text-[var(--primary)]" />
        )}
      </div>

      {/* Content */}
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className={`rounded-2xl px-5 py-3
            ${isUser
              ? 'bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dim)] text-white shadow-md'
              : isError
              ? 'bg-red-50 text-red-600 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              : isTool
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
              : 'bg-[var(--surface)] border border-[var(--border)] shadow-sm'}`}
        >
          {isTool ? (
            <p className="text-sm font-medium flex items-center gap-2">
              <Wrench className="h-3.5 w-3.5" />
              {message.content}
            </p>
          ) : isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    return match ? (
                      <pre className="bg-[var(--bg)] rounded-lg p-3 my-2 overflow-x-auto">
                        <code className="text-sm font-mono" {...props}>
                          {children}
                        </code>
                      </pre>
                    ) : (
                      <code className="bg-[var(--bg-hover)] px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                        {children}
                      </code>
                    );
                  },
                  p({ children }) {
                    return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
                  },
                  ul({ children }) {
                    return <ul className="mb-2 list-disc pl-4">{children}</ul>;
                  },
                  ol({ children }) {
                    return <ol className="mb-2 list-decimal pl-4">{children}</ol>;
                  },
                  li({ children }) {
                    return <li className="mb-1">{children}</li>;
                  },
                  h1({ children }) {
                    return <h1 className="text-lg font-bold mb-2">{children}</h1>;
                  },
                  h2({ children }) {
                    return <h2 className="text-base font-bold mb-2">{children}</h2>;
                  },
                  h3({ children }) {
                    return <h3 className="text-sm font-bold mb-1">{children}</h3>;
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-[var(--primary)]" />
              )}
            </div>
          )}
        </div>

        {/* Timestamp */}
        <span className="text-[10px] text-[var(--text-muted)] px-1">
          {new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
