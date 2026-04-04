import type { CliConfig, Conversation, Message, StreamEvent } from '../types/chat';

const API_BASE = 'http://127.0.0.1:8765/api/chat';

// === CLI Detection ===

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

// === Conversation Management ===

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
  return res.json();
}

export async function listConversations(cliType?: string): Promise<Conversation[]> {
  const url = cliType
    ? `${API_BASE}/conversations?cli_type=${cliType}`
    : `${API_BASE}/conversations`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to list conversations');
  return res.json();
}

export async function getConversation(convId: string): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations/${convId}`);
  if (!res.ok) throw new Error('Conversation not found');
  return res.json();
}

export async function deleteConversation(convId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${convId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete conversation');
}

export async function updateConversationTitle(convId: string, title: string): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${convId}/title?title=${encodeURIComponent(title)}`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error('Failed to update title');
}

// === Messages ===

export async function getMessages(
  convId: string,
  limit = 100,
  beforeId?: string
): Promise<Message[]> {
  let url = `${API_BASE}/conversations/${convId}/messages?limit=${limit}`;
  if (beforeId) url += `&before_id=${beforeId}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to get messages');
  return res.json();
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
