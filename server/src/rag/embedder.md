import { MemoryVectorStore, VectorRecord } from './rag/vectorStore';
import { getEmbedding, getOllamaClient, CHAT_MODEL } from './llm/client';

const store = new MemoryVectorStore();

function create_vector_record(raw_data[]): void {
    const client = getOllamaClient();

    for (const excelRow of this.raw_data) {
       
        const chatDescription = await client.chat.completions.create({
        model: CHAT_MODEL,
        messages: [{ role: "user", content: "Create a short description with these informations ${excelRow["Description 2"]} (${excelRow["Description 1"]}) " }]
        });

       const narrativeText = `On ${excelRow["Transaction Date"]}, there was a transaction of type ${excelRow["Account Type"]} involving (chatDescription) amounting to ${excelRow["CAD$"]} CAD.`;
       
       const rowVector = await getEmbedding(narrativeText);

       const excelRecord: VectorRecord = {
       id: generateId(),
       vector: rowVector, // Simple 3-dimension test vector
       metadata: {
            context: context,
            account_type: excelRow["Account Type"],
            account_number: excelRow["Account Number"],
            description_1: excelRow["Description 1"],
            description_2: excelRow["Description 2"],
            amount: Number(excelRow["CAD$"]),
            date: excelRow["Transaction Date"]
            }
        };
      store.add_vector_record(excelRecord)
    }
}

function generateId(): string {
  return crypto.randomUUID();
}


// Mock data reflecting your RBC statement rows
const mockRecord: VectorRecord = {
  id: "row_1",
  vector: [0.1, 0.2, 0.3], // Simple 3-dimension test vector
  metadata: {
    context: "Spent $34.22 at Tasty BBQ",
    account_type: "Chequing",
    account_number: "03215-5400957",
    description_1: "C-IDP PURCHASE-6760",
    description_2: "TASTY BBQ AND B",
    amount: -34.22,
    date: "2026-01-19"
  }
};


const embedSource =
    (process.env.LLM_PROVIDER || 'groq') === 'groq'
    ? 'Hugging Face'
    : 'Ollama';
console.log(`⏳ Fetching text embedding from ${embedSource}...`);
const vector = await getEmbedding("Starbucks Coffee $5.50");
console.log("✅ Embedding Successful!");
console.log(`Vector Dimension Length: ${vector.length} numbers generated.`);
if (vector.length === 0 || typeof vector[0] !== 'number') {
    throw new Error("Vector data format is invalid.");
}


// Probably aim for running concurrently 
1. Assuming embedder will get an Array of array of data from upload.ts with the RBC statement rows being processed (Account Type	Account Number	Transaction Date	Cheque Number	Description 1	Description 2	CAD$	USD$) need to data clean the header in upload.ts so passed only the excelRow data to create_vector_record
2. Context is not created so need to passed the raw data mentioned in (1) to give Ollama/Groq to create context or manually create a narrative text
3. Then creat unique identifier for each vector record and embed the raw data using getEmbedding to get the vector numbers
4. Once gotten vector numbers and all the raw data create a Vector Record with those info and call add_vector_record
