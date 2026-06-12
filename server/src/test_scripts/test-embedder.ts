import { IngesterFactory } from '../rag/factory/IngesterFactory';
import { getEmbedding } from '../llm/client';
import { createSession } from '../session';
import 'dotenv/config';

async function runEmbedderTest() {
  console.log("🚀 Starting Embedder Pipeline Test...");

  // 1. Setup: Instantiate a clean, isolated testing sandbox session
  const session = createSession(); 

  // Mock array containing realistic RBC transaction rows
  const mockRbcData = [
    {
        "Account Type": "Chequing",
        "Account Number": "03215-5400957",
        "Transaction Date": "1/19/2026",
        "Description 1": "C-IDP PURCHASE-6760",
        "Description 2": "TASTY BBQ AND B",
        "CAD$": -34.22
    },
    {
        "Account Type": "Savings",
        "Account Number": "03215-5789532",
        "Transaction Date": "1/23/2026",
        "Description 1": "MISC PAYMENT",
        "Description 2": "PAYPAL",
        "CAD$": -1448.54
      },
      {
        "Account Type": "MasterCard",
        "Account Number": "5.4159E+15",
        "Transaction Date": "4/21/2026",
        "Description 1": "CHIPOTLE 5200 VANCOUVER BC",
        "Description 2": " ",
        "CAD$": -14.6
      },
  ];

  try {
    const provider = process.env.LLM_PROVIDER || 'groq';
    const ingester = IngesterFactory.getIngester(provider);
    await ingester.ingest(session, mockRbcData);

    // FIX: Verify size by targeting the specific session's vector container
    console.log(`\n Pass: Test Complete. Store currently holds ${session.vectorStore.get_size()} records.`);

    // 4. Run a quick search to ensure the metadata context was formatted properly
    const testQuery = "What is spend on food?";
    console.log(`\n Translating user question: "${testQuery}"`);
    
    const queryVector = await getEmbedding(`search_query: ${testQuery}`);

    console.log(` Running Cosine Similarity Search against isolated session engine...`);
    
    const searchResults = session.vectorStore.similaritySearch(queryVector, 3);

    console.log("\n=== Search Results (Ranked Top to Bottom) ===");
    searchResults.forEach((result, idx) => {
      console.log(`\n Rank ${idx + 1} (Score: ${result.score.toFixed(4)})`);
      console.log(`   Narrative: "${result.record.metadata.context}"`);
      console.log(`   Original Merchant: [${result.record.metadata.description_1}] / [${result.record.metadata.description_2}]`);
    });
    console.log("\n============================================");

  } catch (error) {
    console.error("❌ Error: Test failed:", error);
  }
}

runEmbedderTest();