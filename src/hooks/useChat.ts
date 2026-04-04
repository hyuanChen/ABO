import { useState, useEffect, useRef, useCallback } from 'react';
import type { Conversation, Message, StreamEvent, CliConfig } from '../types/chat';
import {
  detectClis,
  createConversation,
  createChatWebSocket,
} from '../api/chat';

export interface UseChatReturn {
  // CLI
  availableClis: CliConfig[];
  selectedCli: CliConfig | null;

  // 对话
  conversation: Conversation | null;
  messages: Message[];

  // 发送消息（自动处理 CLI 检测和连接）
  sendMessage: (content: string) => Promise<void>;

  // 状态
  isStreaming: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;

  // 清除错误
  clearError: () => void;
}

export function useChat(): UseChatReturn {
  // CLI 状态
  const [availableClis, setAvailableClis] = useState<CliConfig[]>([]);
  const [selectedCli, setSelectedCli] = useState<CliConfig | null>(null);

  // 对话状态
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // 连接状态
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const currentMsgIdRef = useRef<string>('');
  const pendingMessageRef = useRef<string | null>(null);

  // 后台检测 CLI（不阻塞 UI）
  useEffect(() => {
    detectClis()
      .then(setAvailableClis)
      .catch(() => setAvailableClis([]));
  }, []);

  // 清理 WebSocket
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // 自动连接：如果有 pending message 且检测到了 CLI
  useEffect(() => {
    const connectAndSend = async () => {
      if (pendingMessageRef.current && availableClis.length > 0 && !conversation && !isConnecting) {
        await initializeAndSend(pendingMessageRef.current);
      }
    };
    connectAndSend();
  }, [availableClis, conversation, isConnecting]);

  // 初始化连接并发送消息
  const initializeAndSend = async (content: string) => {
    setIsConnecting(true);
    setError(null);

    try {
      // 1. 如果没有可用 CLI，报错
      if (availableClis.length === 0) {
        // 再次尝试检测
        const clis = await detectClis();
        setAvailableClis(clis);

        if (clis.length === 0) {
          setError('未检测到可用的 CLI 工具，请安装 Claude Code 或 Gemini CLI');
          setIsConnecting(false);
          return;
        }
      }

      // 2. 选择第一个可用的 CLI
      const cli = availableClis[0];
      setSelectedCli(cli);

      // 3. 创建对话
      const conv = await createConversation(cli.id);
      setConversation(conv);

      // 4. 建立 WebSocket 连接
      const ws = createChatWebSocket({
        cliType: cli.id,
        sessionId: conv.sessionId,
        onConnect: () => {
          setIsConnected(true);
          setIsConnecting(false);
          // 连接成功后发送 pending 消息
          if (pendingMessageRef.current) {
            doSendMessage(pendingMessageRef.current);
            pendingMessageRef.current = null;
          }
        },
        onDisconnect: () => setIsConnected(false),
        onEvent: handleStreamEvent,
        onError: () => {
          setError('WebSocket 连接失败');
          setIsConnecting(false);
        },
      });

      wsRef.current = ws;

      // 5. 添加用户消息到列表
      const userMsg: Message = {
        id: `user-${Date.now()}`,
        conversationId: conv.id,
        role: 'user',
        content,
        contentType: 'text',
        status: 'completed',
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

    } catch (e) {
      setError(e instanceof Error ? e.message : '连接失败');
      setIsConnecting(false);
    }
  };

  // 发送消息（入口）
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    // 如果还没有连接，保存消息并初始化
    if (!conversation || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      pendingMessageRef.current = content;
      await initializeAndSend(content);
      return;
    }

    // 已连接，直接发送
    doSendMessage(content);
  }, [conversation]);

  // 实际发送消息
  const doSendMessage = (content: string) => {
    if (!wsRef.current || !conversation) return;

    // 添加用户消息到列表
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      conversationId: conversation.id,
      role: 'user',
      content,
      contentType: 'text',
      status: 'completed',
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // 发送消息
    wsRef.current.send(
      JSON.stringify({
        message: content,
        conversation_id: conversation.id,
      })
    );
  };

  // 处理流式事件
  const handleStreamEvent = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case 'start':
        setIsStreaming(true);
        currentMsgIdRef.current = event.msgId;
        setMessages((prev) => [
          ...prev,
          {
            id: event.msgId,
            conversationId: conversation?.id || '',
            msgId: event.msgId,
            role: 'assistant',
            content: '',
            contentType: 'text',
            status: 'streaming',
            createdAt: Date.now(),
          },
        ]);
        break;

      case 'content':
        setMessages((prev) =>
          prev.map((m) =>
            m.msgId === event.msgId
              ? { ...m, content: m.content + event.data }
              : m
          )
        );
        break;

      case 'tool_call':
        const toolData = event.metadata || {};
        setMessages((prev) => [
          ...prev,
          {
            id: `tool-${Date.now()}`,
            conversationId: conversation?.id || '',
            role: 'assistant',
            content: `使用工具: ${toolData.toolName || 'unknown'}`,
            contentType: 'tool_call',
            metadata: toolData,
            status: 'completed',
            createdAt: Date.now(),
          },
        ]);
        break;

      case 'finish':
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.msgId === currentMsgIdRef.current
              ? { ...m, status: 'completed' }
              : m
          )
        );
        break;

      case 'error':
        setIsStreaming(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            conversationId: conversation?.id || '',
            role: 'system',
            content: `错误: ${event.data}`,
            contentType: 'error',
            status: 'error',
            createdAt: Date.now(),
          },
        ]);
        break;
    }
  }, [conversation]);

  const clearError = useCallback(() => setError(null), []);

  return {
    availableClis,
    selectedCli,
    conversation,
    messages,
    sendMessage,
    isStreaming,
    isConnecting,
    isConnected,
    error,
    clearError,
  };
}
