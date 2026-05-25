// server/src/test-store.ts
import { MemoryVectorStore, VectorRecord } from './rag/vectorStore';
import 'dotenv/config';

const store = new MemoryVectorStore();

// Mock data reflecting your RBC statement rows
const mockRecord: VectorRecord = {
  id: "row_1",
  vector: [0.1, 0.2, 0.3], // Simple 3-dimension test vector
  metadata: {
    category: "Food",
    context: "Spent $34.22 at Tasty BBQ",
    account_type: "Chequing",
    account_number: "03215-5400957",
    description_1: "C-IDP PURCHASE-6760",
    description_2: "TASTY BBQ AND B",
    amount: -34.22,
    date: "2026-01-19"
  }
};

console.log("📥 Testing Ingestion Phase...");
store.add_vector_record(mockRecord);
console.log(`✅ Current Store Size: ${store.get_size()} items.`);

console.log("\n🔍 Testing Query Phase...");
const matches = store.similaritySearch([0.1, 0.2, 0.3], 1);
console.log(`Top Match Context: "${matches[0].record.metadata.context}" with score ${matches[0].score.toFixed(4)}`);