import { getLLMClient, getActiveModelName } from '../llm/client';
import { financialTools } from './tools';
import { executeMcpTool } from './executor';
import { sessionStore } from '../session';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

/**
 * Native Agent Coordinator Loop
 * Processes user queries, decides if an MCP tool calculation is required, 
 * executes the pure TypeScript math, and returns the final answer.
 */
export async function processAgentQuery(sessionId: string, userPrompt: string): Promise<string> {
  const llm = getLLMClient();
  const activeModel = getActiveModelName();
  const session = sessionStore.get(sessionId);
  if (!session) throw new Error(`Active session context ${sessionId} not found.`);

  // 1. Build the conversations payload array with financial context
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are Bob, a precise, expert financial AI accountant. 
You have access to a suite of specialized calculation tools to audit statements, flag anomalies, and handle month projections.
When a user requests a calculation, metric, projection, or modification, always call the appropriate tool rather than guessing the math yourself.
Current Date: 2026-02-12.`
    },
    {
      role: 'user',
      content: userPrompt
    }
  ];

  console.log(`🧠 [AGENT BRAIN]: Routing query via model "${activeModel}"...`);

  // 2. Initial LLM invocation with tool schemas attached
  const response = await llm.chat.completions.create({
    model: activeModel,
    messages: messages as any,
    tools: financialTools,
    tool_choice: 'auto',
    temperature: 0.1 // Low temperature ensures accurate tool selection
  });

  const responseMessage = response.choices[0].message;

  // 3. Check if Bob decided to use his calculator (Tool Call)
  if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    const toolCall = responseMessage.tool_calls[0];
    const toolName = (toolCall as any).function.name;
    const toolArgs = (toolCall as any).function.arguments;

    console.log(`🛠️  [AGENT ENGINE]: Bob called the tool: "${toolName}" with args: ${toolArgs}`);

    // Push the assistant's tool-call response to keep conversational history balanced
    messages.push({
      role: 'assistant',
      content: responseMessage.content || '',
      tool_calls: responseMessage.tool_calls
    } as any);

    try {
      // Direct execution via your verified Phase 1 math logic router
      const toolCalculationResult = await executeMcpTool(sessionId, toolName, toolArgs);

      // Feed the raw deterministic result back into the chat context history
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolName,
        content: toolCalculationResult
      });

      console.log(`📡 [AGENT MATCH]: Feeding calculation results back into LLM context pool...`);

      // 4. Final invocation so the LLM can synthesize the raw math into an eloquent answer
      const finalResponse = await llm.chat.completions.create({
        model: activeModel,
        messages: messages as any
      });

      return finalResponse.choices[0].message.content || 'Error generating final analysis.';
    } catch (executionError) {
      console.error(`❌ Tool execution failed inside agent stream:`, executionError);
      return `Failed executing calculation engine: ${executionError instanceof Error ? executionError.message : String(executionError)}`;
    }
  }

  // If no tool was needed, return the LLM's conversational answer directly
  return responseMessage.content || '';
}