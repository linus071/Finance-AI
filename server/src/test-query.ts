import { sessionStore } from './session'; // Import the real store
import { handleQuery } from './routes/query';
import { Request, Response } from 'express';
import { MemoryVectorStore } from './rag/vectorStore';
import 'dotenv/config';
import crypto from 'crypto';

async function runQueryTest() {
  console.log("🚀 Starting Query Integration Test...");

  // 1. Setup: Create a session and add it to the global store
  const sessionId = crypto.randomUUID();
  const session = {
    sessionId,
    transactions: [],
    vectors: [],
    vectorStore: new MemoryVectorStore(),
    createdAt: new Date()
  };
  sessionStore.set(sessionId, session);

  // 2. Data Injection: Add a test record so the AI has something to find
  session.vectorStore.add_vector_record({
    id: "test-rec-001",
    vector: new Array(384).fill(0.1), // Mock vector
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
  
  console.log(`✅ Dummy record added. Store size: ${session.vectorStore.get_size()}`);

  // 3. Mock Request
  const mockReq = {
    body: { sessionId, userQuery: "How much did I spend at A&W in April?" }
  } as Request;

  // 4. Mock Response
  const mockRes = {
    json: (data: any) => console.log("\n🤖 AI Answer:\n", data.answer),
    status: (code: number) => ({ 
        json: (err: any) => console.error(`❌ Status ${code}:`, err) 
    })
  } as unknown as Response;

  // 5. Execution
  console.log("🔍 Running handleQuery...");
  await handleQuery(mockReq, mockRes);
}

runQueryTest().catch(console.error);