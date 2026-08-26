import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote, fmt, RATE_CARD } from '../src/quote.mjs';

test('base band comes straight from the rate card', () => {
  const q = quote({ type: 'bot' });
  assert.equal(q.low, 500);
  assert.equal(q.high, 700);
  assert.equal(q.count, 1);
  assert.equal(q.monthly, null);
});

test('every rate-card type quotes without error and respects the $500 floor', () => {
  for (const type of Object.keys(RATE_CARD)) {
    const q = quote({ type });
    assert.ok(q.low >= 500, `${type} low ${q.low} under floor`);
    assert.ok(q.high >= q.low, `${type} band inverted`);
  }
});

test('landing page base is lifted to the fixed-scope floor', () => {
  const q = quote({ type: 'landing' });
  assert.equal(q.low, 500); // card says 300; floor lifts it
  assert.ok(q.applied.some((a) => /floor/.test(a)));
});

test('integrations beyond the base widen the band asymmetrically (+10%/+15% each)', () => {
  const base = quote({ type: 'automation' }); // intBase 2
  const bumped = quote({ type: 'automation', integrations: 4 }); // 2 extra
  assert.equal(bumped.low, Math.round((1000 * 1.2) / 25) * 25);
  assert.equal(bumped.high, Math.round((2500 * 1.3) / 25) * 25);
  assert.ok(bumped.low > base.low && bumped.high > base.high);
});

test('integrations at or under the base change nothing', () => {
  const a = quote({ type: 'bot-db' });
  const b = quote({ type: 'bot-db', integrations: 2 }); // intBase is 2
  assert.deepEqual([a.low, a.high], [b.low, b.high]);
});

test('multi-project commitment takes 10% off the summed band', () => {
  const one = quote({ type: 'bot' });
  const three = quote({ type: 'bot', count: 3 });
  assert.equal(three.low, Math.round((500 * 3 * 0.9) / 25) * 25);
  assert.equal(three.high, Math.round((700 * 3 * 0.9) / 25) * 25);
  assert.equal(three.perProject.low, one.low); // per-project shown undiscounted
});

test('prepay stacks a further 10% off, multiplicatively', () => {
  const q = quote({ type: 'bot', count: 2, prepay: true });
  assert.equal(q.low, Math.round((500 * 2 * 0.9 * 0.9) / 25) * 25);
  assert.equal(q.high, Math.round((700 * 2 * 0.9 * 0.9) / 25) * 25);
  assert.ok(q.applied.some((a) => /up front/.test(a)));
});

test('scraper always carries the maintenance band and its note', () => {
  const q = quote({ type: 'scraper' });
  assert.deepEqual(q.monthly, { low: 100, high: 300 });
  assert.ok(q.notes.some((n) => /maintenance/.test(n)));
});

test('price-lock note is on every quote', () => {
  for (const type of Object.keys(RATE_CARD)) {
    assert.ok(quote({ type }).notes.some((n) => /Price lock/.test(n)), type);
  }
});

test('unknown type throws instead of guessing', () => {
  assert.throws(() => quote({ type: 'blockchain-metaverse' }), /unknown project type/);
  assert.throws(() => quote({}), /unknown project type/);
});

test('all displayed figures land on $25 boundaries', () => {
  const q = quote({ type: 'chatbot', integrations: 3, count: 2, prepay: true });
  for (const v of [q.low, q.high, q.perProject.low, q.perProject.high]) {
    assert.equal(v % 25, 0, `${v} not on a $25 boundary`);
  }
});

test('fmt renders whole dollars with separators', () => {
  assert.equal(fmt(1225), '$1,225');
  assert.equal(fmt(500), '$500');
});
