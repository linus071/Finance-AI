// server/src/test-upload.ts
import fs from 'fs';
import path from 'path';
import { processUploadedFile } from '../routes/upload'; 
import { createSession } from '../session'; // FIX: Import the session initialization helper
import 'dotenv/config';

async function runUploadTest() {
    console.log("🚀 Starting Upload Pipeline Test...");
    
    try {
        // 1. Setup: Instantiate a clean, isolated session sandbox in memory
        const session = createSession();
        const sessionId = session.sessionId;
        console.log(`📡 Initialized isolated test session container: ${sessionId}`);

        // 2. Read the physical file from your disk into a Buffer
        const filePath = path.join(__dirname, '../../test-statement.csv');
        
        // Defensive Guard: Check if the file actually exists before reading to avoid ugly Node crashes
        if (!fs.existsSync(filePath)) {
            throw new Error(`Physical statement file not found at: ${filePath}. Please check file placement.`);
        }
        
        const fileBuffer = fs.readFileSync(filePath);
        console.log(`📄 Successfully loaded file buffer: ${fileBuffer.length} bytes`);

        // 3. Fire it into your orchestrator, passing the valid sandbox sessionId (FIX)
        const result = await processUploadedFile(sessionId, fileBuffer);
        
        console.log("\n=== Ingestion Pipe Summary ===");
        console.log(`• Status: ${result.success ? "SUCCESS" : "FAILED"}`);
        console.log(`• Records Parsed from CSV: ${result.recordsProcessed}`);
        
        // 4. Senior Verification Check: Assert that the dual-brain memory slots are populated
        console.log(`--------------------------------`);
        console.log(`• Active Ledger Array Items: ${session.transactions.length}`);
        console.log(`• Active Vector Store Density: ${session.vectorStore.get_size()} synced keys`);
        console.log("==============================\n");
        console.log("✅ Test Run Complete!");

    } catch (error) {
        console.error("\n❌ Test Failed:", error);
    }
}

runUploadTest();