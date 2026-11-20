// Read-side queries. All math happens here in SQL, so numbers are exact.
// The LLM's job is only to pick the right query and explain the result.

import type { Db } from './db.js';

export interface Filters {
  from?: string;          // inclusive YYYY-MM-DD
  to?: string;            // inclusive YYYY-MM-DD
  category?: string;      // exact category, or "uncategorized"
  search?: string;        // substring of merchant/description
  direction?: 'out' | 'in' | 'all';
  account?: string;
}

/** Builds a WHERE clause + named params from filters (never string-concatenates user values). */
function where(f: Filters): { sql: string; params: Record<string, string> } {
  const clauses: string[] = [];
  const params: Record<string, string> = {};
  if (f.from) { clauses.push('date >= :from'); params.from = f.from; }
  if (f.to) { clauses.push('date <= :to'); params.to = f.to; }
  if (f.category?.toLowerCase() === 'uncategorized') clauses.push('category IS NULL');
  else if (f.category) { clauses.push('category = :category COLLATE NOCASE'); params.category = f.category; }
  if (f.search) {
    clauses.push(`(merchant LIKE :search OR description LIKE :search)`);
    params.search = `%${f.search}%`;
  }
  if (f.account) { clauses.push('account = :account'); params.account = f.account; }
  if (f.direction === 'out') clauses.push('amount_cents < 0');
  if (f.direction === 'in') clauses.push('amount_cents > 0');
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

const dollars = (cents: number) => Math.round(cents) / 100;

export function listTransactions(db: Db, f: Filters & { limit?: number; sort?: 'date' | 'amount' }) {
  const { sql, params } = where(f);
  // "amount" sort = biggest money movements first, regardless of sign
  const order = f.sort === 'amount' ? 'ABS(amount_cents) DESC' : 'date DESC, id DESC';
  const limit = Math.min(f.limit ?? 50, 500);
  const rows = db.prepare(`
    SELECT id, date, amount_cents, currency, merchant, description, category, account
    FROM transactions ${sql} ORDER BY ${order} LIMIT ${limit}`).all(params) as any[];
  const total = (db.prepare(`SELECT COUNT(*) n FROM transactions ${sql}`).get(params) as { n: number }).n;
  return {
    totalMatching: total,
    shown: rows.length,
    transactions: rows.map(({ amount_cents, ...r }) => ({ ...r, amount: dollars(amount_cents) })),
  };
}

export function spendingSummary(db: Db, f: Filters & { groupBy: 'category' | 'merchant' | 'month' }) {
  const { sql, params } = where({ ...f, direction: f.direction ?? 'out' });
  const key = {
    category: `COALESCE(category, 'Uncategorized')`,
    merchant: 'merchant',
    month: `substr(date, 1, 7)`,
  }[f.groupBy];
  const rows = db.prepare(`
    SELECT ${key} AS grp, SUM(amount_cents) AS cents, COUNT(*) AS n
    FROM transactions ${sql}
    GROUP BY grp
    ORDER BY ${f.groupBy === 'month' ? 'grp' : 'ABS(SUM(amount_cents)) DESC'}`).all(params) as
    { grp: string; cents: number; n: number }[];

  const totalCents = rows.reduce((s, r) => s + r.cents, 0);
  return {
    groupBy: f.groupBy,
    filters: f,
    total: dollars(totalCents),
    groups: rows.map((r) => ({
      [f.groupBy]: r.grp,
      total: dollars(r.cents),
      count: r.n,
      share: totalCents ? Math.round((r.cents / totalCents) * 1000) / 10 : 0, // percent
    })),
  };
}

/**
 * Recurring charges (subscriptions, bills): merchants charged in at least `minMonths`
 * different months with a fairly stable amount. Pure SQL + a little arithmetic.
 */
export function findRecurring(db: Db, minMonths = 3) {
  const rows = db.prepare(`
    SELECT merchant,
           COUNT(DISTINCT substr(date, 1, 7)) AS months,
           COUNT(*)                           AS n,
           AVG(amount_cents)                  AS avg_cents,
           MIN(amount_cents)                  AS min_cents,
           MAX(amount_cents)                  AS max_cents,
           MAX(date)                          AS last_seen,
           MAX(category)                      AS category
    FROM transactions
    WHERE amount_cents < 0
    GROUP BY merchant
    HAVING months >= ?
    ORDER BY avg_cents ASC`).all(minMonths) as any[];

  return rows
    .map((r) => {
      // spread relative to the average; < 25% means "about the same amount each time"
      const spread = Math.abs((r.max_cents - r.min_cents) / r.avg_cents);
      return {
        merchant: r.merchant,
        category: r.category,
        months: r.months,
        charges: r.n,
        averageAmount: dollars(r.avg_cents),
        lastSeen: r.last_seen,
        stableAmount: spread < 0.25,
      };
    })
    .sort((a, b) => Number(b.stableAmount) - Number(a.stableAmount));
}

export function overview(db: Db) {
  const r = db.prepare(`
    SELECT COUNT(*) n, MIN(date) first, MAX(date) last,
           SUM(CASE WHEN category IS NULL THEN 1 ELSE 0 END) uncategorized,
           COUNT(DISTINCT account) accounts
    FROM transactions`).get() as any;
  const categories = db.prepare(`
    SELECT category, COUNT(*) n FROM transactions WHERE category IS NOT NULL
    GROUP BY category ORDER BY n DESC`).all();
  return {
    transactions: r.n,
    dateRange: r.n ? { from: r.first, to: r.last } : null,
    accounts: r.accounts,
    uncategorized: r.uncategorized ?? 0,
    categoriesInUse: categories,
  };
}

/** Set a category by explicit ids, or for every transaction whose merchant contains a pattern. */
export function setCategory(db: Db, args: { ids?: number[]; merchantContains?: string; category: string }) {
  if (args.ids?.length) {
    const stmt = db.prepare(`UPDATE transactions SET category = ?, category_source = 'manual' WHERE id = ?`);
    return args.ids.reduce((n, id) => n + Number(stmt.run(args.category, id).changes), 0);
  }
  if (args.merchantContains) {
    return Number(db.prepare(`
      UPDATE transactions SET category = ?, category_source = 'manual'
      WHERE instr(upper(merchant || ' ' || description), upper(?)) > 0`)
      .run(args.category, args.merchantContains).changes);
  }
  throw new Error('Pass either ids or merchantContains.');
}
