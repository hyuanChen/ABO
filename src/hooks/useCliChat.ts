import { useState, useEffect, useRef, useCallback } from 'react';

export interface StreamEvent {
  type: 'start' | 'content' | 'tool_call' | 'finish' | 'error';
  data: string;
  msg_id: string;
}

interface UseCliChatOptions {
  cliType: string;
  sessionId: string;
  conversationId: string;
  onEvent?: (event: StreamEvent) => void;
  onError?: (error: string) => void;
}

export function useCliChat({
  cliType, sessionId, conversationId, onEvent, onError,
}: UseCliChatOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!cliType || !sessionId) return;

    const wsUrl = `ws://127.0.0.1:8765/api/chat/ws/${cliType}/${sessionId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => { setIsConnected(false); setIsStreaming(false); };
    ws.onerror = () => { setIsConnected(false); onError?.('WebSocket error'); };
    ws.onmessage = (event) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);
        if (data.type === 'start') setIsStreaming(true);
        if (data.type === 'finish') setIsStreaming(false);
        if (data.type === 'error') { setIsStreaming(false); onError?.(data.data); }
        onEvent?.(data);
      } catch (err) {
        console.error('[CliChat] Parse error:', err);
      }
    };

    wsRef.current = ws;
    return () => ws.close();
  }, [cliType, sessionId, onEvent, onError]);

  const sendMessage = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ message, conversation_id: conversationId }));
      return true;
    }
    return false;
  }, [conversationId]);

  return { isConnected, isStreaming, sendMessage };
}
