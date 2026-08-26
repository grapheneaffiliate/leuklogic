/*
 * SwiftStatement — statement.mjs
 * Pure, dependency-free parsing of bank/card-statement TEXT into transactions.
 * No DOM, no Node APIs, no network. Inline-safe.
 *
 * WHERE THE TEXT COMES FROM. The page extracts a PDF's text layer with a
 * locally-vendored pdf.js (nothing uploads); this module turns that extracted
 * text — or pasted statement text — into clean {date, description, amount}
 * rows ready for CSV/Excel. The module itself never touches a PDF: it parses
 * TEXT, which is what makes it purely testable.
 *
 * HONESTY RULES (the same ones every LeukLogic engine carries):
 *   - GENERIC parser, not per-bank magic: it recognizes the common shape of a
 *     statement line (a date, then prose, then one-or-two money columns) across
 *     the layouts real banks share. A line it cannot confidently parse goes to
 *     `unparsed` with its line number — reported, never guessed, never dropped.
 *   - Scanned/image PDFs have no text layer; that is detected by the CALLER
 *     (near-empty extraction) and said plainly — no fake OCR claims.
 *   - Amounts keep their statement sign convention; a trailing balance column
 *     is detected (monotone running-balance heuristic) and separated rather
 *     than being mistaken for the transaction amount.
 */

// ---- shared primitives (same battle-tested logic as SubScan's engine) --------

export function parseAmount(raw) {
  if (typeof raw === 'number') return raw;
  let s = String(raw == null ? '' : raw).trim();
  if (s === '') return NaN;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/(^|\s|\d)cr$/i.test(s)) sign = -1; // trailing CR = credit, spaced or attached (12.00CR)
  if (/(^|\s|\d)dr$/i.test(s)) sign = 1;
  if (s.trim().startsWith('-')) sign = -1;
  const cleaned = s.replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? sign * n : NaN;
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * matchDate(token, nextToken?, year?) -> {month, day, year|null, consumed} | null
 * Recognizes the date shapes statements actually use at line starts:
 *   01/15  01/15/2026  01/15/26  2026-01-15  Jan 15  15 Jan  Jan 15, 2026
 */
export function matchDate(tok, next, third) {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(tok);
  if (m) return { year: +m[1], month: +m[2], day: +m[3], consumed: 1 };
  m = /^(\d{1,2})[\/](\d{1,2})(?:[\/](\d{2,4}))?$/.exec(tok);
  if (m) {
    const mo = +m[1];
    const d = +m[2];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      let y = m[3] ? +m[3] : null;
      if (y != null && y < 100) y += 2000;
      return { year: y, month: mo, day: d, consumed: 1 };
    }
    return null;
  }
  const monTok = MONTHS[String(tok).slice(0, 3).toLowerCase()];
  if (monTok && /^[A-Za-z]{3,9}\.?,?$/.test(tok) && next) {
    m = /^(\d{1,2}),?$/.exec(next);
    if (m && +m[1] >= 1 && +m[1] <= 31) {
      const y = third && /^\d{4}$/.test(third) ? +third : null;
      return { year: y, month: monTok, day: +m[1], consumed: y != null ? 3 : 2 };
    }
  }
  m = /^(\d{1,2})$/.exec(tok);
  if (m && next) {
    const mon = MONTHS[String(next).slice(0, 3).toLowerCase()];
    if (mon && /^[A-Za-z]{3,9}\.?,?$/.test(next) && +m[1] >= 1 && +m[1] <= 31) {
      const y = third && /^\d{4}$/.test(third) ? +third : null;
      return { year: y, month: mon, day: +m[1], consumed: y != null ? 3 : 2 };
    }
  }
  return null;
}

// A money-looking token: $1,234.56  1234.56  (45.00)  -45.00  45.00CR  1,234
const MONEY_RE = /^[-(]?\$?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\)?(?:CR|DR|cr|dr)?$/;

export function isMoneyToken(tok) {
  if (!MONEY_RE.test(tok)) return false;
  // A bare 1-4 digit integer with no $, comma, decimal or sign is more likely a
  // reference/check number than money — refuse it as an amount candidate.
  if (/^\d{1,4}$/.test(tok)) return false;
  return true;
}

