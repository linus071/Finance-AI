// server/src/test-query.ts
import { sessionStore } from './session'; 
import { handleQuery } from './routes/query';
import { Request, Response } from 'express';
import { MemoryVectorStore } from './rag/vectorStore';
import 'dotenv/config';
import crypto from 'crypto';

async function runQueryTest() {
  console.log("🚀 Starting Query Integration Test...");

  const sessionId = crypto.randomUUID();
  
  // Clean initialization without the redundant vectors array
  const session = {
    sessionId,
    transactions: [] as any[], 
    vectorStore: new MemoryVectorStore(),
    createdAt: new Date()
  };
  sessionStore.set(sessionId, session);

  // 1. RAW DATA INJECTION (For exact math tools)
  session.transactions = [
    {
      id: "test-rec-001",
      accountType: "MasterCard",
      accountNumber: "5415...",
      date: "2026-04-17",
      description1: "A&W STORE# 0751",
      description2: "",
      amountCad: -11.96, // Negative because it's spending!
      merchant: "A&W",
      category: "Food & Dining"
    },
    {
      id: "test-rec-002",
      accountType: "MasterCard",
      accountNumber: "5415...",
      date: "2026-04-20",
      description1: "A&W STORE# 0751",
      description2: "",
      amountCad: -15.50,
      merchant: "A&W",
      category: "Food & Dining"
    }
  ];

  // 2. VECTOR STORAGE INJECTION (For semantic RAG searching)
  session.vectorStore.add_vector_record({
    id: "test-rec-001",
    vector: new Array(384).fill(0.1), 
    metadata: {
      context: "Food & Dining transaction: A&W STORE. Amount: 11.96 CAD. Date: 2026-04-17.",
      category: "Food & Dining",
      account_type: "MasterCard",
      account_number: "5415...",
      description_1: "A&W STORE# 0751",
      description_2: "",
      amount: 11.96,
      date: "2026-04-17"
    }
  });

  session.vectorStore.add_vector_record({
    id: "test-rec-002",
    vector: new Array(384).fill(0.1),
    metadata: {
      context: "Food & Dining transaction: A&W STORE. Amount: 15.50 CAD. Date: 2026-04-20.",
      category: "Food & Dining",
      account_type: "MasterCard",
      account_number: "5415...",
      description_1: "A&W STORE# 0751",
      description_2: "",
      amount: 15.50,
      date: "2026-04-20"
    }
  });
  
  console.log(`✅ Test Data Synchronized. Ledger items: ${session.transactions.length}, Vector store size: ${session.vectorStore.get_size()}`);

  const mockReq = {
    body: { sessionId, userQuery: "How much did I spend at A&W in April?" }
  } as Request;

  const mockRes = {
    json: (data: any) => console.log("\n🤖 AI Answer:\n", data.answer),
    status: (code: number) => ({ 
        json: (err: any) => console.error(`❌ Status ${code}:`, err) 
    })
  } as unknown as Response;

  console.log("🔍 Running handleQuery...");
  await handleQuery(mockReq, mockRes);
}

runQueryTest().catch(console.error);