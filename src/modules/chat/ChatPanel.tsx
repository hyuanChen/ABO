/**
 * ChatPanel - 聊天主面板 (带多对话标签页)
 * 流程: ChatHome -> 开始对话 -> ChatSession (平滑过渡)
 * 支持多个对话标签页，像浏览器一样切换
 */
import { useState, useCallback, useEffect } from 'react';
import { ChatHome } from './ChatHome';
import { ChatSession } from './ChatSession';
import { useChat } from '../../hooks/useChat';
import { X, Plus, MessageSquare, Wifi, WifiOff } from 'lucide-react';
import type { CliConfig, Message } from '../../types/chat';

export function ChatPanel() {
  const {
    availableClis,
    selectedCli,
    selectCli,
    conversations,
    activeConversation,
    createNewConversation,
    switchConversation,
    closeConversation,
    messages,
    sendMessage,
    isConnected,
    isStreaming,
    error,
    clearError,
  } = useChat();

  // 本地状态
  const [hasStarted, setHasStarted] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // 同步消息到本地状态
  useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);

  // 同步活动对话状态
  useEffect(() => {
    if (activeConversation) {
      setHasStarted(true);
    }
  }, [activeConversation]);

  // 开始新对话
  const handleStartChat = useCallback(async (initialMessage: string) => {
    if (!selectedCli && availableClis.length === 0) {
      return;
    }

    setIsCreating(true);

    try {
      // 先创建对话（这会连接 WebSocket）
      const conv = await createNewConversation(
        selectedCli?.id,
        initialMessage.slice(0, 30)
      );

      if (conv) {
        // 添加用户消息到本地显示
        const userMsg: Message = {
          id: `user-${Date.now()}`,
          conversationId: conv.id,
          role: 'user',
          content: initialMessage,
          contentType: 'text',
          status: 'completed',
          createdAt: Date.now(),
        };
        setLocalMessages([userMsg]);

        // 发送消息（此时 WebSocket 应该已连接）
        await sendMessage(initialMessage);
      }
    } catch (e) {
      console.error('Failed to start chat:', e);
    } finally {
      setIsCreating(false);
    }
  }, [selectedCli, availableClis, createNewConversation, sendMessage]);

  // 继续对话
  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeConversation) return;

    const content = input;
    setInput('');

    // 添加用户消息到本地
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      conversationId: activeConversation.id,
      role: 'user',
      content: content,
      contentType: 'text',
      status: 'completed',
      createdAt: Date.now(),
    };
    setLocalMessages((prev) => [...prev, userMsg]);

    // 发送到后端
    await sendMessage(content);
  }, [input, activeConversation, sendMessage]);

  // 切换对话
  const handleSwitchConversation = useCallback(async (convId: string) => {
    await switchConversation(convId);
  }, [switchConversation]);

  // 关闭对话
  const handleCloseConversation = useCallback((e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    closeConversation(convId);

    // 如果关闭的是最后一个对话，返回主页
    if (conversations.length <= 1) {
      setHasStarted(false);
      setLocalMessages([]);
    }
  }, [closeConversation, conversations.length]);

  // 新建对话
  const handleNewConversation = useCallback(async () => {
    if (!selectedCli && availableClis.length === 0) return;

    setIsCreating(true);
    try {
      await createNewConversation(selectedCli?.id, '新对话');
    } finally {
      setIsCreating(false);
    }
  }, [selectedCli, availableClis, createNewConversation]);

  // 返回主页
  const handleBack = useCallback(() => {
    setHasStarted(false);
    setLocalMessages([]);
  }, []);

  // 清除当前对话
  const handleClear = useCallback(() => {
    setLocalMessages([]);
  }, []);

  // 选择CLI
  const handleSelectCli = useCallback((cli: CliConfig) => {
    selectCli(cli);
  }, [selectCli]);

  // 如果有错误，显示错误提示
  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-app)]">
        <div className="text-center p-8">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={clearError}
            className="px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const currentCli = selectedCli || availableClis[0];

  return (
    <div className="h-full flex flex-col bg-[var(--bg-app)]">
      {/* 对话标签栏 - 浏览器风格 */}
      {conversations.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-2 bg-white/60 backdrop-blur-xl border-b border-[var(--border-color)] overflow-x-auto">
          {conversations.map((conv) => {
            const isActive = activeConversation?.id === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => handleSwitchConversation(conv.id)}
                className={`
                  group flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer
                  transition-all duration-200 min-w-[120px] max-w-[200px]
                  ${isActive
                    ? 'bg-white shadow-soft border border-[var(--border-color)]'
                    : 'bg-transparent hover:bg-white/40 border border-transparent'
                  }
                `}
              >
                <MessageSquare className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                <span className="flex-1 text-sm truncate text-[var(--text-main)]">
                  {conv.title}
                </span>
                <button
                  onClick={(e) => handleCloseConversation(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--bg-hover)] transition-all"
                >
                  <X className="w-3 h-3 text-[var(--text-muted)]" />
                </button>
              </div>
            );
          })}

          {/* 新建对话按钮 */}
          <button
            onClick={handleNewConversation}
            disabled={isCreating}
            className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-white/60 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4 text-[var(--text-muted)]" />
          </button>

          {/* 连接状态指示器 */}
          <div className="ml-auto flex items-center gap-2 px-3">
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-green-500" />
                <span className="text-xs text-green-600">已连接</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs text-red-500">未连接</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex-1 relative overflow-hidden">
        {/* ChatHome - 输入界面 */}
        <div
          className={`absolute inset-0 transition-all duration-500 ease-out ${
            hasStarted ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
          }`}
        >
          <ChatHome
            clis={availableClis}
            selectedCli={selectedCli}
            onSelectCli={handleSelectCli}
            onStartChat={handleStartChat}
            isLoading={isCreating}
          />
        </div>

        {/* ChatSession - 对话界面 */}
        {hasStarted && activeConversation && (
          <div
            className={`absolute inset-0 transition-all duration-500 ease-out ${
              hasStarted ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'
            }`}
          >
            <ChatSession
              cli={currentCli}
              conversation={activeConversation}
              messages={localMessages}
              isConnected={isConnected}
              isStreaming={isStreaming}
              input={input}
              onInputChange={setInput}
              onSend={handleSend}
              onBack={handleBack}
              onClear={handleClear}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatPanel;
