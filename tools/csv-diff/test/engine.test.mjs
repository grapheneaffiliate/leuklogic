/*
 * DeltaCSV engine tests — pure Node, no dependencies, no network, no browser.
 * Run: node --test tools/csv-diff/test/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, detectDelimiter } from '../src/parse.mjs';
import { diffRows, KEY_SEP } from '../src/diff.mjs';

const BOM = '﻿';

/** Build a table literal without going through the parser. */
function table(header, rows, rowLines) {
  return { header, rows, rowLines: rowLines || rows.map((_, i) => i + 2) };
}

/* ------------------------------------------------------------------ parsing */

test('parse: quoted field containing the delimiter is one field', () => {
  const r = parseCsv('id,name,note\n1,"Smith, John",ok\n');
  assert.deepEqual(r.header, ['id', 'name', 'note']);
  assert.deepEqual(r.rows, [['1', 'Smith, John', 'ok']]);
  assert.equal(r.malformed.length, 0);
});

test('parse: embedded newline inside quotes stays in the field and line numbers stay honest', () => {
  const r = parseCsv('id,note\n1,"line one\nline two"\n2,after\n');
  assert.deepEqual(r.rows, [
    ['1', 'line one\nline two'],
    ['2', 'after'],
  ]);
  // record 1 starts on line 2; its quoted field consumes line 3, so record 2 is line 4
  assert.deepEqual(r.rowLines, [2, 4]);
});

test('parse: escaped quotes ("") become a single literal quote', () => {
  const r = parseCsv('id,name\n1,"He said ""hi"""\n');
  assert.deepEqual(r.rows, [['1', 'He said "hi"']]);
});

test('parse: a fully quoted field of only escaped quotes survives', () => {
  const r = parseCsv('a,b\n"""","x"\n');
  assert.deepEqual(r.rows, [['"', 'x']]);
});

test('parse: BOM is stripped from the first header name', () => {
  const r = parseCsv(BOM + 'id,name\n1,a\n');
  assert.deepEqual(r.header, ['id', 'name']);
  assert.equal(r.header[0].charCodeAt(0), 105); // 'i', not U+FEFF
});

test('parse: CRLF line endings are accepted', () => {
  const r = parseCsv('id,name\r\n1,a\r\n2,b\r\n');
  assert.deepEqual(r.header, ['id', 'name']);
  assert.deepEqual(r.rows, [
    ['1', 'a'],
    ['2', 'b'],
  ]);
  assert.equal(r.malformed.length, 0);
});

test('parse: CRLF inside a quoted field is normalised to LF', () => {
  const r = parseCsv('id,note\r\n1,"one\r\ntwo"\r\n');
  assert.deepEqual(r.rows, [['1', 'one\ntwo']]);
});

test('parse: BOM + CRLF + quoted delimiter together', () => {
  const r = parseCsv(BOM + 'id;name\r\n1;"Doe; Jane"\r\n');
  assert.equal(r.delimiter, ';');
  assert.deepEqual(r.header, ['id', 'name']);
  assert.deepEqual(r.rows, [['1', 'Doe; Jane']]);
});

test('parse: final row without a trailing newline is kept', () => {
  const r = parseCsv('id,name\n1,a\n2,b');
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[1], ['2', 'b']);
});

test('parse: trailing newline does not invent a phantom row', () => {
  const r = parseCsv('id\n1\n\n\n');
  assert.deepEqual(r.rows, [['1']]);
  assert.equal(r.malformed.length, 0);
  assert.equal(r.blankLines, 2);
});

test('parse: trailing empty field is preserved', () => {
  const r = parseCsv('a,b,c\n1,2,\n');
  assert.deepEqual(r.rows, [['1', '2', '']]);
});

test('parse: header names are trimmed', () => {
  const r = parseCsv(' id , name \n1,a\n');
  assert.deepEqual(r.header, ['id', 'name']);
});

test('parse: hasHeader:false synthesises column names and keeps the first record', () => {
  const r = parseCsv('1,a\n2,b\n', { hasHeader: false });
  assert.deepEqual(r.header, ['Column 1', 'Column 2']);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rowLines, [1, 2]);
});

/* ------------------------------------------------------------- malformed rows */

