import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import type { CliConfig } from '../../types/chat';

interface CliSelectorProps {
  clis: CliConfig[];
  selectedCli: CliConfig | null;
  onSelectCli: (cli: CliConfig) => void;
  onStartConversation: () => void;
  isLoading: boolean;
}

const cliIcons: Record<string, string> = {
  claude: '🌟',
  gemini: '✨',
  openclaw: '🦀',
  codex: '🎯',
  custom: '🤖',
};

const cliDescriptions: Record<string, string> = {
  claude: 'Claude Code - 强大的 AI 编程助手',
  gemini: 'Gemini CLI - Google 的 AI 助手',
  openclaw: 'OpenClaw - 开源 AI 网关',
  codex: 'OpenAI Codex - 代码生成专家',
  custom: '自定义 CLI 工具',
};

export function CliSelector({
  clis,
  selectedCli,
  onSelectCli,
  onStartConversation,
  isLoading,
}: CliSelectorProps) {
  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-8"
        style={{ color: 'var(--text-muted)' }}
      >
        <div
          className="flex items-center justify-center w-20 h-20 mb-6 rounded-full"
          style={{ background: 'rgba(188, 164, 227, 0.1)' }}
        >
          <Loader2 size={32} color="#BCA4E3" className="animate-spin" />
        </div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-main)' }}>
          检测可用的 AI 助手...
        </h3>
        <p className="text-sm text-center">正在扫描系统中的 CLI 工具</p>
      </div>
    );
  }

  if (clis.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-8"
        style={{ color: 'var(--text-muted)' }}
      >
        <div
          className="flex items-center justify-center w-20 h-20 mb-6 rounded-full"
          style={{ background: 'rgba(255, 183, 178, 0.15)' }}
        >
          <AlertCircle size={32} color="#FFB7B2" />
        </div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-main)' }}>
          未找到可用的 AI 助手
        </h3>
        <p className="text-sm text-center max-w-md mb-6">
          请确保已安装 Claude Code、Gemini CLI 或其他支持的 CLI 工具，并将其添加到系统 PATH 中。
        </p>
        <div
          className="px-4 py-3 rounded-lg text-sm"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-light)',
            color: 'var(--text-secondary)',
          }}
        >
          <code className="block mb-1">npm install -g @anthropic-ai/claude-code</code>
          <code className="block">gemini install</code>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 overflow-auto">
      {/* Header */}
      <div className="mb-6 text-center">
        <div
          className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full"
          style={{
            background: 'linear-gradient(135deg, rgba(188, 164, 227, 0.2), rgba(188, 164, 227, 0.05))',
          }}
        >
          <Sparkles size={28} color="#BCA4E3" />
        </div>
        <h2
          className="text-xl font-bold mb-2"
          style={{ color: 'var(--text-main)' }}
        >
          选择 AI 助手
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          选择一个 CLI 工具开始对话
        </p>
      </div>

      {/* CLI List */}
      <div className="flex-1 space-y-3 mb-6">
        {clis.map((cli) => (
          <button
            key={cli.id}
            onClick={() => onSelectCli(cli)}
            className="w-full p-4 rounded-xl text-left transition-all duration-200"
            style={{
              background:
                selectedCli?.id === cli.id
                  ? 'rgba(188, 164, 227, 0.15)'
                  : 'var(--bg-card)',
              border:
                selectedCli?.id === cli.id
                  ? '2px solid var(--color-primary)'
                  : '2px solid transparent',
              boxShadow:
                selectedCli?.id === cli.id
                  ? '0 4px 16px rgba(188, 164, 227, 0.2)'
                  : 'var(--shadow-soft)',
            }}
            onMouseEnter={(e) => {
              if (selectedCli?.id !== cli.id) {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedCli?.id !== cli.id) {
                e.currentTarget.style.background = 'var(--bg-card)';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            <div className="flex items-start gap-4">
              <div
                className="flex items-center justify-center flex-shrink-0 w-12 h-12 text-2xl rounded-xl"
                style={{ background: 'rgba(188, 164, 227, 0.1)' }}
              >
                {cliIcons[cli.id] || '🤖'}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3
                    className="font-semibold"
                    style={{ color: 'var(--text-main)' }}
                  >
                    {cli.name}
                  </h3>
                  {cli.version && (
                    <span
                      className="px-2 py-0.5 text-xs rounded-full"
                      style={{
                        background: 'rgba(168, 230, 207, 0.3)',
                        color: '#5CBE9A',
                      }}
                    >
                      {cli.version}
                    </span>
                  )}
                </div>
                <p
                  className="text-sm truncate"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {cliDescriptions[cli.id] || cli.command}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className="px-2 py-0.5 text-xs rounded-md"
                    style={{
                      background: 'var(--bg-hover)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {cli.protocol.toUpperCase()}
                  </span>
                </div>
              </div>

              {selectedCli?.id === cli.id && (
                <div
                  className="flex items-center justify-center w-6 h-6 rounded-full"
                  style={{ background: 'var(--color-primary)' }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path
                      d="M2 6L5 9L10 3"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Start Button */}
      <button
        onClick={onStartConversation}
        disabled={!selectedCli}
        className="w-full py-3.5 px-6 rounded-xl font-semibold text-white transition-all duration-200 disabled:cursor-not-allowed"
        style={{
          background: selectedCli
            ? 'linear-gradient(135deg, #BCA4E3, #9D7BDB)'
            : 'var(--bg-disabled)',
          boxShadow: selectedCli
            ? '0 4px 16px rgba(188, 164, 227, 0.4)'
            : 'none',
          opacity: selectedCli ? 1 : 0.6,
        }}
        onMouseEnter={(e) => {
          if (selectedCli) {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow =
              '0 6px 24px rgba(188, 164, 227, 0.5)';
          }
        }}
        onMouseLeave={(e) => {
          if (selectedCli) {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow =
              '0 4px 16px rgba(188, 164, 227, 0.4)';
          }
        }}
      >
        {selectedCli ? '开始对话' : '请选择一个 AI 助手'}
      </button>
    </div>
  );
}
