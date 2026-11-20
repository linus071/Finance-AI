# finance-mcp

**Ask an AI about your bank statements without uploading them anywhere.**

`finance-mcp` is a local [Model Context Protocol](https://modelcontextprotocol.io) server. It imports bank statements (CSV, OFX, QFX) from almost any bank into a SQLite file on your own computer. AI assistants such as Claude Desktop, Cursor or VS Code can then answer questions about your spending with exact numbers from SQL, not guesses.

```
You: How much did I spend on dining each month this year, and what are my subscriptions?
AI:  → spending_summary(groupBy: "month", category: "Dining")
     → find_recurring()
     January $412.80, February $388.15 … You have 4 recurring charges: …
```

## Why

- **Your data stays local.** Transactions live in `~/.finance-mcp/finance.db`. Categorizing uses a local embedding model (Ollama). Nothing is sent to a server by this project.
- **Exact numbers.** Totals come from SQL, so the AI only picks the query and explains the result.
- **Works with any bank.** Column layouts are detected automatically: one amount column or separate debit/credit, with or without a header row, day-first or month-first dates, and credit-card sign conventions. Once a layout is imported, it's remembered.
- **Safe to re-import.** Overlapping statements don't create duplicates.

> **Privacy note:** the *server* keeps everything local. The AI you connect it to sees whatever the tools return. With a cloud model like Claude, that includes the transactions it asks about. For a fully offline setup, use an MCP client that runs a local model through Ollama.

## Setup

Requires **Node.js 22.13+**. For auto-categorization, also install [Ollama](https://ollama.com) and run `ollama pull nomic-embed-text`.

```bash
git clone https://github.com/linus071/Finance-AI.git finance-mcp
cd finance-mcp
npm install
npm run build
```

### Import a statement

```bash
node dist/cli.js preview ~/Downloads/statement.csv   # check the detected columns first
node dist/cli.js import  ~/Downloads/statement.csv
node dist/cli.js categorize            # preview category guesses
node dist/cli.js categorize --apply    # save the confident ones
node dist/cli.js summary --by category
```

You can also ask the AI to do the import: *"import C:\Users\me\Downloads\statement.csv"*.

### Connect to Claude Desktop

Add the following to `claude_desktop_config.json` (Settings → Developer → Edit Config), using your own path:

```json
{
  "mcpServers": {
    "finance": {
      "command": "node",
      "args": ["--disable-warning=ExperimentalWarning", "C:/path/to/finance-mcp/dist/server.js"]
    }
  }
}
```

Restart Claude Desktop, then ask *"What does my finance data look like?"*. Other MCP clients (Cursor, VS Code, Claude Code) take the same command and args.

## Tools

| Tool | What it does |
|---|---|
| `overview` | Transaction count, date range and categorization status |
| `preview_statement` | Shows how a file would be read, without importing |
| `import_statement` | Imports a CSV/OFX/QFX file (skips duplicates) |
| `list_transactions` | Filter by date, category, text or direction |
| `spending_summary` | Exact totals by category, merchant or month |
| `find_recurring` | Subscriptions and bills |
| `set_category` | Fix categories and learn rules for future imports |
| `auto_categorize` | Local-embedding category guesses |
| `list_categories` | Suggested categories and learned rules |
| `run_sql` | Read-only SQL for anything else |

## Development

```bash
npm test          # unit tests (synthetic statements in test/fixtures)
npm run smoke     # starts the MCP server and calls tools like a real client
npm run cli -- overview
```

`FINANCE_DB=/some/other.db` points everything at a different database, which is handy for experiments.

How it works, and why it's built this way: [ARCHITECTURE.md](ARCHITECTURE.md).

## License

MIT
