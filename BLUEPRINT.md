🗺️ The Big Picture: What is Finance AI?
Imagine you have a personal financial accountant named Alex.

Alex sits at a desk with a calculator. Every time you want to know something about your money, you hand Alex a printout of your bank statement (the CSV file). Alex looks at the paper, memorizes where everything is, and waits for your questions.

If you ask a question ("How much did I spend on coffee?"), Alex reads through the lines, calculates the total, and tells you.

If you give a command ("Fix all my Starbucks transactions to say 'Morning Cafe' instead of 'Food'"), Alex takes out a pen, updates the sheet, and remembers the change.

Finance AI is exactly that desk. Your code is Alex. The LLM (Groq or Ollama) is Alex’s brain, your Vector Store is Alex's memory, and the MCP tools are Alex's calculator and pen.

🛠️ The 3 Things the App Actually Does
When a user opens your web app, they only experience three phases:

Phase 1: The Upload & Memory Setup (The RAG Phase)
You drag and drop a raw bank CSV file (e.g., statements from TD, RBC, or Chase) into the React frontend.

The Node.js backend parses that text file row-by-row.

It takes each row—like 2026-05-14, UBER RIDE, $24.50, Transport—and turns it into a math vector (a string of numbers representing its meaning). It saves these vectors directly in the server's temporary RAM.

Phase 2: Natural Language Querying (The Retrieval Phase)
Instead of filtering columns in Excel or writing complex spreadsheet formulas, you just type like a human into a chat box:

"Did I overspend on takeout this week compared to last week?"

"Find that weird $15 charge I don't recognize."

The backend converts your question into a vector, finds the top 5 transactions that match the meaning of your question (Semantic Search), hands those rows to the LLM as context, and the LLM prints a beautifully formatted summary response in the chat.

Phase 3: Smart Execution (The MCP Tool Phase)
This is what makes your app unique. Instead of just answering questions, the AI can actually change things or run audits on command using Model Context Protocol (MCP) tools.

The User Says: "Hey, look through my statements. If you see anything unusual, flag it."

The Brain (LLM) Realizes: "Ah, the user wants an audit. I don't know how to calculate an audit myself, but I see a tool in my list called flagAnomalies."

The Action: The LLM stops talking, returns a instructions object saying "Run flagAnomalies", your backend code executes the written TypeScript function to calculate deviations, and the result is handed right back to the screen.

🔄 The Architecture Blueprint
Here is how data flows through the directories you just created when a user interacts with the app:
[ FRONTEND: React + Vite ] 
       │
       ▼ (User uploads CSV / types a query)
[ BACKEND: Express Router ] (routes/upload.ts & routes/query.ts)
       │
       ├──► [ RAG ENGINE ] (rag/vectorStore.ts)
       │    └─ Calculates similarity scores to pull relevant financial rows.
       │
       ├──► [ BRAIN CLIENT ] (llm/client.ts)
       │    └─ Standardizes the connection to Groq (Cloud) or Ollama (Local).
       │
       └──► [ AGENT ENGINE ] (mcp/executor.ts & mcp/tools.ts)
            └─ Decides if the user wants to trigger a calculation tool 
               (like bulk-recategorizing transactions) and executes it.

🏛️ The Two Pillars: Semantic vs. DeterministicIn a financial AI pipeline, your data is split into two layers:
Dimension | Vector Search (src/rag/) | MCP Tools (src/mcp/)
The Core Engine | Cosine Similarity / Embeddings | TypeScript Code / Pure Logic / SQL
What it Excels At 
| Semantic Meanings & IntentUnderstanding that "Chipotle" is food, "Uber" is transport, or matching loose terms like "eating out".
| Deterministic Arithmetic & ConstraintsFiltering exact date ranges, sorting by max/min amounts, calculating exact sums.
The Analogy | The Right Brain (Intuition, context, language patterns).| The Left Brain (Calculators, strict rules, database keys).