function fmtISO(y, mo, d) {
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * parseStatementText(text, options?) ->
 *   { transactions, unparsed, balanceColumnDetected, yearAssumed }
 *
 *   transactions: [{ date: 'YYYY-MM-DD', description, amount, balance|null, line }]
 *   unparsed:     [{ line, text }]   — lines with content that didn't parse; never dropped silently
 *   options.year: statement year for date formats that omit it (default: current year, flagged)
 *
 * Line model: DATE  [DATE]  DESCRIPTION…  AMOUNT  [BALANCE]
 * (a second leading date — post vs transaction date — is consumed and ignored;
 * when two trailing money tokens exist, the last is treated as a running
 * balance and separated).
 */
export function parseStatementText(text, options = {}) {
  const now = options.now instanceof Date ? options.now : null;
  const defaultYear = options.year || (now ? now.getUTCFullYear() : null);
  const transactions = [];
  const unparsed = [];
  let yearAssumed = false;
  let sawBalanceCol = 0;

  const lines = String(text == null ? '' : text).split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (line === '') continue;
    const toks = line.split(/\s+/);

    // 1) date at line start (required for a transaction line)
    const d1 = matchDate(toks[0], toks[1], toks[2]);
    if (!d1) {
      // Header/footer prose ("Statement period", "Page 2 of 4") — only worth
      // reporting if the line contains something money-shaped (a near-miss).
      if (toks.some(isMoneyToken)) unparsed.push({ line: i + 1, text: line });
      continue;
    }
    let idx = d1.consumed;
    // optional second date (post date) immediately after
    const d2 = matchDate(toks[idx], toks[idx + 1], toks[idx + 2]);
    if (d2) idx += d2.consumed;

    // 2) money tokens from the END of the line (amount, then optional balance)
    const moneyIdx = [];
    for (let j = toks.length - 1; j >= idx && moneyIdx.length < 2; j--) {
      if (isMoneyToken(toks[j])) moneyIdx.unshift(j);
      else break; // money columns are contiguous at line end on statement layouts
    }
    if (moneyIdx.length === 0) {
      unparsed.push({ line: i + 1, text: line });
      continue;
    }
    const amountIdx = moneyIdx[0];
    const balance = moneyIdx.length === 2 ? parseAmount(toks[moneyIdx[1]]) : null;
    if (moneyIdx.length === 2) sawBalanceCol++;
    const amount = parseAmount(toks[amountIdx]);
    if (!Number.isFinite(amount)) {
      unparsed.push({ line: i + 1, text: line });
      continue;
    }

    // 3) description = everything between the date(s) and the money column(s)
    const description = toks.slice(idx, amountIdx).join(' ').trim();
    if (description === '') {
      unparsed.push({ line: i + 1, text: line });
      continue;
    }

    let year = d1.year;
    if (year == null) {
      if (defaultYear == null) {
        unparsed.push({ line: i + 1, text: line });
        continue;
      }
      year = defaultYear;
      yearAssumed = true;
    }
    transactions.push({
      date: fmtISO(year, d1.month, d1.day),
      description,
      amount,
      balance: Number.isFinite(balance) ? balance : null,
      line: i + 1,
    });
  }

  return {
    transactions,
    unparsed,
    balanceColumnDetected: sawBalanceCol > 0 && sawBalanceCol >= transactions.length / 2,
    yearAssumed,
  };
}

/**
 * toCsv(transactions, options?) -> RFC-4180 CSV string (CRLF, Excel-safe).
 * Columns: Date,Description,Amount[,Balance] — balance column only when any
 * row carries one.
 */
export function toCsv(transactions, options = {}) {
  const newline = options.newline || '\r\n';
  const hasBalance = transactions.some((t) => t.balance != null);
  const q = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = ['Date', 'Description', 'Amount'].concat(hasBalance ? ['Balance'] : []);
  const rows = [head.join(',')];
  for (const t of transactions) {
    const cells = [t.date, q(t.description), t.amount.toFixed(2)];
    if (hasBalance) cells.push(t.balance != null ? t.balance.toFixed(2) : '');
    rows.push(cells.join(','));
  }
  return rows.join(newline) + newline;
}

export default { parseStatementText, toCsv, parseAmount, matchDate, isMoneyToken };