test('parse: malformed rows are reported with 1-indexed line numbers, never dropped', () => {
  const text = 'id,name,qty\n1,a,2\n2,b\n3,c,4,extra\n4,d,5\n';
  const r = parseCsv(text);
  assert.equal(r.rows.length, 2, 'only well-formed rows reach rows[]');
  assert.equal(r.malformed.length, 2);
  assert.deepEqual(
    r.malformed.map((m) => m.line),
    [3, 4]
  );
  assert.deepEqual(r.malformed[0], {
    line: 3,
    fields: ['2', 'b'],
    expected: 3,
    actual: 2,
    raw: '2,b',
  });
  assert.equal(r.malformed[1].actual, 4);
  // Nothing vanishes: 2 well-formed + 2 malformed = the 4 data records in the file.
  assert.equal(r.rows.length + r.malformed.length, 4);
});

test('parse: a malformed row after an embedded newline still reports the right line', () => {
  const r = parseCsv('id,note,qty\n1,"a\nb",2\n2,short\n');
  assert.equal(r.malformed.length, 1);
  assert.equal(r.malformed[0].line, 4);
});

test('diff: malformed rows are excluded from the diff (they never reach rows[])', () => {
  const a = parseCsv('id,v\n1,x\n2,y\n');
  const b = parseCsv('id,v\n1,x\n2,y,oops\n');
  const d = diffRows(a, b, { keyColumns: ['id'] });
  assert.equal(b.malformed.length, 1);
  assert.equal(d.unchangedCount, 1);
  assert.equal(d.removed.length, 1); // id 2 only survives in file A
  assert.equal(d.changed.length, 0);
});

/* ------------------------------------------------------- delimiter detection */

test('detectDelimiter: comma, semicolon, tab and pipe', () => {
  assert.equal(detectDelimiter('a,b,c\n1,2,3\n'), ',');
  assert.equal(detectDelimiter('a;b;c\n1;2;3\n'), ';');
  assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3\n'), '\t');
  assert.equal(detectDelimiter('a|b|c\n1|2|3\n'), '|');
});

test('detectDelimiter: delimiters inside quoted regions are not counted', () => {
  // Every line has one real semicolon and two commas hidden inside quotes.
  const text = 'name;note\n"a,b";"c,d"\n"e,f";"g,h"\n"i,j";"k,l"\n';
  assert.equal(detectDelimiter(text), ';');
  const r = parseCsv(text);
  assert.deepEqual(r.rows[0], ['a,b', 'c,d']);
});

test('detectDelimiter: tab-delimited data containing prose commas still detects tab', () => {
  const text = 'name\tnote\nJane\tHello, world\nJohn\tBye\n';
  assert.equal(detectDelimiter(text), '\t');
});

test('detectDelimiter: single-column file falls back to comma and parses as one column', () => {
  const r = parseCsv('id\n1\n2\n');
  assert.equal(r.delimiter, ',');
  assert.deepEqual(r.rows, [['1'], ['2']]);
});

test('parse: an explicit delimiter overrides detection', () => {
  const text = 'a|b\n1|2\n';
  const r = parseCsv(text, { delimiter: ',' });
  assert.equal(r.delimiter, ',');
  assert.deepEqual(r.header, ['a|b']);
  assert.deepEqual(r.rows, [['1|2']]);
});

/* ------------------------------------------------- the headline: row order */

test('HEADLINE: identical data in a different row order produces ZERO differences', () => {
  const a = parseCsv(
    'order_id,customer,total\n' +
      'A-1,Ada,10.00\n' +
      'A-2,Bob,20.00\n' +
      'A-3,Cy,30.00\n' +
      'A-4,Dee,40.00\n'
  );
  const b = parseCsv(
    'order_id,customer,total\n' +
      'A-3,Cy,30.00\n' +
      'A-1,Ada,10.00\n' +
      'A-4,Dee,40.00\n' +
      'A-2,Bob,20.00\n'
  );
  const d = diffRows(a, b, { keyColumns: ['order_id'] });
  assert.deepEqual(d.added, []);
  assert.deepEqual(d.removed, []);
  assert.deepEqual(d.changed, []);
  assert.deepEqual(d.duplicateKeys, []);
  assert.equal(d.unchangedCount, 4);
});

