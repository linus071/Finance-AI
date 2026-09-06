import OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { financialTools } from '../mcp/tools';

// Centralized configuration
const EMBEDDING_CONFIG = {
  groq: { 
    model: process.env.HF_EMBED_MODEL || 'BAAI/bge-small-en-v1.5',
    dim: 384 
  },
  ollama: { 
    model: 'nomic-embed-text', 
    dim: 768 
  }
};

export const getChatClient = () => {
  const provider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
  
  // Use a shared config for Ollama to avoid redundant client creation
  return new OpenAI({
    apiKey: provider === 'groq' ? process.env.GROQ_API_KEY : 'ollama',
    baseURL: provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'http://localhost:11434/v1',
  });
};

export const getEmbedding = async (text: string): Promise<number[]> => {
  const provider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
  const config = EMBEDDING_CONFIG[provider as keyof typeof EMBEDDING_CONFIG];

  let embedding: number[];

  if (provider === 'groq') {
    const response = await fetch(`https://router.huggingface.co/hf-inference/models/${config.model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.HF_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: text }),
    });
    const data = await response.json();
    embedding = Array.isArray(data[0]) ? data[0] : data;
  } else {
    const response = await fetch(`http://localhost:11434/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.model, prompt: text }),
    });
    const data = await response.json();
    embedding = data.embedding;
  }

  // VALIDATION: This prevents the dimension mismatch error
  if (embedding.length !== config.dim) {
    console.warn(`⚠️ Dimension Mismatch: Expected ${config.dim}, got ${embedding.length}`);
  }

  return embedding;
};

export const getLLMClient = getChatClient;

export const getActiveModelName = (): string => {
  const provider = (process.env.LLM_PROVIDER || 'groq').trim().toLowerCase();
  return provider === 'groq' ? 'llama-3.1-8b-instant' : 'llama3.2';
};

export type ToolAwareChatOptions = {
  messages: ChatCompletionMessageParam[];
  temperature?: number;
  /**
   * When true (default), attaches MCP `financialTools` via the OpenAI-compatible
   * `tools` + `tool_choice` API params so the model can only select real tools.
   * When false, runs a plain completion (e.g. prose formatting after tool results).
   */
  enableTools?: boolean;
};

/**
 * OpenAI-compatible chat completion that optionally binds MCP tool schemas
 * as native function-calling tools (not prompt text / JSON instructions).
 */
export async function createToolAwareChatCompletion(
  options: ToolAwareChatOptions,
): Promise<ChatCompletion> {
  const client = getChatClient();
  const enableTools = options.enableTools !== false;

  const params: ChatCompletionCreateParamsNonStreaming = {
    model: getActiveModelName(),
    messages: options.messages,
    temperature: options.temperature ?? 0.1,
  };

  if (enableTools) {
    params.tools = financialTools;
    params.tool_choice = 'auto';
  }

  return client.chat.completions.create(params);
}

/**
 * Second-pass LLM call: wrap exact tool output in short prose.
 * Must not invent or alter numbers, dates, or IDs from `toolResult`.
 */
export async function formatToolResultAsProse(options: {
  userQuestion: string;
  toolName: string;
  toolResult: string;
}): Promise<string> {
  const { userQuestion, toolName, toolResult } = options;

  const completion = await createToolAwareChatCompletion({
    enableTools: false,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: `You are Bob, a financial assistant.
Your ONLY job is to write 2–3 clear sentences of prose for the user based on the EXACT tool data provided.
Rules:
- Do not alter any numbers, dates, or IDs from the provided data.
- Do not recompute totals, averages, z-scores, or projections.
- Do not invent transactions, merchants, or anomalies that are not in the data.
- Do not output JSON, tool names, or function-call syntax.
- You may briefly explain what the numbers mean, but every figure must match the data verbatim.`,
      },
      {
        role: 'user',
        content: [
          `User question: ${userQuestion}`,
          `Tool used: ${toolName}`,
          `Exact tool data (verbatim — do not alter numbers, dates, or IDs):`,
          toolResult,
        ].join('\n\n'),
      },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() || toolResult;
}

/**
 * Safeguard: never let raw tool-call JSON / hallucinated function payloads reach the client.
 * Returns empty string when the entire content is a leaked tool payload (caller should reject).
 */
export function sanitizeAssistantText(text: string): string {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';

  // Entire message looks like a tool-call / function JSON object
  if (looksLikeToolCallPayload(trimmed)) {
    console.warn('⚠️ [SAFEGUARD]: Rejected assistant text that looks like a raw tool-call payload.');
    return '';
  }

  // Strip fenced or inline JSON blobs that resemble tool calls
  let cleaned = trimmed.replace(/```(?:json)?\s*[\s\S]*?```/gi, (block) => {
    const inner = block.replace(/```(?:json)?/i, '').replace(/```$/, '').trim();
    return looksLikeToolCallPayload(inner) ? '' : block;
  });

  cleaned = cleaned.replace(/\{[\s\S]*?\}/g, (obj) => {
    return looksLikeToolCallPayload(obj) ? '' : obj;
  });

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  if (looksLikeToolCallPayload(cleaned)) {
    console.warn('⚠️ [SAFEGUARD]: Rejected cleaned assistant text still resembling a tool call.');
    return '';
  }

  return cleaned;
}

function looksLikeToolCallPayload(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) {
    // Hallucinated bare tool invocation patterns
    if (/^\s*(function\s+call|tool_call|call\s+\w+)\s*[:{\[]/i.test(t)) return true;
    if (/^\s*\{\s*"name"\s*:\s*"(recategorize|flagAnomalies|projectMonth|summarizeCategory|getSpendingStats)"/i.test(t)) {
      return true;
    }
    return false;
  }

  try {
    const parsed = JSON.parse(t);
    if (Array.isArray(parsed)) {
      return parsed.some((item) => isToolShapedObject(item));
    }
    return isToolShapedObject(parsed);
  } catch {
    // Incomplete / messy JSON — still catch common tool-call keys
    return (
      /"tool_calls"\s*:/.test(t) ||
      /"function"\s*:\s*\{/.test(t) ||
      (/"name"\s*:\s*"(recategorize|flagAnomalies|projectMonth|summarizeCategory|getSpendingStats)"/.test(t) &&
        /"arguments"\s*:/.test(t))
    );
  }
}

function isToolShapedObject(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;

  if (Array.isArray(obj.tool_calls)) return true;
  if (obj.type === 'function' && obj.function) return true;

  if (typeof obj.name === 'string' && 'arguments' in obj) {
    const known = ['recategorize', 'flagAnomalies', 'projectMonth', 'summarizeCategory', 'getSpendingStats'];
    if (known.includes(obj.name)) return true;
  }

  const fn = obj.function;
  if (fn && typeof fn === 'object') {
    const f = fn as Record<string, unknown>;
    if (typeof f.name === 'string' && ('arguments' in f || 'parameters' in f)) return true;
  }

  return false;
}