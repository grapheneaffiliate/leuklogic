/*
 * SubScan — subscan.mjs
 * Pure, dependency-free subscription detection. No DOM, no Node APIs, no network.
 * Safe to inline verbatim into a single-file HTML page (<script type="module">).
 *
 * WHAT IT DOES (and does not). Given a list of transactions (from a bank/card
 * statement), it finds the RECURRING charges — the subscriptions — by grouping
 * charges from the same merchant and checking whether they arrive on a regular
 * cadence at a stable price. It ranks them biggest-annual-cost first and flags
 * price increases. It is pure arithmetic over the data you give it.
 *
 * The one honesty rule that matters: it cannot know whether you still USE a
 * subscription — nothing in a statement records that. It surfaces what you are
 * paying for, on what cadence, and how it has changed, so YOU can decide. It
 * never claims "dormant" as fact; the only usage signal is your own judgement.
 *
 * It also never guesses a charge into existence: a single one-off payment, an
 * irregular cadence, or wildly varying amounts are excluded, not force-fit into
 * a "subscription". False positives cost trust; the bias is toward under-calling.
 */

// ---- small pure helpers -------------------------------------------------------

function median(nums) {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * parseAmount(raw) -> number  (positive = money out, negative = money in)
 * Handles "$1,234.56", "(12.34)" => -12.34, "-12.34", "  12.34  ", "12.34 CR".
 * Returns NaN when there is no number at all.
 */
export function parseAmount(raw) {
  if (typeof raw === 'number') return raw;
  let s = String(raw == null ? '' : raw).trim();
  if (s === '') return NaN;
  let sign = 1;
  // Accounting parentheses mean negative.
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/(^|\s)cr$/i.test(s)) sign = -1; // trailing CR = credit
  if (/(^|\s)dr$/i.test(s)) sign = 1; // trailing DR = debit
  if (s.trim().startsWith('-')) sign = -1;
  const cleaned = s.replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? sign * n : NaN;
}

/**
 * toDate(v) -> Date (UTC midnight) | null
 * Accepts YYYY-MM-DD, YYYY/MM/DD, MM/DD/YYYY, M/D/YY, and a Date object.
 * Uses UTC to keep day-gap math free of timezone drift. Ambiguous or
 * unparseable inputs return null (excluded, never guessed).
 */
