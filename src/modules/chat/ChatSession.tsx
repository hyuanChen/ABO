/**
 * ChatSession - 完整对话会话界面
 * 显示历史消息 + 输入框，支持流式打字机效果
 */
import { useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Wifi, WifiOff, Bot, User, ArrowLeft, MoreVertical, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, CliConfig, Conversation } from '../../types/chat';

interface ChatSessionProps {
  cli: CliConfig;
  conversation: Conversation;
  messages: Message[];
  isConnected: boolean;
  isStreaming: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onBack: () => void;
  onClear: () => void;
}

export function ChatSession({
  cli,
  conversation,
  messages,
  isConnected,
  isStreaming,
  input,
  onInputChange,
  onSend,
  onBack,
  onClear,
}: ChatSessionProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when streaming
  useEffect(() => {
    if (isStreaming) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }, [onSend]);

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
  }, []);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/60 backdrop-blur-xl border-b border-[var(--border-color)]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-primary)]/20">
              <Bot className="h-5 w-5 text-[var(--color-primary)]" />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--text-main)] text-sm">{cli.name}</h3>
              <div className="flex items-center gap-1.5 text-xs">
                {isConnected ? (
                  <>
                    <Wifi className="w-3 h-3 text-green-500" />
                    <span className="text-green-600">已连接</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-red-500" />
                    <span className="text-red-500">未连接</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onClear}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:bg-red-50 hover:text-red-500 transition-all"
            title="清除对话"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-xl text-[var(--text-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-all">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Conversation title */}
          <div className="text-center py-4">
            <h2 className="text-lg font-semibold text-[var(--text-main)]">{conversation.title}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {new Date(conversation.createdAt).toLocaleString('zh-CN')}
            </p>
          </div>

          {/* Message list */}
          {messages.map((msg, index) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isLast={index === messages.length - 1}
              isStreaming={isStreaming && index === messages.length - 1 && msg.role === 'assistant'}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="p-4 bg-white/60 backdrop-blur-xl border-t border-[var(--border-color)]">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 p-2 rounded-2xl bg-white/80 border border-[var(--border-color)] shadow-soft focus-within:border-[var(--color-primary)] focus-within:shadow-medium transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder="继续对话..."
              disabled={!isConnected || isStreaming}
              rows={1}
              className="flex-1 resize-none bg-transparent px-3 py-2.5 text-[var(--text-main)] placeholder:text-[var(--text-muted)]/60 outline-none text-sm"
              style={{ minHeight: '40px', maxHeight: '120px' }}
            />
            <button
              onClick={onSend}
              disabled={!input.trim() || !isConnected || isStreaming}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
                bg-[var(--color-primary)] text-white
                transition-all hover:bg-[var(--color-primary-dark)] hover:scale-105
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-center text-xs text-[var(--text-muted)] mt-2">
            按 Enter 发送，Shift + Enter 换行
          </p>
        </div>
      </div>
    </div>
  );
}

// Typing cursor component - Claude Code style
function TypingCursor() {
  return (
    <span className="inline-flex items-center ml-1">
      <span className="w-2 h-4 bg-[var(--color-primary)] animate-pulse rounded-sm" />
    </span>
  );
}

// Message bubble component with streaming support
function MessageBubble({
  message,
  isStreaming,
}: {
  message: Message;
  isLast?: boolean;
  isStreaming?: boolean;
}) {
  const isUser = message.role === 'user';
  const isError = message.contentType === 'error';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl
          ${isUser ? 'bg-[var(--color-primary)]' : 'bg-white border border-[var(--border-color)]'}
          ${isError ? 'bg-red-500' : ''}`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <Bot className="h-4 w-4 text-[var(--color-primary)]" />
        )}
      </div>

      {/* Content */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-soft
          ${
            isUser
              ? 'bg-[var(--color-primary)] text-white rounded-tr-sm'
              : isError
              ? 'bg-red-50 text-red-600 border border-red-200'
              : 'bg-white border border-[var(--border-color)] rounded-tl-sm'
          }`}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none text-[var(--text-main)]">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>,
                code: ({ children }) => <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{children}</code>,
              }}
            >
              {message.content}
            </ReactMarkdown>
            {isStreaming && <TypingCursor />}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatSession;
