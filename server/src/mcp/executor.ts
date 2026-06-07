// server/src/mcp/executor.ts
import { sessionStore } from '../session';
import { detectAnomalies, getStandardDeviation } from '../utils/calculateStdDev';

/**
 * MCP Tool Implementations
 * This is where you will practice writing your core financial algorithms!
 */

async function handleRecategorize(sessionId: string, args: { filter: string; newCategory: string }): Promise<string> {
  const session = sessionStore.get(sessionId);
  if (!session) return 'Error: Active session not found.';

  const keyword = args.filter.toLowerCase();
  let updatedCount = 0;

  // Step 1: Update the raw transactions ledger
  session.transactions = session.transactions.map(t => {
    // Check if merchant or description matches the filter keyword
    const matchMerchant = t.merchant?.toLowerCase().includes(keyword);
    const matchDesc = t.description1?.toLowerCase().includes(keyword);

    if (matchMerchant || matchDesc) {
      updatedCount++;
      return {
        ...t,
        category: args.newCategory // Update the category field
      };
    }
    return t;
  });

  if (updatedCount === 0) {
    return `No transactions found matching "${args.filter}". No changes made.`;
  }

  // Step 2: Sync changes to the Vector Store
  // Loop through all records in your vector database and update their metadata tags too!
  const allVectors = session.vectorStore.get_all_records(); // Assuming your VectorStore class has a way to get records
  
  allVectors.forEach(record => {
    const matchMerchant = record.metadata.description_1?.toLowerCase().includes(keyword);
    if (matchMerchant) {
      record.metadata.category = args.newCategory;
      // Re-synthesize your narrative string context so the RAG context updates too!
      record.metadata.context = `${args.newCategory} transaction: ${record.metadata.description_1}. Amount: ${record.metadata.amount} CAD. Date: ${record.metadata.date}.`;
    }
  });

  return `Successfully updated ${updatedCount} transactions to category: "${args.newCategory}" across both ledger and vector memories.`;
}

async function handleFlagAnomalies(sessionId: string): Promise<string> {
  const session = sessionStore.get(sessionId);
  if (!session) return 'Error: Active session not found.';

  if (session.transactions.length === 0) {
    return 'Error: No transactions available to analyze for anomalies.';
  }

  // Step 1: Format the data exactly as your helper expects it
  const financialDataInput = session.transactions.map(t => ({
    value: t.amountCad,
    timestamp: t.date
  }));

  // Step 2: Run your math helper (Threshold of 3 standard deviations is standard practice)
  const anomalyResults = detectAnomalies(financialDataInput, 3);

  // Step 3: Loop through the results and match anomalies back to the original transaction
  const flaggedReports: string[] = [];

  for (let i = 0; i < anomalyResults.length; i++) {
    if (anomalyResults[i].isAnomaly) {
      // The index in the results array matches the index in the original transactions array
      const originalTx = session.transactions[i];
      const zScore = anomalyResults[i].zScore.toFixed(2);
      
      // Fallback to description1 if merchant is undefined
      const merchantName = originalTx.merchant || originalTx.description1 || 'Unknown Merchant';
      
      flaggedReports.push(
        `ANOMALY: $${originalTx.amountCad.toFixed(2)} CAD at ${merchantName} on ${originalTx.date} (Z-Score Deviation: ${zScore})`
      );
    }
  }

  // Step 4: Construct the final narrative report for the LLM
  if (flaggedReports.length === 0) {
    return 'Analysis complete. No unusual spending spikes detected. All transactions fall within normal variance (under 3 standard deviations).';
  }

  const report = [
    `=== Anomaly Detection Report ===`,
    `Total Transactions Scanned: ${session.transactions.length}`,
    `Anomalies Detected: ${flaggedReports.length}`,
    `\nDetails:\n` + flaggedReports.join('\n'),
    `\nNote for AI: Ask the user if they recognize these abnormal charges.`
  ].join('\n');

  return report;
}

