/** One transaction after reading a file, before it goes into the database. */
export interface ParsedTransaction {
  date: string;        // YYYY-MM-DD
  amountCents: number; // negative = money out
  description: string;
  account?: string;
  currency: string;
  bankId?: string;     // OFX FITID when available
}
