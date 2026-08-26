import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAmount,
  toDate,
  normalizeMerchant,
  classifyCadence,
  detectSubscriptions,
  pickColumns,
  transactionsFromCsv,
} from '../src/subscan.mjs';
import { parseCsv } from '../src/parse.mjs';

// ---- parseAmount --------------------------------------------------------------

test('parseAmount handles currency symbols, commas, signs, parentheses', () => {
  assert.equal(parseAmount('$1,234.56'), 1234.56);
  assert.equal(parseAmount('12.34'), 12.34);
  assert.equal(parseAmount('-12.34'), -12.34);
  assert.equal(parseAmount('(12.34)'), -12.34); // accounting negative
  assert.equal(parseAmount('12.34 CR'), -12.34); // credit
  assert.equal(parseAmount('  9.99  '), 9.99);
  assert.equal(parseAmount(15), 15);
});

test('parseAmount returns NaN when there is no number', () => {
  assert.ok(Number.isNaN(parseAmount('')));
  assert.ok(Number.isNaN(parseAmount('n/a')));
  assert.ok(Number.isNaN(parseAmount(null)));
});

// ---- toDate -------------------------------------------------------------------

test('toDate parses common statement date formats to UTC midnight', () => {
  assert.equal(toDate('2026-01-15').toISOString().slice(0, 10), '2026-01-15');
  assert.equal(toDate('2026/01/15').toISOString().slice(0, 10), '2026-01-15');
  assert.equal(toDate('01/15/2026').toISOString().slice(0, 10), '2026-01-15'); // US MM/DD/YYYY
  assert.equal(toDate('1/5/26').toISOString().slice(0, 10), '2026-01-05');
});

test('toDate returns null for empty/garbage input', () => {
  assert.equal(toDate(''), null);
  assert.equal(toDate('not a date'), null);
});

// ---- normalizeMerchant --------------------------------------------------------

test('normalizeMerchant collapses the same merchant despite noise', () => {
  const a = normalizeMerchant('NETFLIX.COM 866-579-7172 CA');
  const b = normalizeMerchant('NETFLIX 8887 LOS GATOS CA');
  const c = normalizeMerchant('SQ *NETFLIX #4471');
  assert.equal(a, 'NETFLIX');
  assert.equal(b, 'NETFLIX');
  assert.equal(c, 'NETFLIX');
});

test('normalizeMerchant keeps multiword identities and drops ref numbers', () => {
  assert.equal(normalizeMerchant('AMAZON PRIME*2H4XY9 AMZN.COM/BILL WA'), 'AMAZON PRIME');
  assert.equal(normalizeMerchant('PAYPAL *SPOTIFY 35314369001'), 'SPOTIFY');
});

test('normalizeMerchant returns empty for pure noise', () => {
  assert.equal(normalizeMerchant('#12345 999'), '');
  assert.equal(normalizeMerchant(''), '');
});

// ---- classifyCadence ----------------------------------------------------------

test('classifyCadence maps gaps to billing cycles', () => {
  assert.equal(classifyCadence(7).label, 'weekly');
  assert.equal(classifyCadence(30).label, 'monthly');
  assert.equal(classifyCadence(31).label, 'monthly');
  assert.equal(classifyCadence(91).label, 'quarterly');
  assert.equal(classifyCadence(365).label, 'annual');
});

test('classifyCadence rejects irregular spacing (not a subscription)', () => {
  assert.equal(classifyCadence(3), null);
  assert.equal(classifyCadence(20), null);
  assert.equal(classifyCadence(120), null);
});

// ---- detectSubscriptions ------------------------------------------------------

function monthly(desc, amount, startISO, n) {
  const out = [];
  const [y, m, d] = startISO.split('-').map(Number);
  for (let i = 0; i < n; i++) {
    out.push({ date: new Date(Date.UTC(y, m - 1 + i, d)).toISOString().slice(0, 10), desc, amount });
  }
  return out;
}

test('detects a clean monthly subscription and computes annual cost', () => {
  const txns = monthly('NETFLIX.COM CA', 15.49, '2026-01-05', 4);
  const { subscriptions, count, totalAnnual } = detectSubscriptions(txns);
  assert.equal(count, 1);
  const s = subscriptions[0];
  assert.equal(s.merchant, 'NETFLIX');
  assert.equal(s.cadence, 'monthly');
  assert.equal(s.typicalAmount, 15.49);
  assert.equal(s.annual, round2(15.49 * 12));
  assert.equal(s.priceIncrease, false);
  assert.equal(totalAnnual, round2(15.49 * 12));
});

test('flags a price increase across the series', () => {
  const txns = [
    ...monthly('SPOTIFY USA', 9.99, '2026-01-10', 2),
    ...monthly('SPOTIFY USA', 11.99, '2026-03-10', 2),
  ];
  const { subscriptions } = detectSubscriptions(txns);
  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].priceIncrease, true);
  assert.equal(subscriptions[0].firstAmount, 9.99);
  assert.equal(subscriptions[0].lastAmount, 11.99);
});