async function handleProjectMonth(sessionId: string, args: { targetSavings: number }): Promise<string> {
  const session = sessionStore.get(sessionId);
  if (!session) return 'Error: Active session not found.';
  if (session.transactions.length === 0) return 'Error: No transactions found to project.';

  // 1. Calculate historical totals cleanly using absolute values for spending
  const totalIncome = session.transactions
    .filter(t => t.amountCad > 0)
    .reduce((sum, t) => sum + t.amountCad, 0);

  const totalSpending = Math.abs(
    session.transactions
      .filter(t => t.amountCad < 0)
      .reduce((sum, t) => sum + t.amountCad, 0)
  );

  // 2. Determine the timeframe based on the actual ledger data, not the current real-world clock
  const transactionDates = session.transactions.map(t => new Date(t.date));
  const latestTransactionDate = new Date(Math.max(...transactionDates.map(d => d.getTime())));
  
  // Extract tracking parameters from the data's timeline
  const currentDay = latestTransactionDate.getDate() || 1; // Fallback to 1 to prevent division by 0
  const daysInMonth = new Date(latestTransactionDate.getFullYear(), latestTransactionDate.getMonth() + 1, 0).getDate();

  // 3. Complete the projections with fixed sign logic
  const projectedSpending = (totalSpending / currentDay) * daysInMonth;
  const projectedSavings = totalIncome - projectedSpending;
  
  // 4. Calculate variance against the target savings goal safely
  const savingsShortfallOrSurplus = projectedSavings - args.targetSavings;
  const status = savingsShortfallOrSurplus >= 0 ? 'SURPLUS' : 'SHORTFALL';
  
  const differencePercentage = args.targetSavings !== 0 
    ? (savingsShortfallOrSurplus / args.targetSavings) * 100 
    : 0;

  return [
    `=== Budget Projection Report ===`,
    `• Target Savings Goal: $${args.targetSavings.toFixed(2)} CAD`,
    `• Month Timeline Matrix: Day ${currentDay} of ${daysInMonth}`,
    `• Current Month Spending Velocity: $${(totalSpending / currentDay).toFixed(2)} CAD/day`,
    `--------------------------------`,
    `• Projected End-of-Month Spending: $${projectedSpending.toFixed(2)} CAD`,
    `• Projected End-of-Month Savings: $${projectedSavings.toFixed(2)} CAD`,
    `• Goal Standing: ${status} of $${Math.abs(savingsShortfallOrSurplus).toFixed(2)} CAD (${differencePercentage.toFixed(1)}% variance from target).`
  ].join('\n');

}

async function handleSummarizeCategory(sessionId: string, args: { category: string }): Promise<string> {
  const session = sessionStore.get(sessionId);
  if (!session) return 'Error: Active session not found.';

  // 1. Find matches safely
  const matches = session.transactions.filter(t => 
    t.category?.toLowerCase().includes(args.category.toLowerCase())
  );
  
  if (matches.length === 0) {
    return `No transactions found matching category keywords: "${args.category}"`;
  }

  // 2. Perform math aggregations
  const total = matches.reduce((sum, t) => sum + t.amountCad, 0);
  const totalCount = matches.length;
  const averageSpend = total / totalCount;

  // 3. Construct a professional engineering report for the LLM to read
  const report = [
    `=== Category Analysis: ${args.category.toUpperCase()} ===`,
    `• Total Expenditure: $${total.toFixed(2)} CAD`,
    `• Transaction Count: ${totalCount} entries`,
    `• Average Transaction Amount: $${averageSpend.toFixed(2)} CAD`,
    `• Data Scope: Analyzing active session ledger.`
  ].join('\n');

  return report;
}

/**
 * Master Execution Router
 */
export async function executeMcpTool(sessionId: string, toolName: string, argumentJson: string): Promise<string> {
  try {
    const args = JSON.parse(argumentJson);

    switch (toolName) {
      case 'recategorize':
        return await handleRecategorize(sessionId, args);
      case 'flagAnomalies':
        return await handleFlagAnomalies(sessionId);
      case 'projectMonth':
        return await handleProjectMonth(sessionId, args);
      case 'summarizeCategory':
        return await handleSummarizeCategory(sessionId, args);
      default:
        return `Error: Unknown tool function call: "${toolName}"`;
    }
  } catch (error) {
    return `Error parsing tool arguments or executing handler: ${error instanceof Error ? error.message : String(error)}`;
  }
}