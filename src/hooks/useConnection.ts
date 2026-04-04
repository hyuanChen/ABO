import { useState, useEffect, useRef, useCallback } from 'react';
import type { ConnectionState, ConnectionStatus } from '../types/chat';

export interface UseConnectionOptions {
  cliType: string;
  sessionId: string;
  onStateChange?: (state: ConnectionState, prevState: ConnectionState) => void;
  onMessage?: (data: unknown) => void;
  onError?: (error: string) => void;
  autoReconnect?: boolean;
}

export interface UseConnectionReturn {
  state: ConnectionState;
  status: ConnectionStatus | null;
  latency: number | null;
  connect: () => void;
  disconnect: () => void;
  send: (message: string, conversationId: string) => boolean;
  stop: () => void;
  fetchStatus: () => Promise<void>;
  isConnected: boolean;
  isStreaming: boolean;
  reconnectCount: number;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const PING_INTERVAL_MS = 15000;

export function useConnection({
  cliType,
  sessionId,
  onStateChange,
  onMessage,
  onError,
  autoReconnect = true,
}: UseConnectionOptions): UseConnectionReturn {
  const [state, setState] = useState<ConnectionState>('idle');
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<ConnectionState>('idle');

  // 更新状态并触发回调
  const updateState = useCallback((newState: ConnectionState) => {
    const prevState = stateRef.current;
    stateRef.current = newState;
    setState(newState);
    onStateChange?.(newState, prevState);
  }, [onStateChange]);

  // 连接 WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    updateState('connecting');

    const ws = new WebSocket(
      `ws://127.0.0.1:8765/api/chat/ws/${cliType}/${sessionId}`
    );

    ws.onopen = () => {
      updateState('connected');
      reconnectCountRef.current = 0;

      // 启动客户端心跳
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString(),
          }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onclose = () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      if (!autoReconnect || reconnectCountRef.current >= MAX_RECONNECT_ATTEMPTS) {
        updateState('disconnected');
        return;
      }

      // 自动重连
      updateState('reconnecting');
      reconnectCountRef.current++;

      // 指数退避: 2s, 4s, 6s
      const delay = 2000 * reconnectCountRef.current;
      setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      updateState('error');
      onError?.('WebSocket error');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type: string };

        switch (data.type) {
          case 'ping':
            // 响应服务器心跳
            ws.send(JSON.stringify({
              type: 'pong',
              timestamp: new Date().toISOString(),
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
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    wsRef.current = ws;
  }, [cliType, sessionId, autoReconnect, onMessage, onError, updateState]);

  // 断开连接
  const disconnect = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    wsRef.current?.close();
    updateState('disconnected');
  }, [updateState]);

  // 发送消息
  const send = useCallback((message: string, conversationId: string): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'message',
        content: message,
        conversation_id: conversationId,
      }));
      return true;
    }
    return false;
  }, []);

  // 停止生成
  const stop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
  }, []);

  // 获取状态
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `http://127.0.0.1:8765/api/chat/connections/${cliType}:${sessionId}/status`
      );
      if (res.ok) {
        const data = await res.json() as ConnectionStatus;
        setStatus(data);
        if (data.latencyMs) {
          setLatency(data.latencyMs);
        }
      }
    } catch (e) {
      console.error('Failed to fetch connection status:', e);
    }
  }, [cliType, sessionId]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    state,
    status,
    latency,
    connect,
    disconnect,
    send,
    stop,
    fetchStatus,
    isConnected: state === 'connected' || state === 'streaming',
    isStreaming: state === 'streaming',
    reconnectCount: reconnectCountRef.current,
  };
}
