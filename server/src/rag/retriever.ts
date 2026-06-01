// server/src/rag/retriever.ts
import { getEmbedding } from '../llm/client';
import { sessionStore } from '../session';

export function formatTransactionContext(hits: any[]): string {
  if (hits.length === 0) {
    return 'No relevant transactions were found for this session.';
  }

  return hits
    .map((hit, index) => {
      const { metadata } = hit.record;
      return [
        `[${index + 1}] ${metadata.context}`,
        `    Category: ${metadata.category} | Amount: $${metadata.amount} CAD | Date: ${metadata.date}`,
      ].join('\n');
    })
    .join('\n\n');
}

/**
 * Pure retrieval function usable by API routes OR MCP tools
 */
export async function retrieveContext(userQuery: string, sessionId: string, topK = 20): Promise<string> {
  const session = sessionStore.get(sessionId);
  if (!session) {
    throw new Error('Session not found or expired');
  }

  // 1. Vectorize the user's intent
  const queryVector = await getEmbedding(userQuery.trim());
  
  // 2. Query the session's isolated vector store
  const hits = session.vectorStore.similaritySearch(queryVector, topK);
  
  // 3. Return the formatted text block
  return formatTransactionContext(hits);
}