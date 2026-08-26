/* Missed-Call Cost Calculator engine tests — pure Node. Run: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missedCallCost, money } from '../src/calc.mjs';

test('core model: lost = missed × closeRate × jobValue', () => {
  const r = missedCallCost({ missedPerWeek: 10, jobValue: 300, closeRate: 50, recoveryRate: 0, weeksPerYear: 52 });
  // 10 × 0.5 = 5 lost jobs/wk × $300 = $1500/wk
  assert.equal(r.lostJobsPerWeek, 5);
  assert.equal(r.lostPerWeek, 1500);
  assert.equal(r.lostPerYear, 78000);        // 1500 × 52
  assert.equal(r.lostPerMonth, 6500);        // 78000 / 12
});

test('recovery scenario applies recoveryRate to the lost amount', () => {
  const r = missedCallCost({ missedPerWeek: 10, jobValue: 300, closeRate: 50, recoveryRate: 30 });
  assert.equal(r.recoveredPerYear, 23400);   // 78000 × 0.30
  assert.equal(r.recoveredPerMonth, 1950);   // 6500 × 0.30
});

test('recoveryRate defaults to 30 when omitted', () => {
  const r = missedCallCost({ missedPerWeek: 10, jobValue: 300, closeRate: 50 });
  assert.equal(r.inputs.recoveryRate, 30);
});

test('percentages clamp to 0..100', () => {
  const hi = missedCallCost({ missedPerWeek: 10, jobValue: 100, closeRate: 500 });
  assert.equal(hi.inputs.closeRate, 100);
  const lo = missedCallCost({ missedPerWeek: 10, jobValue: 100, closeRate: -5 });
  assert.equal(lo.inputs.closeRate, 0);
});

test('negative / non-numeric inputs are treated as 0, never NaN', () => {
  const r = missedCallCost({ missedPerWeek: 'abc', jobValue: -50, closeRate: 50 });
  assert.equal(r.lostPerWeek, 0);
  assert.ok(Number.isFinite(r.lostPerYear));
});

test('zero missed calls -> zero everything, no crash', () => {
  const r = missedCallCost({ missedPerWeek: 0, jobValue: 300, closeRate: 50 });
  assert.equal(r.lostPerYear, 0);
  assert.equal(r.recoveredPerYear, 0);
});

test('empty input object is safe', () => {
  const r = missedCallCost();
  assert.equal(r.lostPerYear, 0);
});

test('weeksPerYear of 0 falls back to 52 (no divide-by-zero)', () => {
  const r = missedCallCost({ missedPerWeek: 10, jobValue: 300, closeRate: 50, weeksPerYear: 0 });
  assert.equal(r.inputs.weeksPerYear, 52);
});

test('money formats whole dollars with commas, cents only under $100', () => {
  assert.equal(money(1500), '$1,500');
  assert.equal(money(78000), '$78,000');
  assert.equal(money(12.5), '$12.50');
  assert.equal(money(0), '$0');
});
