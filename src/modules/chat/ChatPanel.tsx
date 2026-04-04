/**
 * ChatPanel - 严格遵循 AionUi 设计规范
 * 完整集成 WebSocket 流式通信
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatHeader } from './ChatHeader';
import { MessageList, Message } from './MessageList';
import { ChatInput } from './ChatInput';
import { API_BASE_URL } from '../../core/api';

interface WebSocketEvent {
  type: 'connected' | 'ping' | 'start' | 'content' | 'tool_call' | 'finish' | 'error';
  data?: string;
  msg_id?: string;
  metadata?: any;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [_sessionId, setSessionId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const currentMsgIdRef = useRef<string | null>(null);

  // 创建对话
  const createConversation = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cli_type: 'echo',
          title: 'Claude Chat',
          workspace: '',
        }),
      });
      const data = await response.json();
      setConversationId(data.id);
      setSessionId(data.session_id);
      return data;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      return null;
    }
  }, []);

  // 连接 WebSocket
  const connectWebSocket = useCallback((conv: any) => {
    if (!conv?.session_id) return;

    const wsUrl = `${API_BASE_URL.replace('http', 'ws')}/api/chat/ws/echo/${conv.session_id}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const msg: WebSocketEvent = JSON.parse(event.data);
      handleWebSocketMessage(msg);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    };

    wsRef.current = ws;
  }, []);

  // 处理 WebSocket 消息
  const handleWebSocketMessage = useCallback((msg: WebSocketEvent) => {
    switch (msg.type) {
      case 'connected':
        setIsConnected(true);
        break;

      case 'start':
        setIsStreaming(true);
        currentMsgIdRef.current = msg.msg_id || null;
        // 添加空的助手消息
        setMessages((prev) => [
          ...prev,
          {
            id: msg.msg_id || Date.now().toString(),
            role: 'assistant',
            content: '',
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            isStreaming: true,
          },
        ]);
        break;

      case 'content':
        if (msg.data) {
          setMessages((prev) => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
              return [
                ...prev.slice(0, -1),
                { ...lastMsg, content: lastMsg.content + msg.data },
              ];
            }
            return prev;
          });
        }
        break;

      case 'finish':
        setIsStreaming(false);
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            return [...prev.slice(0, -1), { ...lastMsg, isStreaming: false }];
          }
          return prev;
        });
        currentMsgIdRef.current = null;
        break;

      case 'error':
        console.error('Server error:', msg.data);
        setIsStreaming(false);
        break;
    }
  }, []);

  // 初始化
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const conv = await createConversation();
      if (mounted && conv) {
        connectWebSocket(conv);
      }
    };

    init();

    return () => {
      mounted = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [createConversation, connectWebSocket]);

  // 发送消息
  const handleSend = useCallback(
    (content: string) => {
      if (!wsRef.current || !conversationId) return;

      // 添加用户消息
      const userMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, userMsg]);

      // 发送 WebSocket 消息
      wsRef.current.send(
        JSON.stringify({
          type: 'message',
          content,
          conversation_id: conversationId,
        })
      );
    },
    [conversationId]
  );

  return (
    <div className="flex flex-col h-full bg-[#FCFAF2]">
      <ChatHeader
        cliName="Claude Code"
        isOnline={isConnected}
        onSettings={() => console.log('Settings clicked')}
        onClose={() => console.log('Close clicked')}
      />
      <MessageList messages={messages} />
      <ChatInput onSend={handleSend} disabled={!isConnected || isStreaming} />
    </div>
  );
}

export default ChatPanel;
