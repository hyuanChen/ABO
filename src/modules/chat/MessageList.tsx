/**
 * MessageList - 严格遵循 AionUi 设计规范
 * - 用户消息: 右对齐, 白色背景
 * - 助手消息: 左对齐, 带边框
 * - Markdown 渲染 + 流式光标
 */
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#FCFAF2]">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} gap-3`}
        >
          {/* 消息气泡 */}
          <div
            className={`max-w-[80%] rounded-lg px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-white shadow-sm'
                : 'bg-white border border-[#E6DDF2]'
            }`}
          >
            {/* 消息内容 */}
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={oneLight}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className="bg-[#F5F5F0] px-1.5 py-0.5 rounded text-sm" {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {msg.content}
              </ReactMarkdown>
              {/* 流式光标 */}
              {msg.isStreaming && (
                <span className="inline-block w-2 h-5 ml-1 bg-[#7B5EA7] animate-pulse">
                  ▋
                </span>
              )}
            </div>

            {/* 时间戳 */}
            <div
              className={`mt-2 text-xs text-[#666666] ${
                msg.role === 'user' ? 'text-right' : 'text-left'
              }`}
            >
              {msg.role === 'user' && <span className="mr-1">[你]</span>}
              {msg.timestamp}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default MessageList;
