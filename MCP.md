🧱 Part 1: The Simple Tool Breakdown
Think of your tools as specialized employees sitting at a desk. The AI agent is the manager who decides which employee to call based on what the user asks.

       [ User Query ]
             │
             ▼
     ┌───────────────┐
     │   AI Agent    │
     └───────┬───────┘
             │ (Decides which tool to call)
             ▼
 ┌────────────────────────────────────────────────────────┐
 │                      MCP EXECUTOR                      │
 ├───────────────┬────────────────┬───────────────┬───────┤
 │  Summarize    │  Recategorize  │ FlagAnomalies │Project│
 │   Category    │   (Find &      │  (The Alarm   │ Month │
 │ (Highlighter) │   Replace)     │     Bell)     │(Future)│
 └────────────────────────────────────────────────────────┘
summarizeCategory (The Highlighter)

What it does: It acts like a highlighter on an account statement. If you ask about "Food," it highlights every food line, counts them, adds up the total cost, figures out the average cost, and writes a short summary paragraph.

recategorize (The Find & Replace)

What it does: If you tell the AI "A&W isn't Groceries, it's Fast Food," this tool goes through your main Excel sheet (session.transactions) and switches the tag. Crucially, it also updates the AI's search engine database (vectorStore) and saves it to the hard drive so the AI doesn't get confused in future questions.

flagAnomalies (The Alarm Bell)

What it does: It looks for weird spending spikes. It takes all your purchase amounts, runs a statistical formula (Z-Score), and sounds an alarm if a purchase is in the extreme tail end (the highest 0.3%) of your normal spending habits.

projectMonth (The Future Predictor)

What it does: It looks at your spending speed (velocity). If you spent $500 by day 10 of a 30-day month, it calculates that you are spending $50/day and predicts you will finish the month having spent $1,500. It then warns you if that trajectory will cause you to miss your personal savings goal.