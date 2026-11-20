import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { openDb } from '../src/db.js';
import { parseCsv } from '../src/importers/csv.js';
import { detectMapping } from '../src/importers/mapping.js';
import { importFile, previewFile } from '../src/importers/index.js';
import { normalizeMerchant, parseAmountCents, parseDate } from '../src/parse.js';
import { findRecurring, listTransactions, setCategory, spendingSummary } from '../src/queries.js';
import { addRule, applyRules } from '../src/categorize/rules.js';

const fixture = (name: string) => path.join(import.meta.dirname, 'fixtures', name);
const rowsOf = (name: string) => parseCsv(fs.readFileSync(fixture(name), 'utf8'));
const freshDb = () => openDb(':memory:');

test('parseAmountCents handles bank formatting', () => {
  assert.equal(parseAmountCents('-34.22'), -3422);
  assert.equal(parseAmountCents('$1,234.56'), 123456);
  assert.equal(parseAmountCents('(12.00)'), -1200);
  assert.equal(parseAmountCents('12.00-'), -1200);
  assert.equal(parseAmountCents(''), null);
  assert.equal(parseAmountCents('abc'), null);
  assert.equal(parseAmountCents('0.1'), 10);
});

test('parseDate handles common formats', () => {
  assert.equal(parseDate('1/19/2026', 'MDY'), '2026-01-19');
  assert.equal(parseDate('19/01/2026', 'DMY'), '2026-01-19');
  assert.equal(parseDate('2026-01-19'), '2026-01-19');
  assert.equal(parseDate('20260119120000[-5:EST]'), '2026-01-19');
  assert.equal(parseDate('19 Jan 2026'), '2026-01-19');
  assert.equal(parseDate('Jan 19, 2026'), '2026-01-19');
  assert.equal(parseDate('2/30/2026'), null);
  assert.equal(parseDate('hello'), null);
});

test('normalizeMerchant strips bank noise', () => {
  assert.equal(normalizeMerchant('C-IDP PURCHASE-6760 TASTY BBQ AND B'), 'TASTY BBQ AND B');
  assert.equal(normalizeMerchant('WWW PAYMENT - 8822 FIDO'), 'FIDO');
});

test('parseCsv handles quotes, commas and escaped quotes', () => {
  assert.deepEqual(parseCsv('a,"b,c","say ""hi"""\r\n1,2,3\n'), [['a', 'b,c', 'say "hi"'], ['1', '2', '3']]);
});

test('detects RBC-style layout', () => {
  const { mapping } = detectMapping(rowsOf('rbc-style.csv'));
  assert.ok(mapping);
  assert.equal(mapping.date, 2);
  assert.deepEqual(mapping.description, [4, 5]);
  assert.equal(mapping.amount, 6);
  assert.equal(mapping.account, 1);
  assert.equal(mapping.invertSign, false);
});

test('detects headerless debit/credit/balance (not the balance!)', () => {
  const { mapping } = detectMapping(rowsOf('no-header-split.csv'));
  assert.ok(mapping);
  assert.equal(mapping.hasHeader, false);
  assert.equal(mapping.debit, 2);
  assert.equal(mapping.credit, 3);
  assert.deepEqual(mapping.description, [1]);
});

test('detects named Withdrawals/Deposits columns', () => {
  const { mapping } = detectMapping(rowsOf('named-split.csv'));
  assert.ok(mapping);
  assert.equal(mapping.debit, 2);
  assert.equal(mapping.credit, 3);
});

test('credit card file: positive purchases become money out', () => {
  const { mapping, warnings } = detectMapping(rowsOf('credit-card.csv'));
  assert.ok(mapping);
  assert.equal(mapping.date, 0, 'prefers transaction date over posted date');
  assert.equal(mapping.invertSign, true);
  assert.ok(warnings.some((w) => /credit-card/.test(w)));
});

test('day-first dates are detected', () => {
  const db = freshDb();
  importFile(db, fixture('day-first.csv'));
  const dates = listTransactions(db, {}).transactions.map((t) => t.date).sort();
  assert.deepEqual(dates, ['2026-01-25', '2026-02-03']);
});

test('every fixture imports with correct signs', () => {
  const db = freshDb();
  const expected: Record<string, number> = {
    'rbc-style.csv': 6, 'no-header-split.csv': 3, 'named-split.csv': 2,
    'credit-card.csv': 4, 'day-first.csv': 2, 'sample.ofx': 2,
  };
  for (const [file, n] of Object.entries(expected)) {
    const r = importFile(db, fixture(file));
    assert.equal(r.inserted, n, file);
    assert.deepEqual(r.rowsSkipped, [], file);
  }
  const amount = (search: string) => listTransactions(db, { search }).transactions[0]!.amount;
  assert.equal(amount('RENT'), -1500);
  assert.equal(amount('SALARY'), 3000);
  assert.equal(amount('GROCERY MART'), -82.1);
  assert.equal(amount('STREAMING CO'), -15.99);
  assert.equal(amount('PAYMENT THANK YOU'), 75.99);
  assert.equal(amount('COFFEE SHOP POS'), -12.5);
});

test('re-importing is idempotent, but identical same-day rows are kept', () => {
  const db = freshDb();
  const csv = path.join(import.meta.dirname, 'fixtures', 'dupes.tmp.csv');
  fs.writeFileSync(csv, 'Date,Description,Amount\n2026-01-01,COFFEE,-5.00\n2026-01-01,COFFEE,-5.00\n');
  try {
    assert.equal(importFile(db, csv).inserted, 2);
    const again = importFile(db, csv);
    assert.equal(again.inserted, 0);
    assert.equal(again.duplicatesSkipped, 2);
  } finally {
    fs.unlinkSync(csv);
  }
});

test('mapping is remembered as a profile', () => {
  const db = freshDb();
  importFile(db, fixture('rbc-style.csv'));
  assert.equal(previewFile(db, fixture('rbc-style.csv')).mappingSource, 'saved-profile');
});

test('summaries, recurring and rules', () => {
  const db = freshDb();
  importFile(db, fixture('rbc-style.csv'));

  const s = spendingSummary(db, { groupBy: 'merchant' });
  assert.equal(s.total, -(151 + 34.22 + 44.8 * 3));

  const recurring = findRecurring(db, 3);
  assert.equal(recurring[0]?.merchant, 'PHONECO');
  assert.equal(recurring[0]?.stableAmount, true);

  addRule(db, 'phoneco', 'Bills & Utilities');
  assert.equal(applyRules(db), 3);
  assert.equal(applyRules(db), 0, 'nothing changes the second time');

  // manual categories are never overwritten by rules
  const bbq = listTransactions(db, { search: 'BBQ' }).transactions[0]!;
  setCategory(db, { ids: [bbq.id], category: 'Dining' });
  addRule(db, 'BBQ', 'Groceries');
  applyRules(db);
  assert.equal(listTransactions(db, { search: 'BBQ' }).transactions[0]!.category, 'Dining');

  const byCat = spendingSummary(db, { groupBy: 'category' });
  assert.equal(byCat.groups.find((g) => g.category === 'Bills & Utilities')?.total, -134.4);
});