test('HEADLINE control: a line-order diff WOULD have flagged those rows', () => {
  // Sanity check that the fixture above really is re-sorted, so the test above
  // is meaningful rather than trivially true.
  const a = parseCsv('order_id,customer\nA-1,Ada\nA-2,Bob\n');
  const b = parseCsv('order_id,customer\nA-2,Bob\nA-1,Ada\n');
  assert.notDeepEqual(a.rows, b.rows);
  const d = diffRows(a, b, { keyColumns: ['order_id'] });
  assert.equal(d.unchangedCount, 2);
});

/* --------------------------------------------------------- rows and columns */

test('diff: added, removed and changed rows land in the right buckets', () => {
  const a = parseCsv('id,qty,note\n1,5,keep\n2,7,drop\n3,9,same\n');
  const b = parseCsv('id,qty,note\n3,9,same\n1,6,keep\n4,1,new\n');
  const d = diffRows(a, b, { keyColumns: ['id'] });

  assert.equal(d.unchangedCount, 1);
  assert.deepEqual(d.removed.map((r) => r.key), ['2']);
  assert.deepEqual(d.added.map((r) => r.key), ['4']);
  assert.equal(d.changed.length, 1);
  assert.equal(d.changed[0].key, '1');
  assert.deepEqual(d.changed[0].cells, [{ column: 'qty', oldValue: '5', newValue: '6' }]);
  assert.deepEqual(d.removed[0].row, { id: '2', qty: '7', note: 'drop' });
  assert.deepEqual(d.added[0].row, { id: '4', qty: '1', note: 'new' });
});

test('diff: changed entries carry ONLY the differing cells', () => {
  const a = table(['id', 'a', 'b', 'c'], [['1', 'x', 'y', 'z']]);
  const b = table(['id', 'a', 'b', 'c'], [['1', 'x', 'Y2', 'z']]);
  const d = diffRows(a, b, { keyColumns: ['id'] });
  assert.equal(d.changed.length, 1);
  assert.equal(d.changed[0].cells.length, 1);
  assert.deepEqual(d.changed[0].cells[0], { column: 'b', oldValue: 'y', newValue: 'Y2' });
});

test('diff: changed entries carry the source line numbers from each file', () => {
  const a = parseCsv('id,v\n1,x\n2,y\n');
  const b = parseCsv('id,v\n2,y\n1,X\n');
  const d = diffRows(a, b, { keyColumns: ['id'] });
  assert.equal(d.changed.length, 1);
  assert.equal(d.changed[0].oldLine, 2);
  assert.equal(d.changed[0].newLine, 3);
});

test('diff: reordered COLUMNS are not reported as changes (matching is by name)', () => {
  const a = parseCsv('id,name,qty\n1,Ada,5\n2,Bob,7\n');
  const b = parseCsv('qty,id,name\n5,1,Ada\n7,2,Bob\n');
  const d = diffRows(a, b, { keyColumns: ['id'] });
  assert.deepEqual(d.changed, []);
  assert.deepEqual(d.addedColumns, []);
  assert.deepEqual(d.removedColumns, []);
  assert.equal(d.unchangedCount, 2);
});

test('diff: reordered columns AND reordered rows together still diff to zero', () => {
  const a = parseCsv('id,name,qty\n1,Ada,5\n2,Bob,7\n3,Cy,9\n');
  const b = parseCsv('name,qty,id\nCy,9,3\nAda,5,1\nBob,7,2\n');
  const d = diffRows(a, b, { keyColumns: ['id'] });
  assert.equal(d.unchangedCount, 3);
  assert.deepEqual([d.added, d.removed, d.changed], [[], [], []]);
});

test('diff: columns present in only one file are reported as column changes, not cell changes', () => {
  const a = parseCsv('id,name,legacy\n1,Ada,old\n2,Bob,old\n');
  const b = parseCsv('id,name,region\n1,Ada,US\n2,Bob,EU\n');
  const d = diffRows(a, b, { keyColumns: ['id'] });
  assert.deepEqual(d.addedColumns, ['region']);
  assert.deepEqual(d.removedColumns, ['legacy']);
  assert.deepEqual(d.comparedColumns, ['id', 'name']);
  assert.deepEqual(d.changed, [], 'a one-sided column never counts as a row change');
  assert.equal(d.unchangedCount, 2);
});

