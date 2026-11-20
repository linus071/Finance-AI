# How finance-mcp works

The codebase is about 1,200 lines, and each file does one job. Read it in this order.

```
statement.csv / .ofx
      │
      ▼
importers/      read file → detect columns → ParsedTransaction[]
      │                         (mapping.ts, csv.ts, ofx.ts)
      ▼
db.ts           SQLite: transactions, import_profiles, category_rules, embeddings
      │
      ├──► categorize/   rules.ts (exact)  →  embeddings.ts (fuzzy, local Ollama)
      │
      ▼
queries.ts      SQL for summaries, listing, recurring charges
      │
      ▼
server.ts       exposes all of the above as MCP tools  ◄──── Claude Desktop / Cursor / …
cli.ts          the same functions from a terminal
```

## Design decisions (and what changed from v0)

The first version (git tag `legacy-v0`) embedded every transaction and answered questions with cosine-similarity search plus an LLM. That doesn't work for this data, which is why it was rebuilt.

**1. Transactions are rows, so use SQL.** "How much did I spend on food in March?" needs *every* matching row summed. Vector search returns the *k most similar* rows, so any total built from it is wrong once you have more than k transactions. SQL is exact, instant and free.

**2. Embeddings do the fuzzy job: categorizing.** Deciding that "TST\* JAM CAFE" is Dining is a meaning problem, and that's where embeddings help. `categorize/embeddings.ts` is a small retrieval system:
- *Index:* merchants you've already categorized, plus one description per category (`categories.ts`).
- *Query:* an uncategorized merchant name.
- *Retrieve:* the most similar example by cosine similarity, applied only if it scores ≥ 0.7.
- *It learns:* every correction you make becomes a new example, so similar merchants get it right next time. Vectors are cached in SQLite, so nothing is embedded twice.

**3. Detect CSV columns with heuristics, not an LLM.** `importers/mapping.ts` scores each column: does it parse as dates? as money? what is its header called? does each row fill exactly one of two numeric columns (a debit/credit split)? It's deterministic and testable, and it doesn't send your data anywhere. When it guesses wrong, you pass an explicit mapping once and it's saved for that bank's header row.

**4. MCP instead of a chat app.** v0 contained its own chat loop, prompt templates, tool routing and about 80 lines of regex to catch the model's malformed tool calls. With MCP, the *client* (Claude Desktop and others) owns the model and the conversation. This server only declares typed tools (`zod` schemas) and returns JSON. Any MCP client works, and swapping models is the client's problem.

**5. Money is stored as integer cents.** `0.1 + 0.2 !== 0.3` in floating point. Storing cents as integers keeps sums exact. Values are converted to dollars only when shown.

**6. Imports are idempotent.** Each transaction gets a fingerprint: a hash of account, date, amount, description, and the number of identical rows seen so far in the file. Re-importing the same or an overlapping statement skips rows already stored, but two identical $5 coffees on the same day still count as two. OFX files include the bank's own unique id (`FITID`), which is used instead.

**7. `run_sql` is safe by construction.** It runs on a separate connection opened with `readOnly: true`, so SQLite itself rejects writes no matter what SQL the model sends.

## Adding support for a new bank

1. `npm run cli -- preview your-file.csv`
2. If the parsed sample looks right, import it. Done.
3. If not, add a **synthetic** copy of the layout (fake values, same columns) to `test/fixtures/`, add a test to `test/import.test.ts`, and adjust the heuristics in `mapping.ts`. Never commit real statements.

## Ideas for next steps

- PDF statements (extract tables, then reuse the same column mapping)
- Budgets: a `budgets` table and a `budget_status` tool
- Strip city/province suffixes in `normalizeMerchant` so "TIM HORTONS VANCOUVER BC" and "TIM HORTONS TORONTO ON" group together
- Package for `npx finance-mcp` and list it in MCP server directories
