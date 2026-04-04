import { useEffect, useRef } from 'react';
import { useChat } from '../../hooks/useChat';
import { ConversationSidebar } from './ConversationSidebar';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { Loader2, AlertCircle, Bot } from 'lucide-react';

export function ChatPanel() {
  const {
    conversations,
    conversation,
    selectedCli,
    createNewConversation,
    switchConversation,
    deleteConv,
    renameConv,
    messages,
    sendMessage,
    isStreaming,
    isConnected,
    isLoading,
    isInitialized,
    error,
  } = useChat();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 加载中或未初始化
  if (!isInitialized || isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg)]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[var(--primary)]" />
          <p className="text-[var(--text-muted)]">正在初始化 AI 助手...</p>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg)]">
        <div className="max-w-md rounded-2xl bg-red-50 p-8 text-center dark:bg-red-900/20">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h3 className="mb-2 text-lg font-medium text-red-600 dark:text-red-400">
            初始化失败
          </h3>
          <p className="text-sm text-red-600/80 dark:text-red-400/80">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // 无可用 CLI
  if (!selectedCli) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg)]">
        <div className="max-w-md rounded-2xl bg-amber-50 p-8 text-center dark:bg-amber-900/20">
          <Bot className="mx-auto mb-4 h-12 w-12 text-amber-500" />
          <h3 className="mb-2 text-lg font-medium text-amber-600 dark:text-amber-400">
            未检测到 CLI 工具
          </h3>
          <p className="text-sm text-amber-600/80 dark:text-amber-400/80">
            请安装 Claude Code、Gemini CLI 或其他支持的 CLI 工具
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[var(--bg)]">
      {/* 侧边栏 - 对话列表 */}
      <ConversationSidebar
        conversations={conversations}
        currentConv={conversation}
        selectedCli={selectedCli}
        onSwitch={switchConversation}
        onCreateNew={() => createNewConversation()}
        onDelete={deleteConv}
        onRename={renameConv}
        isConnected={isConnected}
      />

      {/* 主聊天区域 */}
      <div className="flex flex-1 flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/50 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dim)]">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="font-medium text-[var(--text)]">
                {conversation?.title || '新对话'}
              </h3>
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span>{isConnected ? '已连接' : '未连接'}</span>
                <span>·</span>
                <span>{selectedCli.name}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 消息列表 */}
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          messagesEndRef={messagesEndRef}
        />

        {/* 输入框 */}
        <ChatInput
          onSend={sendMessage}
          isStreaming={isStreaming}
          disabled={!isConnected}
        />
      </div>
    </div>
  );
}
