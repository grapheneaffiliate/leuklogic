/*
 * DeltaCSV — parse.mjs
 * Pure, dependency-free CSV parsing. No DOM, no Node APIs, no network.
 * Safe to inline verbatim into a single-file HTML page (<script type="module">).
 *
 * Shape it targets: RFC 4180, with the tolerances real-world exports need
 *   - fields may be quoted; a quoted field may contain the delimiter
 *   - a quoted field may contain newlines (CRLF inside quotes is normalised to LF)
 *   - a literal quote inside a quoted field is written as two quotes ("")
 *   - a UTF-8 BOM at the start of the file is stripped
 *   - LF and CRLF line endings are both accepted (bare CR too)
 *
 * The one rule that matters most: a record whose field count does not match the
 * header is NEVER silently dropped and never silently padded. It goes to
 * `malformed` with its 1-indexed line number and is excluded from `rows`.
 */

const BOM = '﻿';
const DEFAULT_CANDIDATES = [',', ';', '\t', '|'];

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * Split text into logical lines (quote-aware) and count each candidate
 * delimiter OUTSIDE quoted regions. Used only by detectDelimiter.
 */
function countOutsideQuotes(src, quote, candidates, maxLines) {
  const perLine = [];
  let counts = Object.create(null);
  for (const c of candidates) counts[c] = 0;
  let inQuotes = false;
  let hasContent = false;

  const flush = () => {
    if (hasContent) perLine.push(counts);
    counts = Object.create(null);
    for (const c of candidates) counts[c] = 0;
    hasContent = false;
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === quote) {
      // A doubled quote inside a quoted region flips the flag twice — a no-op,
      // which is exactly the behaviour we want for counting purposes.
      inQuotes = !inQuotes;
      hasContent = true;
      continue;
    }
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      flush();
      if (perLine.length >= maxLines) return perLine;
      continue;
    }
    if (!inQuotes && Object.prototype.hasOwnProperty.call(counts, ch)) counts[ch]++;
    hasContent = true;
  }
  flush();
  return perLine;
}

/**
 * detectDelimiter(text, options?) -> ',' | ';' | '\t' | '|'
 *
 * Counts each candidate outside quoted regions across the first `sampleLines`
 * logical lines, then picks the candidate that appears the most CONSISTENTLY
 * (same non-zero count on the most lines). Consistency beats raw frequency,
 * which is what stops a comma inside prose from beating a real semicolon.
 *
 * Genuinely ambiguous files exist (e.g. European decimals: "1,5;2,5"), so the
 * result is a best guess — the UI must always expose an override.
 */
export function detectDelimiter(text, options = {}) {
  const quote = options.quote || '"';
  const candidates = options.candidates || DEFAULT_CANDIDATES;
  const sampleLines = options.sampleLines || 20;
  const src = stripBom(typeof text === 'string' ? text : String(text ?? ''));
  if (src === '') return candidates[0];

  const lines = countOutsideQuotes(src.slice(0, 1 << 20), quote, candidates, sampleLines);
  if (lines.length === 0) return candidates[0];

  let best = null;
  for (let ci = 0; ci < candidates.length; ci++) {
    const c = candidates[ci];
    // Mode of the non-zero counts for this candidate.
    const tally = new Map();
    for (const l of lines) {
      const n = l[c];
      if (n > 0) tally.set(n, (tally.get(n) || 0) + 1);
    }
    if (tally.size === 0) continue;
    let mode = 0;
    let modeLines = 0;
    for (const [n, hits] of tally) {
      if (hits > modeLines || (hits === modeLines && n > mode)) {
        mode = n;
        modeLines = hits;
      }
    }
    const consistency = modeLines / lines.length;
    const cand = { delimiter: c, consistency, mode, order: ci };
    if (
      best === null ||
      cand.consistency > best.consistency ||
      (cand.consistency === best.consistency && cand.mode > best.mode) ||
      (cand.consistency === best.consistency && cand.mode === best.mode && cand.order < best.order)
    ) {
      best = cand;
    }
  }
  return best ? best.delimiter : candidates[0];
}

