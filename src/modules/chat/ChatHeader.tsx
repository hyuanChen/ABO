/**
 * ChatHeader - 严格遵循 AionUi 设计规范
 * 高度: 60px, 底部边框, 在线状态指示器
 */
import { Settings, X, Plug } from 'lucide-react';

interface ChatHeaderProps {
  cliName: string;
  isOnline: boolean;
  onSettings?: () => void;
  onClose?: () => void;
}

export function ChatHeader({ cliName, isOnline, onSettings, onClose }: ChatHeaderProps) {
  return (
    <header
      className="flex items-center justify-between px-4 h-[60px] border-b border-[#E6DDF2] bg-[#FCFAF2]"
      style={{ backgroundColor: '#FCFAF2', borderBottom: '1px solid #E6DDF2' }}
    >
      {/* 左侧: 插头图标 + CLI名称 + 在线状态 */}
      <div className="flex items-center gap-3">
        <Plug className="w-5 h-5 text-[#7B5EA7]" />
        <span className="font-medium text-[#1a1a1a] text-base">
          {cliName}
        </span>
        <div className="flex items-center gap-1.5 ml-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm text-[#666666]">在线</span>
        </div>
      </div>

      {/* 右侧: 设置按钮 + 关闭按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={onSettings}
          className="p-2 rounded-md hover:bg-[#F5F5F0] transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5 text-[#666666]" />
        </button>
        <button
          onClick={onClose}
          className="p-2 rounded-md hover:bg-[#F5F5F0] transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-[#666666]" />
        </button>
      </div>
    </header>
  );
}

export default ChatHeader;
