// Talks to the MCP server exactly like Claude Desktop would: spawn it, list tools, call some.
// Usage: npx tsx scripts/smoke-mcp.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--disable-warning=ExperimentalWarning', '--import', 'tsx', 'src/server.ts'],
  env: { ...process.env } as Record<string, string>,
});
const client = new Client({ name: 'smoke-test', version: '0.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log('tools:', tools.map((t) => t.name).join(', '));

for (const [name, args] of [
  ['overview', {}],
  ['spending_summary', { groupBy: 'month' }],
  ['run_sql', { sql: 'SELECT COUNT(*) AS n FROM transactions' }],
  ['run_sql', { sql: 'DELETE FROM transactions' }],
] as const) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[])[0]!.text;
  console.log(`\n${name} ${JSON.stringify(args)}${res.isError ? '  [error, as expected?]' : ''}\n${text.slice(0, 400)}`);
}
await client.close();
