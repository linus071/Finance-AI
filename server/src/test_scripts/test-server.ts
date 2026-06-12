// server/src/test-server.ts
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function testLiveServer() {
  console.log("📡 Pinging local Finance AI Web Server...");
  const BASE_URL = 'http://localhost:3000/api';

  try {
    // 1. Test Session Initialization Endpoint
    const initRes = await fetch(`${BASE_URL}/session/init`);
    const { sessionId } = await initRes.json() as { sessionId: string };
    console.log(`✨ Step 1 Success: Initialized web session container -> ${sessionId}`);

    // 2. Test Multipart File Upload Endpoint
    const csvPath = path.join(__dirname, '../../test-statement.csv');
    if (!fs.existsSync(csvPath)) {
      console.error(`❌ Aborting: Place your 'test-statement.csv' in the server root folder to run this test.`);
      return;
    }

    // Node-native simulation of a browser form upload
    const fileBuffer = fs.readFileSync(csvPath);
    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('file', new Blob([fileBuffer]), 'test-statement.csv');

    console.log("📥 Step 2: Sending multi-part statement payload stream over HTTP...");
    const uploadRes = await fetch(`${BASE_URL}/upload`, {
      method: 'POST',
      body: formData
    });
    
    const uploadReport = await uploadRes.json();
    console.log("📊 Server Ingestion Report:", uploadReport);

    // 3. Test Agent Chat Endpoint
    console.log("💬 Step 3: Dispatching conversation prompt to Bob...");
    const chatRes = await fetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        userQuery: "Hey Bob, do you notice any massive unusual debits in my statement?"
      })
    });

    const chatAnswer = await chatRes.json() as { answer: string };
    console.log(`\n🤖 [Bob's Live HTTP Response]:\n${chatAnswer.answer}\n`);

  } catch (error) {
    console.error("❌ Smoke test failed! Is your server running with 'npm start' in another terminal?", error);
  }
}

testLiveServer();