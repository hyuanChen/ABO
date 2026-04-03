import { useState, useEffect, useRef, useCallback } from 'react';
import type { Conversation, Message, StreamEvent, CliConfig } from '../types/chat';
import {
  detectClis,
  createConversation,
  getMessages,
  createChatWebSocket,
} from '../api/chat';

export interface UseChatReturn {
  // CLI
  availableClis: CliConfig[];
  selectedCli: CliConfig | null;
  selectCli: (cli: CliConfig) => void;

  // 对话
  conversation: Conversation | null;
  createNewConversation: () => Promise<void>;
  loadConversation: (conv: Conversation) => Promise<void>;

  // 消息
  messages: Message[];
  sendMessage: (content: string) => void;
  isStreaming: boolean;

  // 连接状态
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
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
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const currentMsgIdRef = useRef<string>('');

  // 检测 CLI
  useEffect(() => {
    detectClis()
      .then(setAvailableClis)
      .catch((e) => setError(e.message));
  }, []);

  // 清理 WebSocket
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // 选择 CLI
  const selectCli = useCallback((cli: CliConfig) => {
    setSelectedCli(cli);
    setError(null);
  }, []);

  // 创建新对话
  const createNewConversation = useCallback(async () => {
    if (!selectedCli) {
      setError('Please select a CLI first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 关闭现有连接
      wsRef.current?.close();

      // 创建新对话
      const conv = await createConversation(selectedCli.id);
      setConversation(conv);
      setMessages([]);

      // 建立 WebSocket 连接
      const ws = createChatWebSocket({
        cliType: selectedCli.id,
        sessionId: conv.sessionId,
        onConnect: () => setIsConnected(true),
        onDisconnect: () => setIsConnected(false),
        onEvent: handleStreamEvent,
        onError: () => setError('WebSocket connection failed'),
      });

      wsRef.current = ws;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCli]);

  // 加载已有对话
  const loadConversation = useCallback(async (conv: Conversation) => {
    setIsLoading(true);
    setError(null);

    try {
      // 关闭现有连接
      wsRef.current?.close();

      // 加载历史消息
      const history = await getMessages(conv.id);
      setMessages(history);
      setConversation(conv);

      // 找到 CLI 配置
      const cli = availableClis.find((c) => c.id === conv.cliType);
      if (cli) setSelectedCli(cli);

      // 建立 WebSocket 连接
      const ws = createChatWebSocket({
        cliType: conv.cliType,
        sessionId: conv.sessionId,
        onConnect: () => setIsConnected(true),
        onDisconnect: () => setIsConnected(false),
        onEvent: handleStreamEvent,
      });

      wsRef.current = ws;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [availableClis]);

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
            content: `🔧 使用工具: ${toolData.toolName || 'unknown'}`,
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
            content: `Error: ${event.data}`,
            contentType: 'error',
            status: 'error',
            createdAt: Date.now(),
          },
        ]);
        break;
    }
  }, [conversation]);

  // 发送消息
  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || !conversation) {
      setError('Not connected');
      return;
    }

    if (wsRef.current.readyState !== WebSocket.OPEN) {
      setError('WebSocket not connected');
      return;
    }

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
  }, [conversation]);

  return {
    availableClis,
    selectedCli,
    selectCli,
    conversation,
    createNewConversation,
    loadConversation,
    messages,
    sendMessage,
    isStreaming,
    isConnected,
    isLoading,
    error,
  };
}
