// Figures out which CSV column is the date, amount, description... for ANY bank.
//
// Strategy: look at the header names AND at what the values look like
// (does this column parse as dates? as money?). No LLM needed, so it's fast,
// free, private and deterministic. If it guesses wrong, the caller can pass an
// explicit mapping, which then gets saved as a profile for that bank's layout.

import { z } from 'zod';
import { parseAmountCents, parseDate, type DateOrder } from '../parse.js';

export const ColumnMappingSchema = z.object({
  hasHeader: z.boolean().describe('true if the first row is column names'),
  date: z.number().int().min(0).describe('0-based column index of the transaction date'),
  dateOrder: z.enum(['YMD', 'MDY', 'DMY']).describe('how to read numeric dates like 03/04/2026'),
  description: z.array(z.number().int().min(0)).min(1).describe('column(s) joined to form the description'),
  amount: z.number().int().min(0).optional().describe('single signed amount column'),
  debit: z.number().int().min(0).optional().describe('money-out column (when the bank splits debit/credit)'),
  credit: z.number().int().min(0).optional().describe('money-in column'),
  invertSign: z.boolean().default(false).describe('true for files where purchases are positive (many credit cards)'),
  account: z.number().int().min(0).optional().describe('column holding the account number/name'),
  currency: z.string().default('CAD'),
});
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

export interface Detection {
  mapping: ColumnMapping | null;
  warnings: string[];
}

const SAMPLE = 50;

/** A date in either month-first or day-first order (we decide which one later). */
const isDate = (v: string) => parseDate(v, 'MDY') !== null || parseDate(v, 'DMY') !== null;

/**
 * Two numeric columns where (almost) every row fills exactly one of them = a
 * debit/credit split, even when there's no header to tell us so.
 */
function complementaryPair<C extends { i: number }>(body: string[][], cols: C[]): [C, C] | null {
  for (let a = 0; a < cols.length; a++) {
    for (let b = a + 1; b < cols.length; b++) {
      const exactlyOne = body.filter((r) => {
        const x = (r[cols[a]!.i] ?? '').trim() !== '';
        const y = (r[cols[b]!.i] ?? '').trim() !== '';
        return x !== y;
      }).length;
      if (exactlyOne / body.length >= 0.9) return [cols[a]!, cols[b]!];
    }
  }
  return null;
}

/** Header signature: identifies a bank's layout so we can remember its mapping. */
export function headerSignature(header: string[]): string {
  return header.map((h) => h.trim().toLowerCase()).join('|');
}

