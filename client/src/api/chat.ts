import { apiFetch } from './client';

export interface ChatRequest {
  sessionId: string;
  userQuery: string;
}

export interface ChatResponse {
  answer: string;
}

export function sendChatMessage(payload: ChatRequest): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
