// server/src/mcp/tools.ts
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import type { Transaction } from '../session';

export type SpendingStatsFilter = {
  category?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type SpendingStatsResult = {
  total: number;
  average: number;
  transactionCount: number;
  maxTransaction: Transaction;
  minTransaction: Transaction;
};

function parseTransactionDate(dateStr: string): number {
  const isoParts = dateStr.split('-');
  if (isoParts.length === 3 && isoParts[0].length === 4) {
    return new Date(
      parseInt(isoParts[0], 10),
      parseInt(isoParts[1], 10) - 1,
      parseInt(isoParts[2], 10),
    ).getTime();
  }
  const slashParts = dateStr.split('/');
  if (slashParts.length === 3) {
    // M/D/YYYY (common bank export)
    return new Date(
      parseInt(slashParts[2], 10),
      parseInt(slashParts[0], 10) - 1,
      parseInt(slashParts[1], 10),
    ).getTime();
  }
  return new Date(dateStr).getTime();
}

function applySpendingStatsFilter(
  transactions: Transaction[],
  filter?: SpendingStatsFilter,
): Transaction[] {
  if (!filter) return transactions;

  return transactions.filter((t) => {
    if (filter.category) {
      const cat = t.category?.toLowerCase() ?? '';
      if (!cat.includes(filter.category.toLowerCase())) return false;
    }

    if (filter.dateFrom || filter.dateTo) {
      const ts = parseTransactionDate(t.date);
      if (Number.isNaN(ts)) return false;
      if (filter.dateFrom) {
        const from = parseTransactionDate(filter.dateFrom);
        if (!Number.isNaN(from) && ts < from) return false;
      }
      if (filter.dateTo) {
        const to = parseTransactionDate(filter.dateTo);
        if (!Number.isNaN(to) && ts > to) return false;
      }
    }

    return true;
  });
}

/**
 * Pure aggregate stats over a transaction list (optional category / date filters).
 * maxTransaction / minTransaction are by amountCad (algebraic max/min).
 */
export function getSpendingStats(
  transactions: Transaction[],
  filter?: SpendingStatsFilter,
): SpendingStatsResult | null {
  const subset = applySpendingStatsFilter(transactions, filter);
  if (subset.length === 0) return null;

  const total = subset.reduce((sum, t) => sum + t.amountCad, 0);
  const transactionCount = subset.length;
  const average = total / transactionCount;

  let maxTransaction = subset[0];
  let minTransaction = subset[0];

  for (const t of subset) {
    if (t.amountCad > maxTransaction.amountCad) maxTransaction = t;
    if (t.amountCad < minTransaction.amountCad) minTransaction = t;
  }

  return {
    total,
    average,
    transactionCount,
    maxTransaction,
    minTransaction,
  };
}

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
      description:
        'Aggregates totals, transaction counts, and average amount for a category. If category is omitted, summarizes across all transactions in the session.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description:
              'Optional category keyword to summarize (e.g., "Food & Dining"). Omit to summarize the entire ledger.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getSpendingStats',
      description:
        'Computes general aggregate spending stats (total, average, count, max/min transactions) over the session ledger. Optionally filter by category and/or date range. Use for highest/lowest/average/total questions — not for anomaly detection.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Optional category keyword filter (e.g., "Food & Dining"). Omit for all categories.',
          },
          dateFrom: {
            type: 'string',
            description: 'Optional inclusive start date (YYYY-MM-DD or M/D/YYYY).',
          },
          dateTo: {
            type: 'string',
            description: 'Optional inclusive end date (YYYY-MM-DD or M/D/YYYY).',
          },
        },
        required: [],
      },
    },
  },
];

/** Shared system prompt for tool-selection LLM calls (query route + agent). */
export const TOOL_SELECTION_SYSTEM_PROMPT = `You are Bob, a precise, expert financial AI accountant.
Use the provided function-calling tools for calculations, metrics, projections, anomaly checks, or category modifications.
Never invent tool names. Never write tool-call JSON in your reply text — the API handles tool selection.

Tool selection rules:
- For general aggregate questions (highest, lowest, average, total spent / overall stats), prefer getSpendingStats. Do NOT use flagAnomalies for "highest spending" (anomaly ≠ maximum). Do NOT guess a category just to call summarizeCategory.
- Use summarizeCategory when the user asks about a specific category summary (category is optional — omit it only when summarizing the whole ledger via that tool).
- Use flagAnomalies only for unusual/spike/outlier detection relative to historical patterns.
- Use projectMonth for savings goals and end-of-month projections.
- Use recategorize only when the user wants to change category labels.

If no tool truly fits: do not invent required parameter values. Answer from the retrieved transaction context, or briefly say what is not currently supported.
Current Date: 2026-02-12.`;
