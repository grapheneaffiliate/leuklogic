/*
 * DeltaCSV — diff.mjs
 * Pure, dependency-free key-based CSV diffing. No DOM, no Node APIs, no network.
 * Safe to inline verbatim into a single-file HTML page (<script type="module">).
 *
 * The whole point of this tool: rows are matched by a KEY COLUMN the user picks,
 * not by line order. Two exports of the same data sorted differently must diff to
 * zero changes.
 *
 * Three correctness rules this module refuses to break:
 *   1. DUPLICATE KEYS are never resolved by "take the first match". Any key that
 *      appears more than once in either file is excluded from added/removed/changed
 *      and reported in its own bucket. Silently first-matching is how a diff tool
 *      quietly lies.
 *   2. Columns are matched BY NAME. Reordering columns is not a change. A column
 *      present in only one file is reported as an added/removed COLUMN and its
 *      cells are never counted as per-row changes.
 *   3. Nothing is dropped without being counted somewhere.
 */

// Key parts are joined with U+001F (UNIT SEPARATOR). CSV data can in principle
// contain that byte, so parts are escaped prefix-free first (U+001E is the escape).
// That keeps ["ab"] and ["a","b"] from colliding.
export const KEY_SEP = '\u001F';
const KEY_ESC = '\u001E';

function escapeKeyPart(s) {
  return s.indexOf(KEY_ESC) === -1 && s.indexOf(KEY_SEP) === -1
    ? s
    : s.split(KEY_ESC).join(KEY_ESC + KEY_ESC).split(KEY_SEP).join(KEY_ESC + KEY_SEP);
}

function normName(n) {
  return String(n ?? '').replace(/^\uFEFF/, '').trim();
}

const NUMERIC_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

