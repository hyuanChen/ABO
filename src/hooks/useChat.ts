import { useState, useEffect, useRef, useCallback } from 'react';
import type { Conversation, Message, StreamEvent, CliConfig } from '../types/chat';
import {
  detectClis,
  createConversation,
  getMessages,
  createChatWebSocket,
} from '../api/chat';

interface UseChatReturn {
  // CLI
  availableClis: CliConfig[];
  selectedCli: CliConfig | null;
  selectCli: (cli: CliConfig) => void;

  // Conversation
  conversation: Conversation | null;
  createNewConversation: () => Promise<void>;
  loadConversation: (conv: Conversation) => Promise<void>;

  // Messages
  messages: Message[];
  sendMessage: (content: string) => void;
  isStreaming: boolean;

  // Connection state
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useChat(): UseChatReturn {
  // CLI state
  const [availableClis, setAvailableClis] = useState<CliConfig[]>([]);
  const [selectedCli, setSelectedCli] = useState<CliConfig | null>(null);

  // Conversation state
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const currentMsgIdRef = useRef<string>('');

  // Detect CLI on mount
  useEffect(() => {
    detectClis()
      .then(setAvailableClis)
      .catch((e) => setError(e.message));
  }, []);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Select CLI
  const selectCli = useCallback((cli: CliConfig) => {
    setSelectedCli(cli);
    setError(null);
  }, []);

  // Create new conversation
  const createNewConversation = useCallback(async () => {
    if (!selectedCli) {
      setError('Please select a CLI first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Close existing connection
      wsRef.current?.close();

      // Create new conversation
      const conv = await createConversation(selectedCli.id);
      setConversation(conv);
      setMessages([]);

      // Establish WebSocket connection
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

  // Load existing conversation
  const loadConversation = useCallback(async (conv: Conversation) => {
    setIsLoading(true);
    setError(null);

    try {
      // Close existing connection
      wsRef.current?.close();

      // Load history messages
      const history = await getMessages(conv.id);
      setMessages(history);
      setConversation(conv);

      // Find CLI config
      const cli = availableClis.find((c) => c.id === conv.cliType);
      if (cli) setSelectedCli(cli);

      // Establish WebSocket connection
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

  // Handle stream events
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

      case 'tool_call': {
        const toolData = event.metadata || {};
        setMessages((prev) => [
          ...prev,
          {
            id: `tool-${Date.now()}`,
            conversationId: conversation?.id || '',
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

  // Send message
  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || !conversation) {
      setError('Not connected');
      return;
    }

    if (wsRef.current.readyState !== WebSocket.OPEN) {
      setError('WebSocket not connected');
      return;
    }

    // Add user message to list
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

    // Send message
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
