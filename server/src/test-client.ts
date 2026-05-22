console.log("DEBUG: Script file loaded successfully!");
// server/src/test-client.ts
import * as dotenv from 'dotenv';
import path from 'path';

// Explicitly load env variables from the server folder
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { getEmbedding, getChatClient, CHAT_MODEL } from './llm/client';

async function testConnection() {
  console.log("🚀 Testing your Finance AI Client Setup...");
  console.log(`Current Provider Mode: ${process.env.LLM_PROVIDER || 'groq'}\n`);

  try {
    // 1. Test the Embedding pipeline
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
    
    // 2. Test the LLM Complete function
    const chatSource = (process.env.LLM_PROVIDER || 'groq') === 'groq' ? 'Groq Cloud' : 'Ollama Local';
    console.log(`\n⏳ Fetching chat response from ${chatSource}...`);
    const client = getChatClient();
    const chatResponse = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: "Say hello and confirm you read this text." }]
    });
    
    console.log("✅ Chat Engine Successful!");
    console.log(`Response from ${CHAT_MODEL}: "${chatResponse.choices[0].message.content}"`);

  } catch (error) {
    console.error("❌ Test Failed! Check your .env file API keys or networks.");
    console.error(error);
  }
}

testConnection();