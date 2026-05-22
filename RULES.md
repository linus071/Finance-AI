# Cursor Rules for FinanceAI

## Project Overview
A privacy-first personal finance analyst. Users upload 
bank CSV exports. The app parses transactions, builds 
an in-memory vector store per session, and lets users 
query their data via natural language using RAG + MCP tools.

## Stack
- Frontend: React + Vite + TypeScript (deploy: Vercel)
- Backend: Node.js + Express + TypeScript (deploy: Render)
- LLM: Groq API in production, Ollama locally
- Vector store: In-memory cosine similarity (no external DB)
- No persistent database — all data lives in session memory

## Hard Rules
- Never use a database or persistent storage for transaction data
- Never log or store CSV contents anywhere
- Always use TypeScript, never plain JavaScript
- Keep the LLM client abstracted in server/src/llm/client.ts
- Never call Groq or Ollama directly from routes — always 
  go through the llm/client.ts abstraction
- MCP tools must be defined as pure functions in mcp/tools.ts
  and only executed through mcp/executor.ts
- Do not modify files in rag/ or mcp/ unless I explicitly ask

## Environment Variables
GROQ_API_KEY=        # Groq cloud API key
OLLAMA_BASE_URL=     # http://localhost:11434 for local
LLM_PROVIDER=        # "groq" or "ollama"

## What Cursor Should NOT do
- Do not suggest adding a database
- Do not suggest storing embeddings to disk
- Do not use any paid APIs beyond Groq free tier
- Do not add authentication — out of scope