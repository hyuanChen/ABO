import { useEffect, useState, useCallback } from 'react';
import { useConnection } from './useConnection';
import type { ConnectionState, ConnectionStatus } from '../types/chat';

export interface UseConnectionRecoveryReturn {
  isRecovering: boolean;
  state: ConnectionState;
  status: ConnectionStatus | null;
  connect: () => void;
  retry: () => Promise<void>;
}

export function useConnectionRecovery(
  conversationId: string,
  cliType: string
): UseConnectionRecoveryReturn {
  const [isRecovering, setIsRecovering] = useState(true);

  const {
    state,
    connect,
    status,
    fetchStatus,
  } = useConnection({
    cliType,
    sessionId: conversationId,
    autoReconnect: true,
  });

  // 恢复连接逻辑
  const recoverConnection = useCallback(async () => {
    setIsRecovering(true);

    try {
      // 1. 查询后端是否有活跃连接
      await fetchStatus();

      // 2. 如果有连接，尝试重新连接
      if (status?.isAlive) {
        connect();
      }
    } catch (e) {
      console.error('Failed to recover connection:', e);
    } finally {
      setIsRecovering(false);
    }
  }, [fetchStatus, status?.isAlive, connect]);

  // 页面加载时尝试恢复连接
  useEffect(() => {
    recoverConnection();
  }, []);

  // 手动重试恢复
  const retry = useCallback(async () => {
    await recoverConnection();
  }, [recoverConnection]);

  return {
    isRecovering,
    state,
    status,
    connect,
    retry,
  };
}