test('diff: ignoreColumns removes a column from comparison', () => {
  const a = parseCsv('id,v,exported_at\n1,x,2026-01-01\n');
  const b = parseCsv('id,v,exported_at\n1,x,2026-02-01\n');
  const withTs = diffRows(a, b, { keyColumns: ['id'] });
  assert.equal(withTs.changed.length, 1);
  const withoutTs = diffRows(a, b, { keyColumns: ['id'], ignoreColumns: ['exported_at'] });
  assert.deepEqual(withoutTs.changed, []);
  assert.equal(withoutTs.unchangedCount, 1);
  assert.deepEqual(withoutTs.comparedColumns, ['id', 'v']);
});

test('diff: duplicate COLUMN names are reported rather than silently shadowed', () => {
  const a = table(['id', 'v', 'v'], [['1', 'x', 'y']]);
  const b = table(['id', 'v', 'v'], [['1', 'x', 'y']]);
  const d = diffRows(a, b, { keyColumns: ['id'] });
  assert.deepEqual(d.duplicateColumns, [{ column: 'v', countA: 2, countB: 2 }]);
});

/* ------------------------------------------------------------ DUPLICATE KEYS */

test('DUPLICATE KEYS: a key repeated in file A goes to its own bucket, never first-matched', () => {
  const a = parseCsv('id,v\n1,x\n1,DIFFERENT\n2,y\n');
  const b = parseCsv('id,v\n1,x\n2,y\n');
  const d = diffRows(a, b, { keyColumns: ['id'] });

  assert.equal(d.duplicateKeys.length, 1);
  assert.equal(d.duplicateKeys[0].key, '1');
  assert.equal(d.duplicateKeys[0].countA, 2);
  assert.equal(d.duplicateKeys[0].countB, 1);
  assert.deepEqual(d.duplicateKeys[0].linesA, [2, 3]);
  assert.deepEqual(d.duplicateKeys[0].linesB, [2]);

  // Excluded from every other bucket — a first-match implementation would have
  // reported "1" as unchanged and quietly hidden the second row.
  assert.equal(d.unchangedCount, 1, 'only id 2 is unchanged');
  for (const bucket of [d.added, d.removed, d.changed]) {
    assert.equal(bucket.filter((e) => e.key === '1').length, 0);
  }
});

test('DUPLICATE KEYS: a key repeated only in file B is excluded too', () => {
  const a = parseCsv('id,v\n1,x\n');
  const b = parseCsv('id,v\n1,x\n1,x\n');
  const d = diffRows(a, b, { keyColumns: ['id'] });
  assert.equal(d.duplicateKeys.length, 1);
  assert.deepEqual([d.duplicateKeys[0].countA, d.duplicateKeys[0].countB], [1, 2]);
  assert.equal(d.unchangedCount, 0);
  assert.deepEqual([d.added, d.removed, d.changed], [[], [], []]);
});

test('DUPLICATE KEYS: a duplicate present in only one file is still surfaced (count 0 on the other side)', () => {
  const a = parseCsv('id,v\n7,a\n7,b\n');
  const b = parseCsv('id,v\n8,c\n');
  const d = diffRows(a, b, { keyColumns: ['id'] });
  assert.equal(d.duplicateKeys.length, 1);
  assert.equal(d.duplicateKeys[0].key, '7');
  assert.deepEqual([d.duplicateKeys[0].countA, d.duplicateKeys[0].countB], [2, 0]);
  assert.deepEqual(d.added.map((r) => r.key), ['8']);
  assert.deepEqual(d.removed, [], 'the duplicated key is not reported as removed');
});

test('DUPLICATE KEYS: three occurrences are counted, not collapsed', () => {
  const a = parseCsv('id,v\n1,a\n1,b\n1,c\n2,z\n');
  const b = parseCsv('id,v\n1,a\n2,z\n');
  const d = diffRows(a, b, { keyColumns: ['id'] });
  assert.equal(d.duplicateKeys[0].countA, 3);
  assert.equal(d.unchangedCount, 1);
});

test('DUPLICATE KEYS: duplicates created by case-insensitive key folding are caught', () => {
  const a = parseCsv('email,v\nA@x.com,1\na@x.com,2\n');
  const b = parseCsv('email,v\na@x.com,1\n');
  const exact = diffRows(a, b, { keyColumns: ['email'] });
  assert.deepEqual(exact.duplicateKeys, [], 'case-sensitive: two distinct keys');
  const folded = diffRows(a, b, { keyColumns: ['email'], caseInsensitiveKeys: true });
  assert.equal(folded.duplicateKeys.length, 1);
  assert.equal(folded.duplicateKeys[0].countA, 2);
});

