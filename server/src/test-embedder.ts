// server/src/test-embedder.ts
import { create_vector_record, store } from './rag/embedder';
import { getEmbedding } from './llm/client';
import 'dotenv/config';

async function runEmbedderTest() {
  console.log("Starting Embedder Pipeline Test...");

  // 1. Create a mock array containing 2-3 realistic RBC transaction rows
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
    // 2. Pass the mock data to your ingestion pipeline
    await create_vector_record(mockRbcData);

    // 3. Verify the database size
    console.log(`\n Pass: Test Complete. Store currently holds ${store.get_size()} records.`);

    // 4. Run a quick search to ensure the metadata context was formatted properly
    const testQuery = "What is spend on food?";
    console.log(`\n Translating user question: "${testQuery}"`);
    
    // Convert text question into a vector
    const queryVector = await getEmbedding(`search_query: ${testQuery}`);

    console.log(` Running Cosine Similarity Search...`);
    
    // BUMPED TO 3: This forces the database to return EVERY single record it has sorted by match quality
    const searchResults = store.similaritySearch(queryVector, 3);

    // Finally, print all the results to see the LLM's modifications and match rankings
    console.log("\n=== Search Results (Ranked Top to Bottom) ===");
    searchResults.forEach((result, idx) => {
      console.log(`\n Rank ${idx + 1} (Score: ${result.score.toFixed(4)})`);
      console.log(`   Narrative: "${result.record.metadata.context}"`);
      console.log(`   Original Merchant: [${result.record.metadata.description_1}] / [${result.record.metadata.description_2}]`);
    });
    console.log("\n============================================");

  } catch (error) {
    console.error("Error: Test failed:", error);
  }
}

runEmbedderTest();