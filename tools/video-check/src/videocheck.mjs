/*
 * CheckClip — videocheck.mjs
 * Pure, dependency-free platform-fit checks for a video file's measurable
 * properties. No DOM, no Node APIs, no network. Inline-safe.
 *
 * WHAT IT JUDGES (and does not). It checks the things a machine can measure —
 * duration, dimensions, file size — against each platform's published limits,
 * and says pass / warn / fail per platform. It does NOT rate content: whether
 * a video is any good is a human judgement no metadata check can make, and the
 * page says so out loud.
 *
 * SPEC PROVENANCE. Limits verified 2026-08 against current platform documentation
 * and spec guides (see the page's sources note). Platform limits DRIFT — the
 * SPECS table carries a `verified` date so staleness is visible, not hidden.
 *   - YouTube Shorts: ≤180s to count as a Short; 9:16 (1080×1920) preferred.
 *   - TikTok: ≤600s recorded in-app / ≤3600s uploaded pre-recorded; 9:16
 *     preferred; ~287.6MB mobile upload cap (desktop uploads allow more).
 *   - Instagram Reels: ≤1200s (20min) since Dec 2025, BUT Reels over 180s are
 *     not shown to non-followers — allowed and throttled are different things.
 *   - X (Twitter) standard tier: ≤140s, ≤512MB; 16:9 / 9:16 / 1:1. Premium
 *     tiers allow far more — the check targets the free tier and says so.
 */

export const VERIFIED = '2026-08';

// verdict: 'pass' | 'warn' | 'fail'
const PASS = 'pass';
const WARN = 'warn';
const FAIL = 'fail';

function aspectClass(width, height) {
  if (!width || !height) return null;
  const r = width / height;
  if (Math.abs(r - 9 / 16) < 0.02) return '9:16';
  if (Math.abs(r - 16 / 9) < 0.02) return '16:9';
  if (Math.abs(r - 1) < 0.02) return '1:1';
  return r < 1 ? 'vertical (non-standard)' : 'horizontal (non-standard)';
}

const MB = 1024 * 1024;

/**
 * checkVideo(meta) -> { platforms: [{key,name,verdict,reasons:[...]}], aspect, verified }
 * meta: { durationSec, width, height, sizeBytes } — any may be missing/0
 * (a browser can fail to read metadata for some codecs); a check that lacks
 * its input reports 'warn' with an "unknown" reason, never a silent pass.
 */
