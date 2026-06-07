// server/src/mcp/executor.ts
import { getEmbedding } from '../llm/client';
import { sessionStore } from '../session';
import { detectAnomalies } from '../utils/calculateStdDev';

/**
 * MCP Tool Implementations
 */

async function handleRecategorize(sessionId: string, args: { filter: string; newCategory: string }): Promise<string> {
  const session = sessionStore.get(sessionId);
  if (!session) return 'Error: Active session not found.';

  const keyword = args.filter.toLowerCase();
  let updatedCount = 0;

  // Step 1: Synchronize the exact math ledger array
  session.transactions = session.transactions.map(t => {
    const matchMerchant = t.merchant?.toLowerCase().includes(keyword);
    const matchDesc = t.description1?.toLowerCase().includes(keyword);

    if (matchMerchant || matchDesc) {
      updatedCount++;
      return { ...t, category: args.newCategory };
    }
    return t;
  });

  if (updatedCount === 0) {
    return `No transactions found matching "${args.filter}". No changes made.`;
  }

  // Step 2: Track records that require vector coordinate adjustment
  const allVectors = session.vectorStore.get_all_records();
  
  const reEmbeddingPromises = allVectors.map(async (record) => {
    const matchDesc1 = record.metadata.description_1?.toLowerCase().includes(keyword);
    const matchDesc2 = record.metadata.description_2?.toLowerCase().includes(keyword);
    const matchContext = record.metadata.context?.toLowerCase().includes(keyword);

    if (matchDesc1 || matchDesc2 || matchContext) {
      // Update metadata tags
      record.metadata.category = args.newCategory;
      record.metadata.context = `${args.newCategory} transaction: ${record.metadata.description_1}. Amount: ${record.metadata.amount} CAD. Date: ${record.metadata.date}.`;
      
      // Synthesize the exact same document string template your ingestion pipeline uses
      const embeddingPayload = `search_document: Category: ${args.newCategory}. Merchant: ${record.metadata.description_1}.`;
      
      // Regenerate the mathematical vector so it migrates to its new cluster location!
      record.vector = await getEmbedding(embeddingPayload);
    }
  });

  // Execute all vector mutations in parallel concurrent batches across threads
  await Promise.all(reEmbeddingPromises);

  // Step 3: Persist changes back down to structural storage
  session.vectorStore.save_to_disk();

  return `Successfully updated and re-embedded ${updatedCount} transactions to category: "${args.newCategory}" across all system memories.`;
}

async function handleFlagAnomalies(sessionId: string): Promise<string> {
  const session = sessionStore.get(sessionId);
  if (!session) return 'Error: Active session not found.';
  if (session.transactions.length === 0) return 'Error: No transactions available.';

  // FIX: Leverage structural categories rather than personal text scrapings
  const spendingTransactions = session.transactions.filter(
    t => t.amountCad < 0 && t.category?.toLowerCase() !== 'transfer'
  );

  if (spendingTransactions.length === 0) {
    return 'Analysis complete. No consumer spending transactions found to evaluate.';
  }

  const financialDataInput = spendingTransactions.map(t => ({
    value: t.amountCad,
    timestamp: t.date,
    originalTx: t
  }));

  const anomalyResults = detectAnomalies(financialDataInput, 2.0) as any[];
  const flaggedReports: string[] = [];

  for (const result of anomalyResults) {
    if (result.isAnomaly) {
      const originalTx = result.originalTx;
      const zScore = result.zScore.toFixed(2);
      const merchantName = originalTx.merchant || originalTx.description2 || originalTx.description1 || 'Unknown';
      
      flaggedReports.push(
        `🚨 ANOMALY: $${Math.abs(originalTx.amountCad).toFixed(2)} CAD at ${merchantName} on ${originalTx.date} (Z-Score Deviation: ${zScore})`
      );
    }
  }

  if (flaggedReports.length === 0) {
    return 'Analysis complete. No unusual spending spikes detected under modified asset deviations.';
  }

  return [
    `=== Anomaly Detection Report ===`,
    `Total Database Records Scanned: ${session.transactions.length}`,
    `Evaluated Spending Nodes: ${spendingTransactions.length}`,
    `Anomalies Flagged: ${flaggedReports.length}`,
    `\nDetails:\n` + flaggedReports.join('\n'),
    `\nNote for AI: Advise the user to audit these specific line items.`
  ].join('\n');
}

