// Import pipeline:  file → rows → ParsedTransaction[] → (dedupe) → transactions table
//
// For CSV the column mapping comes from, in order:
//   1. an explicit mapping passed by the caller
//   2. a saved profile for this exact header row (remembered from a previous import)
//   3. auto-detection (importers/mapping.ts)

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { inTransaction, type Db } from '../db.js';
import { normalizeMerchant, parseAmountCents, parseDate } from '../parse.js';
import { applyRules } from '../categorize/rules.js';
import { parseCsv } from './csv.js';
import { ColumnMappingSchema, detectMapping, headerSignature, type ColumnMapping } from './mapping.js';
import { looksLikeOfx, parseOfx } from './ofx.js';
import type { ParsedTransaction } from './types.js';

export interface PreviewResult {
  format: 'csv' | 'ofx';
  header?: string[];
  sampleRows: string[][];
  mapping?: ColumnMapping;
  mappingSource?: 'saved-profile' | 'auto-detected';
  warnings: string[];
  parsedSample: ParsedTransaction[];
}

export interface ImportResult {
  format: 'csv' | 'ofx';
  inserted: number;
  duplicatesSkipped: number;
  rowsSkipped: { row: number; reason: string }[];
  autoCategorized: number;
  dateRange?: { from: string; to: string };
  warnings: string[];
}

