// server/src/mcp/tools.ts
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const financialTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'recategorize',
      description: 'Bulk updates categories for transactions matching a specific merchant or keyword filter.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: 'The merchant name or keyword to look for (e.g., "A&W").' },
          newCategory: { type: 'string', description: 'The new category assignment (e.g., "Food & Dining").' },
        },
        required: ['filter', 'newCategory'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'flagAnomalies',
      description: 'Analyzes session transactions to detect unusual spending spikes compared to historical patterns.',
      parameters: {
        type: 'object',
        properties: {}, // No args needed, it scans the whole active session
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'projectMonth',
      description: 'Calculates spending velocity and suggests optimization strategies to hit a target savings goal.',
      parameters: {
        type: 'object',
        properties: {
          targetSavings: { type: 'number', description: 'The desired savings threshold in CAD.' },
        },
        required: ['targetSavings'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarizeCategory',
      description: 'Aggregates totals, transaction counts, and general volume trajectory for a single specified category.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'The exact target category to summarize.' },
        },
        required: ['category'],
      },
    },
  }
];