# FinanceAI Architecture

## Data Flow
CSV Upload → Parse rows → Chunk into transaction objects
→ Embed each chunk → Store vectors in session memory
→ User query → Embed query → Cosine similarity retrieval
→ Top K chunks → LLM prompt → Response

## Session Model
Each upload creates a new in-memory session object:
{
  sessionId: string,
  transactions: Transaction[],
  vectors: Float32Array[],
  createdAt: Date
}
Sessions are wiped after 1 hour of inactivity.

## MCP Tools Available
1. recategorize(filter, newCategory) — bulk update categories
2. flagAnomalies() — detect unusual spending vs rolling average
3. projectMonth(targetSavings) — suggest cuts to hit savings goal
4. summarizeCategory(category) — total + trend for one category

## LLM Abstraction
All LLM calls go through getLLMClient() in llm/client.ts.
Provider is selected via LLM_PROVIDER env var.
Both Groq and Ollama use OpenAI-compatible APIs.