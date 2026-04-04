/**
 * ChatPanel - 完整集成 useChat hook
 * 布局: Header (CLI选择器 + 连接状态 + 设置) + 消息列表 + 输入框
 * 设计: AionUi - 背景 #FCFAF2, 全高度 flex 布局
 */
import { useEffect, useRef, useCallback } from 'react';
import { Plus, AlertCircle, Loader2 } from 'lucide-react';
import { MessageList, Message as MessageListMessage } from './MessageList';
import { ChatInput } from './ChatInput';
import { useChat } from '../../hooks/useChat';
import type { Message } from '../../types/chat';

// 将 useChat 的 Message 转换为 MessageList 的 Message
function convertMessages(messages: Message[]): MessageListMessage[] {
  return messages.map((msg) => ({
    id: msg.id,
    role: msg.role === 'system' ? 'assistant' : msg.role,
    content: msg.content,
    timestamp: new Date(msg.createdAt).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    isStreaming: msg.status === 'streaming',
  }));
}

export function ChatPanel() {
  const {
    // CLI
    availableClis,
    selectedCli,
    selectCli,

    // Conversation
    conversation,
    createNewConversation,

    // Messages
    messages,
    sendMessage,
    isStreaming,

    // Connection state
    isConnected,
    isLoading,
    error,
  } = useChat();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 处理 CLI 选择
  const handleCliSelect = useCallback(
    (cliId: string) => {
      const cli = availableClis.find((c) => c.id === cliId);
      if (cli) {
        selectCli(cli);
      }
    },
    [availableClis, selectCli]
  );

  // 处理新建对话
  const handleNewChat = useCallback(async () => {
    await createNewConversation();
  }, [createNewConversation]);

  // 处理发送消息
  const handleSend = useCallback(
    (content: string) => {
      sendMessage(content);
    },
    [sendMessage]
  );

  // 获取可用的 CLI 列表（只显示可用的）
  const availableCliList = availableClis.filter((cli) => cli.isAvailable);

  // 头部渲染：CLI 选择器 + 新建对话按钮 + 连接状态
  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between px-4 h-[60px] border-b border-[#E6DDF2] bg-[#FCFAF2]">
        {/* 左侧: CLI 选择器 + 新建对话按钮 */}
        <div className="flex items-center gap-3">
          {/* CLI 选择器 */}
          <div className="flex items-center gap-2">
            <select
              value={selectedCli?.id || ''}
              onChange={(e) => handleCliSelect(e.target.value)}
              disabled={isLoading || availableCliList.length === 0}
              className="px-3 py-1.5 rounded-md border border-[#E6DDF2] bg-white
                         text-sm text-[#1a1a1a] focus:outline-none focus:border-[#D8B4E2]
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">
                {availableCliList.length === 0 ? '无可用 CLI' : '选择 CLI'}
              </option>
              {availableCliList.map((cli) => (
                <option key={cli.id} value={cli.id}>
                  {cli.name}
                </option>
              ))}
            </select>

            {/* 新建对话按钮 */}
            <button
              onClick={handleNewChat}
              disabled={!selectedCli || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md
                         bg-[#7B5EA7] text-white text-sm
                         hover:bg-[#6B4E97] disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors"
            >
              <Plus className="w-4 h-4" />
              新对话
            </button>
          </div>

          {/* 连接状态指示器 */}
          {conversation && (
            <div className="flex items-center gap-1.5 ml-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />
              <span className="text-sm text-[#666666]">
                {isConnected ? '已连接' : '未连接'}
              </span>
            </div>
          )}
        </div>

        {/* 右侧: 设置按钮 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => console.log('Settings clicked')}
            className="p-2 rounded-md hover:bg-[#F5F5F0] transition-colors"
            aria-label="Settings"
          >
            <svg
              className="w-5 h-5 text-[#666666]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  // 错误提示
  const renderError = () => {
    if (!error) return null;

    return (
      <div className="px-4 py-2 bg-red-50 border-b border-red-100">
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      </div>
    );
  };

  // 加载状态
  const renderLoading = () => {
    if (!isLoading) return null;

    return (
      <div className="absolute inset-0 bg-[#FCFAF2]/80 flex items-center justify-center z-10">
        <div className="flex items-center gap-2 text-[#7B5EA7]">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">连接中...</span>
        </div>
      </div>
    );
  };

  // 空状态提示
  const renderEmptyState = () => {
    if (conversation || isLoading) return null;

    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#F3EDFA] flex items-center justify-center">
            <svg
              className="w-8 h-8 text-[#7B5EA7]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <p className="text-[#666666] text-sm mb-2">选择一个 CLI 开始新对话</p>
          {availableCliList.length === 0 && (
            <p className="text-[#999999] text-xs">未检测到可用的 CLI</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#FCFAF2] relative">
      {/* 头部: CLI 选择器 + 连接状态 + 设置 */}
      {renderHeader()}

      {/* 错误提示 */}
      {renderError()}

      {/* 加载遮罩 */}
      {renderLoading()}

      {/* 消息列表区域 */}
      {conversation ? (
        <>
          <div className="flex-1 overflow-hidden relative">
            <div className="absolute inset-0 overflow-y-auto">
              <MessageList messages={convertMessages(messages)} />
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* 输入区域 */}
          <ChatInput
            onSend={handleSend}
            disabled={!isConnected || isStreaming}
            placeholder={isConnected ? '输入消息...' : '等待连接...'}
          />
        </>
      ) : (
        renderEmptyState()
      )}
    </div>
  );
}

export default ChatPanel;