export function detectMapping(rows: string[][]): Detection {
  const warnings: string[] = [];
  if (rows.length === 0) return { mapping: null, warnings: ['File is empty.'] };

  const width = Math.max(...rows.slice(0, SAMPLE).map((r) => r.length));
  const first = rows[0]!;

  // ---- 1. Is the first row a header? (no cell in it parses as a date or amount)
  const firstLooksLikeData = first.some((c) => isDate(c));
  const hasHeader = !firstLooksLikeData;
  const header = hasHeader ? first.map((h) => h.trim().toLowerCase()) : [];
  const body = (hasHeader ? rows.slice(1) : rows).slice(0, SAMPLE);
  if (body.length === 0) return { mapping: null, warnings: ['No data rows found.'] };

  // ---- 2. Profile every column by what its values look like
  const cols = Array.from({ length: width }, (_, i) => {
    const values = body.map((r) => (r[i] ?? '').trim());
    const filled = values.filter((v) => v !== '');
    const fill = filled.length / body.length;
    const dates = filled.filter((v) => isDate(v)).length;
    const nums = filled.filter((v) => parseAmountCents(v) !== null).length;
    return {
      i,
      name: header[i] ?? '',
      fill,
      dateRatio: filled.length ? dates / filled.length : 0,
      numRatio: filled.length ? nums / filled.length : 0,
      values: filled,
    };
  });

  const named = (re: RegExp) => cols.filter((c) => re.test(c.name));

  // ---- 3. Date column: prefer "transaction date" over "posted date"
  const dateCols = cols.filter((c) => c.dateRatio > 0.9 && c.fill > 0.9);
  const dateCol =
    dateCols.find((c) => /trans/.test(c.name)) ?? dateCols.find((c) => /date/.test(c.name)) ?? dateCols[0];
  if (!dateCol) return { mapping: null, warnings: ['Could not find a date column.'] };

  // ---- 4. Date order for numeric dates like 03/04/2026
  let dateOrder: DateOrder = 'MDY';
  let sawUnambiguous = false;
  for (const v of dateCol.values) {
    const m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}$/);
    if (/^\d{4}/.test(v)) { dateOrder = 'YMD'; sawUnambiguous = true; break; }
    if (!m) continue;
    if (Number(m[1]) > 12) { dateOrder = 'DMY'; sawUnambiguous = true; break; }
    if (Number(m[2]) > 12) { dateOrder = 'MDY'; sawUnambiguous = true; break; }
  }
  if (!sawUnambiguous && dateCol.values.some((v) => /^\d{1,2}[-/.]\d{1,2}[-/.]/.test(v))) {
    warnings.push('Dates are ambiguous (e.g. 03/04): assumed month/day/year. Pass dateOrder "DMY" if wrong.');
  }

  // ---- 5. Amount: split debit/credit columns, or one signed column
  const money = cols.filter((c) => c.i !== dateCol.i && c.numRatio > 0.9 && c.values.length > 0);
  const notMoney = /balance|number|no\.?$|cheque|check|card|id$|ref/;
  const debitCol = money.find((c) => /debit|withdraw|money out|paid out|spent/.test(c.name));
  const creditCol = money.find((c) => /credit|deposit|money in|paid in|received/.test(c.name));

  let amount: number | undefined, debit: number | undefined, credit: number | undefined;
  const candidates = money.filter((c) => !notMoney.test(c.name));
  const pair = debitCol && creditCol && debitCol !== creditCol
    ? ([debitCol, creditCol] as const)
    // currency columns (RBC's CAD$ / USD$) are also "one or the other", but they aren't in/out
    : complementaryPair(body, candidates.filter((c) => !/amount|cad|usd|eur|gbp/.test(c.name)));
  if (pair) {
    // banks list money-out before money-in, so the first of an unnamed pair is the debit
    [debit, credit] = [pair[0].i, pair[1].i];
    if (!debitCol) warnings.push(`Columns ${debit} and ${credit} look like separate money-out / money-in columns.`);
  } else {
    const byName = candidates.find((c) => /amount|cad|usd|value|^\$/.test(c.name));
    // With a header: the best-filled numeric column (RBC's CAD$ beats the mostly-empty USD$).
    // Without one: the FIRST numeric column, because a trailing always-filled one is usually the balance.
    const pick = byName ?? (hasHeader ? [...candidates].sort((a, b) => b.fill - a.fill)[0] : candidates[0]);
    if (!pick) return { mapping: null, warnings: ['Could not find an amount column.'] };
    amount = pick.i;
    if (!hasHeader && candidates.length > 1) {
      warnings.push(`No header row and several numeric columns; guessed column ${pick.i} is the amount.`);
    }
  }

  // ---- 6. Account column (optional)
  const accountCol = named(/account.*(number|no|#)|^account$/)[0];

  // ---- 7. Description: remaining mostly-text columns, minus obvious non-descriptions
  const used = new Set([dateCol.i, amount, debit, credit, accountCol?.i].filter((x) => x !== undefined));
  const skip = /account|type|cheque|check|number|balance|status|currency|category|date|card/;
  let description = cols
    .filter((c) => !used.has(c.i) && c.fill > 0 && c.numRatio < 0.5 && c.dateRatio < 0.5 && !skip.test(c.name))
    .map((c) => c.i);
  if (description.length === 0) {
    return { mapping: null, warnings: [...warnings, 'Could not find a description column.'] };
  }
  const preferred = description.filter((i) => /desc|memo|payee|detail|narrative|name|merchant/.test(cols[i]!.name));
  if (preferred.length > 0) description = preferred;

  // ---- 8. Sign convention: if most single-column amounts are positive, it's probably a
  // credit card export where purchases are positive.
  let invertSign = false;
  if (amount !== undefined) {
    const vals = cols[amount]!.values.map((v) => parseAmountCents(v)!);
    const positive = vals.filter((v) => v > 0).length;
    if (positive / vals.length > 0.6) {
      invertSign = true;
      warnings.push('Most amounts are positive, so this looks like a credit-card file: treating positive as money OUT. Pass invertSign:false if wrong.');
    }
  }

  return {
    mapping: ColumnMappingSchema.parse({
      hasHeader,
      date: dateCol.i,
      dateOrder,
      description,
      amount,
      debit,
      credit,
      invertSign,
      account: accountCol?.i,
    }),
    warnings,
  };
}
