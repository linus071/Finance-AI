import { apiFetch } from './client';

export interface SessionInitResponse {
  sessionId: string;
}

export function initSession(): Promise<SessionInitResponse> {
  return apiFetch<SessionInitResponse>('/session/init');
}
