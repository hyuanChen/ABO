import { useState, useRef, useCallback } from 'react';
import { Send, Loader2, Mic } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, isStreaming, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isStreaming || disabled) return;

      onSend(input.trim());
      setInput('');

      // 重置高度
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    },
    [input, isStreaming, disabled, onSend]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit]
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
  }, []);

  return (
    <div className="border-t border-[var(--border)] bg-[var(--surface)] p-4">
      <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl gap-3">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={disabled ? '连接中...' : '输入消息...'}
            disabled={disabled || isStreaming}
            rows={1}
            className="w-full resize-none rounded-xl border border-[var(--border)]
              bg-[var(--bg)] px-4 py-3 pr-12 text-[var(--text)]
              outline-none transition-all
              focus:ring-2 focus:ring-[var(--primary)]
              disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: '48px', maxHeight: '200px' }}
          />

          {/* 语音输入按钮（可选） */}
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]
              hover:text-[var(--text)]"
          >
            <Mic className="h-5 w-5" />
          </button>
        </div>

        <button
          type="submit"
          disabled={!input.trim() || isStreaming || disabled}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl
            bg-[var(--primary)] text-white transition-all
            hover:bg-[var(--primary-dim)]
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isStreaming ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </form>
    </div>
  );
}
