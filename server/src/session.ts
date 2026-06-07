import crypto from 'crypto';
import { MemoryVectorStore } from './rag/vectorStore';

/** Parsed, enriched transaction row stored on a session. */
export interface Transaction {
  id: string;
  accountType: string;
  accountNumber: string;
  date: string;
  description1: string;
  description2: string;
  amountCad: number;
  amountUsd?: number;
  merchant?: string;
  category?: string;
}

/** In-memory session payload (see PROJECT.md). */
export interface SessionData {
  sessionId: string;
  transactions: Transaction[];
  vectorStore: MemoryVectorStore;
  createdAt: Date;
}

export const sessionStore = new Map<string, SessionData>();

export function createSession(): SessionData {
  const sessionId = crypto.randomUUID();
  const session: SessionData = {
    sessionId,
    transactions: [], // For exact math and tool execution
    vectorStore: new MemoryVectorStore(), // For semantic RAG searches
    createdAt: new Date(),
  };
  sessionStore.set(sessionId, session);
  return session;
}