/* ------------------------------------------------------------ composite keys */

test('composite keys: two columns identify a row', () => {
  const a = parseCsv('sku,warehouse,qty\nX1,NY,5\nX1,LA,7\nX2,NY,1\n');
  const b = parseCsv('sku,warehouse,qty\nX2,NY,1\nX1,LA,9\nX1,NY,5\n');
  const d = diffRows(a, b, { keyColumns: ['sku', 'warehouse'] });
  assert.deepEqual(d.duplicateKeys, [], 'sku alone repeats, but sku+warehouse does not');
  assert.equal(d.unchangedCount, 2);
  assert.equal(d.changed.length, 1);
  assert.deepEqual(d.changed[0].keyValues, ['X1', 'LA']);
  assert.equal(d.changed[0].key, 'X1' + KEY_SEP + 'LA');
  assert.deepEqual(d.changed[0].cells, [{ column: 'qty', oldValue: '7', newValue: '9' }]);
});

test('composite keys: the same file keyed on one column instead reports duplicates', () => {
  const a = parseCsv('sku,warehouse,qty\nX1,NY,5\nX1,LA,7\n');
  const d = diffRows(a, a, { keyColumns: ['sku'] });
  assert.equal(d.duplicateKeys.length, 1);
  assert.equal(d.duplicateKeys[0].countA, 2);
});

test('composite keys: parts cannot collide across the separator', () => {
  // Without escaping, ["a<US>b","c"] and ["a","b<US>c"] would join to the same key.
  const header = ['x', 'y', 'v'];
  const rows = [
    ['a' + KEY_SEP + 'b', 'c', '1'],
    ['a', 'b' + KEY_SEP + 'c', '2'],
  ];
  const d = diffRows(table(header, rows), table(header, rows), { keyColumns: ['x', 'y'] });
  assert.deepEqual(d.duplicateKeys, [], 'distinct rows must not collide into a duplicate key');
  assert.equal(d.unchangedCount, 2);
});

test('composite keys: a missing key column is a clear error, not a silent bad diff', () => {
  const a = parseCsv('id,v\n1,x\n');
  const b = parseCsv('id,v\n1,x\n');
  assert.throws(() => diffRows(a, b, { keyColumns: ['nope'] }), /key column "nope"/);
  assert.throws(() => diffRows(a, b, { keyColumns: [] }), /keyColumns is required/);
});

/* --------------------------------------------------------- comparison options */

test('options: trim is ON by default and OFF when asked', () => {
  const a = table(['id', 'v'], [['1', 'hello']]);
  const b = table(['id', 'v'], [['1', ' hello ']]);
  assert.equal(diffRows(a, b, { keyColumns: ['id'] }).changed.length, 0);
  const strict = diffRows(a, b, { keyColumns: ['id'], trim: false });
  assert.equal(strict.changed.length, 1);
  assert.deepEqual(strict.changed[0].cells[0], { column: 'v', oldValue: 'hello', newValue: ' hello ' });
});

test('options: trim also applies to keys, so " 1" and "1" match by default', () => {
  const a = table(['id', 'v'], [[' 1 ', 'x']]);
  const b = table(['id', 'v'], [['1', 'x']]);
  assert.equal(diffRows(a, b, { keyColumns: ['id'] }).unchangedCount, 1);
  const strict = diffRows(a, b, { keyColumns: ['id'], trim: false });
  assert.equal(strict.added.length, 1);
  assert.equal(strict.removed.length, 1);
});

test('options: caseInsensitiveKeys is OFF by default', () => {
  const a = table(['id', 'v'], [['AB', 'x']]);
  const b = table(['id', 'v'], [['ab', 'x']]);
  const strict = diffRows(a, b, { keyColumns: ['id'] });
  assert.equal(strict.added.length, 1);
  assert.equal(strict.removed.length, 1);
  assert.equal(strict.unchangedCount, 0);

  const folded = diffRows(a, b, { keyColumns: ['id'], caseInsensitiveKeys: true });
  assert.equal(folded.added.length, 0);
  assert.equal(folded.removed.length, 0);
  // The keys matched, but the key cell itself really does differ — report it.
  assert.equal(folded.changed.length, 1);
  assert.deepEqual(folded.changed[0].cells, [{ column: 'id', oldValue: 'AB', newValue: 'ab' }]);
});

