import type { CliConfig, Conversation } from '../../types/chat';
import { Bot, X, Settings, MoreVertical } from 'lucide-react';

interface ChatHeaderProps {
  cli: CliConfig;
  conversation: Conversation;
  isConnected: boolean;
}

export function ChatHeader({ cli, conversation, isConnected }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-2)]">
          <Bot className="h-5 w-5 text-[var(--primary)]" />
        </div>

        <div>
          <h3 className="font-medium text-[var(--text)]">{conversation.title || cli.name}</h3>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span>{isConnected ? '已连接' : '未连接'}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="rounded-lg p-2 text-[var(--text-muted)]
            hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <Settings className="h-5 w-5" />
        </button>

        <button
          className="rounded-lg p-2 text-[var(--text-muted)]
            hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <MoreVertical className="h-5 w-5" />
        </button>

        <button
          className="rounded-lg p-2 text-[var(--text-muted)]
            hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
