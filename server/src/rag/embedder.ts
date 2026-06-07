import crypto from 'crypto';
import { VectorRecord } from './vectorStore';
import { getEmbedding, getOllamaClient, CHAT_MODEL } from '../llm/client';
import { SessionData, Transaction } from '../session'; // Import Session structures

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
 * and populates BOTH the exact ledger and the vector store of the specific session.
 */
export async function ingest_user_file(session: SessionData, raw_data: RawTransactionRow[]): Promise<void> {
    const client = getOllamaClient();
    
    // Arrays to hold our processed results
    const processedTransactions: Transaction[] = [];
    const processedVectors: VectorRecord[] = [];

    const processingPromises = raw_data.map(async (excelRow) => {
        try {
            // 1. Clean up bank jargon via LLM
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
            let cleanedJsonString = rawContent;
            const jsonRegexMatch = rawContent.match(/\{[\s\S]*?\}/);
            if (jsonRegexMatch) cleanedJsonString = jsonRegexMatch[0];
            cleanedJsonString = cleanedJsonString.replace(/\\([^"\\/bfnrtu])/g, '$1');

            let merchantName = excelRow["Description 1"];
            let category = 'Other';
            try {
                const parsed = JSON.parse(cleanedJsonString);
                merchantName = parsed.merchant || excelRow["Description 1"];
                category = parsed.category || 'Other';
            } catch {
                merchantName = excelRow["Description 1"];
                category = 'Other';
            }

            const recordId = crypto.randomUUID();
            const amount = Number(excelRow["CAD$"]);

            // 2. Build the Exact Math Ledger Item
            const ledgerItem: Transaction = {
                id: recordId,
                accountType: excelRow["Account Type"],
                accountNumber: excelRow["Account Number"],
                date: excelRow["Transaction Date"],
                description1: excelRow["Description 1"],
                description2: excelRow["Description 2"],
                amountCad: amount,
                amountUsd: excelRow["USD$"] ? Number(excelRow["USD$"]) : undefined,
                merchant: merchantName,
                category: category
            };
            processedTransactions.push(ledgerItem);

            // 3. Synthesize semantic RAG strings
            const embeddingPayload = `search_document: Category: ${category}. Merchant: ${merchantName}.`;
            const narrativeText = `${category} transaction: ${merchantName}. Amount: ${excelRow["CAD$"]} CAD. Date: ${excelRow["Transaction Date"]}.`;

            // 4. Generate the vector embedding array
            const rowVector = await getEmbedding(embeddingPayload);

            // 5. Build the Vector Store Item
            const vectorItem: VectorRecord = {
                id: recordId,
                vector: rowVector,
                metadata: {
                    context: narrativeText,
                    category,
                    account_type: excelRow["Account Type"],
                    account_number: excelRow["Account Number"],
                    description_1: excelRow["Description 1"],
                    description_2: excelRow["Description 2"],
                    amount: amount,
                    date: excelRow["Transaction Date"]
                }
            };
            processedVectors.push(vectorItem);

        } catch (rowError) {
            console.error(`Error processing transaction row:`, excelRow, rowError);
        }
    });

    await Promise.all(processingPromises);

    // 6. Commit BOTH sets directly to the session instance passed in (Fixes Bug 1)
    session.transactions.push(...processedTransactions);
    processedVectors.forEach(rec => session.vectorStore.add_vector_record(rec));

    // Optional: Save this specific session state to a unique file if persistence is required
    // session.vectorStore.save_to_disk(); 

    console.log(`\n Ingestion complete! Session ${session.sessionId} populated with ${session.transactions.length} items.`);
}