test('options: caseInsensitiveValues is OFF by default', () => {
  const a = table(['id', 'v'], [['1', 'Yes']]);
  const b = table(['id', 'v'], [['1', 'yes']]);
  assert.equal(diffRows(a, b, { keyColumns: ['id'] }).changed.length, 1);
  assert.equal(
    diffRows(a, b, { keyColumns: ['id'], caseInsensitiveValues: true }).changed.length,
    0
  );
});

test('options: numericTolerance 0 is an exact string compare', () => {
  const a = table(['id', 'v'], [['1', '1.0']]);
  const b = table(['id', 'v'], [['1', '1.00']]);
  const d = diffRows(a, b, { keyColumns: ['id'] });
  assert.equal(d.changed.length, 1);
  assert.deepEqual(d.changed[0].cells[0], { column: 'v', oldValue: '1.0', newValue: '1.00' });
});

test('options: numericTolerance absorbs differences at or under the tolerance', () => {
  const a = table(
    ['id', 'total'],
    [
      ['1', '10.00'],
      ['2', '20.00'],
      ['3', '30.00'],
    ]
  );
  const b = table(
    ['id', 'total'],
    [
      ['1', '10.004'], // within 0.01
      ['2', '20.01'], // exactly at 0.01
      ['3', '30.02'], // beyond 0.01
    ]
  );
  const d = diffRows(a, b, { keyColumns: ['id'], numericTolerance: 0.01 });
  assert.deepEqual(d.changed.map((c) => c.key), ['3']);
  assert.equal(d.unchangedCount, 2);
  assert.deepEqual(d.changed[0].cells[0], { column: 'total', oldValue: '30.00', newValue: '30.02' });
});

test('options: numericTolerance treats equivalent numeric spellings as equal', () => {
  const a = table(['id', 'v'], [['1', '1.0'], ['2', '1e3']]);
  const b = table(['id', 'v'], [['1', '1'], ['2', '1000']]);
  const d = diffRows(a, b, { keyColumns: ['id'], numericTolerance: 0.001 });
  assert.deepEqual(d.changed, []);
  assert.equal(d.unchangedCount, 2);
});

test('options: numericTolerance never makes non-numeric text equal', () => {
  const a = table(['id', 'v'], [['1', 'ten'], ['2', ''], ['3', '5']]);
  const b = table(['id', 'v'], [['1', '10'], ['2', '0'], ['3', 'five']]);
  const d = diffRows(a, b, { keyColumns: ['id'], numericTolerance: 100 });
  assert.equal(d.changed.length, 3, 'text vs number stays a difference at any tolerance');
});

test('options: a negative numericTolerance is rejected', () => {
  const a = table(['id'], [['1']]);
  assert.throws(() => diffRows(a, a, { keyColumns: ['id'], numericTolerance: -1 }), /must be >= 0/);
});

test('diff: a non-table argument fails loudly', () => {
  assert.throws(() => diffRows(null, table(['id'], []), { keyColumns: ['id'] }), /parseCsv result/);
});

test('parse: bare CR line endings are accepted', () => {
  const r = parseCsv('id,name\r1,a\r2,b\r');
  assert.deepEqual(r.header, ['id', 'name']);
  assert.deepEqual(r.rows, [
    ['1', 'a'],
    ['2', 'b'],
  ]);
});

test('parse: a quote in the middle of an unquoted field is data, not structure', () => {
  const r = parseCsv('id,size\n1,5" pipe\n');
  assert.deepEqual(r.rows, [['1', '5" pipe']]);
  assert.equal(r.malformed.length, 0);
});

test('diff: rows may also be given as objects keyed by column name', () => {
  const a = { header: ['id', 'v'], rows: [{ id: '1', v: 'x' }, { id: '2', v: 'y' }] };
  const b = { header: ['v', 'id'], rows: [{ id: '2', v: 'y' }, { id: '1', v: 'z' }] };
  const d = diffRows(a, b, { keyColumns: ['id'] });
  assert.equal(d.unchangedCount, 1);
  assert.deepEqual(d.changed[0].cells, [{ column: 'v', oldValue: 'x', newValue: 'z' }]);
  assert.equal(d.changed[0].line, undefined);
});