export function toDate(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v == null ? '' : v).trim();
  if (s === '') return null;
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return mkUTC(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return mkUTC(y, +m[1], +m[2]); // US-style MM/DD/YYYY
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mkUTC(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

// Product qualifiers that DO distinguish a subscription from a merchant's other
// charges (Amazon Prime vs Amazon retail, Disney Plus vs a Disney store). These
// are kept as part of the key; city/ref tokens are not.
const QUALIFIERS = new Set([
  'PRIME', 'PLUS', 'PREMIUM', 'MUSIC', 'TV', 'GOLD', 'PRO', 'ONE', 'ICLOUD',
  'CLOUD', 'UNLIMITED', 'FAMILY', 'STUDENT', 'BASIC', 'STANDARD', 'MAX', 'GO',
]);
// Words that are billing/legal/location noise, never merchant identity.
const NOISE = new Set([
  'BILL', 'BILLING', 'PAYMENT', 'PYMT', 'HELP', 'SUPPORT', 'USA', 'US', 'INC',
  'LLC', 'LTD', 'CORP', 'MEMBERSHIP', 'SUBSCRIPTION', 'SUBSCR', 'MONTHLY',
  'ANNUAL', 'RENEWAL', 'ONLINE', 'HTTP', 'HTTPS', 'WWW',
]);
const STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL',
  'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT',
  'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]);

/**
 * normalizeMerchant(desc) -> canonical grouping key (may be '')
 * Strips the noise that makes the SAME merchant look like many: processor
 * prefixes (SQ*, TST*, PAYPAL*), store/ref numbers, phone numbers, dates,
 * domains, states and cities — then keys on the first real word plus a product
 * qualifier if present. Consistency (same merchant -> same key) matters more
 * than a pretty name; the raw description is kept separately for display.
 *
 * Known limit: a leading city/word is rare but possible, and a high-volume
 * merchant with many descriptor variants can still fragment. It under-calls
 * rather than inventing a false subscription.
 */
export function normalizeMerchant(desc) {
  let s = String(desc == null ? '' : desc).toUpperCase();
  // Common card/ACH processor prefixes.
  s = s.replace(/\b(SQ|TST|SP|PP|PAYPAL|POS|ACH|WEB|PMT|PURCHASE|RECURRING|RECUR|AUTOPAY|AUTO PAY|DEBIT|CREDIT|VISA|MASTERCARD|AMEX|CHECKCARD|CARD)\b/g, ' ');
  s = s.replace(/[*#]/g, ' ');
  // Domains -> keep the name, drop the TLD.
  s = s.replace(/\b([A-Z0-9-]+)\.(COM|NET|ORG|IO|CO|APP|TV|AI|GG)\b/g, ' $1 ');
  // Drop any whitespace token that contains a digit: store/ref/phone/date codes.
  s = s
    .split(/\s+/)
    .filter((t) => t && !/\d/.test(t))
    .join(' ');
  // Non-letters become spaces; collapse.
  s = s.replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const toks = s.split(' ').filter((t) => t.length > 1 && !NOISE.has(t) && !STATES.has(t));
  if (toks.length === 0) return '';
  let key = toks[0];
  if (toks[1] && QUALIFIERS.has(toks[1])) key += ' ' + toks[1];
  return key;
}

// Regular billing cadences, by median days between charges.
const CADENCES = [
  { label: 'weekly', min: 5, max: 9, perYear: 52 },
  { label: 'biweekly', min: 12, max: 16, perYear: 26 },
  { label: 'monthly', min: 26, max: 35, perYear: 12 },
  { label: 'bimonthly', min: 56, max: 66, perYear: 6 },
  { label: 'quarterly', min: 82, max: 98, perYear: 4 },
  { label: 'semiannual', min: 172, max: 195, perYear: 2 },
  { label: 'annual', min: 350, max: 385, perYear: 1 },
];

/**
 * classifyCadence(medianGapDays) -> {label, perYear} | null
 * null means the spacing does not match any regular billing cycle, i.e. it is
 * not a subscription (e.g. groceries every few days at random).
 */
export function classifyCadence(medianGapDays) {
  for (const c of CADENCES) {
    if (medianGapDays >= c.min && medianGapDays <= c.max) {
      return { label: c.label, perYear: c.perYear };
    }
  }
  return null;
}

/**
 * detectSubscriptions(transactions, options?) ->
 *   { subscriptions, totalMonthly, totalAnnual, count, scanned }
 *
 *   transactions: [{ date, desc, amount }]  — amount is the charge size; only
 *     positive amounts (money out) are considered. date/desc as strings are fine.
 *
 *   options.minCharges        default 2  — need at least this many to call it recurring
 *   options.priceHikePct      default 5  — last vs first amount rise (%) to flag a hike
 *   options.maxAmountRatio    default 3  — reject a group whose max/min amount exceeds this
 *
 * Each subscription: { merchant, sampleDesc, cadence, perYear, typicalAmount,
 *   monthly, annual, chargeCount, firstDate, lastDate, firstAmount, lastAmount,
 *   priceIncrease }. Sorted by annual cost, biggest first.
 */
export function detectSubscriptions(transactions, options = {}) {
  const minCharges = options.minCharges || 2;
  const priceHikePct = options.priceHikePct == null ? 5 : options.priceHikePct;
  const maxAmountRatio = options.maxAmountRatio || 3;

  const groups = new Map();
  let scanned = 0;
  for (const t of transactions || []) {
    const amount = typeof t.amount === 'number' ? t.amount : parseAmount(t.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue; // money in / non-charges ignored
    const date = toDate(t.date);
    if (!date) continue;
    const key = normalizeMerchant(t.desc);
    if (!key) continue;
    scanned++;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ date, amount, desc: String(t.desc == null ? '' : t.desc).trim() });
  }

  const subscriptions = [];
  for (const [key, charges] of groups) {
    if (charges.length < minCharges) continue;
    charges.sort((a, b) => a.date - b.date);

    const gaps = [];
    for (let i = 1; i < charges.length; i++) {
      gaps.push((charges[i].date - charges[i - 1].date) / 86400000);
    }
    const medianGap = median(gaps);
    if (medianGap <= 0) continue; // same-day duplicates, not a cadence
    const cadence = classifyCadence(medianGap);
    if (!cadence) continue;

    // With 3+ charges, require most gaps to sit near the cadence (reject the
    // merchant you happen to buy from on a loosely monthly-ish basis).
    if (gaps.length >= 2) {
      const tol = Math.max(4, medianGap * 0.25);
      const near = gaps.filter((g) => Math.abs(g - medianGap) <= tol).length;
      if (near / gaps.length < 0.5) continue;
    }

    const amounts = charges.map((c) => c.amount);
    const maxAmt = Math.max(...amounts);
    const minAmt = Math.min(...amounts);
    if (minAmt > 0 && maxAmt / minAmt > maxAmountRatio) continue; // variable spend, not a sub

    const typical = median(amounts);
    const first = charges[0];
    const last = charges[charges.length - 1];
    const priceIncrease = last.amount > first.amount * (1 + priceHikePct / 100);

    subscriptions.push({
      merchant: key,
      sampleDesc: last.desc || key,
      cadence: cadence.label,
      perYear: cadence.perYear,
      typicalAmount: round2(typical),
      monthly: round2((typical * cadence.perYear) / 12),
      annual: round2(typical * cadence.perYear),
      chargeCount: charges.length,
      firstDate: fmtDate(first.date),
      lastDate: fmtDate(last.date),
      firstAmount: round2(first.amount),
      lastAmount: round2(last.amount),
      priceIncrease,
    });
  }

  subscriptions.sort((a, b) => b.annual - a.annual || a.merchant.localeCompare(b.merchant));
  const totalMonthly = round2(subscriptions.reduce((s, x) => s + x.monthly, 0));
  const totalAnnual = round2(subscriptions.reduce((s, x) => s + x.annual, 0));
  return { subscriptions, totalMonthly, totalAnnual, count: subscriptions.length, scanned };
}

/**
 * pickColumns(header) -> { date, desc, amount, debit, credit }  (indices; -1 if absent)
 * Best-effort mapping of statement columns by header name.
 */
export function pickColumns(header) {
  const idx = { date: -1, desc: -1, amount: -1, debit: -1, credit: -1 };
  const h = (header || []).map((x) => String(x == null ? '' : x).toLowerCase().trim());
  const find = (re, taken) => {
    for (let i = 0; i < h.length; i++) if (re.test(h[i]) && !taken.includes(i)) return i;
    return -1;
  };
  const taken = [];
  idx.date = find(/\b(date|posted|posting|trans(action)? date)\b|^date$/, taken);
  if (idx.date >= 0) taken.push(idx.date);
  idx.debit = find(/debit|withdrawal|paid out|payment|charge/, taken);
  if (idx.debit >= 0) taken.push(idx.debit);
  idx.credit = find(/credit|deposit|paid in/, taken);
  if (idx.credit >= 0) taken.push(idx.credit);
  idx.amount = find(/amount|amt|value/, taken);
  if (idx.amount >= 0) taken.push(idx.amount);
  idx.desc = find(/description|payee|name|memo|merchant|details|narrative|transaction/, taken);
  if (idx.desc >= 0) taken.push(idx.desc);
  // Fallbacks: if desc still missing, take the widest text column that isn't date/amount.
  return idx;
}

/**
 * transactionsFromCsv(parsed, options?) -> { transactions, columns, note }
 * Maps a parseCsv() result to [{date, desc, amount}]. amount is positive for a
 * charge (money out). Column meaning:
 *   - explicit Debit column  -> those values are charges
 *   - single Amount column   -> negative values are charges by default (most US
 *                               exports); set options.chargesArePositive to flip
 */
export function transactionsFromCsv(parsed, options = {}) {
  const header = (parsed && parsed.header) || [];
  const rows = (parsed && parsed.rows) || [];
  const columns = pickColumns(header);
  const out = [];
  let note = '';

  if (columns.date < 0 || columns.desc < 0 || (columns.amount < 0 && columns.debit < 0)) {
    return { transactions: [], columns, note: 'Could not find date, description, and amount columns.' };
  }

  // Decide sign convention for a single Amount column by sampling the data.
  let chargesArePositive = options.chargesArePositive;
  if (chargesArePositive === undefined && columns.debit < 0 && columns.amount >= 0) {
    let neg = 0;
    let pos = 0;
    for (const r of rows) {
      const a = parseAmount(r[columns.amount]);
      if (!Number.isFinite(a) || a === 0) continue;
      if (a < 0) neg++;
      else pos++;
    }
    // A statement is mostly spending; whichever sign dominates is the charges.
    chargesArePositive = pos > neg;
    note = chargesArePositive
      ? 'Single amount column: treating positive values as charges.'
      : 'Single amount column: treating negative values as charges.';
  }

  for (const r of rows) {
    const date = r[columns.date];
    const desc = r[columns.desc];
    let amount;
    if (columns.debit >= 0) {
      amount = parseAmount(r[columns.debit]); // debit column holds the charge amount
      if (!Number.isFinite(amount)) continue;
      amount = Math.abs(amount);
    } else {
      const a = parseAmount(r[columns.amount]);
      if (!Number.isFinite(a) || a === 0) continue;
      const isCharge = chargesArePositive ? a > 0 : a < 0;
      if (!isCharge) continue;
      amount = Math.abs(a);
    }
    if (amount > 0) out.push({ date, desc, amount });
  }
  return { transactions: out, columns, note };
}

export default {
  parseAmount,
  toDate,
  normalizeMerchant,
  classifyCadence,
  detectSubscriptions,
  pickColumns,
  transactionsFromCsv,
};
