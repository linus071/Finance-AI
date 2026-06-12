import crypto from 'crypto';
import { VectorRecord } from '../vectorStore';
import { getEmbedding, getLLMClient, getActiveModelName } from '../../llm/client';
import { SessionData, Transaction } from '../../session';
import { RawTransactionRow, TransactionIngester } from './types';

export class GroqIngester implements TransactionIngester {
    async ingest(session: SessionData, raw_data: RawTransactionRow[]): Promise<void> {
        const client = getLLMClient();
        const CHAT_MODEL = getActiveModelName();

        const processedTransactions: Transaction[] = [];
        const processedVectors: VectorRecord[] = [];

        const BATCH_SIZE = 30;

        console.log(`\n📦 Starting batch processing for ${raw_data.length} transactions...`);

        for (let i = 0; i < raw_data.length; i += BATCH_SIZE) {
            const batch = raw_data.slice(i, i + BATCH_SIZE);
            console.log(`   -> Processing chunk ${i + 1} to ${Math.min(i + BATCH_SIZE, raw_data.length)}...`);

            const batchPromptData = batch.map((row, index) => ({
                id: index,
                desc1: row["Description 1"],
                desc2: row["Description 2"]
            }));

            let parsedResults: any[] = [];

            try {
                const chatCompletion = await client.chat.completions.create({
                    model: CHAT_MODEL,
                    messages: [
                        {
                            role: "system",
                            content: `You are a bank transaction parser. I will give you a JSON array of transactions. 
                        You MUST return a strictly valid JSON array of objects in the EXACT same order. 
                        Each object must have this structure:
                        {
                          "merchant": "cleaned merchant name",
                          "category": "one of: Food & Dining | Groceries | Transport | Entertainment | Subscriptions | Shopping | Transfer | Income | Healthcare | Utilities | Other"
                        }
                        Return ONLY the JSON array. No explanations. No markdown formatting. Start with [ and end with ].`
                        },
                        {
                            role: "user",
                            content: JSON.stringify(batchPromptData)
                        }
                    ],
                    temperature: 0.0
                });

                const rawContent = chatCompletion.choices[0]?.message?.content?.trim() || '[]';

                const match = rawContent.match(/\[[\s\S]*\]/);
                const cleanedJsonString = match ? match[0] : rawContent;

                parsedResults = JSON.parse(cleanedJsonString);

                if (!Array.isArray(parsedResults)) {
                    parsedResults = [];
                }
            } catch (llmError) {
                console.error(`⚠️ LLM Batch Failed, falling back to raw descriptions.`, llmError);
                parsedResults = [];
            }

            const embeddingPromises = batch.map(async (excelRow, index) => {
                try {
                    const parsed = parsedResults[index] || {};
                    const merchantName = parsed.merchant || excelRow["Description 1"];
                    const category = parsed.category || 'Other';

                    const recordId = crypto.randomUUID();
                    const amount = Number(excelRow["CAD$"]);

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

                    const embeddingPayload = `search_document: Category: ${category}. Merchant: ${merchantName}.`;
                    const narrativeText = `${category} transaction: ${merchantName}. Amount: ${excelRow["CAD$"]} CAD. Date: ${excelRow["Transaction Date"]}.`;

                    const rowVector = await getEmbedding(embeddingPayload);

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
                    console.error(`Error processing individual row in batch:`, rowError);
                }
            });

            await Promise.all(embeddingPromises);
        }

        session.transactions.push(...processedTransactions);
        processedVectors.forEach(rec => session.vectorStore.add_vector_record(rec));
        session.vectorStore.save_to_disk();

        console.log(`\n✅ Ingestion complete! Session ${session.sessionId} populated with ${session.transactions.length} items.`);
    }
}
