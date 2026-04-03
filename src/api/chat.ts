import type { CliConfig, Conversation, Message, StreamEvent } from '../types/chat';

const API_BASE = 'http://127.0.0.1:8765/api/chat';

// === CLI 检测 ===

export async function detectClis(force = false): Promise<CliConfig[]> {
  const res = await fetch(`${API_BASE}/cli/detect?force=${force}`);
  if (!res.ok) throw new Error('Failed to detect CLIs');
  return res.json();
}

export async function getCliInfo(cliId: string): Promise<CliConfig> {
  const res = await fetch(`${API_BASE}/cli/${cliId}`);
  if (!res.ok) throw new Error('CLI not found');
  return res.json();
}

// === 对话管理 ===

export async function createConversation(
  cliType: string,
  title?: string,
  workspace?: string
): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cli_type: cliType, title, workspace }),
  });
  if (!res.ok) throw new Error('Failed to create conversation');
  const data = await res.json();
  return {
    id: data.id,
    cliType: data.cli_type,
    sessionId: data.session_id,
    title: data.title,
    workspace: data.workspace || '',
    status: data.status || 'active',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function listConversations(cliType?: string): Promise<Conversation[]> {
  const url = cliType
    ? `${API_BASE}/conversations?cli_type=${cliType}`
    : `${API_BASE}/conversations`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to list conversations');
  const data = await res.json();
  return data.map((c: any) => ({
    id: c.id,
    cliType: c.cli_type,
    sessionId: c.session_id,
    title: c.title,
    workspace: c.workspace || '',
    status: c.status || 'active',
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }));
}

export async function getConversation(convId: string): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations/${convId}`);
  if (!res.ok) throw new Error('Conversation not found');
  const data = await res.json();
  return {
    id: data.id,
    cliType: data.cli_type,
    sessionId: data.session_id,
    title: data.title,
    workspace: data.workspace || '',
    status: data.status || 'active',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function deleteConversation(convId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${convId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete conversation');
}

export async function updateConversationTitle(convId: string, title: string): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${convId}/title`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error('Failed to update title');
}

// === 消息 ===

export async function getMessages(
  convId: string,
  limit = 100,
  beforeId?: string
): Promise<Message[]> {
  let url = `${API_BASE}/conversations/${convId}/messages?limit=${limit}`;
  if (beforeId) url += `&before_id=${beforeId}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to get messages');
  const data = await res.json();
  return data.map((m: any) => ({
    id: m.id,
    conversationId: convId,
    msgId: m.msg_id,
    role: m.role,
    content: m.content,
    contentType: m.content_type || 'text',
    status: m.status || 'completed',
    createdAt: m.created_at,
    metadata: m.metadata,
  }));
}

// === WebSocket ===

export interface ChatWebSocketOptions {
  cliType: string;
  sessionId: string;
  onEvent: (event: StreamEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export function createChatWebSocket({
  cliType,
  sessionId,
  onEvent,
  onConnect,
  onDisconnect,
  onError,
}: ChatWebSocketOptions): WebSocket {
  const ws = new WebSocket(`ws://127.0.0.1:8765/api/chat/ws/${cliType}/${sessionId}`);

  ws.onopen = () => onConnect?.();

  ws.onmessage = (event) => {
    try {
      const data: StreamEvent = JSON.parse(event.data);
      onEvent(data);
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  };

  ws.onclose = () => onDisconnect?.();
  ws.onerror = (error) => onError?.(error);

  return ws;
}