async function handleProjectMonth(sessionId: string, args: { targetSavings: number }): Promise<string> {
  const session = sessionStore.get(sessionId);
  if (!session) return 'Error: Active session not found.';
  if (session.transactions.length === 0) return 'Error: No transactions found to project.';
  
  const totalIncome = session.transactions
    .filter(t => t.amountCad > 0 && t.category?.toLowerCase() !== 'transfer')
    .reduce((sum, t) => sum + t.amountCad, 0);

  // FIX 2: Exclude all structural transfer categories from consumer outflows
  const allSpending = session.transactions.filter(
    t => t.amountCad < 0 && t.category?.toLowerCase() !== 'transfer'
  );

  // Separate routine variable spending from fixed structural overhead/one-time anomalies (> $1,000)
  const dynamicSpendingItems = allSpending.filter(t => Math.abs(t.amountCad) < 1000);
  const macroFixedItemsTotal = allSpending
    .filter(t => Math.abs(t.amountCad) >= 1000)
    .reduce((sum, t) => sum + Math.abs(t.amountCad), 0);

  const totalDynamicSpending = dynamicSpendingItems.reduce((sum, t) => sum + Math.abs(t.amountCad), 0);

  // FIX 3: Safe Timezone Parsing Engine (Splits string components to guarantee exact calendar match)
  const transactionDates = session.transactions.map(t => {
    const parts = t.date.split('-'); // Expects YYYY-MM-DD
    if (parts.length === 3) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    return new Date(t.date);
  });
  
  const latestTransactionDate = new Date(Math.max(...transactionDates.map(d => d.getTime())));
  
  const currentDay = latestTransactionDate.getDate() || 1; 
  const daysInMonth = new Date(latestTransactionDate.getFullYear(), latestTransactionDate.getMonth() + 1, 0).getDate();

  // 3. Projecting the metrics safely
  const dailyVelocity = totalDynamicSpending / currentDay;
  const projectedSpending = (dailyVelocity * daysInMonth) + macroFixedItemsTotal;
  const projectedSavings = totalIncome - projectedSpending;
  
  const savingsShortfallOrSurplus = projectedSavings - args.targetSavings;
  const status = savingsShortfallOrSurplus >= 0 ? 'SURPLUS' : 'SHORTFALL';
  const differencePercentage = args.targetSavings !== 0 ? (savingsShortfallOrSurplus / args.targetSavings) * 100 : 0;

  return [
    `=== Budget Projection Report ===`,
    `• Target Savings Goal: $${args.targetSavings.toFixed(2)} CAD`,
    `• Month Timeline Matrix: Day ${currentDay} of ${daysInMonth}`,
    `• Baseline Variable Spending Velocity: $${dailyVelocity.toFixed(2)} CAD/day`,
    `• Large/One-off Outflows Identified: $${macroFixedItemsTotal.toFixed(2)} CAD`,
    `--------------------------------`,
    `• Projected End-of-Month Spending: $${projectedSpending.toFixed(2)} CAD`,
    `• Projected End-of-Month Savings: $${projectedSavings.toFixed(2)} CAD`,
    `• Goal Standing: ${status} of $${Math.abs(savingsShortfallOrSurplus).toFixed(2)} CAD (${differencePercentage.toFixed(1)}% variance from target).`
  ].join('\n');
}

async function handleSummarizeCategory(sessionId: string, args: { category: string }): Promise<string> {
  const session = sessionStore.get(sessionId);
  if (!session) return 'Error: Active session not found.';

  const matches = session.transactions.filter(t => 
    t.category?.toLowerCase().includes(args.category.toLowerCase())
  );
  
  if (matches.length === 0) {
    return `No transactions found matching category keywords: "${args.category}"`;
  }

  const total = matches.reduce((sum, t) => sum + t.amountCad, 0);
  const totalCount = matches.length;
  const averageSpend = total / totalCount;

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