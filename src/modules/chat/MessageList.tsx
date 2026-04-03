import type { Message } from '../../types/chat';
import { User, Bot, Wrench } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function MessageList({ messages, isStreaming, messagesEndRef }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-6">
        {messages.length === 0 && (
          <div className="py-12 text-center text-[var(--text-muted)]">
            <p>开始你的第一次对话</p>
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
      {/* 头像 */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
          ${isUser ? 'bg-[var(--primary)]' : 'bg-[var(--surface-2)]'}
          ${isError ? 'bg-red-500' : ''}`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : isTool ? (
          <Wrench className="h-4 w-4 text-[var(--primary)]" />
        ) : (
          <Bot className="h-4 w-4 text-[var(--primary)]" />
        )}
      </div>

      {/* 内容 */}
      <div
        className={`max-w-[80%] rounded-2xl px-5 py-3
          ${
            isUser
              ? 'bg-[var(--primary)] text-white'
              : isError
              ? 'bg-red-50 text-red-600 dark:bg-red-900/20'
              : 'bg-[var(--surface)] border border-[var(--border)]'
          }`}
      >
        {isTool ? (
          <p className="text-sm font-medium text-[var(--primary)]">{message.content}</p>
        ) : isUser ? (
          <p className="text-sm leading-relaxed">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
            {isStreaming && (
              <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-[var(--primary)]" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
