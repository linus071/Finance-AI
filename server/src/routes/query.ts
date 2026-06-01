// server/src/routes/query.ts
import type { Request, Response } from 'express';
import { getLLMClient, MODEL } from '../llm/client';
import { retrieveContext } from '../rag/retriever';

const SYSTEM_PROMPT = `You are a privacy-first personal finance assistant.
Answer the user's question using only the transaction context provided below.
If the context does not contain enough information, say so clearly.
Do not invent transactions or amounts. Be concise and specific.`;

export async function handleQuery(req: Request, res: Response): Promise<void> {
  const { sessionId, userQuery } = req.body as { sessionId?: string; userQuery?: string };

  if (!sessionId || !userQuery) {
    res.status(400).json({ error: 'sessionId and userQuery are required' });
    return;
  }

  try {
    // Call the isolated retriever module!
    const context = await retrieveContext(userQuery, sessionId, 20);

    const client = getLLMClient();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Transaction context:\n${context}\n\nUser question: ${userQuery.trim()}` },
      ],
      temperature: 0.2,
    });

    res.json({ answer: completion.choices[0]?.message?.content?.trim() ?? '' });
  } catch (error: any) {
    console.error("Query Error:", error);
    res.status(error.message === 'Session not found or expired' ? 404 : 500).json({ error: error.message });
  }
}