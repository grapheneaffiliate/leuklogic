import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkVideo, fmtDur, fmtSize } from '../src/videocheck.mjs';

const MB = 1024 * 1024;

function verdict(res, key) {
  return res.platforms.find((p) => p.key === key).verdict;
}

test('a clean 60s 1080x1920 vertical clip passes everywhere', () => {
  const r = checkVideo({ durationSec: 60, width: 1080, height: 1920, sizeBytes: 50 * MB });
  assert.equal(r.aspect, '9:16');
  for (const p of r.platforms) assert.equal(p.verdict, 'pass', p.name);
});

test('a 4-minute clip fails Shorts, warns on Reels, fails X, passes TikTok', () => {
  const r = checkVideo({ durationSec: 240, width: 1080, height: 1920, sizeBytes: 80 * MB });
  assert.equal(verdict(r, 'shorts'), 'fail');
  assert.equal(verdict(r, 'reels'), 'warn'); // allowed but throttled past 3:00
  assert.equal(verdict(r, 'x'), 'fail'); // over 2:20 standard
  assert.equal(verdict(r, 'tiktok'), 'pass');
});

test('the Reels 3-minute throttle line is called out as reach, not upload', () => {
  const r = checkVideo({ durationSec: 240, width: 1080, height: 1920, sizeBytes: 80 * MB });
  const reels = r.platforms.find((p) => p.key === 'reels');
  assert.ok(reels.reasons.some((x) => /non-followers/.test(x)));
});

test('landscape 16:9 warns on the vertical-first platforms, passes X', () => {
  const r = checkVideo({ durationSec: 60, width: 1920, height: 1080, sizeBytes: 50 * MB });
  assert.equal(r.aspect, '16:9');
  assert.equal(verdict(r, 'shorts'), 'warn');
  assert.equal(verdict(r, 'tiktok'), 'warn');
  assert.equal(verdict(r, 'reels'), 'warn');
  assert.equal(verdict(r, 'x'), 'pass');
});

test('square 1:1 passes Shorts and X', () => {
  const r = checkVideo({ durationSec: 45, width: 1080, height: 1080, sizeBytes: 30 * MB });
  assert.equal(r.aspect, '1:1');
  assert.equal(verdict(r, 'shorts'), 'pass');
  assert.equal(verdict(r, 'x'), 'pass');
});

test('an 11-minute clip warns on TikTok (in-app limit) and fails Shorts + X', () => {
  const r = checkVideo({ durationSec: 660, width: 1080, height: 1920, sizeBytes: 200 * MB });
  assert.equal(verdict(r, 'tiktok'), 'warn');
  assert.equal(verdict(r, 'shorts'), 'fail');
  assert.equal(verdict(r, 'x'), 'fail');
});

test('a 61-minute upload fails TikTok outright and a 21-minute one fails Reels', () => {
  const long = checkVideo({ durationSec: 3660, width: 1080, height: 1920, sizeBytes: 500 * MB });
  assert.equal(verdict(long, 'tiktok'), 'fail');
  const reels = checkVideo({ durationSec: 1260, width: 1080, height: 1920, sizeBytes: 500 * MB });
  assert.equal(verdict(reels, 'reels'), 'fail');
});

test('file size gates: 600MB fails X, warns TikTok mobile; 5GB fails Reels', () => {
  const r = checkVideo({ durationSec: 120, width: 1080, height: 1920, sizeBytes: 600 * MB });
  assert.equal(verdict(r, 'x'), 'fail');
  const tik = r.platforms.find((p) => p.key === 'tiktok');
  assert.ok(tik.reasons.some((x) => /desktop/.test(x)));
  const big = checkVideo({ durationSec: 120, width: 1080, height: 1920, sizeBytes: 5 * 1024 * MB });
  assert.equal(verdict(big, 'reels'), 'fail');
});

test('missing metadata never silently passes — it warns with a reason', () => {
  const r = checkVideo({ sizeBytes: 50 * MB });
  for (const key of ['shorts', 'tiktok', 'reels', 'x']) {
    const p = r.platforms.find((x) => x.key === key);
    assert.notEqual(p.verdict, 'pass', p.name);
    assert.ok(p.reasons.some((x) => /unreadable|unknown/.test(x)), p.name);
  }
});

test('non-standard aspect is named, not force-fit', () => {
  const r = checkVideo({ durationSec: 30, width: 1000, height: 1300, sizeBytes: 10 * MB });
  assert.ok(/non-standard/.test(r.aspect));
  assert.equal(verdict(r, 'x'), 'warn');
});

test('formatters', () => {
  assert.equal(fmtDur(185), '3:05');
  assert.equal(fmtDur(45), '0:45');
  assert.equal(fmtSize(600 * MB), '600MB');
  assert.equal(fmtSize(4.5 * 1024 * MB), '4.50GB');
});
