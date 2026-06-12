import type { Request, Response } from 'express';
import { retrieveContext } from '../rag/retriever';
import { processAgentQuery } from '../mcp/agent';

export async function handleQuery(req: Request, res: Response): Promise<void> {
  const { sessionId, userQuery } = req.body as { sessionId?: string; userQuery?: string };

  if (!sessionId || !userQuery) {
    res.status(400).json({ error: 'sessionId and userQuery are required' });
    return;
  }

  try {
    console.log(`🔍 [HTTP API]: Fetching semantic RAG coordinates for session: ${sessionId}`);
    
    // 1. Pull semantic records from your vector storage matches
    const vectorContext = await retrieveContext(userQuery, sessionId, 20);

    // 2. Package the context cleanly for the agent prompt window
    const enrichedPrompt = [
      `[Semantic Transaction Context Matching User Request]:`,
      vectorContext || "No exact keyword or vector matches found in statement history.",
      `--------------------------------`,
      `User Question: ${userQuery.trim()}`
    ].join('\n');

    // 3. Delegate execution directly to your verified Agent pipeline
    const bobAnswer = await processAgentQuery(sessionId, enrichedPrompt);

    res.json({ answer: bobAnswer });
  } catch (error: any) {
    console.error("HTTP Query Endpoint Failure:", error);
    res.status(error.message?.includes('not found') ? 404 : 500).json({ error: error.message });
  }
}