function readText(file: string): string {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function savedProfile(db: Db, rows: string[][]): ColumnMapping | undefined {
  if (!rows[0]) return undefined;
  const hit = db
    .prepare('SELECT mapping_json FROM import_profiles WHERE header_signature = ?')
    .get(headerSignature(rows[0])) as { mapping_json: string } | undefined;
  return hit ? ColumnMappingSchema.parse(JSON.parse(hit.mapping_json)) : undefined;
}

function resolveMapping(db: Db, rows: string[][], explicit?: ColumnMapping) {
  if (explicit) return { mapping: explicit, source: 'explicit' as const, warnings: [] };
  const saved = savedProfile(db, rows);
  if (saved) return { mapping: saved, source: 'saved-profile' as const, warnings: [] };
  const { mapping, warnings } = detectMapping(rows);
  return { mapping, source: 'auto-detected' as const, warnings };
}

/** Apply a mapping to raw CSV rows. Rows that can't be read are reported, not silently dropped. */
export function rowsToTransactions(rows: string[][], m: ColumnMapping) {
  const body = m.hasHeader ? rows.slice(1) : rows;
  const offset = m.hasHeader ? 2 : 1; // human row numbers (1-based, counting the header)
  const ok: ParsedTransaction[] = [];
  const skipped: { row: number; reason: string }[] = [];

  body.forEach((r, idx) => {
    const date = parseDate(r[m.date], m.dateOrder);
    if (!date) return skipped.push({ row: idx + offset, reason: `bad date "${r[m.date] ?? ''}"` });

    let cents: number | null;
    if (m.amount !== undefined) {
      cents = parseAmountCents(r[m.amount]);
    } else {
      // split columns: both usually hold positive numbers; one of them is empty
      const out = parseAmountCents(r[m.debit!]);
      const inn = parseAmountCents(r[m.credit!]);
      cents = out === null && inn === null ? null : Math.abs(inn ?? 0) - Math.abs(out ?? 0);
    }
    if (cents === null) return skipped.push({ row: idx + offset, reason: 'no amount' });
    if (m.invertSign) cents = -cents;

    const description = m.description.map((i) => (r[i] ?? '').trim()).filter(Boolean).join(' ');
    ok.push({
      date,
      amountCents: cents,
      description: description || '(no description)',
      account: m.account !== undefined ? r[m.account]?.trim() || undefined : undefined,
      currency: m.currency,
    });
  });
  return { ok, skipped };
}

export function previewFile(db: Db, file: string, explicit?: ColumnMapping): PreviewResult {
  const text = readText(file);
  if (looksLikeOfx(text)) {
    const txs = parseOfx(text);
    return { format: 'ofx', sampleRows: [], warnings: txs.length ? [] : ['No transactions found.'], parsedSample: txs.slice(0, 5) };
  }
  const rows = parseCsv(text);
  const { mapping, source, warnings } = resolveMapping(db, rows, explicit);
  return {
    format: 'csv',
    header: rows[0],
    sampleRows: rows.slice(1, 6),
    mapping: mapping ?? undefined,
    mappingSource: source === 'explicit' ? undefined : source,
    warnings,
    parsedSample: mapping ? rowsToTransactions(rows.slice(0, 6), mapping).ok : [],
  };
}

/**
 * Fingerprint = hash(account, date, amount, description, n) where n counts identical
 * rows within this file. Two identical $5 coffees on the same day stay two rows, but
 * importing the same file (or an overlapping statement) twice doesn't duplicate them.
 */
function fingerprints(txs: ParsedTransaction[]): string[] {
  const seen = new Map<string, number>();
  return txs.map((t) => {
    if (t.bankId) return `fitid:${t.account ?? ''}:${t.bankId}`;
    const base = [t.account ?? '', t.date, t.amountCents, t.description.toUpperCase()].join('|');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return crypto.createHash('sha256').update(`${base}|${n}`).digest('hex').slice(0, 32);
  });
}

export function importFile(db: Db, file: string, opts: { mapping?: ColumnMapping; dryRun?: boolean } = {}): ImportResult {
  const text = readText(file);
  let format: 'csv' | 'ofx';
  let txs: ParsedTransaction[];
  let skipped: { row: number; reason: string }[] = [];
  let warnings: string[] = [];
  let profileToSave: { signature: string; mapping: ColumnMapping } | undefined;

  if (looksLikeOfx(text)) {
    format = 'ofx';
    txs = parseOfx(text);
  } else {
    format = 'csv';
    const rows = parseCsv(text);
    const resolved = resolveMapping(db, rows, opts.mapping);
    warnings = resolved.warnings;
    if (!resolved.mapping) {
      throw new Error(`Could not work out this CSV's columns: ${warnings.join(' ')} Use preview_statement and pass an explicit mapping.`);
    }
    ({ ok: txs, skipped } = rowsToTransactions(rows, resolved.mapping));
    if (resolved.mapping.hasHeader && rows[0]) {
      profileToSave = { signature: headerSignature(rows[0]), mapping: resolved.mapping };
    }
  }

  if (txs.length === 0) throw new Error('No readable transactions in this file.');

  const fps = fingerprints(txs);
  const dates = txs.map((t) => t.date).sort();
  const result: ImportResult = {
    format,
    inserted: 0,
    duplicatesSkipped: 0,
    rowsSkipped: skipped,
    autoCategorized: 0,
    dateRange: { from: dates[0]!, to: dates[dates.length - 1]! },
    warnings,
  };

  if (opts.dryRun) {
    const exists = db.prepare('SELECT 1 FROM transactions WHERE fingerprint = ?');
    for (const fp of fps) (exists.get(fp) ? result.duplicatesSkipped++ : result.inserted++);
    return result;
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO transactions
      (date, amount_cents, currency, description, merchant, account, source_file, fingerprint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  inTransaction(db, () => {
    txs.forEach((t, i) => {
      const r = insert.run(
        t.date, t.amountCents, t.currency, t.description,
        normalizeMerchant(t.description), t.account ?? null, path.basename(file), fps[i]!,
      );
      r.changes ? result.inserted++ : result.duplicatesSkipped++;
    });
    if (profileToSave) {
      db.prepare('INSERT OR REPLACE INTO import_profiles (header_signature, mapping_json) VALUES (?, ?)')
        .run(profileToSave.signature, JSON.stringify(profileToSave.mapping));
    }
  });

  result.autoCategorized = applyRules(db);
  return result;
}
