import crypto from 'crypto';
import { MemoryVectorStore, VectorRecord } from './vectorStore';
import { getEmbedding, getOllamaClient, CHAT_MODEL } from '../llm/client';

//Create a shared vector store for the embedder to use
export const store = new MemoryVectorStore();

// Define what a single parsed row from upload.ts looks like structurally
export interface RawTransactionRow {
    "Account Type": string;
    "Account Number": string;
    "Transaction Date": string;
    "Cheque Number"?: string | number;
    "Description 1": string;
    "Description 2": string;
    "CAD$": string | number;
    "USD$"?: string | number;
  }

/**
 * Ingestion Pipeline: Processes transaction arrays, enriches context via LLM,
 * generates vector embeddings, and saves records into the vector database.
 */
export async function create_vector_record(raw_data: RawTransactionRow[]): Promise<void> {
    const client = getOllamaClient();
    // Map each row into an asynchronous promise block for concurrent processing
    const processingPromises = raw_data.map(async (excelRow) => {
        try {
        // 1. Clean up bank jargon using a bulletproof System/User instruction layout
        const chatCompletion = await client.chat.completions.create({
            model: CHAT_MODEL,
            messages: [
              {
                role: "system",
                content: `You are a bank transaction parser. Given a banking description, return ONLY a JSON object with two fields:
          {
            "merchant": "cleaned merchant name",
            "category": "one of: Food & Dining | Groceries | Transport | Entertainment | Subscriptions | Shopping | Transfer | Income | Healthcare | Utilities | Other"
          }
          No explanation. No markdown. Raw JSON only.`
              },
              {
                role: "user",
                content: `Description 1: "${excelRow["Description 1"]}", Description 2: "${excelRow["Description 2"]}"`
              }
            ],
            temperature: 0.0
          });
          
        const rawContent = chatCompletion.choices[0]?.message?.content?.trim() || '{}';

        // This instantly cuts off trailing markdown ticks, conversational text, or double braces.
        let cleanedJsonString = rawContent;
        const jsonRegexMatch = rawContent.match(/\{[\s\S]*?\}/);
        if (jsonRegexMatch) {
            cleanedJsonString = jsonRegexMatch[0];
        }

        // Strip illegal backslash escapes (e.g. A\&W, \+) that break JSON.parse
        cleanedJsonString = cleanedJsonString.replace(/\\([^"\\/bfnrtu])/g, '$1');

        let cleanedDescription = excelRow["Description 1"];
        let category = 'Other';
        try {
            const parsed = JSON.parse(cleanedJsonString);
            cleanedDescription = parsed.merchant || excelRow["Description 1"];
            category = parsed.category || 'Other';
        } catch {
            // Fall back to raw Excel description so the row still gets embedded
            cleanedDescription = excelRow["Description 1"];
            category = 'Other';
        }

        // 2. Synthesize your final unified narrative sentence context
        const embeddingPayload = `search_document: Category: ${category}. Merchant: ${cleanedDescription}.`;
        const narrativeText = `${category} transaction: ${cleanedDescription}. Amount: ${excelRow["CAD$"]} CAD. Date: ${excelRow["Transaction Date"]}.`;

        // 3. Generate the numerical float array vector via the embedding engine
        const rowVector = await getEmbedding(embeddingPayload);

        // 4. Assemble the final VectorRecord shape matching your database spec
        const excelRecord: VectorRecord = {
            id: crypto.randomUUID(),
            vector: rowVector,
            metadata: {
                context: narrativeText,
                category,
                account_type: excelRow["Account Type"],
                account_number: excelRow["Account Number"],
                description_1: excelRow["Description 1"],
                description_2: excelRow["Description 2"],
                amount: Number(excelRow["CAD$"]),
                date: excelRow["Transaction Date"]
            }
        };

        // 5. Commit record straight into the storage vector store cache
        store.add_vector_record(excelRecord);

        } catch (rowError) {
        // Prevent a single broken row from throwing an error that stops the entire upload pipeline
        console.error(`Error: Failed to process transaction row:`, excelRow, rowError);
        }
    });

    // Execute all rows concurrently in parallel batches across threads
    await Promise.all(processingPromises);
    store.save_to_disk();

    console.log(`\n Ingestion complete! Storage state updated: ${store.get_size()} total vectors indexed.`);
}