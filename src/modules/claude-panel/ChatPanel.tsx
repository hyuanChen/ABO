import { useState, useEffect, useRef } from 'react';
import { useCliChat, type StreamEvent } from '../../hooks/useCliChat';
import { detectClis, createConversation, type CliConfig, type Message } from '../../core/api';
import { Bot, Send, Loader2 } from 'lucide-react';

export function ChatPanel() {
  const [clis, setClis] = useState<CliConfig[]>([]);
  const [conversation, setConversation] = useState<{ id: string; cli_type: string; session_id: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    detectClis().then(setClis);
  }, []);

  const startChat = async (cliType: string) => {
    const conv = await createConversation(cliType);
    setConversation(conv);
    setMessages([]);
  };

  const { isConnected, isStreaming, sendMessage } = useCliChat({
    cliType: conversation?.cli_type || '',
    sessionId: conversation?.session_id || '',
    conversationId: conversation?.id || '',
    onEvent: (event: StreamEvent) => {
      switch (event.type) {
        case 'start':
          setMessages(prev => [...prev, { id: event.msg_id, role: 'assistant', content: '' }]);
          break;
        case 'content':
          setMessages(prev => prev.map(m => m.id === event.msg_id ? { ...m, content: m.content + event.data } : m));
          break;
        case 'finish':
          // 可选：标记完成状态
          break;
        case 'tool_call':
          const tool = JSON.parse(event.data);
          setMessages(prev => [...prev, { id: `tool-${Date.now()}`, role: 'assistant', content: `🔧 ${tool.tool_name}` }]);
          break;
      }
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || !conversation) return;

    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: input }]);
    sendMessage(input);
    setInput('');
  };

  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <h2 className="text-xl font-semibold text-[var(--text)]">选择 CLI 开始对话</h2>
        <div className="flex gap-3">
          {clis.map(cli => (
            <button
              key={cli.id}
              onClick={() => startChat(cli.id)}
              className="flex items-center gap-2 rounded-xl bg-[var(--surface)] px-6 py-3 text-[var(--text)] shadow-sm hover:bg-[var(--surface-2)]"
            >
              <Bot className="h-5 w-5 text-[var(--primary)]" />
              <span>{cli.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-6 py-4">
        <Bot className="h-5 w-5 text-[var(--primary)]" />
        <span className="font-medium text-[var(--text)]">{clis.find(c => c.id === conversation.cli_type)?.name}</span>
        <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                msg.role === 'user'
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]'
              }`}>
                {msg.content}
                {msg.role === 'assistant' && isStreaming && messages[messages.length - 1]?.id === msg.id && (
                  <span className="ml-1 animate-pulse">▋</span>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mx-auto flex max-w-3xl gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="输入消息..."
            disabled={isStreaming}
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="flex items-center rounded-xl bg-[var(--primary)] px-6 py-3 text-white hover:bg-[var(--primary-dim)] disabled:opacity-50"
          >
            {isStreaming ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </form>
    </div>
  );
}
