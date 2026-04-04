/**
 * MessageItem - 聊天消息单项组件
 * 严格遵循 AionUi 设计规范
 * - 用户消息: 右对齐, 白色背景, 带[你]标签
 * - 助手消息: 左对齐, 带边框
 * - Markdown 渲染 + 代码高亮 + 流式光标 + 工具调用显示
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message } from '../../types/chat';

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 代码块渲染组件
 */
function CodeBlock({
  inline,
  className,
  children,
  ...props
}: {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  const match = /language-(\w+)/.exec(className || '');
  return !inline && match ? (
    <SyntaxHighlighter
      style={oneLight as any}
      language={match[1]}
      PreTag="div"
      {...props}
    >
      {String(children).replace(/\n$/, '')}
    </SyntaxHighlighter>
  ) : (
    <code
      className="bg-[#F5F5F0] px-1.5 py-0.5 rounded text-sm"
      {...props}
    >
      {children}
    </code>
  );
}

/**
 * 工具调用显示组件
 */
function ToolCallDisplay({
  toolName,
  toolInput,
}: {
  toolName?: string;
  toolInput?: Record<string, unknown>;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-[#666666] bg-[#F5F5F0] px-3 py-2 rounded-md my-2">
      <span>🔧</span>
      <span className="font-medium">{toolName || '工具调用'}</span>
      {toolInput && (
        <code className="text-xs text-[#999999] truncate max-w-[200px]">
          {JSON.stringify(toolInput).slice(0, 50)}
          {JSON.stringify(toolInput).length > 50 ? '...' : ''}
        </code>
      )}
    </div>
  );
}

export function MessageItem({ message, isStreaming }: MessageItemProps) {
  const isUser = message.role === 'user';
  const isToolCall = message.contentType === 'tool_call';
  const isError = message.contentType === 'error';
  const timestamp = formatTimestamp(message.createdAt);

  return (
    <div
      className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3`}
    >
      {/* 消息气泡 */}
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-white shadow-sm'
            : isError
            ? 'bg-red-50 border border-red-200'
            : 'bg-white border border-[#E6DDF2]'
        }`}
      >
        {/* 工具调用显示 */}
        {isToolCall && (
          <ToolCallDisplay
            toolName={message.metadata?.toolName}
            toolInput={message.metadata?.toolInput}
          />
        )}

        {/* 错误显示 */}
        {isError && (
          <div className="text-red-600 text-sm mb-2">⚠️ 错误</div>
        )}

        {/* 消息内容 */}
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown
            components={{
              code: CodeBlock,
            }}
          >
            {message.content}
          </ReactMarkdown>

          {/* 流式光标 */}
          {isStreaming && (
            <span className="inline-block w-2 h-5 ml-1 bg-[#7B5EA7] animate-pulse">
              ▋
            </span>
          )}
        </div>

        {/* 时间戳 */}
        <div
          className={`mt-2 text-xs text-[#666666] ${
            isUser ? 'text-right' : 'text-left'
          }`}
        >
          {isUser && <span className="mr-1">[你]</span>}
          {timestamp}
        </div>
      </div>
    </div>
  );
}

export default MessageItem;
