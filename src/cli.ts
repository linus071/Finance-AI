#!/usr/bin/env node
// Command-line access to the same functions the MCP server uses.
// Handy for importing, and for checking results without any AI involved.

import { parseArgs } from 'node:util';
import { defaultDbPath, openDb } from './db.js';
import { importFile, previewFile } from './importers/index.js';
import { autoCategorize } from './categorize/embeddings.js';
import { applyRules } from './categorize/rules.js';
import { findRecurring, listTransactions, overview, spendingSummary } from './queries.js';

const HELP = `finance-mcp: local bank statement database

Usage:
  finance-mcp serve                          start the MCP server (stdio)
  finance-mcp preview <file>                 show detected columns, import nothing
  finance-mcp import <file> [--dry-run]      import a CSV / OFX / QFX statement
  finance-mcp overview
  finance-mcp summary [--by category|merchant|month] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
  finance-mcp list [--category X] [--search X] [--limit N]
  finance-mcp recurring
  finance-mcp categorize [--apply]           suggest categories with local embeddings (Ollama)

Database: ${defaultDbPath()}  (set FINANCE_DB to change)`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    'dry-run': { type: 'boolean' },
    apply: { type: 'boolean' },
    by: { type: 'string', default: 'category' },
    from: { type: 'string' },
    to: { type: 'string' },
    category: { type: 'string' },
    search: { type: 'string' },
    limit: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

const [command, file] = positionals;
const print = (v: unknown) => console.log(JSON.stringify(v, null, 2));

if (!command || values.help) {
  console.log(HELP);
} else if (command === 'serve') {
  await import('./server.js');
} else {
  const db = openDb();
  switch (command) {
    case 'preview':
      if (!file) throw new Error('preview needs a file path');
      print(previewFile(db, file));
      break;
    case 'import':
      if (!file) throw new Error('import needs a file path');
      print(importFile(db, file, { dryRun: values['dry-run'] }));
      break;
    case 'overview':
      print(overview(db));
      break;
    case 'summary':
      print(spendingSummary(db, {
        groupBy: values.by as 'category' | 'merchant' | 'month',
        from: values.from,
        to: values.to,
      }));
      break;
    case 'list':
      print(listTransactions(db, {
        category: values.category,
        search: values.search,
        limit: values.limit ? Number(values.limit) : 20,
      }));
      break;
    case 'recurring':
      print(findRecurring(db));
      break;
    case 'categorize': {
      applyRules(db);
      const { suggestions, applied } = await autoCategorize(db, { apply: Boolean(values.apply) });
      for (const s of suggestions) {
        console.log(`${(s.category ?? '(unsure)').padEnd(18)} ${s.score.toFixed(3)}  ${s.merchant}   ← ${s.basis}`);
      }
      console.log(values.apply ? `\nApplied to ${applied} transactions.` : '\nDry run. Add --apply to save.');
      break;
    }
    default:
      console.log(HELP);
      process.exitCode = 1;
  }
}
