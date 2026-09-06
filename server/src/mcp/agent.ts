import {
  createToolAwareChatCompletion,
  formatToolResultAsProse,
  getActiveModelName,
  sanitizeAssistantText,
} from '../llm/client';
import { executeMcpTool } from './executor';
import { TOOL_SELECTION_SYSTEM_PROMPT } from './tools';
import { sessionStore } from '../session';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/**
 * Agent loop used by scripts/tests. HTTP chat uses the same pattern in routes/query.ts.
 * Tool execution is deterministic; a second LLM pass only writes prose around exact data.
 */
export async function processAgentQuery(sessionId: string, userPrompt: string): Promise<string> {
  const activeModel = getActiveModelName();
  const session = sessionStore.get(sessionId);
  if (!session) throw new Error(`Active session context ${sessionId} not found.`);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: TOOL_SELECTION_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: userPrompt,
    },
  ];

  console.log(`🧠 [AGENT BRAIN]: Routing query via model "${activeModel}" with native tools...`);

  const response = await createToolAwareChatCompletion({
    messages,
    temperature: 0.1,
    enableTools: true,
  });

  const responseMessage = response.choices[0].message;

  if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    const toolCall = responseMessage.tool_calls[0];
    const toolName =
      toolCall.type === 'function' ? toolCall.function.name : (toolCall as any).function?.name;
    const toolArgs =
      toolCall.type === 'function'
        ? toolCall.function.arguments
        : (toolCall as any).function?.arguments ?? '{}';

    console.log(`🛠️  [AGENT ENGINE]: Bob called the tool: "${toolName}" with args: ${toolArgs}`);

    try {
      const toolCalculationResult = await executeMcpTool(sessionId, toolName, toolArgs);

      console.log(`📡 [AGENT MATCH]: Formatting prose around exact tool data...`);

      const prose = await formatToolResultAsProse({
        userQuestion: userPrompt,
        toolName,
        toolResult: toolCalculationResult,
      });

      return sanitizeAssistantText(prose) || toolCalculationResult;
    } catch (executionError) {
      console.error(`❌ Tool execution failed inside agent stream:`, executionError);
      return `Failed executing calculation engine: ${executionError instanceof Error ? executionError.message : String(executionError)}`;
    }
  }

  const text = sanitizeAssistantText(responseMessage.content || '');
  if (!text) {
    return 'I could not produce a valid answer. Please rephrase your question.';
  }
  return text;
}
