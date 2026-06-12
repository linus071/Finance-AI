// server/src/test-tools.ts
import { createSession } from '../session';
import { executeMcpTool } from '../mcp/executor';

async function runToolTests() {
  console.log("🚀 Starting Phase 1: Real-World Dataset Tool Integration Tests...\n");

  // 1. Setup isolated session sandbox
  const session = createSession();
  const sessionId = session.sessionId;

  // 2. Inject Mock Ledger Data mirroring your exact RBC layout
  // We use the real descriptions from your spreadsheet, adding categories/merchants
  // as if they had successfully passed through your LLM embedder parser stage.
  session.transactions = [
    {
      id: "tx-001",
      accountType: "Chequing",
      accountNumber: "03215-5400957",
      date: "2026-01-19",
      description1: "Email Trfs",
      description2: "E-TRANSFER SENT",
      amountCad: -151.00,
      merchant: "E-Transfer",
      category: "Transfer"
    },
    {
      id: "tx-002",
      accountType: "Chequing",
      accountNumber: "03215-5400957",
      date: "2026-01-19",
      description1: "C-IDP PUR",
      description2: "TASTY BBQ AND B",
      amountCad: -34.22,
      merchant: "Tasty BBQ and Bar",
      category: "Food & Dining"
    },
    {
      id: "tx-003",
      accountType: "Chequing",
      accountNumber: "03215-5400957",
      date: "2026-01-21",
      description1: "Payment",
      description2: "WWW PAYMENT - 8822 FIDO",
      amountCad: -44.80,
      merchant: "Fido",
      category: "Utilities"
    },
    {
      id: "tx-004",
      accountType: "Chequing",
      accountNumber: "03215-5400957",
      date: "2026-01-23",
      description1: "Transfer",
      description2: "WWW TRANSFER - 4380",
      amountCad: 1448.54, // Positive Deposit
      merchant: "Internal Transfer",
      category: "Transfer"
    },
    {
      id: "tx-005",
      accountType: "Chequing",
      accountNumber: "03215-5400957",
      date: "2026-01-26",
      description1: "BILL PAYM",
      description2: "SHCS EFT",
      amountCad: -1448.54,
      merchant: "SHCS",
      category: "Other"
    },
    {
      id: "tx-006",
      accountType: "Chequing",
      accountNumber: "03215-5400957",
      date: "2026-01-30",
      description1: "PAYROLL",
      description2: "UBC PAYROLL",
      amountCad: 842.98, // Primary Recurring Income
      merchant: "UBC",
      category: "Income"
    },
    {
      id: "tx-007",
      accountType: "Chequing",
      accountNumber: "03215-5400957",
      date: "2026-01-30",
      description1: "FUNDS TR",
      description2: "TT LIM SENG BEN",
      amountCad: 15000.00, // Massive balance wash entry
      merchant: "Lim Seng Ben",
      category: "Transfer"
    },
    {
      id: "tx-008",
      accountType: "Chequing",
      accountNumber: "03215-5400957",
      date: "2026-01-30",
      description1: "WWW TRF",
      description2: "DDA - 2626",
      amountCad: -15000.00, // Counter-acting balance wash out
      merchant: "Internal Transfer",
      category: "Transfer"
    },
    {
      id: "tx-009",
      accountType: "Chequing",
      accountNumber: "03215-5400957",
      date: "2026-02-09",
      description1: "C-IDP PUR",
      description2: "TST-Jam Cafe -",
      amountCad: -23.54,
      merchant: "Jam Cafe",
      category: "Food & Dining"
    },
    {
      id: "tx-010",
      accountType: "Chequing",
      accountNumber: "03215-5400957",
      date: "2026-02-09",
      description1: "C-IDP PUR",
      description2: "LS KONBINIYA JA",
      amountCad: -35.61,
      merchant: "Konbiniya Japan Centre",
      category: "Shopping"
    },
    // 🚨 MANUALLY INJECTED ANOMALY OUTLIER FOR TESTING PURPOSES
    // This deviates wildly from normal Jam Cafe or Fido bills to confirm tool parsing triggers!
    {
      id: "tx-anomaly",
      accountType: "Chequing",
      accountNumber: "03215-5400957",
      date: "2026-02-12",
      description1: "UNKNOWN DEBIT",
      description2: "OUTLIER TRANSACTION HOLD",
      amountCad: -4850.00,
      merchant: "Unknown Merchant",
      category: "Other"
    }
  ];

  console.log(`✅ Sandbox loaded with ${session.transactions.length} production-simulated records.`);
  console.log(`📡 Targeting session context ID: ${sessionId}\n`);

  // 3. Test Tool Execution: flagAnomalies
  console.log("🛠️  Executing: flagAnomalies...");
  try {
    const anomalyResult = await executeMcpTool(sessionId, "flagAnomalies", "{}");
    console.log("\n📥 [TOOL RESPONSE - ANOMALIES]:");
    console.log(anomalyResult);
  } catch (err) {
    console.error("❌ flagAnomalies failed execution:", err);
  }
  
  console.log("\n--------------------------------------------------\n");

  // 4. Test Tool Execution: projectMonth
  console.log("🛠️  Executing: projectMonth...");
  try {
    const projectArgs = JSON.stringify({ targetSavings: 500 });
    const projectResult = await executeMcpTool(sessionId, "projectMonth", projectArgs);
    console.log("\n📥 [TOOL RESPONSE - PROJECTIONS]:");
    console.log(projectResult);
  } catch (err) {
    console.error("❌ projectMonth failed execution:", err);
  }
  
  console.log("\n==================================================\n");
}

runToolTests().catch(console.error);