test('does NOT flag irregular, variable spend as a subscription', () => {
  // Groceries: same merchant, random gaps, wildly varying amounts.
  const txns = [
    { date: '2026-01-03', desc: 'WHOLE FOODS MKT', amount: 84.12 },
    { date: '2026-01-06', desc: 'WHOLE FOODS MKT', amount: 22.5 },
    { date: '2026-01-19', desc: 'WHOLE FOODS MKT', amount: 143.9 },
    { date: '2026-01-21', desc: 'WHOLE FOODS MKT', amount: 9.75 },
  ];
  const { count } = detectSubscriptions(txns);
  assert.equal(count, 0);
});

test('a single charge is never called a subscription', () => {
  const { count } = detectSubscriptions([{ date: '2026-02-01', desc: 'ADOBE', amount: 54.99 }]);
  assert.equal(count, 0);
});

test('detects an annual subscription from two charges a year apart', () => {
  const txns = [
    { date: '2025-03-01', desc: 'AMAZON PRIME AMZN.COM WA', amount: 139 },
    { date: '2026-03-01', desc: 'AMAZON PRIME AMZN.COM WA', amount: 139 },
  ];
  const { subscriptions } = detectSubscriptions(txns);
  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].cadence, 'annual');
  assert.equal(subscriptions[0].annual, 139);
  assert.equal(subscriptions[0].monthly, round2(139 / 12));
});

test('ignores credits/refunds (non-positive amounts)', () => {
  const txns = [
    ...monthly('HULU', 17.99, '2026-01-08', 3),
    { date: '2026-02-08', desc: 'HULU REFUND', amount: -17.99 },
  ];
  const { subscriptions } = detectSubscriptions(txns);
  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].chargeCount, 3);
});

test('ranks subscriptions by annual cost, biggest first, and totals reconcile', () => {
  const txns = [
    ...monthly('NETFLIX', 22.99, '2026-01-01', 3),
    ...monthly('ICLOUD APPLE', 2.99, '2026-01-01', 3),
    ...monthly('NYTIMES', 17.0, '2026-01-01', 3),
  ];
  const { subscriptions, totalMonthly, totalAnnual } = detectSubscriptions(txns);
  assert.equal(subscriptions.length, 3);
  assert.deepEqual(
    subscriptions.map((s) => s.merchant),
    ['NETFLIX', 'NYTIMES', 'ICLOUD'],
  );
  const sumMonthly = round2(subscriptions.reduce((a, s) => a + s.monthly, 0));
  assert.equal(totalMonthly, sumMonthly);
  assert.equal(totalAnnual, round2(subscriptions.reduce((a, s) => a + s.annual, 0)));
});

// ---- CSV column mapping + integration ----------------------------------------

test('pickColumns finds date/description/amount by header name', () => {
  const idx = pickColumns(['Date', 'Description', 'Amount']);
  assert.equal(idx.date, 0);
  assert.equal(idx.desc, 1);
  assert.equal(idx.amount, 2);
});

test('pickColumns finds a separate Debit column', () => {
  const idx = pickColumns(['Posted Date', 'Payee', 'Debit', 'Credit']);
  assert.equal(idx.date, 0);
  assert.equal(idx.desc, 1);
  assert.equal(idx.debit, 2);
  assert.equal(idx.credit, 3);
});

test('transactionsFromCsv maps a single-amount statement (negatives = charges)', () => {
  const csv =
    'Date,Description,Amount\n' +
    '2026-01-05,NETFLIX.COM CA,-15.49\n' +
    '2026-02-05,NETFLIX.COM CA,-15.49\n' +
    '2026-02-15,PAYROLL DEPOSIT,2500.00\n' +
    '2026-03-05,NETFLIX.COM CA,-15.49\n';
  const parsed = parseCsv(csv);
  const { transactions, note } = transactionsFromCsv(parsed);
  assert.equal(transactions.length, 3); // the deposit is excluded
  assert.ok(/negative/.test(note));
  const { subscriptions } = detectSubscriptions(transactions);
  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].merchant, 'NETFLIX');
});

test('transactionsFromCsv uses an explicit Debit column when present', () => {
  const csv =
    'Date,Payee,Debit,Credit\n' +
    '2026-01-10,SPOTIFY USA,9.99,\n' +
    '2026-02-10,SPOTIFY USA,9.99,\n' +
    '2026-02-12,REFUND,,9.99\n';
  const parsed = parseCsv(csv);
  const { transactions } = transactionsFromCsv(parsed);
  assert.equal(transactions.length, 2); // credit row has no debit -> skipped
  assert.equal(transactions[0].amount, 9.99);
});

test('transactionsFromCsv reports when columns are missing', () => {
  const parsed = parseCsv('Foo,Bar\n1,2\n');
  const { transactions, note } = transactionsFromCsv(parsed);
  assert.equal(transactions.length, 0);
  assert.ok(/could not find/i.test(note));
});

// local copy of round2 for expected-value math in tests
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
