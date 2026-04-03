import type { CliConfig } from '../../types/chat';
import { Bot, Check, ChevronRight } from 'lucide-react';

interface CliSelectorProps {
  clis: CliConfig[];
  selected: CliConfig | null;
  onSelect: (cli: CliConfig) => void;
  onStart: () => void;
}

export function CliSelector({ clis, selected, onSelect, onStart }: CliSelectorProps) {
  const availableClis = clis.filter((c) => c.isAvailable);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-[var(--text)]">
          选择 AI 助手
        </h2>
        <p className="mt-2 text-[var(--text-muted)]">
          选择一个 CLI 工具开始对话
        </p>
      </div>

      {availableClis.length === 0 ? (
        <div className="rounded-xl bg-amber-50 p-6 text-amber-600 dark:bg-amber-900/20">
          <p>未检测到可用的 CLI 工具</p>
          <p className="mt-2 text-sm">
            请安装 Claude Code、Gemini CLI 或 OpenClaw
          </p>
        </div>
      ) : (
        <div className="grid w-full max-w-md gap-3">
          {availableClis.map((cli) => (
            <button
              key={cli.id}
              onClick={() => onSelect(cli)}
              className={`flex items-center gap-4 rounded-xl border p-4 transition-all
                ${
                  selected?.id === cli.id
                    ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary-dim)]'
                }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-2)]">
                <Bot className="h-5 w-5 text-[var(--primary)]" />
              </div>

              <div className="flex-1 text-left">
                <p className="font-medium text-[var(--text)]">{cli.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{cli.version}</p>
              </div>

              {selected?.id === cli.id && (
                <Check className="h-5 w-5 text-[var(--primary)]" />
              )}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <button
          onClick={onStart}
          className="flex items-center gap-2 rounded-xl bg-[var(--primary)] px-8 py-3
            text-white transition-all hover:bg-[var(--primary-dim)]"
        >
          <span>开始对话</span>
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
