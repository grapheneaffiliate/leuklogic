import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatementText, toCsv, matchDate, isMoneyToken } from '../src/statement.mjs';

// ---- token recognizers --------------------------------------------------------

test('matchDate recognizes the statement date shapes', () => {
  assert.deepEqual(matchDate('01/15/2026'), { year: 2026, month: 1, day: 15, consumed: 1 });
  assert.deepEqual(matchDate('01/15'), { year: null, month: 1, day: 15, consumed: 1 });
  assert.deepEqual(matchDate('1/5/26'), { year: 2026, month: 1, day: 5, consumed: 1 });
  assert.deepEqual(matchDate('2026-01-15'), { year: 2026, month: 1, day: 15, consumed: 1 });
  assert.deepEqual(matchDate('Jan', '15'), { year: null, month: 1, day: 15, consumed: 2 });
  assert.deepEqual(matchDate('Jan', '15,', '2026'), { year: 2026, month: 1, day: 15, consumed: 3 });
  assert.deepEqual(matchDate('15', 'Jan'), { year: null, month: 1, day: 15, consumed: 2 });
  assert.equal(matchDate('13/45'), null); // impossible month/day
  assert.equal(matchDate('STARBUCKS'), null);
});

test('isMoneyToken accepts money, refuses bare reference numbers', () => {
  assert.ok(isMoneyToken('$1,234.56'));
  assert.ok(isMoneyToken('45.00'));
  assert.ok(isMoneyToken('-45.00'));
  assert.ok(isMoneyToken('(45.00)'));
  assert.ok(isMoneyToken('45.00CR'));
  assert.ok(isMoneyToken('1,234'));
  assert.equal(isMoneyToken('4471'), false); // check/ref number, not money
  assert.equal(isMoneyToken('WA'), false);
});

// ---- full-line parsing: the common layouts ------------------------------------

test('classic layout: MM/DD/YYYY description amount', () => {
  const r = parseStatementText(
    '01/05/2026 NETFLIX.COM CA -15.49\n01/07/2026 PAYROLL DIRECT DEP 2,450.00\n',
  );
  assert.equal(r.transactions.length, 2);
  assert.deepEqual(r.transactions[0], {
    date: '2026-01-05', description: 'NETFLIX.COM CA', amount: -15.49, balance: null, line: 1,
  });
  assert.equal(r.transactions[1].amount, 2450);
  assert.equal(r.unparsed.length, 0);
  assert.equal(r.yearAssumed, false);
});

test('amount + running balance columns are separated, not conflated', () => {
  const r = parseStatementText(
    '01/05/2026 COFFEE SHOP -4.50 1,995.50\n01/06/2026 GROCERY MART -82.13 1,913.37\n',
  );
  assert.equal(r.transactions.length, 2);
  assert.equal(r.transactions[0].amount, -4.5);
  assert.equal(r.transactions[0].balance, 1995.5);
  assert.equal(r.balanceColumnDetected, true);
});

test('two leading dates (transaction + post date): second is consumed', () => {
  const r = parseStatementText('01/05 01/06 AMAZON MKTP US -29.99\n', { year: 2026 });
  assert.equal(r.transactions.length, 1);
  assert.equal(r.transactions[0].date, '2026-01-05');
  assert.equal(r.transactions[0].description, 'AMAZON MKTP US');
});

test('month-name dates with omitted year use the provided year and flag it', () => {
  const r = parseStatementText('Jan 5 STARBUCKS #1234 -6.75\n15 Jan TRANSIT AUTHORITY -2.90\n', {
    year: 2026,
  });
  assert.equal(r.transactions.length, 2);
  assert.equal(r.transactions[0].date, '2026-01-05');
  assert.equal(r.transactions[1].date, '2026-01-15');
  assert.equal(r.yearAssumed, true);
});

test('accounting parentheses and CR suffix read as negative', () => {
  const r = parseStatementText('02/01/2026 SERVICE FEE (12.00)\n02/02/2026 REFUND ISSUED 12.00CR\n');
  assert.equal(r.transactions[0].amount, -12);
  assert.equal(r.transactions[1].amount, -12);
});

test('headers, footers and page furniture are skipped silently; money-bearing near-misses are reported', () => {
  const text = [
    'FIRST EXAMPLE BANK',
    'Statement period 01/01/2026 through 01/31/2026',
    'Date Description Amount',
    '01/05/2026 NETFLIX.COM -15.49',
    'Page 2 of 4',
    'Total fees this period $12.00', // money-shaped but no leading date -> reported near-miss
  ].join('\n');
  const r = parseStatementText(text);
  assert.equal(r.transactions.length, 1);
  assert.equal(r.unparsed.length, 1);
  assert.ok(/Total fees/.test(r.unparsed[0].text));
});

test('a dated line with no money goes to unparsed, never guessed', () => {
  const r = parseStatementText('01/05/2026 CONTINUED ON NEXT PAGE\n');
  assert.equal(r.transactions.length, 0);
  assert.equal(r.unparsed.length, 1);
  assert.equal(r.unparsed[0].line, 1);
});

test('yearless dates with no year provided are unparsed, not invented', () => {
  const r = parseStatementText('01/05 NETFLIX.COM -15.49\n');
  assert.equal(r.transactions.length, 0);
  assert.equal(r.unparsed.length, 1);
});

test('check-number columns are not mistaken for amounts', () => {
  // "1123" is a check number; the amount is the trailing -500.00
  const r = parseStatementText('01/09/2026 CHECK 1123 -500.00\n');
  assert.equal(r.transactions.length, 1);
  assert.equal(r.transactions[0].amount, -500);
  assert.equal(r.transactions[0].description, 'CHECK 1123');
});

// ---- CSV output ---------------------------------------------------------------

test('toCsv emits RFC-4180 with CRLF, quoting commas, two-decimal amounts', () => {
  const r = parseStatementText('01/05/2026 DOE, JANE CONSULTING 1,200.00\n');
  const csv = toCsv(r.transactions);
  assert.equal(
    csv,
    'Date,Description,Amount\r\n2026-01-05,"DOE, JANE CONSULTING",1200.00\r\n',
  );
});

test('toCsv adds the Balance column only when balances exist', () => {
  const withBal = parseStatementText('01/05/2026 COFFEE -4.50 995.50\n');
  assert.ok(toCsv(withBal.transactions).startsWith('Date,Description,Amount,Balance'));
  const noBal = parseStatementText('01/05/2026 COFFEE -4.50\n');
  assert.ok(toCsv(noBal.transactions).startsWith('Date,Description,Amount\r\n'));
});

test('empty input yields empty results, no crash', () => {
  const r = parseStatementText('');
  assert.deepEqual(r.transactions, []);
  assert.deepEqual(r.unparsed, []);
});
