export type CliType = 'claude' | 'gemini' | 'openclaw' | 'custom';

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
  status: 'active' | 'closed' | 'error';
  createdAt: number;
  updatedAt: number;
}

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'streaming' | 'completed' | 'error';

export interface Message {
  id: string;
  conversationId: string;
  msgId?: string;
  role: MessageRole;
  content: string;
  contentType: 'text' | 'tool_call' | 'error';
  metadata?: {
    toolName?: string;
    toolInput?: Record<string, unknown>;
    tokens?: number;
  };
  status: MessageStatus;
  createdAt: number;
}

export interface StreamEvent {
  type: 'start' | 'content' | 'tool_call' | 'error' | 'finish';
  data: string;
  msgId: string;
  metadata?: Record<string, unknown>;
}
