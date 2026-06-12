import * as XLSX from 'xlsx';
import { IngesterFactory } from '../rag/factory/IngesterFactory';
import { RawTransactionRow } from '../rag/factory/types';
import { sessionStore } from '../session';

const EXPECTED_HEADERS = [
  "Account Type",
  "Account Number",
  "Transaction Date",
  "Cheque Number",
  "Description 1",
  "Description 2",
  "CAD$",
  "USD$"
];

function cleanStringCell(cellValue: any): string {
  if (cellValue === null || cellValue === undefined) return '';
  const trimmed = String(cellValue).trim();
  if (/^\d+(\.\d+)?[eE]\+\d+$/.test(trimmed)) {
    return Number(trimmed).toFixed(0);
  }
  return trimmed;
}

function cleanNumericCell(cellValue: any): number {
  if (cellValue === null || cellValue === undefined || cellValue === '') return 0;
  if (typeof cellValue === 'number') return cellValue;
  const sanitized = String(cellValue).replace(/[\s,$\(\)]/g, '').trim();
  const parsed = parseFloat(sanitized);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Core Orchestrator Endpoint: Validates and processes statements via memory buffers.
 */
export async function processUploadedFile(sessionId: string, fileBuffer: Buffer): Promise<{ success: boolean; recordsProcessed: number }> {
  const session = sessionStore.get(sessionId);
  if (!session) {
    throw new Error(`Ingestion aborted: Active session container "${sessionId}" was not found.`);
  }

  // 1. Ingest file bytes
  const workbook = XLSX.read(fileBuffer, { 
    type: 'buffer',
    cellDates: true, 
    raw: false       
  });

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

  if (!rawRows || rawRows.length === 0) {
    throw new Error("Ingestion aborted: Target workbook file is empty.");
  }

  // 2. Validate strict schema alignment for headers
  const fileHeaders = rawRows[0].map((h:any) => String(h).trim());
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    if (fileHeaders[i] !== EXPECTED_HEADERS[i]) {
      throw new Error(`Schema misalignment at column index ${i} (Expected: "${EXPECTED_HEADERS[i]}", Received: "${fileHeaders[i] || 'EMPTY'}")`);
    }
  }

  const sanitizedPayload: RawTransactionRow[] = [];

  // 3. Row Iteration Processing
  for (let rowIndex = 1; rowIndex < rawRows.length; rowIndex++) {
    const currentRow = rawRows[rowIndex];

    if (!currentRow || currentRow.length === 0 || currentRow.every((cell:any) => cell === null || cell === '')) {
      continue;
    }

    const transactionRecord: RawTransactionRow = {
      "Account Type": cleanStringCell(currentRow[0]),
      "Account Number": cleanStringCell(currentRow[1]),
      "Transaction Date": cleanStringCell(currentRow[2]),
      "Cheque Number": currentRow[3] ? cleanStringCell(currentRow[3]) : undefined,
      "Description 1": cleanStringCell(currentRow[4]),
      "Description 2": currentRow[5] ? cleanStringCell(currentRow[5]) : ' ',
      "CAD$": cleanNumericCell(currentRow[6]),
      "USD$": currentRow[7] ? cleanNumericCell(currentRow[7]) : undefined
    };

    if (!transactionRecord["Transaction Date"] || !transactionRecord["Description 1"]) {
      console.warn(`[Ingestion Warning] Skipping row index ${rowIndex} due to missing primary descriptors.`);
      continue;
    }

    sanitizedPayload.push(transactionRecord);
  }

  console.log(`\n Clear for Ingestion: Verified ${sanitizedPayload.length} valid row objects. Executing ingestion pipeline...`);

  const provider = process.env.LLM_PROVIDER || 'groq';
  const ingester = IngesterFactory.getIngester(provider);
  await ingester.ingest(session, sanitizedPayload);

  return {
    success: true,  
    recordsProcessed: sanitizedPayload.length
  };
}