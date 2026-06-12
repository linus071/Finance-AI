import { ApiError } from './client';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api';

export interface UploadResponse {
  success: boolean;
  recordsProcessed: number;
}

export async function uploadStatement(
  sessionId: string,
  file: File,
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('sessionId', sessionId);
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    let message = `Upload failed with status ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data?.error === 'string') message = data.error;
    } catch {
      // keep default
    }
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<UploadResponse>;
}
