// server/src/test-agent.ts
import { createSession } from './session';
import { processAgentQuery } from './mcp/agent';
import 'dotenv/config';

async function runAgentPipelineTest() {
  console.log("🚀 Initializing End-to-End Agentic Loop Integration Test...\n");

  // 1. Set up an isolated session sandbox context
  const session = createSession();
  const sessionId = session.sessionId;

  // 2. Inject identical verified ledger mock entries from Phase 1
  session.transactions = [
    { id: "tx-001", accountType: "Chequing", accountNumber: "03215-5400957", date: "2026-01-19", description1: "Email Trfs", description2: "E-TRANSFER SENT", amountCad: -151.00, merchant: "E-Transfer", category: "Transfer" },
    { id: "tx-002", accountType: "Chequing", accountNumber: "03215-5400957", date: "2026-01-19", description1: "C-IDP PUR", description2: "TASTY BBQ AND B", amountCad: -34.22, merchant: "Tasty BBQ and Bar", category: "Food & Dining" },
    { id: "tx-003", accountType: "Chequing", accountNumber: "03215-5400957", date: "2026-01-21", description1: "Payment", description2: "WWW PAYMENT - 8822 FIDO", amountCad: -44.80, merchant: "Fido", category: "Utilities" },
    { id: "tx-005", accountType: "Chequing", accountNumber: "03215-5400957", date: "2026-01-26", description1: "BILL PAYM", description2: "SHCS EFT", amountCad: -1448.54, merchant: "SHCS", category: "Other" },
    { id: "tx-006", accountType: "Chequing", accountNumber: "03215-5400957", date: "2026-01-30", description1: "PAYROLL", description2: "UBC PAYROLL", amountCad: 842.98, merchant: "UBC", category: "Income" },
    { id: "tx-009", accountType: "Chequing", accountNumber: "03215-5400957", date: "2026-02-09", description1: "C-IDP PUR", description2: "TST-Jam Cafe -", amountCad: -23.54, merchant: "Jam Cafe", category: "Food & Dining" },
    { id: "tx-010", accountType: "Chequing", accountNumber: "03215-5400957", date: "2026-02-09", description1: "C-IDP PUR", description2: "LS KONBINIYA JA", amountCad: -35.61, merchant: "Konbiniya Japan Centre", category: "Shopping" },
    { id: "tx-anomaly", accountType: "Chequing", accountNumber: "03215-5400957", date: "2026-02-12", description1: "UNKNOWN DEBIT", description2: "OUTLIER TRANSACTION HOLD", amountCad: -4850.00, merchant: "Unknown Merchant", category: "Other" }
  ];

  console.log(`✅ Sandbox environment set up with Session Context ID: ${sessionId}`);
  console.log("----------------------------------------------------------------------\n");

  // Prompt 1: Testing conversational anomaly tracking intent
  const userPrompt1 = "Hey Bob, look through my statements and flag if you see any unusual transactions.";
  console.log(`👤 [USER]: "${userPrompt1}"`);
  
  try {
    const response1 = await processAgentQuery(sessionId, userPrompt1);
    console.log(`\n🤖 [Bob]:\n${response1}\n`);
  } catch (error) {
    console.error("Agent failed to respond to Prompt 1:", error);
  }

  console.log("----------------------------------------------------------------------\n");

  // Prompt 2: Testing tracking intent for target projections
  const userPrompt2 = "Can you calculate my current velocity run rate and project if I can hit a savings target of $500 this month?";
  console.log(`👤 [USER]: "${userPrompt2}"`);

  try {
    const response2 = await processAgentQuery(sessionId, userPrompt2);
    console.log(`\n🤖 [Bob]:\n${response2}\n`);
  } catch (error) {
    console.error("Agent failed to respond to Prompt 2:", error);
  }
}

runAgentPipelineTest().catch(console.error);