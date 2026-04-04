import { Bot, Settings, X, Loader2 } from 'lucide-react';
import type { CliConfig } from '../../types/chat';

interface ChatHeaderProps {
  cli: CliConfig | null;
  isConnected: boolean;
  isConnecting: boolean;
  onSettings?: () => void;
  onClose?: () => void;
}

const cliIcons: Record<string, string> = {
  claude: '🌟',
  gemini: '✨',
  openclaw: '🦀',
  codex: '🎯',
  custom: '🤖',
};

export function ChatHeader({
  cli,
  isConnected,
  isConnecting,
  onSettings,
  onClose,
}: ChatHeaderProps) {
  const getStatusColor = () => {
    if (isConnecting) return '#F5C88C';
    if (isConnected) return '#7DD3C0';
    return '#FFB7B2';
  };

  const getStatusText = () => {
    if (isConnecting) return '连接中...';
    if (isConnected) return '在线';
    return '未连接';
  };

  return (
    <div
      className="flex items-center justify-between px-6 py-4"
      style={{
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-light)',
        backdropFilter: 'blur(16px) saturate(160%)',
      }}
    >
      {/* Left: CLI Info */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl"
          style={{
            background: cli
              ? 'linear-gradient(135deg, #BCA4E3, #9D7BDB)'
              : 'var(--bg-disabled)',
            boxShadow: cli ? '0 4px 12px rgba(188, 164, 227, 0.3)' : 'none',
          }}
        >
          {cli ? (
            <span className="text-xl">{cliIcons[cli.id] || '🤖'}</span>
          ) : (
            <Bot size={20} color="var(--text-muted)" />
          )}
        </div>

        <div>
          <h2
            className="text-base font-semibold"
            style={{ color: 'var(--text-main)' }}
          >
            {cli?.name || 'AI 助手'}
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            {isConnecting ? (
              <Loader2 size={12} color="#F5C88C" className="animate-spin" />
            ) : (
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: getStatusColor(),
                  transition: 'background 0.3s ease',
                }}
              />
            )}
            <span
              className="text-xs"
              style={{ color: 'var(--text-secondary)' }}
            >
              {getStatusText()}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {onSettings && (
          <button
            onClick={onSettings}
            className="p-2 rounded-lg transition-all duration-200 hover:scale-105"
            style={{
              color: 'var(--text-muted)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)';
              e.currentTarget.style.color = 'var(--text-main)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
            title="设置"
          >
            <Settings size={18} />
          </button>
        )}

        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-all duration-200 hover:scale-105"
            style={{
              color: 'var(--text-muted)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 183, 178, 0.2)';
              e.currentTarget.style.color = '#D48984';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
            title="关闭"
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
