import type { Request, Response } from 'express';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  createToolAwareChatCompletion,
  formatToolResultAsProse,
  sanitizeAssistantText,
} from '../llm/client';
import { executeMcpTool } from '../mcp/executor';
import { TOOL_SELECTION_SYSTEM_PROMPT } from '../mcp/tools';
import { retrieveContext } from '../rag/retriever';
import { sessionStore } from '../session';

/**
 * Query pipeline: native tool selection → deterministic MCP execution → prose formatting.
 * Raw tool-call JSON never leaves this handler as the user-facing answer.
 */
export async function handleQuery(req: Request, res: Response): Promise<void> {
  const { sessionId, userQuery } = req.body as { sessionId?: string; userQuery?: string };

  if (!sessionId || !userQuery) {
    res.status(400).json({ error: 'sessionId and userQuery are required' });
    return;
  }

  if (!sessionStore.get(sessionId)) {
    res.status(404).json({ error: `Active session context ${sessionId} not found.` });
    return;
  }

  try {
    console.log(`🔍 [HTTP API]: Fetching semantic RAG coordinates for session: ${sessionId}`);

    const vectorContext = await retrieveContext(userQuery, sessionId, 20);
    const trimmedQuery = userQuery.trim();

    const enrichedPrompt = [
      `[Semantic Transaction Context Matching User Request]:`,
      vectorContext || 'No exact keyword or vector matches found in statement history.',
      `--------------------------------`,
      `User Question: ${trimmedQuery}`,
    ].join('\n');

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: TOOL_SELECTION_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: enrichedPrompt,
      },
    ];

    // Call 1: native function calling (tools bound via API params)
    const decision = await createToolAwareChatCompletion({
      messages,
      temperature: 0.1,
      enableTools: true,
    });

    const decisionMessage = decision.choices[0]?.message;
    if (!decisionMessage) {
      res.status(500).json({ error: 'Empty model response' });
      return;
    }

    // --- Tool-call path (distinct from text) ---
    if (decisionMessage.tool_calls && decisionMessage.tool_calls.length > 0) {
      const toolCall = decisionMessage.tool_calls[0];
      const toolName =
        toolCall.type === 'function' ? toolCall.function.name : (toolCall as any).function?.name;
      const toolArgs =
        toolCall.type === 'function'
          ? toolCall.function.arguments
          : (toolCall as any).function?.arguments ?? '{}';

      console.log(`🛠️  [QUERY]: Tool call detected → "${toolName}" args=${toolArgs}`);

      // Execute deterministic TypeScript math — numbers/dates come only from here
      const toolResult = await executeMcpTool(sessionId, toolName, toolArgs);

      console.log(`📡 [QUERY]: Tool result ready; formatting prose around exact data...`);

      // Call 2: prose only — must not regenerate or alter computed values
      const prose = await formatToolResultAsProse({
        userQuestion: trimmedQuery,
        toolName,
        toolResult,
      });

      const answer = sanitizeAssistantText(prose);
      res.json({ answer });
      return;
    }

    // --- Plain text path ---
    const rawText = decisionMessage.content || '';
    const answer = sanitizeAssistantText(rawText);

    if (!answer) {
      res.status(500).json({
        error:
          'Model returned an invalid or empty text response (possible leaked tool-call payload).',
      });
      return;
    }

    res.json({ answer });
  } catch (error: any) {
    console.error('HTTP Query Endpoint Failure:', error);
    res.status(error.message?.includes('not found') ? 404 : 500).json({ error: error.message });
  }
}
