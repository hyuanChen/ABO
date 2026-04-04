import type { Conversation, CliConfig } from '../../types/chat';
import { Plus, MessageSquare, Trash2, Edit2, Check, X, Bot } from 'lucide-react';
import { useState } from 'react';

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentConv: Conversation | null;
  selectedCli: CliConfig | null;
  onSwitch: (conv: Conversation) => void;
  onCreateNew: () => void;
  onDelete: (convId: string) => void;
  onRename: (convId: string, title: string) => void;
  isConnected: boolean;
}

export function ConversationSidebar({
  conversations,
  currentConv,
  selectedCli,
  onSwitch,
  onCreateNew,
  onDelete,
  onRename,
  isConnected,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const handleStartEdit = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const handleSaveEdit = (convId: string) => {
    if (editTitle.trim()) {
      onRename(convId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  return (
    <div className="flex h-full w-64 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-[var(--primary)]" />
          <span className="font-medium text-[var(--text)]">AI 对话</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={onCreateNew}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)]
            bg-[var(--bg)] px-4 py-2.5 text-sm font-medium text-[var(--text)]
            transition-all hover:border-[var(--primary)] hover:bg-[var(--primary)]/5"
        >
          <Plus className="h-4 w-4" />
          新建对话
        </button>
      </div>

      {/* CLI Info */}
      {selectedCli && (
        <div className="mx-3 mb-3 rounded-lg bg-[var(--bg)] px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">当前助手</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-medium text-[var(--text)]">{selectedCli.name}</span>
            <span className="text-xs text-[var(--text-muted)]">{selectedCli.version}</span>
          </div>
        </div>
      )}

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2">
        <div className="mb-2 px-2 text-xs font-medium text-[var(--text-muted)]">历史对话</div>
        {conversations.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-[var(--text-muted)]">
            暂无对话
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => onSwitch(conv)}
                className={`group relative flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5
                  transition-all ${
                    currentConv?.id === conv.id
                      ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'text-[var(--text)] hover:bg-[var(--bg-hover)]'
                  }`}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />

                {editingId === conv.id ? (
                  <div className="flex flex-1 items-center gap-1">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(conv.id);
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      className="flex-1 rounded border border-[var(--primary)] bg-[var(--bg)] px-1.5 py-0.5 text-sm outline-none"
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSaveEdit(conv.id); }}
                      className="rounded p-0.5 hover:bg-[var(--primary)]/20"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
                      className="rounded p-0.5 hover:bg-red-500/20"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 truncate text-sm">{conv.title}</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStartEdit(conv); }}
                        className="rounded p-1 hover:bg-[var(--bg-hover)]"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                        className="rounded p-1 hover:bg-red-500/20 hover:text-red-500"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