// Deliberately does NOT trim: whitespace handling is the `trim` option's job, so
// numericTolerance never quietly overrides a user who turned trimming off.
function toNumber(s) {
  if (s === '' || !NUMERIC_RE.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Accepts a parseCsv result ({header, rows, rowLines}); rows may be arrays or objects. */
function normalizeTable(t, label) {
  if (!t || !Array.isArray(t.header) || !Array.isArray(t.rows)) {
    throw new Error(
      `diffRows: argument "${label}" must be a parseCsv result — an object with { header, rows }.`
    );
  }
  const header = t.header.map(normName);
  const index = new Map();
  // First occurrence wins for lookups; duplicates are reported separately.
  header.forEach((h, i) => {
    if (!index.has(h)) index.set(h, i);
  });
  return { header, index, rows: t.rows, rowLines: Array.isArray(t.rowLines) ? t.rowLines : [] };
}

function cellOf(T, row, col) {
  if (Array.isArray(row)) {
    const i = T.index.get(col);
    return i === undefined ? '' : row[i] ?? '';
  }
  return row[col] ?? '';
}

function rowObject(T, row) {
  const o = {};
  T.header.forEach((h, i) => {
    if (!(h in o)) o[h] = Array.isArray(row) ? row[i] ?? '' : row[h] ?? '';
  });
  return o;
}

function tallyNames(header) {
  const seen = new Map();
  for (const h of header) seen.set(h, (seen.get(h) || 0) + 1);
  return seen;
}

function normValue(v, o) {
  let s = v == null ? '' : String(v);
  if (o.trim) s = s.trim();
  if (o.caseInsensitiveValues) s = s.toLowerCase();
  return s;
}

function normKeyPart(v, o) {
  let s = v == null ? '' : String(v);
  if (o.trim) s = s.trim();
  if (o.caseInsensitiveKeys) s = s.toLowerCase();
  return s;
}

function valuesEqual(x, y, o) {
  const a = normValue(x, o);
  const b = normValue(y, o);
  if (a === b) return true;
  if (o.numericTolerance > 0) {
    const na = toNumber(a);
    const nb = toNumber(b);
    // Only a numeric comparison when BOTH sides are numbers — "1.0" vs "one"
    // stays a difference.
    if (na !== null && nb !== null) return Math.abs(na - nb) <= o.numericTolerance + 1e-12;
  }
  return false;
}

function indexByKey(T, keys, o) {
  const idx = new Map();
  T.rows.forEach((row, i) => {
    const keyValues = keys.map((k) => cellOf(T, row, k));
    const key = keyValues.map((p) => escapeKeyPart(normKeyPart(p, o))).join(KEY_SEP);
    let bucket = idx.get(key);
    if (!bucket) {
      bucket = [];
      idx.set(key, bucket);
    }
    bucket.push({ row, rowIndex: i, line: T.rowLines[i] ?? null, keyValues });
  });
  return idx;
}

/**
 * diffRows(a, b, options) -> {
 *   added, removed, changed, unchangedCount,
 *   duplicateKeys, addedColumns, removedColumns,
 *   duplicateColumns, comparedColumns, keyColumns, options
 * }
 *
 * options:
 *   keyColumns             string[] (required) — one name, or several for a composite key
 *   ignoreColumns          string[] — columns excluded from comparison entirely
 *   trim                   default TRUE  — trim whitespace before comparing keys and values
 *   caseInsensitiveKeys    default false
 *   caseInsensitiveValues  default false
 *   numericTolerance       default 0 (exact string compare)
 *
 * `changed` entries carry the key and ONLY the differing cells:
 *   { key, keyValues, cells: [{column, oldValue, newValue}], oldLine, newLine, ... }
 */
export function diffRows(a, b, options = {}) {
  const o = {
    trim: options.trim !== false,
    caseInsensitiveKeys: options.caseInsensitiveKeys === true,
    caseInsensitiveValues: options.caseInsensitiveValues === true,
    numericTolerance: Number(options.numericTolerance) || 0,
  };
  if (o.numericTolerance < 0) throw new Error('diffRows: numericTolerance must be >= 0.');

  const A = normalizeTable(a, 'a');
  const B = normalizeTable(b, 'b');

  const keys = (options.keyColumns || []).map(normName).filter((k) => k !== '');
  if (keys.length === 0) {
    throw new Error(
      'diffRows: keyColumns is required — rows are matched by key, not by line order.'
    );
  }
  for (const k of keys) {
    if (!A.index.has(k)) {
      throw new Error(`diffRows: key column "${k}" is not in the first file's header.`);
    }
    if (!B.index.has(k)) {
      throw new Error(`diffRows: key column "${k}" is not in the second file's header.`);
    }
  }

  const ignore = new Set((options.ignoreColumns || []).map(normName));

  // Columns, matched by NAME. Order is irrelevant.
  const inA = new Set(A.header);
  const inB = new Set(B.header);
  const addedColumns = [];
  const removedColumns = [];
  for (const h of B.header) if (!inA.has(h) && !addedColumns.includes(h)) addedColumns.push(h);
  for (const h of A.header) if (!inB.has(h) && !removedColumns.includes(h)) removedColumns.push(h);

  const comparedColumns = [];
  for (const h of A.header) {
    if (inB.has(h) && !ignore.has(h) && !comparedColumns.includes(h)) comparedColumns.push(h);
  }

  // Duplicate COLUMN names make name-based lookup ambiguous — say so out loud.
  const tallyA = tallyNames(A.header);
  const tallyB = tallyNames(B.header);
  const duplicateColumns = [];
  for (const name of new Set([...A.header, ...B.header])) {
    const countA = tallyA.get(name) || 0;
    const countB = tallyB.get(name) || 0;
    if (countA > 1 || countB > 1) duplicateColumns.push({ column: name, countA, countB });
  }

  const idxA = indexByKey(A, keys, o);
  const idxB = indexByKey(B, keys, o);

  // RULE 1: any key appearing more than once in EITHER file is excluded from
  // added/removed/changed and reported on its own.
  const dupKeys = new Set();
  for (const [k, ea] of idxA) {
    const eb = idxB.get(k);
    if (ea.length > 1 || (eb && eb.length > 1)) dupKeys.add(k);
  }
  for (const [k, eb] of idxB) {
    if (eb.length > 1) dupKeys.add(k);
  }

  const duplicateKeys = [];
  const emitDup = (k) => {
    const ea = idxA.get(k) || [];
    const eb = idxB.get(k) || [];
    duplicateKeys.push({
      key: k,
      keyValues: (ea[0] || eb[0]).keyValues,
      countA: ea.length,
      countB: eb.length,
      linesA: ea.map((e) => e.line),
      linesB: eb.map((e) => e.line),
    });
  };
  for (const k of idxA.keys()) if (dupKeys.has(k)) emitDup(k);
  for (const k of idxB.keys()) if (dupKeys.has(k) && !idxA.has(k)) emitDup(k);

  const added = [];
  const removed = [];
  const changed = [];
  let unchangedCount = 0;

  for (const [k, ea] of idxA) {
    if (dupKeys.has(k)) continue;
    const eb = idxB.get(k);
    const oldEntry = ea[0];
    if (!eb) {
      removed.push({
        key: k,
        keyValues: oldEntry.keyValues,
        row: rowObject(A, oldEntry.row),
        rowIndex: oldEntry.rowIndex,
        line: oldEntry.line,
      });
      continue;
    }
    const newEntry = eb[0];
    const cells = [];
    for (const col of comparedColumns) {
      const oldValue = cellOf(A, oldEntry.row, col);
      const newValue = cellOf(B, newEntry.row, col);
      if (!valuesEqual(oldValue, newValue, o)) cells.push({ column: col, oldValue, newValue });
    }
    if (cells.length > 0) {
      changed.push({
        key: k,
        keyValues: oldEntry.keyValues,
        cells,
        oldRowIndex: oldEntry.rowIndex,
        newRowIndex: newEntry.rowIndex,
        oldLine: oldEntry.line,
        newLine: newEntry.line,
      });
    } else {
      unchangedCount++;
    }
  }

  for (const [k, eb] of idxB) {
    if (dupKeys.has(k) || idxA.has(k)) continue;
    const e = eb[0];
    added.push({
      key: k,
      keyValues: e.keyValues,
      row: rowObject(B, e.row),
      rowIndex: e.rowIndex,
      line: e.line,
    });
  }

  return {
    added,
    removed,
    changed,
    unchangedCount,
    duplicateKeys,
    addedColumns,
    removedColumns,
    duplicateColumns,
    comparedColumns,
    keyColumns: keys,
    options: o,
  };
}

export default { diffRows, KEY_SEP };
