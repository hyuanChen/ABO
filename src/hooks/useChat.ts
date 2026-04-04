import { useState, useEffect, useRef, useCallback } from 'react';
import type { Conversation, Message, StreamEvent, CliConfig } from '../types/chat';
import {
  detectClis,
  createConversation,
  listConversations,
  getMessages,
  deleteConversation,
  updateConversationTitle,
  createChatWebSocket,
} from '../api/chat';

export interface UseChatReturn {
  // CLI
  availableClis: CliConfig[];
  selectedCli: CliConfig | null;

  // 对话列表
  conversations: Conversation[];
  loadConversations: () => Promise<void>;

  // 当前对话
  conversation: Conversation | null;
  createNewConversation: (cliType?: string) => Promise<void>;
  switchConversation: (conv: Conversation) => Promise<void>;
  deleteConv: (convId: string) => Promise<void>;
  renameConv: (convId: string, title: string) => Promise<void>;

  // 消息
  messages: Message[];
  sendMessage: (content: string) => void;
  isStreaming: boolean;

  // 连接状态
  isConnected: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
}

export function useChat(): UseChatReturn {
  // CLI 状态
  const [availableClis, setAvailableClis] = useState<CliConfig[]>([]);
  const [selectedCli, setSelectedCli] = useState<CliConfig | null>(null);

  // 对话状态
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // 初始化状态
  const [isInitialized, setIsInitialized] = useState(false);

  // 连接状态
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const currentMsgIdRef = useRef<string>('');
  const initializingRef = useRef(false);

  // 初始化：检测CLI并自动创建对话
  useEffect(() => {
    if (initializingRef.current) return;
    initializingRef.current = true;

    const initialize = async () => {
      try {
        setIsLoading(true);

        // 1. 检测可用CLI
        const clis = await detectClis();
        setAvailableClis(clis);

        if (clis.length === 0) {
          setError('未检测到可用的CLI工具，请安装Claude Code或Gemini CLI');
          setIsInitialized(true);
          setIsLoading(false);
          return;
        }

        // 2. 加载历史对话列表
        await loadConversations();

        // 3. 如果没有活跃对话，自动创建一个
        const activeConvs = await listConversations();
        if (activeConvs.length === 0) {
          // 使用第一个可用的CLI自动创建
          const defaultCli = clis[0];
          setSelectedCli(defaultCli);
          await createNewConversation(defaultCli.id, false);
        } else {
          // 使用最新的对话
          const latest = activeConvs[0];
          await switchConversation(latest, false);
        }

        setIsInitialized(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : '初始化失败');
        setIsInitialized(true);
      } finally {
        setIsLoading(false);
      }
    };

    initialize();

    // 清理
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // 加载对话列表
  const loadConversations = useCallback(async () => {
    try {
      const convs = await listConversations();
      setConversations(convs);
    } catch (e) {
      console.error('Failed to load conversations:', e);
    }
  }, []);

  // 创建新对话
  const createNewConversation = useCallback(async (cliType?: string, updateList: boolean = true) => {
    const targetCliType = cliType || selectedCli?.id || availableClis[0]?.id;
    if (!targetCliType) {
      setError('没有可用的CLI');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 关闭现有连接
      wsRef.current?.close();

      // 创建新对话
      const conv = await createConversation(targetCliType);
      setConversation(conv);
      setMessages([]);

      // 更新选中的CLI
      const cli = availableClis.find(c => c.id === targetCliType);
      if (cli) setSelectedCli(cli);

      // 更新对话列表
      if (updateList) {
        await loadConversations();
      }

      // 建立 WebSocket 连接
      const ws = createChatWebSocket({
        cliType: targetCliType,
        sessionId: conv.sessionId,
        onConnect: () => setIsConnected(true),
        onDisconnect: () => setIsConnected(false),
        onEvent: handleStreamEvent,
        onError: () => setError('WebSocket连接失败'),
      });

      wsRef.current = ws;
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建对话失败');
    } finally {
      setIsLoading(false);
    }
  }, [availableClis, selectedCli, loadConversations]);

  // 切换对话
  const switchConversation = useCallback(async (conv: Conversation, updateList: boolean = true) => {
    if (conversation?.id === conv.id) return;

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

      // 更新列表（确保顺序正确）
      if (updateList) {
        await loadConversations();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换对话失败');
    } finally {
      setIsLoading(false);
    }
  }, [availableClis, conversation?.id, loadConversations]);

  // 删除对话
  const deleteConv = useCallback(async (convId: string) => {
    try {
      await deleteConversation(convId);

      // 如果删除的是当前对话，切换到其他对话或创建新对话
      if (conversation?.id === convId) {
        const remaining = conversations.filter(c => c.id !== convId);
        if (remaining.length > 0) {
          await switchConversation(remaining[0]);
        } else {
          await createNewConversation();
        }
      }

      await loadConversations();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  }, [conversation?.id, conversations, createNewConversation, switchConversation, loadConversations]);

  // 重命名对话
  const renameConv = useCallback(async (convId: string, title: string) => {
    try {
      await updateConversationTitle(convId, title);
      await loadConversations();
      if (conversation?.id === convId) {
        setConversation({ ...conversation, title });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '重命名失败');
    }
  }, [conversation, loadConversations]);

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
            content: `错误: ${event.data}`,
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
      setError('未连接');
      return;
    }

    if (wsRef.current.readyState !== WebSocket.OPEN) {
      setError('WebSocket未连接');
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
    conversations,
    loadConversations,
    conversation,
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
  };
}
