/*
 * CronText engine tests — pure Node, no browser, no deps. Run: npm test
 * next-run tests pass a FIXED `from` date so they are fully deterministic
 * regardless of the machine's clock or timezone offset.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCron, describeCron, nextRuns } from '../src/cron.mjs';

/* ---------------- parse: validation ---------------- */

test('parseCron: rejects wrong field count', () => {
  assert.throws(() => parseCron('* * * *'), /exactly 5 fields/);
  assert.throws(() => parseCron('* * * * * *'), /exactly 5 fields/);
});

test('parseCron: rejects out-of-range values with the field name', () => {
  assert.throws(() => parseCron('60 * * * *'), /minute field/);
  assert.throws(() => parseCron('* 24 * * *'), /hour field/);
  assert.throws(() => parseCron('* * 32 * *'), /day-of-month field/);
  assert.throws(() => parseCron('* * * 13 *'), /month field/);
});

test('parseCron: rejects a backwards range and a zero step', () => {
  assert.throws(() => parseCron('5-1 * * * *'), /backwards/);
  assert.throws(() => parseCron('*/0 * * * *'), /positive whole number/);
});

test('parseCron: empty / non-string input asks for an expression', () => {
  assert.throws(() => parseCron(''), /Enter a cron/);
  assert.throws(() => parseCron('   '), /Enter a cron/);
  assert.throws(() => parseCron(null), /Enter a cron/);
});

test('parseCron: names and shortcuts expand', () => {
  assert.deepEqual([...parseCron('0 0 * JAN MON').month.values], [1]);
  assert.deepEqual([...parseCron('0 0 * * MON').dow.values], [1]);
  assert.deepEqual([...parseCron('@daily').hour.values], [0]);
  assert.deepEqual([...parseCron('@hourly').minute.values], [0]);
});

test('parseCron: day-of-week 7 and 0 both mean Sunday', () => {
  assert.deepEqual([...parseCron('0 0 * * 7').dow.values], [0]);
  assert.deepEqual([...parseCron('0 0 * * 0').dow.values], [0]);
});

test('parseCron: step and range expand to the right set', () => {
  assert.deepEqual([...parseCron('*/15 * * * *').minute.values], [0, 15, 30, 45]);
  assert.deepEqual([...parseCron('1-5 * * * *').minute.values], [1, 2, 3, 4, 5]);
  assert.deepEqual([...parseCron('0,30 * * * *').minute.values], [0, 30]);
  assert.deepEqual([...parseCron('10-20/5 * * * *').minute.values], [10, 15, 20]);
});

/* ---------------- describe ---------------- */

test('describeCron: common expressions read naturally', () => {
  assert.equal(describeCron('0 9 * * *'), 'At 09:00.');
  assert.equal(describeCron('* * * * *'), 'Every minute.');
  assert.equal(describeCron('*/15 * * * *'), 'Every 15 minutes.');
  assert.equal(describeCron('0 9 * * 1-5'), 'At 09:00 on Monday, Tuesday, Wednesday, Thursday and Friday.');
  assert.equal(describeCron('30 8 1 * *'), 'At 08:30 on the 1st of the month.');
  assert.equal(describeCron('0 0 1 1 *'), 'At 00:00 on the 1st of the month in January.');
});

test('describeCron: shortcut @weekly', () => {
  assert.equal(describeCron('@weekly'), 'At 00:00 on Sunday.');
});

/* ---------------- next runs (deterministic) ---------------- */

// A fixed reference instant, constructed in LOCAL time so the assertions match
// nextRuns' local-time stepping on any machine: 2026-03-10 is a Tuesday.
const FROM = new Date(2026, 2, 10, 8, 15, 0); // months are 0-indexed -> March

test('nextRuns: daily 09:00 gives the next calendar days at 09:00', () => {
  const runs = nextRuns('0 9 * * *', FROM, 3);
  assert.equal(runs.length, 3);
  assert.deepEqual(
    runs.map((d) => [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]),
    [[2026, 2, 10, 9, 0], [2026, 2, 11, 9, 0], [2026, 2, 12, 9, 0]]
  );
});

test('nextRuns: every 15 minutes steps quarter-hours and is strictly after `from`', () => {
  const runs = nextRuns('*/15 * * * *', FROM, 3);
  assert.deepEqual(runs.map((d) => [d.getHours(), d.getMinutes()]), [[8, 30], [8, 45], [9, 0]]);
});

test('nextRuns: weekdays only skips the weekend', () => {
  // From Fri 2026-03-13 10:00, next weekday 09:00 run is Mon 2026-03-16.
  const fri = new Date(2026, 2, 13, 10, 0, 0);
  const runs = nextRuns('0 9 * * 1-5', fri, 1);
  assert.deepEqual([runs[0].getMonth(), runs[0].getDate(), runs[0].getDay()], [2, 16, 1]); // Monday
});

test('nextRuns: dom OR dow when both restricted (cron convention)', () => {
  // "0 0 1 * MON" fires on the 1st OR any Monday. From 2026-03-10 (Tue),
  // the next hit is Monday 2026-03-16 (a Monday comes before April 1).
  const runs = nextRuns('0 0 1 * MON', FROM, 1);
  assert.deepEqual([runs[0].getMonth(), runs[0].getDate()], [2, 16]);
});

test('nextRuns: impossible date returns [] instead of hanging', () => {
  // Feb has no 30th; bounded search yields nothing within a year.
  const runs = nextRuns('0 0 30 2 *', FROM, 3);
  assert.deepEqual(runs, []);
});

test('nextRuns: invalid expression throws (same errors as parseCron)', () => {
  assert.throws(() => nextRuns('99 * * * *', FROM), /minute field/);
});