test('options: numericTolerance does not override trim:false on whitespace', () => {
  const a = table(['id', 'v'], [['1', '10.00']]);
  const b = table(['id', 'v'], [['1', ' 10.00']]);
  assert.equal(diffRows(a, b, { keyColumns: ['id'], numericTolerance: 1 }).changed.length, 0);
  const strict = diffRows(a, b, { keyColumns: ['id'], numericTolerance: 1, trim: false });
  assert.equal(strict.changed.length, 1, 'trim:false means whitespace still counts');
});

test('diff: hasHeader:false files diff on synthesised column names', () => {
  const a = parseCsv('1,a\n2,b\n', { hasHeader: false });
  const b = parseCsv('2,b\n1,A\n', { hasHeader: false });
  const d = diffRows(a, b, { keyColumns: ['Column 1'] });
  assert.equal(d.unchangedCount, 1);
  assert.deepEqual(d.changed[0].cells, [{ column: 'Column 2', oldValue: 'a', newValue: 'A' }]);
});

/* ------------------------------------------------------------- integration */

test('integration: re-sorted export, reordered columns, one real change, one dup, one malformed row', () => {
  const before =
    BOM +
    'order_id,customer,total,legacy_flag\r\n' +
    'A-1,"Smith, John",10.00,Y\r\n' +
    'A-2,"O""Neil, Pat",20.00,N\r\n' +
    'A-3,"multi\r\nline",30.00,Y\r\n' +
    'A-4,Dee,40.00,N\r\n';

  const after =
    'total,order_id,customer,region\n' +
    '40.00,A-4,Dee,US\n' +
    '30.005,A-3,"multi\nline",EU\n' +
    '10.00,A-1,"Smith, John",US\n' +
    '25.00,A-2,"O""Neil, Pat",US\n' +
    '99.00,A-5\n' + // malformed: 2 fields where 4 are expected
    '1.00,A-6,Eve,US\n' +
    '2.00,A-6,Eve2,US\n'; // duplicate key A-6

  const a = parseCsv(before);
  const b = parseCsv(after);

  assert.equal(a.delimiter, ',');
  assert.equal(a.header[0], 'order_id', 'BOM stripped');
  assert.equal(a.rows.length, 4);
  assert.equal(a.malformed.length, 0);

  assert.equal(b.malformed.length, 1);
  // A-3's quoted field spans two physical lines, so the malformed record is line 7.
  assert.equal(b.malformed[0].line, 7);
  assert.equal(b.rows.length, 6);

  const d = diffRows(a, b, { keyColumns: ['order_id'], numericTolerance: 0.01 });

  assert.deepEqual(d.addedColumns, ['region']);
  assert.deepEqual(d.removedColumns, ['legacy_flag']);
  assert.deepEqual(d.comparedColumns, ['order_id', 'customer', 'total']);

  // A-6 is duplicated in the new file: excluded from added, reported on its own.
  assert.deepEqual(d.duplicateKeys.map((k) => k.key), ['A-6']);
  assert.equal(d.duplicateKeys[0].countB, 2);
  assert.equal(d.added.length, 0, 'the duplicated key is NOT reported as added');

  // A-3's total moved by 0.005 — inside the tolerance, so it is unchanged.
  // A-2's total really moved. Everything else is untouched.
  assert.deepEqual(d.changed.map((c) => c.key), ['A-2']);
  assert.deepEqual(d.changed[0].cells, [{ column: 'total', oldValue: '20.00', newValue: '25.00' }]);
  assert.equal(d.unchangedCount, 3);
  assert.deepEqual(d.removed, []);

  // Every input row is accounted for in exactly one bucket.
  const bAccounted =
    d.added.length + d.changed.length + d.unchangedCount + d.duplicateKeys[0].countB;
  assert.equal(bAccounted + b.malformed.length, 7, 'all 7 data records in file B are accounted for');
});

test('integration: a semicolon export and a comma export of the same data diff to zero', () => {
  const eu = parseCsv('id;name;note\n1;Ada;"a;b"\n2;Bob;plain\n');
  const us = parseCsv('id,name,note\n2,Bob,plain\n1,Ada,"a;b"\n');
  assert.equal(eu.delimiter, ';');
  assert.equal(us.delimiter, ',');
  const d = diffRows(eu, us, { keyColumns: ['id'] });
  assert.equal(d.unchangedCount, 2);
  assert.deepEqual([d.added, d.removed, d.changed, d.duplicateKeys], [[], [], [], []]);
});
