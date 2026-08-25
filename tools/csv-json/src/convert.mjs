/*
 * FlipCSV — convert.mjs
 * Pure, dependency-free CSV <-> JSON conversion. No DOM, no Node APIs, no network.
 * Safe to inline verbatim into a single-file HTML page (<script type="module">).
 *
 * Two directions, both lossless by default:
 *   csvToJson(text, opts) -> { rows, header, malformed, delimiter, blankLines }
 *       rows: array of plain objects keyed by header. Values are STRINGS unless
 *       opts.inferTypes is set, in which case a value is converted ONLY when the
 *       conversion round-trips exactly (so nothing is silently corrupted).
 *   jsonToCsv(jsonOrText, opts) -> { csv, columns, count }
 *       Accepts a JSON string or an already-parsed value. An array of objects
 *       becomes one row each; a single object becomes one row. Columns are the
 *       UNION of every object's keys in first-seen order — no row silently loses
 *       a field that a later row introduced. Emits strict RFC 4180 quoting.
 *
 * The design rule shared with DeltaCSV: never silently drop or corrupt data.
 * A CSV record whose width does not match the header is reported in `malformed`,
 * never guessed at; a JSON value that cannot be a table is a thrown error with a
 * plain-English reason, never a half-written file.
 */

import { parseCsv } from './parse.mjs';

/* --------------------------------------------------------------------------
 * CSV -> JSON
 * ------------------------------------------------------------------------ */

/**
 * inferValue(s) -> string | number | boolean | null
 * Conservative, round-trip-safe type inference. A string is converted ONLY if
 * re-serialising the result yields the original string, so "007", "1e999",
 * " 12 " and "1,5" all stay strings (converting them would lose information).
 */
export function inferValue(s) {
  if (s === '') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  // Numbers: must round-trip EXACTLY. This rejects leading zeros ("007"),
  // leading/trailing space, "+1", "1." , "Infinity"/"NaN", and overflow.
  const n = Number(s);
  if (!Number.isNaN(n) && Number.isFinite(n) && String(n) === s) return n;
  return s;
}

/**
 * csvToJson(text, options?)
 *   options.delimiter   explicit delimiter, or omit/'auto' to detect
 *   options.hasHeader   default true
 *   options.inferTypes  default false (values stay strings — lossless)
 * Returns { rows, header, malformed, delimiter, blankLines }.
 */
export function csvToJson(text, options = {}) {
  const { header, rows, malformed, delimiter, blankLines } = parseCsv(text, {
    delimiter: options.delimiter,
    hasHeader: options.hasHeader,
  });
  const infer = options.inferTypes === true;

  // Duplicate header names would collide as object keys; disambiguate the
  // SECOND and later occurrences ("id", "id" -> "id", "id_2") so no column
  // silently overwrites another. First occurrence keeps its bare name.
  const seen = Object.create(null);
  const keys = header.map((h) => {
    const base = h === '' ? 'column' : h;
    if (seen[base] === undefined) {
      seen[base] = 1;
      return base;
    }
    seen[base] += 1;
    return `${base}_${seen[base]}`;
  });

  const out = rows.map((cells) => {
    const obj = {};
    for (let i = 0; i < keys.length; i++) {
      obj[keys[i]] = infer ? inferValue(cells[i]) : cells[i];
    }
    return obj;
  });

  return { rows: out, header: keys, malformed, delimiter, blankLines };
}

/* --------------------------------------------------------------------------
 * JSON -> CSV
 * ------------------------------------------------------------------------ */

const NEEDS_QUOTING = /["\n\r]/;

/**
 * csvCell(value, delimiter) -> string
 * RFC 4180 field serialisation. null/undefined become an empty field; objects
 * and arrays are JSON-stringified into the cell (a table cell cannot hold a
 * nested structure, so we keep it as readable JSON rather than "[object Object]").
 */
export function csvCell(value, delimiter) {
  if (value === null || value === undefined) return '';
  let s;
  if (typeof value === 'object') s = JSON.stringify(value);
  else s = String(value);
  if (s.includes(delimiter) || NEEDS_QUOTING.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * jsonToCsv(jsonOrText, options?)
 *   options.delimiter   default ','
 *   options.newline     default '\r\n' (RFC 4180); pass '\n' for unix
 *   options.columns     explicit column order; omit to use first-seen union
 * Returns { csv, columns, count }. Throws a plain-English Error when the input
 * is not a JSON array/object of records.
 */
export function jsonToCsv(jsonOrText, options = {}) {
  const delimiter = options.delimiter || ',';
  const newline = options.newline || '\r\n';

  let data = jsonOrText;
  if (typeof jsonOrText === 'string') {
    const trimmed = jsonOrText.trim();
    if (trimmed === '') throw new Error('Nothing to convert — the JSON input is empty.');
    try {
      data = JSON.parse(trimmed);
    } catch (e) {
      throw new Error('That is not valid JSON: ' + e.message);
    }
  }

  // Normalise to an array of records.
  let records;
  if (Array.isArray(data)) {
    records = data;
  } else if (data && typeof data === 'object') {
    records = [data];
  } else {
    throw new Error(
      'JSON must be an array of objects (or a single object) to become a table — got a ' +
        (data === null ? 'null' : typeof data) + '.'
    );
  }

  if (records.length === 0) return { csv: '', columns: [], count: 0 };

  // Every record must be an object; a bare value has no columns.
  records.forEach((rec, idx) => {
    if (Array.isArray(rec) || rec === null || typeof rec !== 'object') {
      throw new Error(
        `Row ${idx + 1} is not an object, so it has no columns — every item in the array must be a { key: value } object.`
      );
    }
  });

  // Column order: explicit, else the union of keys in first-seen order.
  let columns = options.columns;
  if (!columns) {
    const set = new Map();
    for (const rec of records) for (const k of Object.keys(rec)) if (!set.has(k)) set.set(k, true);
    columns = [...set.keys()];
  }

  const headerLine = columns.map((c) => csvCell(c, delimiter)).join(delimiter);
  const lines = [headerLine];
  for (const rec of records) {
    lines.push(columns.map((c) => csvCell(rec[c], delimiter)).join(delimiter));
  }
  return { csv: lines.join(newline), columns, count: records.length };
}

export default { csvToJson, jsonToCsv, inferValue, csvCell };
