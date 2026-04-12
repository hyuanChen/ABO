import { useState, useEffect, useRef, useCallback } from 'react';
import type { Conversation, Message, StreamEvent, CliConfig } from '../types/chat';
import {
  detectClis,
  createConversation,
  getMessages,
  listConversations,
} from '../api/chat';
import { useStore } from '../core/store';

interface UseChatReturn {
  // CLI
  availableClis: CliConfig[];
  selectedCli: CliConfig | null;
  selectCli: (cli: CliConfig) => void;

  // Conversations (tabs)
  conversations: Conversation[];
  activeConversation: Conversation | null;
  createNewConversation: (cliType?: string, title?: string) => Promise<Conversation | null>;
  switchConversation: (convId: string) => Promise<void>;
  closeConversation: (convId: string) => void;

  // Messages
  messages: Message[];
  sendMessage: (content: string) => void;
  isStreaming: boolean;

  // Connection state
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  connectionState: string;

  // Actions
  clearError: () => void;
  refreshConversations: () => Promise<void>;
}

export function useChat(): UseChatReturn {
  const aiProvider = useStore((state) => state.aiProvider);

  // CLI state
  const [availableClis, setAvailableClis] = useState<CliConfig[]>([]);
  const [selectedCli, setSelectedCli] = useState<CliConfig | null>(null);

  // Conversations state (tabs)
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  // Messages state
  const [messages, setMessages] = useState<Message[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const currentMsgIdRef = useRef<string>('');
  const pendingMessagesRef = useRef<Map<string, Message[]>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);

  // Detect CLIs on mount
  useEffect(() => {
    detectClis()
      .then((clis) => {
        console.log('[useChat] Detected CLIs:', clis);
        setAvailableClis(clis);
        if (clis.length > 0) {
          const preferredCli = clis.find((cli) => cli.id === aiProvider) ?? clis[0];
          if (!selectedCli || !clis.some((cli) => cli.id === selectedCli.id) || selectedCli.id !== preferredCli.id) {
            setSelectedCli(preferredCli);
          }
        }
      })
      .catch((e) => {
        console.error('[useChat] Failed to detect CLIs:', e);
        setError(e.message);
      });
  }, [aiProvider, selectedCli]);

  // Load initial conversations
  useEffect(() => {
    refreshConversations();
  }, []);

  // WebSocket connection management
  const connectWebSocket = useCallback((cliType: string, sessionId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('[WebSocket] Already connected');
        resolve();
        return;
      }

      if (!sessionId) {
        console.error('[WebSocket] No sessionId provided');
        reject(new Error('No sessionId'));
        return;
      }

      const wsUrl = `ws://127.0.0.1:8765/api/chat/ws/${cliType}/${sessionId}`;
      console.log('[WebSocket] Connecting to:', wsUrl);

      try {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('[WebSocket] Connected');
          setIsConnected(true);
          resolve();
        };

        ws.onmessage = (event) => {
          try {
            const data: StreamEvent = JSON.parse(event.data);
            console.log('[WebSocket] Received:', data.type);
            handleStreamEvent(data);
          } catch (e) {
            console.error('[WebSocket] Failed to parse message:', e);
          }
        };

        ws.onclose = () => {
          console.log('[WebSocket] Disconnected');
          setIsConnected(false);
          setIsStreaming(false);
          wsRef.current = null;
        };

        ws.onerror = (error) => {
          console.error('[WebSocket] Error:', error);
          setIsConnected(false);
          setError('WebSocket 连接错误');
          reject(error);
        };

        wsRef.current = ws;
      } catch (e) {
        console.error('[WebSocket] Failed to create connection:', e);
        reject(e);
      }
    });
  }, []);

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      console.log('[WebSocket] Disconnecting...');
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendViaWebSocket = useCallback((content: string, conversationId: string): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Sending message');
      wsRef.current.send(JSON.stringify({
        type: 'message',
        content,
        conversation_id: conversationId,
      }));
      return true;
    }
    console.error('[WebSocket] Not connected, cannot send');
    return false;
  }, []);

  // Handle stream events (convert snake_case to camelCase)
  const handleStreamEvent = useCallback((rawEvent: any) => {
    // Convert snake_case to camelCase
    const event: StreamEvent = {
      type: rawEvent.type,
      data: rawEvent.data || '',
      msgId: rawEvent.msg_id || rawEvent.msgId || '',
      metadata: rawEvent.metadata,
      timestamp: rawEvent.timestamp,
    };
    console.log('[WebSocket] Event:', event.type, event);
    switch (event.type) {
      case 'start':
        setIsStreaming(true);
        currentMsgIdRef.current = event.msgId;
        setMessages((prev) => [
          ...prev,
          {
            id: event.msgId,
            conversationId: activeConversation?.id || '',
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

      case 'tool_call': {
        const toolData = event.metadata || {};
        setMessages((prev) => [
          ...prev,
          {
            id: `tool-${Date.now()}`,
            conversationId: activeConversation?.id || '',
            role: 'assistant',
            content: `Tool: ${toolData.toolName || 'unknown'}`,
            contentType: 'tool_call',
            metadata: toolData,
            status: 'completed',
            createdAt: Date.now(),
          },
        ]);
        break;
      }

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
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            conversationId: activeConversation?.id || '',
            role: 'system',
            content: `Error: ${event.data}`,
            contentType: 'error',
            status: 'error',
            createdAt: Date.now(),
          },
        ]);
        break;
    }
  }, [activeConversation]);

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const connectionState = isConnected ? 'connected' : 'disconnected';

  // Select CLI
  const selectCli = useCallback((cli: CliConfig) => {
    setSelectedCli(cli);
    setError(null);
  }, []);

  // Refresh conversations list
  const refreshConversations = useCallback(async () => {
    try {
      const convs = await listConversations();
      setConversations(convs);
    } catch (e) {
      console.error('[useChat] Failed to load conversations:', e);
    }
  }, []);

  // Create new conversation
  const createNewConversation = useCallback(async (cliType?: string, title?: string): Promise<Conversation | null> => {
    const cliId = cliType || selectedCli?.id;
    if (!cliId) {
      setError('请先选择一个 CLI');
      return null;
    }

    const cli = availableClis.find((c) => c.id === cliId);
    if (!cli) {
      setError(`CLI ${cliId} 不可用`);
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Close existing connection
      disconnectWebSocket();

      // Create new conversation
      console.log('[useChat] Creating conversation with CLI:', cliId);
      const conv = await createConversation(cliId, title);
      console.log('[useChat] Created conversation:', conv);

      // Add to conversations list
      setConversations((prev) => [conv, ...prev]);
      setActiveConversation(conv);
      setMessages([]);

      // Connect WebSocket and wait for connection
      await connectWebSocket(conv.cliType, conv.sessionId);

      return conv;
    } catch (e) {
      console.error('[useChat] Failed to create conversation:', e);
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [selectedCli, availableClis, connectWebSocket, disconnectWebSocket]);

  // Switch to existing conversation
  const switchConversation = useCallback(async (convId: string) => {
    const conv = conversations.find((c) => c.id === convId);
    if (!conv) return;

    // Save current messages
    if (activeConversation) {
      pendingMessagesRef.current.set(activeConversation.id, messages);
    }

    setIsLoading(true);

    try {
      // Close existing connection
      disconnectWebSocket();

      // Load messages from cache or fetch
      const cached = pendingMessagesRef.current.get(convId);
      if (cached) {
        setMessages(cached);
      } else {
        const history = await getMessages(convId);
        setMessages(history);
      }

      setActiveConversation(conv);

      // Find and set CLI
      const cli = availableClis.find((c) => c.id === conv.cliType);
      if (cli) setSelectedCli(cli);

      // Connect WebSocket
      connectWebSocket(conv.cliType, conv.sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [conversations, activeConversation, messages, availableClis, connectWebSocket, disconnectWebSocket]);

  // Close conversation (remove from tabs)
  const closeConversation = useCallback((convId: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    pendingMessagesRef.current.delete(convId);

    if (activeConversation?.id === convId) {
      disconnectWebSocket();

      // Switch to another conversation or clear
      const remaining = conversations.filter((c) => c.id !== convId);
      if (remaining.length > 0) {
        switchConversation(remaining[0].id);
      } else {
        setActiveConversation(null);
        setMessages([]);
      }
    }
  }, [activeConversation, conversations, disconnectWebSocket, switchConversation]);

  // Send message
  const sendMessage = useCallback(async (content: string) => {
    if (!activeConversation) {
      setError('没有活动的对话');
      return;
    }

    // Add user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      conversationId: activeConversation.id,
      role: 'user',
      content,
      contentType: 'text',
      status: 'completed',
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Check actual connection state and reconnect if needed
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      console.log('[useChat] Not connected, reconnecting...');
      try {
        await connectWebSocket(activeConversation.cliType, activeConversation.sessionId);
      } catch (e) {
        setError('WebSocket 连接失败');
        return;
      }
    }

    // Send via WebSocket
    const sent = sendViaWebSocket(content, activeConversation.id);
    if (!sent) {
      setError('发送失败 - WebSocket 未连接');
    }
  }, [activeConversation, sendViaWebSocket, connectWebSocket]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectWebSocket();
    };
  }, [disconnectWebSocket]);

  return {
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
    isStreaming,
    isConnected,
    isLoading,
    error,
    connectionState,
    clearError,
    refreshConversations,
  };
}
