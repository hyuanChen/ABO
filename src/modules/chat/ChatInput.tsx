/**
 * ChatInput - 严格遵循 AionUi 设计规范
 * - 圆角输入框, 浅紫色边框
 * - Enter 发送, Shift+Enter 换行
 * - 自适应高度
 */
import { useState, useRef, KeyboardEvent } from 'react';
import { Mic, Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = '输入消息...',
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Shift+Enter 默认换行, 不需要额外处理
  };

  const handleSend = () => {
    if (!message.trim() || disabled) return;
    onSend(message.trim());
    setMessage('');
    // 重置高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // 自适应高度
  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  return (
    <div className="px-4 py-3 bg-[#FCFAF2] border-t border-[#E6DDF2]">
      <div className="flex items-end gap-2">
        {/* 输入框容器 */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className="w-full px-4 py-3 pr-12 rounded-lg border border-[#E6DDF2]
                       bg-white text-[#1a1a1a] placeholder-[#999999]
                       focus:outline-none focus:border-[#D8B4E2] focus:ring-1 focus:ring-[#D8B4E2]
                       resize-none overflow-hidden transition-all"
            style={{ minHeight: '48px', maxHeight: '200px' }}
          />
          {/* 麦克风图标 */}
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5
                       text-[#7B5EA7] hover:bg-[#F3EDFA] rounded-md transition-colors"
            aria-label="语音输入"
          >
            <Mic className="w-5 h-5" />
          </button>
        </div>

        {/* 发送按钮 */}
        <button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          className="p-3 rounded-lg bg-[#7B5EA7] text-white
                     hover:bg-[#6B4E97] disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors flex-shrink-0"
          aria-label="发送"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export default ChatInput;
