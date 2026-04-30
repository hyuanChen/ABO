import { useState, useEffect, useRef, useCallback } from 'react';
import type { ConnectionState, StreamEvent } from '../types/chat';
import { buildWsUrl } from '../core/api';

interface UseConnectionOptions {
  cliType: string;
  sessionId: string;
  onStateChange?: (state: ConnectionState, prevState: ConnectionState) => void;
  onMessage?: (data: StreamEvent) => void;
  onError?: (error: string) => void;
  autoReconnect?: boolean;
  enabled?: boolean;
}

export function useConnection({
  cliType,
  sessionId,
  onStateChange,
  onMessage,
  onError,
  autoReconnect = true,
  enabled = true
}: UseConnectionOptions) {
  const [state, setState] = useState<ConnectionState>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<ConnectionState>('idle');
  const lastPingTimeRef = useRef<number>(0);

  // Update state and trigger callback
  const updateState = useCallback((newState: ConnectionState) => {
    const prevState = stateRef.current;
    stateRef.current = newState;
    setState(newState);
    onStateChange?.(newState, prevState);
  }, [onStateChange]);

  // Connect WebSocket
  const connect = useCallback(() => {
    if (!enabled || !sessionId) {
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    updateState('connecting');

    const ws = new WebSocket(buildWsUrl(`/api/chat/ws/${cliType}/${sessionId}`));

    ws.onopen = () => {
      updateState('connected');
      reconnectCountRef.current = 0;

      // Start client heartbeat
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          lastPingTimeRef.current = Date.now();
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }));
        }
      }, 15000);
    };

    ws.onclose = () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }

      if (!autoReconnect || reconnectCountRef.current >= 3) {
        updateState('disconnected');
        return;
      }

      // Auto reconnect with exponential backoff
      updateState('reconnecting');
      reconnectCountRef.current++;

      setTimeout(() => {
        connect();
      }, 2000 * reconnectCountRef.current);
    };

    ws.onerror = () => {
      updateState('error');
      onError?.('WebSocket error');
    };

    ws.onmessage = (event) => {
      const data: StreamEvent = JSON.parse(event.data);

      switch (data.type) {
        case 'ping':
          // Respond to server heartbeat
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: data.timestamp
          }));
          break;

        case 'connected':
          updateState('connected');
          break;

        case 'reconnected':
          updateState('connected');
          break;

        case 'disconnected':
          updateState('disconnected');
          break;

        case 'start':
          updateState('streaming');
          onMessage?.(data);
          break;

        case 'finish':
        case 'error':
          updateState('connected');
          onMessage?.(data);
          break;

        default:
          onMessage?.(data);
      }
    };

    wsRef.current = ws;
  }, [cliType, sessionId, autoReconnect, onMessage, onError, updateState]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    wsRef.current?.close();
    updateState('disconnected');
  }, [updateState]);

  // Send message
  const send = useCallback((message: string, conversationId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'message',
        content: message,
        conversation_id: conversationId
      }));
      return true;
    }
    return false;
  }, []);

  // Stop generation
  const stop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    state,
    connect,
    disconnect,
    send,
    stop,
    isConnected: state === 'connected' || state === 'streaming',
    isStreaming: state === 'streaming',
    reconnectCount: reconnectCountRef.current
  };
}
