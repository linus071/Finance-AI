// Small, pure parsing helpers for the messy values banks put in files.

/** "1,234.56" | "$1,234.56" | "(12.00)" | "-12" | "12.00-" → cents (integer). null if not a number. */
export function parseAmountCents(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.trim();
  if (s === '') return null;

  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true; // accounting style: (12.00) means -12.00
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    negative = true; // some banks put the minus at the end
    s = s.slice(0, -1);
  }
  s = s.replace(/[$€£\s,]/g, '').replace(/^(CAD|USD|EUR|GBP)/i, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;

  // Math.round avoids float noise like 34.22 * 100 = 3421.9999999
  const cents = Math.round(parseFloat(s) * 100);
  return negative ? -cents : cents;
}

export type DateOrder = 'YMD' | 'MDY' | 'DMY';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse a bank date into ISO 'YYYY-MM-DD'. Returns null if it isn't a date.
 * Handles 2026-01-19, 20260119, 1/19/2026, 19/01/2026, 19 Jan 2026, Jan 19, 2026.
 * `order` resolves ambiguous numeric dates like 03/04/2026.
 */
export function parseDate(raw: string | undefined, order: DateOrder = 'MDY'): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let y: number, m: number, d: number;

  let match: RegExpMatchArray | null;
  if ((match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{4})(\d{2})(\d{2})(\d{6})?(\.\d+)?(\[.*\])?$/))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]; // OFX: 20260119120000[-5:EST]
  } else if ((match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    const a = Number(match[1]), b = Number(match[2]);
    y = Number(match[3]);
    if (y < 100) y += 2000;
    [m, d] = order === 'DMY' ? [b, a] : [a, b];
  } else if ((match = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{4})$/))) {
    d = Number(match[1]); m = MONTHS[match[2]!.toLowerCase()] ?? 0; y = Number(match[3]);
  } else if ((match = s.match(/^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/))) {
    m = MONTHS[match[1]!.toLowerCase()] ?? 0; d = Number(match[2]); y = Number(match[3]);
  } else {
    return null;
  }

  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCDate() !== d) return null; // rejects Feb 30 etc.
  return date.toISOString().slice(0, 10);
}

/**
 * Turn raw bank text into a stable merchant name for grouping.
 * "C-IDP PURCHASE-6760 TASTY BBQ AND B" → "TASTY BBQ AND B"
 * "WWW PAYMENT - 8822 FIDO"            → "FIDO"
 * Deliberately simple; extend NOISE as you meet new banks.
 */
const NOISE = [
  /\b(C-)?IDP\b/g, /\bPOS\b/g, /\bPURCHASE\b/g, /\bWWW\b/g, /\bPAYMENT\b/g,
  /\bINTERAC\b/g, /\bVISA DEBIT\b/g, /\bDEBIT CARD\b/g, /\bRECURRING\b/g,
  /\bSQ \*/g, /\bTST\*/g, /\bPP\*/g,
];

export function normalizeMerchant(description: string): string {
  let s = description.toUpperCase();
  for (const re of NOISE) s = s.replace(re, ' ');
  s = s
    .replace(/#?\b[A-Z]*\d[\dA-Z]*\b/g, ' ') // tokens containing digits: store #s, card #s, refs
    .replace(/[^A-Z&' .]/g, ' ')             // punctuation
    .replace(/\s+/g, ' ')
    .trim();
  return s || description.trim().toUpperCase();
}
