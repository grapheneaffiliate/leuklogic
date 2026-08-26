/*
 * Missed-Call Cost Calculator — calc.mjs
 * Pure, dependency-free. No DOM, no Node APIs, no network. Inline-safe.
 *
 * The persuasion is arithmetic, kept honest: it shows what missed calls cost a
 * service business, and what a text-back that recovers SOME of them saves — with
 * every assumption an explicit, editable input, never a hidden multiplier.
 */

/**
 * missedCallCost(input) -> breakdown
 *   input.missedPerWeek  missed/unanswered calls in a typical week
 *   input.jobValue       average revenue of one job ($)
 *   input.closeRate      % of answered leads that become a job (0-100)
 *   input.recoveryRate   % of missed callers a fast text-back wins back (0-100); default 30
 *   input.weeksPerYear   default 52
 *
 * Model (deliberately simple + defensible):
 *   A missed call is a lost LEAD. Lost revenue = missedCalls × closeRate × jobValue
 *   (you only lose the ones you would have closed, not every ring).
 *   Text-back recovers `recoveryRate` of those otherwise-lost jobs.
 */
export function missedCallCost(input = {}) {
  const num = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  const missedPerWeek = num(input.missedPerWeek);
  const jobValue = num(input.jobValue);
  const closeRate = clampPct(input.closeRate);
  const recoveryRate = input.recoveryRate === undefined ? 30 : clampPct(input.recoveryRate);
  const weeksPerYear = num(input.weeksPerYear, 52) || 52;

  const lostJobsPerWeek = missedPerWeek * (closeRate / 100);
  const lostPerWeek = lostJobsPerWeek * jobValue;
  const lostPerMonth = lostPerWeek * (weeksPerYear / 12);
  const lostPerYear = lostPerWeek * weeksPerYear;

  const recoveredPerMonth = lostPerMonth * (recoveryRate / 100);
  const recoveredPerYear = lostPerYear * (recoveryRate / 100);

  return {
    lostJobsPerWeek: round2(lostJobsPerWeek),
    lostPerWeek: round2(lostPerWeek),
    lostPerMonth: round2(lostPerMonth),
    lostPerYear: round2(lostPerYear),
    recoveredPerMonth: round2(recoveredPerMonth),
    recoveredPerYear: round2(recoveredPerYear),
    inputs: { missedPerWeek, jobValue, closeRate, recoveryRate, weeksPerYear },
  };
}

function clampPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** money(n) -> "$1,234" (whole dollars) or "$12.50" under $100. Pure formatting. */
export function money(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const opts = abs < 100 && abs % 1 !== 0
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 };
  return '$' + v.toLocaleString('en-US', opts);
}

export default { missedCallCost, money };
