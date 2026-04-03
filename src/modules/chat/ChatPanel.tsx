import { useEffect, useRef } from 'react';
import { useChat } from '../../hooks/useChat';
import { CliSelector } from './CliSelector';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { ChatHeader } from './ChatHeader';
import { Loader2 } from 'lucide-react';

export function ChatPanel() {
  const {
    availableClis,
    selectedCli,
    selectCli,
    conversation,
    createNewConversation,
    messages,
    sendMessage,
    isStreaming,
    isConnected,
    isLoading,
    error,
  } = useChat();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 错误提示
  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-xl bg-red-50 p-6 text-red-600 dark:bg-red-900/20 dark:text-red-400">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // 加载中
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  // 选择 CLI 界面
  if (!conversation || !selectedCli) {
    return (
      <CliSelector
        clis={availableClis}
        selected={selectedCli}
        onSelect={selectCli}
        onStart={createNewConversation}
      />
    );
  }

  // 聊天界面
  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <ChatHeader
        cli={selectedCli}
        conversation={conversation}
        isConnected={isConnected}
      />

      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        messagesEndRef={messagesEndRef}
      />

      <ChatInput
        onSend={sendMessage}
        isStreaming={isStreaming}
        disabled={!isConnected}
      />
    </div>
  );
}