/**
 * parseCsv(text, options?) -> { header, rows, rowLines, malformed, delimiter, blankLines }
 *
 *   options.delimiter  explicit delimiter; omit (or 'auto') to auto-detect
 *   options.hasHeader  default true; when false, headers are "Column 1", "Column 2", …
 *   options.quote      default '"'
 *
 *   header      string[]   — trimmed header names, in file order
 *   rows        string[][] — only records whose field count === header.length
 *   rowLines    number[]   — 1-indexed start line of each row, parallel to rows
 *   malformed   {line, fields, expected, actual, raw}[]  — reported, never dropped
 *   delimiter   the delimiter actually used
 *   blankLines  count of completely empty lines skipped (they carry no data)
 */
export function parseCsv(text, options = {}) {
  const hasHeader = options.hasHeader !== false;
  const quote = options.quote || '"';
  const src = stripBom(typeof text === 'string' ? text : String(text ?? ''));
  const delimiter =
    options.delimiter && options.delimiter !== 'auto'
      ? options.delimiter
      : detectDelimiter(src, { quote });

  const records = [];
  let blankLines = 0;

  let fields = [];
  let field = '';
  let inQuotes = false;
  let recordHadQuote = false;
  let line = 1;
  let recordLine = 1;
  let recordStart = 0;
  let i = 0;

  const endRecord = (endOffset) => {
    fields.push(field);
    field = '';
    const isBlank = fields.length === 1 && fields[0] === '' && !recordHadQuote;
    if (isBlank) {
      blankLines++;
    } else {
      records.push({ fields, line: recordLine, raw: src.slice(recordStart, endOffset) });
    }
    fields = [];
    recordHadQuote = false;
  };

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === quote) {
        if (src[i + 1] === quote) {
          field += quote;
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      if (ch === '\r') {
        // Normalise CRLF (and bare CR) inside a quoted field to a single LF.
        field += '\n';
        line++;
        i += src[i + 1] === '\n' ? 2 : 1;
        continue;
      }
      if (ch === '\n') {
        field += '\n';
        line++;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === quote) {
      recordHadQuote = true;
      if (field === '') {
        inQuotes = true;
        i++;
        continue;
      }
      // A quote in the middle of an unquoted field is data, not structure.
      field += ch;
      i++;
      continue;
    }

    if (ch === delimiter) {
      fields.push(field);
      field = '';
      i++;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      const width = ch === '\r' && src[i + 1] === '\n' ? 2 : 1;
      endRecord(i);
      i += width;
      line++;
      recordLine = line;
      recordStart = i;
      continue;
    }

    field += ch;
    i++;
  }

  // Flush a final record that was not terminated by a newline.
  if (field !== '' || fields.length > 0 || recordHadQuote) endRecord(src.length);

  if (records.length === 0) {
    return { header: [], rows: [], rowLines: [], malformed: [], delimiter, blankLines };
  }

  let header;
  let dataRecords;
  if (hasHeader) {
    header = records[0].fields.map((h) => stripBom(String(h)).trim());
    dataRecords = records.slice(1);
  } else {
    header = records[0].fields.map((_, idx) => `Column ${idx + 1}`);
    dataRecords = records;
  }

  const rows = [];
  const rowLines = [];
  const malformed = [];
  for (const rec of dataRecords) {
    if (rec.fields.length === header.length) {
      rows.push(rec.fields);
      rowLines.push(rec.line);
    } else {
      malformed.push({
        line: rec.line,
        fields: rec.fields,
        expected: header.length,
        actual: rec.fields.length,
        raw: rec.raw,
      });
    }
  }

  return { header, rows, rowLines, malformed, delimiter, blankLines };
}

export default { parseCsv, detectDelimiter };
