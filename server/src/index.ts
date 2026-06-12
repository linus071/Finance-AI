import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { processUploadedFile } from './routes/upload';
import { handleQuery } from './routes/query';
import { createSession } from './session';

// Load environmental keys
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configure CORS so your React frontend (typically port 5173 or 3000) can securely communicate
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Initialize Multer to process files inside your computer's temporary RAM buffer
const uploadInterceptor = multer({ storage: multer.memoryStorage() });

/**
 * Endpoint A: Initialize a fresh isolated session container 
 * Returns a new sessionId context to your React state machine.
 */
app.get('/api/session/init', (req, res) => {
  const newSession = createSession();
  console.log(`✨ [API]: Generated a fresh session context sandbox: ${newSession.sessionId}`);
  res.json({ sessionId: newSession.sessionId });
});

/**
 * Endpoint B: Drag-and-Drop Statement Ingestion
 * Intercepts real multipart form files from browsers, processes the rows, and triggers embeddings.
 */
app.post('/api/upload', uploadInterceptor.single('file'), async (req, res) => {
  const sessionId = req.body.sessionId;
  const attachedFile = req.file;

  if (!sessionId) {
    res.status(400).json({ error: 'Missing active sessionId initialization header parameter.' });
    return;
  }
  if (!attachedFile) {
    res.status(400).json({ error: 'Payload empty: No bank statement file detected.' });
    return;
  }

  try {
    console.log(`📥 [API]: Intercepted browser statement upload request for session: ${sessionId}`);
    
    const parsingReport = await processUploadedFile(sessionId, attachedFile.buffer);
    
    res.json(parsingReport);
  } catch (error: any) {
    console.error("File Ingestion Endpoint Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Endpoint C: Chat Conversation Loop
 * Exposes Bob's brain routing straight to the web client.
 */
app.post('/api/chat', handleQuery);

// Spin up the listener loop
app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 FINANCE AI WEB SERVER STANDING LIVE ON PORT: ${PORT}`);
  console.log(`🌐 API Active Entrypoint: http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});