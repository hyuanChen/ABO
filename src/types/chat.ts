export type CliType = 'codex' | 'claude' | 'gemini' | 'openclaw' | 'custom';

export interface CliConfig {
  id: CliType;
  name: string;
  command: string;
  version?: string;
  isAvailable: boolean;
  protocol: 'raw' | 'acp' | 'websocket';
}

export interface Conversation {
  id: string;
  cliType: CliType;
  sessionId: string;
  title: string;
  workspace: string;
  origin?: string;
  status: 'active' | 'closed' | 'error';
  createdAt: number;
  updatedAt: number;
}

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'streaming' | 'completed' | 'error' | 'cancelled';

export interface Message {
  id: string;
  conversationId: string;
  msgId?: string;
  role: MessageRole;
  content: string;
  contentType: 'text' | 'tool_call' | 'thinking' | 'agent_status' | 'error';
  metadata?: {
    toolName?: string;
    command?: string;
    phase?: string;
    label?: string;
    detail?: string;
    toolInput?: Record<string, unknown>;
    tokens?: number;
    [key: string]: unknown;
  };
  status: MessageStatus;
  createdAt: number;
}

export interface ChatRunStatus {
  phase: string;
  label: string;
  detail?: string;
  elapsedSeconds: number;
  conversationId?: string;
  cliType?: string;
  updatedAt: number;
}

export interface StreamEvent {
  type: 'start' | 'status' | 'content' | 'thinking' | 'thought' | 'tool_call' | 'error' | 'finish' | 'stopped' | 'ping' | 'pong' | 'connected' | 'disconnected' | 'reconnected';
  data: string;
  msgId: string;
  metadata?: Record<string, unknown>;
  conversationId?: string;
  timestamp?: string;
  attempt?: number;
  reason?: string;
}

export interface ChatRuntimeState {
  conversationId: string;
  hasRuntime: boolean;
  busy: boolean;
  lastActiveAt?: number | null;
  resumeSessionId?: string | null;
  cliType?: string | null;
}

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'streaming'
  | 'disconnected'
  | 'error'
  | 'reconnecting';
