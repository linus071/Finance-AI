#!/usr/bin/env node
// The MCP server. This is the whole "AI" integration.
//
// MCP (Model Context Protocol) in one paragraph: an MCP *server* (this file) exposes
// named tools with typed inputs. An MCP *client* (Claude Desktop, Cursor, VS Code,
// or a local-LLM client) launches this process, talks to it over stdin/stdout using
// JSON-RPC, shows the tools to its LLM, and runs a tool whenever the LLM asks.
// So we write no prompts, no chat loop, no "did the model leak JSON" cleanup.
// The client does all of that; we just provide correct tools.
//
// IMPORTANT: stdout is the protocol channel. Never console.log here; use console.error.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { defaultDbPath, openDb, openReadOnly } from './db.js';
import { importFile, previewFile } from './importers/index.js';
import { ColumnMappingSchema } from './importers/mapping.js';
import { addRule, applyRules, listRules } from './categorize/rules.js';
import { autoCategorize } from './categorize/embeddings.js';
import { CATEGORIES } from './categorize/categories.js';
import { findRecurring, listTransactions, overview, setCategory, spendingSummary } from './queries.js';

const dbPath = defaultDbPath();
const db = openDb(dbPath);

const server = new McpServer({ name: 'finance-mcp', version: '0.1.0' });

