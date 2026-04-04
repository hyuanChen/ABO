import { useState, useRef, useCallback } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';

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

      // Reset height
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
    <div className="border-t border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-sm p-4">
      <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl gap-3 items-end">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={disabled ? '连接中...' : '输入消息，按 Enter 发送，Shift+Enter 换行...'}
            disabled={disabled || isStreaming}
            rows={1}
            className="w-full resize-none rounded-xl border border-[var(--border)]
              bg-[var(--bg)] px-4 py-3 pr-12 text-[var(--text)]
              outline-none transition-all
              focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20
              disabled:opacity-50 disabled:cursor-not-allowed
              placeholder:text-[var(--text-muted)]"
            style={{ minHeight: '52px', maxHeight: '200px' }}
          />

          {/* Sparkles decoration */}
          <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)] opacity-30" />
        </div>

        <button
          type="submit"
          disabled={!input.trim() || isStreaming || disabled}
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl
            bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dim)]
            text-white shadow-md transition-all
            hover:shadow-lg hover:scale-105 active:scale-95
            disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {isStreaming ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </form>

      {/* Hint */}
      <div className="mx-auto max-w-3xl mt-2 text-center">
        <span className="text-[10px] text-[var(--text-muted)]">
          AI 生成的内容可能不准确，请核实重要信息
        </span>
      </div>
    </div>
  );
}