export function checkVideo(meta = {}) {
  const d = Number(meta.durationSec) || 0;
  const w = Number(meta.width) || 0;
  const h = Number(meta.height) || 0;
  const size = Number(meta.sizeBytes) || 0;
  const aspect = aspectClass(w, h);
  const vertical = aspect === '9:16';

  const platforms = [];
  const add = (key, name, verdict, reasons) => platforms.push({ key, name, verdict, reasons });

  // Worst-of helper: fail beats warn beats pass.
  const worst = (...vs) => (vs.includes(FAIL) ? FAIL : vs.includes(WARN) ? WARN : PASS);

  // ---- YouTube Shorts --------------------------------------------------------
  {
    const reasons = [];
    let vDur = PASS;
    if (!d) {
      vDur = WARN;
      reasons.push('duration unreadable — check skipped');
    } else if (d > 180) {
      vDur = FAIL;
      reasons.push(`${fmtDur(d)} is over the 3:00 Shorts limit — it would upload as a regular video, not a Short`);
    } else {
      reasons.push(`${fmtDur(d)} fits the 3:00 Shorts limit`);
    }
    let vAsp = PASS;
    if (!aspect) {
      vAsp = WARN;
      reasons.push('dimensions unreadable');
    } else if (!vertical && aspect !== '1:1') {
      vAsp = WARN;
      reasons.push(`${aspect} — Shorts strongly prefers 9:16 vertical (1080×1920); landscape gets letterboxed`);
    } else {
      reasons.push(`${aspect} aspect works for Shorts`);
    }
    add('shorts', 'YouTube Shorts', worst(vDur, vAsp), reasons);
  }

  // ---- TikTok ----------------------------------------------------------------
  {
    const reasons = [];
    let vDur = PASS;
    if (!d) {
      vDur = WARN;
      reasons.push('duration unreadable — check skipped');
    } else if (d > 3600) {
      vDur = FAIL;
      reasons.push(`${fmtDur(d)} is over TikTok's 60:00 upload ceiling`);
    } else if (d > 600) {
      vDur = WARN;
      reasons.push(`${fmtDur(d)} exceeds the 10:00 in-app limit — uploadable pre-recorded, but long-form is throttled on TikTok`);
    } else {
      reasons.push(`${fmtDur(d)} fits TikTok`);
    }
    let vSize = PASS;
    if (!size) {
      vSize = WARN;
      reasons.push('file size unknown');
    } else if (size > 287.6 * MB) {
      vSize = WARN;
      reasons.push(`${fmtSize(size)} is over the ~287MB mobile upload cap — upload from desktop instead`);
    } else {
      reasons.push(`${fmtSize(size)} fits the mobile upload cap`);
    }
    let vAsp = PASS;
    if (aspect && !vertical) {
      vAsp = WARN;
      reasons.push(`${aspect} — TikTok is a 9:16 canvas; anything else shows with dead space`);
    }
    add('tiktok', 'TikTok', worst(vDur, vSize, vAsp), reasons);
  }

  // ---- Instagram Reels -------------------------------------------------------
  {
    const reasons = [];
    let vDur = PASS;
    if (!d) {
      vDur = WARN;
      reasons.push('duration unreadable — check skipped');
    } else if (d > 1200) {
      vDur = FAIL;
      reasons.push(`${fmtDur(d)} is over the 20:00 Reels limit`);
    } else if (d > 180) {
      vDur = WARN;
      reasons.push(`${fmtDur(d)} uploads fine, but Reels over 3:00 are not shown to non-followers — allowed and recommended are different things`);
    } else {
      reasons.push(`${fmtDur(d)} is in the fully-distributed Reels range`);
    }
    let vSize = PASS;
    if (size > 4096 * MB) {
      vSize = FAIL;
      reasons.push(`${fmtSize(size)} is over the 4GB Reels cap`);
    }
    let vAsp = PASS;
    if (aspect && !vertical) {
      vAsp = WARN;
      reasons.push(`${aspect} — Reels is a 9:16 canvas`);
    }
    add('reels', 'Instagram Reels', worst(vDur, vSize, vAsp), reasons);
  }

  // ---- X (Twitter), standard tier -------------------------------------------
  {
    const reasons = [];
    let vDur = PASS;
    if (!d) {
      vDur = WARN;
      reasons.push('duration unreadable — check skipped');
    } else if (d > 140) {
      vDur = FAIL;
      reasons.push(`${fmtDur(d)} is over the 2:20 standard-account limit (Premium tiers allow much longer)`);
    } else {
      reasons.push(`${fmtDur(d)} fits the standard 2:20 limit`);
    }
    let vSize = PASS;
    if (!size) {
      vSize = WARN;
      reasons.push('file size unknown');
    } else if (size > 512 * MB) {
      vSize = FAIL;
      reasons.push(`${fmtSize(size)} is over the 512MB cap`);
    } else {
      reasons.push(`${fmtSize(size)} fits the 512MB cap`);
    }
    let vAsp = PASS;
    if (aspect && aspect.includes('non-standard')) {
      vAsp = WARN;
      reasons.push(`${aspect} — X supports 16:9, 9:16 and 1:1 cleanly`);
    }
    add('x', 'X (standard account)', worst(vDur, vSize, vAsp), reasons);
  }

  return { platforms, aspect, verified: VERIFIED };
}

export function fmtDur(sec) {
  const s = Math.round(Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `0:${String(r).padStart(2, '0')}`;
}

export function fmtSize(bytes) {
  const b = Number(bytes) || 0;
  if (b >= 1024 * MB) return (b / (1024 * MB)).toFixed(2) + 'GB';
  return Math.round(b / MB) + 'MB';
}

export default { checkVideo, fmtDur, fmtSize, VERIFIED };