/** Wrap a plain result as MCP tool output; turn thrown errors into readable tool errors. */
async function respond(fn: () => unknown) {
  try {
    const value = await fn();
    return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
  } catch (err) {
    return { isError: true, content: [{ type: 'text' as const, text: (err as Error).message }] };
  }
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
const filters = {
  from: date.optional().describe('inclusive start date YYYY-MM-DD'),
  to: date.optional().describe('inclusive end date YYYY-MM-DD'),
  category: z.string().optional().describe('exact category name, or "uncategorized"'),
  search: z.string().optional().describe('text to find in merchant/description'),
  account: z.string().optional(),
};

// ---------------------------------------------------------------- overview
server.registerTool('overview', {
  title: 'Data overview',
  description: 'What data is loaded: transaction count, date range, accounts, categories in use, how many are uncategorized. Call this first to orient yourself.',
  annotations: { readOnlyHint: true },
}, () => respond(() => ({ database: dbPath, ...overview(db), today: new Date().toLocaleDateString('en-CA') /* local YYYY-MM-DD */ })));

// ---------------------------------------------------------------- importing
server.registerTool('preview_statement', {
  title: 'Preview a statement file',
  description: 'Inspect a bank CSV/OFX/QFX file WITHOUT importing: shows headers, sample rows, the detected column mapping, and how the first rows would be parsed. Use before import_statement for a bank you have not imported before, and fix the mapping if the parsed sample looks wrong.',
  inputSchema: { path: z.string().describe('absolute path to the file'), mapping: ColumnMappingSchema.optional() },
  annotations: { readOnlyHint: true },
}, ({ path, mapping }) => respond(() => previewFile(db, path, mapping)));

server.registerTool('import_statement', {
  title: 'Import a statement file',
  description: 'Import transactions from a bank CSV, OFX or QFX file into the local database. Safe to re-run: already-imported transactions are skipped. For CSVs the column mapping is auto-detected (or reused from a previous import of the same layout); pass `mapping` to override. Set dryRun to see counts without writing.',
  inputSchema: {
    path: z.string().describe('absolute path to the file'),
    mapping: ColumnMappingSchema.optional(),
    dryRun: z.boolean().default(false),
  },
}, ({ path, mapping, dryRun }) => respond(() => importFile(db, path, { mapping, dryRun })));

// ---------------------------------------------------------------- querying
server.registerTool('list_transactions', {
  title: 'List transactions',
  description: 'List individual transactions matching filters. Amounts are in dollars; negative = money out. `totalMatching` tells you if there are more than shown.',
  inputSchema: {
    ...filters,
    direction: z.enum(['out', 'in', 'all']).default('all'),
    sort: z.enum(['date', 'amount']).default('date').describe('"amount" = largest first'),
    limit: z.number().int().min(1).max(500).default(50),
  },
  annotations: { readOnlyHint: true },
}, (args) => respond(() => listTransactions(db, args)));

server.registerTool('spending_summary', {
  title: 'Spending summary',
  description: 'Exact totals grouped by category, merchant or month, with counts and % share. Defaults to money out (totals are negative). Use direction "in" for income. Use this for any "how much did I spend…" question instead of adding numbers yourself.',
  inputSchema: {
    ...filters,
    groupBy: z.enum(['category', 'merchant', 'month']),
    direction: z.enum(['out', 'in', 'all']).default('out'),
  },
  annotations: { readOnlyHint: true },
}, (args) => respond(() => spendingSummary(db, args)));

server.registerTool('find_recurring', {
  title: 'Find recurring charges',
  description: 'Find subscriptions and bills: merchants that charged you in several different months. `stableAmount` = roughly the same amount each time.',
  inputSchema: { minMonths: z.number().int().min(2).default(3) },
  annotations: { readOnlyHint: true },
}, ({ minMonths }) => respond(() => findRecurring(db, minMonths)));

server.registerTool('run_sql', {
  title: 'Run read-only SQL',
  description: `Escape hatch for questions the other tools can't answer. Runs a SELECT on a READ-ONLY connection (writes are impossible). Schema: transactions(id, date TEXT 'YYYY-MM-DD', amount_cents INTEGER negative=out, currency, description, merchant, category NULL=uncategorized, category_source, account, source_file). Remember amounts are CENTS. Max 500 rows.`,
  inputSchema: { sql: z.string() },
  annotations: { readOnlyHint: true },
}, ({ sql }) => respond(() => {
  if (!/^\s*(select|with)\b/i.test(sql)) throw new Error('Only SELECT / WITH queries are allowed.');
  const ro = openReadOnly(dbPath);
  try {
    const rows = ro.prepare(sql).all();
    return { rowCount: rows.length, rows: rows.slice(0, 500) };
  } finally {
    ro.close();
  }
}));

// ---------------------------------------------------------------- categorizing
server.registerTool('list_categories', {
  title: 'List categories and rules',
  description: 'The suggested category names and the merchant→category rules learned so far.',
  annotations: { readOnlyHint: true },
}, () => respond(() => ({ suggestedCategories: Object.keys(CATEGORIES), rules: listRules(db) })));

server.registerTool('set_category', {
  title: 'Set category',
  description: 'Categorize transactions by id, or every transaction whose merchant/description contains some text. With remember=true (and merchantContains), also saves a rule so future imports get this category automatically. Prefer names from list_categories.',
  inputSchema: {
    category: z.string(),
    ids: z.array(z.number().int()).optional(),
    merchantContains: z.string().optional(),
    remember: z.boolean().default(true),
  },
}, ({ category, ids, merchantContains, remember }) => respond(() => {
  const updated = setCategory(db, { ids, merchantContains, category });
  if (remember && merchantContains) addRule(db, merchantContains, category);
  return { updated, ruleSaved: Boolean(remember && merchantContains) };
}));

server.registerTool('auto_categorize', {
  title: 'Auto-categorize with local embeddings',
  description: 'Guess categories for uncategorized merchants using a LOCAL embedding model (Ollama). Compares each merchant to merchants already categorized and to category descriptions. With apply=false only shows suggestions. Low-confidence ones are left uncategorized for you to review via list_transactions(category="uncategorized").',
  inputSchema: {
    apply: z.boolean().default(false),
    minScore: z.number().min(0).max(1).default(0.7).describe('cosine similarity needed to apply'),
  },
}, ({ apply, minScore }) => respond(async () => {
  applyRules(db);
  return autoCategorize(db, { apply, minScore });
}));

// ---------------------------------------------------------------- start
await server.connect(new StdioServerTransport());
console.error(`finance-mcp running (db: ${dbPath})`);
