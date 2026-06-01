// server/src/index.ts
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import { handleQuery } from './routes/query'; // Import your query handler

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Wire up the query route
app.post('/query', handleQuery);

// Upload route placeholder (for later)
app.post('/upload', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Upload route not implemented yet' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`FinanceAI server listening on http://localhost:${PORT}`);
  });
}

export default app;