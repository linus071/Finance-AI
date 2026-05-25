import * as XLSX from 'xlsx';
import { create_vector_record, RawTransactionRow } from '../rag/embedder';

// Strict canonical header layout expected from Column A to H
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

/**
 * Safely converts any asset valuation or account cell into a stable string,
 * preventing Excel scientific notation string corruption (e.g., 5.4159E+15).
 */
function cleanStringCell(cellValue: any): string {
  if (cellValue === null || cellValue === undefined) return '';
  
  const trimmed = String(cellValue).trim();
  
  // If the string is stuck in scientific notation, expand it back to a standard string sequence
  if (/^\d+(\.\d+)?[eE]\+\d+$/.test(trimmed)) {
    return Number(trimmed).toFixed(0);
  }
  
  return trimmed;
}

/**
 * Strips formatting artifacts (commas, spaces, currency symbols) 
 * to guarantee flawless conversion into native numeric floats.
 */
function cleanNumericCell(cellValue: any): number {
  if (cellValue === null || cellValue === undefined || cellValue === '') return 0;
  if (typeof cellValue === 'number') return cellValue;

  const sanitized = String(cellValue)
    .replace(/[\s,$\(\)]/g, '') // Strip commas, spaces, currency indicators, and accounting parens
    .trim();

  const parsed = parseFloat(sanitized);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Core Orchestrator Endpoint: Validates and processes statements via memory buffers.
 * Integrates directly with standard multi-part file interceptors (like Multer).
 */
export async function processUploadedFile(fileBuffer: Buffer): Promise<{ success: boolean; recordsProcessed: number }> {
  // 1. Ingest file bytes using standard array-backed allocations
  const workbook = XLSX.read(fileBuffer, { 
    type: 'buffer',
    cellDates: true, // Auto-parse dates inside native XLSX structures
    raw: false       // Force string formatting evaluations where possible
  });

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert sheet to raw 2D matrix array to ensure strict index position checking (A to H)
  const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

  if (!rawRows || rawRows.length === 0) {
    throw new Error("Ingestion aborted: Target workbook file is empty.");
  }

  // 2. Validate strict schema alignment for headers (Row index 0)
  const fileHeaders = rawRows[0].map((h:any) => String(h).trim());
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    if (fileHeaders[i] !== EXPECTED_HEADERS[i]) {
      throw new Error(`Schema misalignment at column index ${i} (Expected: "${EXPECTED_HEADERS[i]}", Received: "${fileHeaders[i] || 'EMPTY'}")`);
    }
  }

  const sanitizedPayload: RawTransactionRow[] = [];

  // 3. Row Iteration Processing (Skip header row at index 0)
  for (let rowIndex = 1; rowIndex < rawRows.length; rowIndex++) {
    const currentRow = rawRows[rowIndex];

    // Defensive Guard: Skip trailing space allocations or purely blank separator entries
    if (!currentRow || currentRow.length === 0 || currentRow.every((cell:any) => cell === null || cell === '')) {
      continue;
    }

    // Preserve the transaction even if optional fields (Cheque or USD) are completely missing
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

    // Strict validation requirement: Data rows must have core routing references
    if (!transactionRecord["Transaction Date"] || !transactionRecord["Description 1"]) {
      console.warn(`[Ingestion Warning] Skipping row index ${rowIndex} due to missing primary descriptors.`);
      continue;
    }

    sanitizedPayload.push(transactionRecord);
  }

  console.log(`\n Clear for Ingestion: Verified ${sanitizedPayload.length} valid row objects. Executing throttled pipelines...`);

  // 4. Thread-Safe Batching Routine
  // Prevents concurrent connection limits from stalling local LLM token distribution tasks
  const PIPELINE_BATCH_LIMIT = 10;
  for (let batchIndex = 0; batchIndex < sanitizedPayload.length; batchIndex += PIPELINE_BATCH_LIMIT) {
    const currentBatch = sanitizedPayload.slice(batchIndex, batchIndex + PIPELINE_BATCH_LIMIT);
    
    // Execute block chunks sequentially to shield local API engines from resource starvation
    await create_vector_record(currentBatch);
  }

  return {
    success: true,
    recordsProcessed: sanitizedPayload.length
  };
}