/** Typed HTTP client → http://127.0.0.1:8765 */

const BASE = "http://127.0.0.1:8765";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "DELETE",
      body: body ? JSON.stringify(body) : undefined,
    }),
};

// ── CLI Chat API ─────────────────────────────────────────────────

export interface CliConfig {
  id: string;
  name: string;
  version: string;
}

export interface Conversation {
  id: string;
  cli_type: string;
  session_id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export async function detectClis(): Promise<CliConfig[]> {
  return api.get<CliConfig[]>('/api/cli/detect');
}

export async function debugCli(cliType: string): Promise<unknown> {
  return api.get(`/api/cli/debug/${cliType}`);
}

export async function createConversation(
  cliType: string,
  title?: string
): Promise<Conversation> {
  return api.post<Conversation>('/api/chat/conversations', {
    cli_type: cliType,
    title,
  });
}

export async function listConversations(cliType?: string): Promise<Conversation[]> {
  const query = cliType ? `?cli_type=${cliType}` : '';
  return api.get<Conversation[]>(`/api/chat/conversations${query}`);
}

export async function getMessages(convId: string, limit = 100): Promise<Message[]> {
  const data = await api.get<{ messages: Message[] }>(
    `/api/chat/conversations/${convId}/messages?limit=${limit}`
  );
  return data.messages;
}

export async function deleteConversation(convId: string): Promise<{ success: boolean }> {
  return api.delete(`/api/chat/conversations/${convId}`);
}

export async function updateConversationTitle(
  convId: string,
  title: string
): Promise<{ success: boolean }> {
  return api.patch(`/api/chat/conversations/${convId}/title`, { title });
}
