import { useRef, useState } from 'react';
import { Send, Loader2, Mic } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  isStreaming: boolean;
  isConnected: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  isStreaming,
  isConnected,
  placeholder = '输入消息，按 Enter 发送...',
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || !isConnected) return;

    const content = input.trim();
    setInput('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    onSend(content);
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

  const isDisabled = !isConnected || isStreaming;

  return (
    <div
      className="px-6 py-4"
      style={{
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border-light)',
        backdropFilter: 'blur(16px) saturate(160%)',
      }}
    >
      <form onSubmit={handleSubmit} className="flex gap-3 items-end">
        {/* Textarea Container */}
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={isConnected ? placeholder : '未连接...'}
            disabled={isDisabled}
            rows={1}
            className="w-full resize-none outline-none transition-all duration-200"
            style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-medium)',
              background: 'var(--bg-card)',
              padding: '14px 48px 14px 16px',
              fontSize: '14px',
              lineHeight: 1.5,
              color: 'var(--text-main)',
              minHeight: '48px',
              maxHeight: '200px',
              fontFamily: 'inherit',
            }}
          />

          {/* Mic Icon (decorative) */}
          <button
            type="button"
            className="absolute p-1.5 rounded-md transition-all duration-200"
            style={{
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              opacity: 0.5,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)';
              e.currentTarget.style.opacity = '0.8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.opacity = '0.5';
            }}
            disabled={isDisabled}
            title="语音输入 (即将推出)"
          >
            <Mic size={18} />
          </button>
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={!input.trim() || isDisabled}
          className="flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-200 disabled:cursor-not-allowed"
          style={{
            background:
              !input.trim() || isDisabled
                ? 'var(--bg-disabled)'
                : 'linear-gradient(135deg, #BCA4E3, #9D7BDB)',
            color: 'white',
            boxShadow:
              !input.trim() || isDisabled
                ? 'none'
                : '0 4px 12px rgba(188, 164, 227, 0.4)',
            opacity: !input.trim() || isDisabled ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (input.trim() && !isDisabled) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow =
                '0 6px 20px rgba(188, 164, 227, 0.5)';
            }
          }}
          onMouseLeave={(e) => {
            if (input.trim() && !isDisabled) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow =
                '0 4px 12px rgba(188, 164, 227, 0.4)';
            }
          }}
        >
          {isStreaming ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <Send size={20} />
          )}
        </button>
      </form>

      {/* Disclaimer */}
      <div className="mt-2 text-center">
        <span
          className="text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          AI 生成的内容可能不准确，请核实重要信息
        </span>
      </div>
    </div>
  );
}
