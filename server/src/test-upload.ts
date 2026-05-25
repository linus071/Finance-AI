import fs from 'fs';
import path from 'path';
import { processUploadedFile } from './routes/upload'; 
import 'dotenv/config';

async function runUploadTest() {
    console.log("Starting Upload Pipeline Test...");
    
    try {
        // 1. Read the physical file from your disk into a Buffer
        const filePath = path.join(__dirname, '../test-statement.csv');
        const fileBuffer = fs.readFileSync(filePath);
        
        console.log(`Successfully loaded file buffer: ${fileBuffer.length} bytes`);

        // 2. Fire it into your new orchestrator
        const result = await processUploadedFile(fileBuffer);
        
        console.log("\n✅ Test Complete!");
        console.log(`Status: ${result.success ? "Success" : "Failed"}`);
        console.log(`Records Processed: ${result.recordsProcessed}`);

    } catch (error) {
        console.error("\n❌ Test Failed:", error);
    }
}

runUploadTest();