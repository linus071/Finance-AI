// Rules are the simplest, most trustworthy categorizer: "merchant contains X → category Y".
// They're created when you correct a category with remember=true, and always win over
// embedding guesses. Manually set categories are never overwritten.

import type { Db } from '../db.js';

export function addRule(db: Db, pattern: string, category: string): void {
  db.prepare('INSERT OR REPLACE INTO category_rules (pattern, category) VALUES (?, ?)')
    .run(pattern.trim().toUpperCase(), category);
}

export function listRules(db: Db) {
  return db.prepare('SELECT pattern, category FROM category_rules ORDER BY pattern').all() as
    { pattern: string; category: string }[];
}

/** Apply every rule to transactions not categorized by hand. Returns rows changed. */
export function applyRules(db: Db): number {
  // Shorter patterns first, so a later, more specific "UBER EATS" overrides "UBER".
  const rules = listRules(db).sort((a, b) => a.pattern.length - b.pattern.length);
  const update = db.prepare(`
    UPDATE transactions SET category = :category, category_source = 'rule'
    WHERE instr(upper(merchant || ' ' || description), :pattern) > 0
      AND (category_source IS NULL OR category_source != 'manual')
      AND (category IS NULL OR category != :category)`);
  let changed = 0;
  for (const r of rules) changed += Number(update.run({ category: r.category, pattern: r.pattern }).changes);
  return changed;
}
