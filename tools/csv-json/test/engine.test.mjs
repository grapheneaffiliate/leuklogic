/*
 * FlipCSV engine tests — pure Node, no browser, no deps. Run: npm test
 * These are the definition of done: the page ships only if these pass.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvToJson, jsonToCsv, inferValue, csvCell } from '../src/convert.mjs';

/* ---------------- CSV -> JSON ---------------- */

test('csvToJson: basic rows become keyed objects (values stay strings by default)', () => {
  const { rows, header } = csvToJson('a,b\n1,2\n3,4');
  assert.deepEqual(header, ['a', 'b']);
  assert.deepEqual(rows, [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
});

test('csvToJson: lossless default keeps "007" and "1e999" as strings', () => {
  const { rows } = csvToJson('id,val\n007,1e999');
  assert.equal(rows[0].id, '007');
  assert.equal(rows[0].val, '1e999');
});

test('csvToJson: inferTypes converts only round-trip-safe values', () => {
  const { rows } = csvToJson('n,b,e,z,s\n12,true,,3.5,hi', { inferTypes: true });
  assert.deepEqual(rows[0], { n: 12, b: true, e: null, z: 3.5, s: 'hi' });
});

test('csvToJson: inferTypes still refuses "007" (would lose the leading zero)', () => {
  const { rows } = csvToJson('id\n007', { inferTypes: true });
  assert.equal(rows[0].id, '007');
});

test('csvToJson: quoted field with comma and newline survives', () => {
  const { rows } = csvToJson('name,note\n"Doe, Jane","line1\nline2"');
  assert.equal(rows[0].name, 'Doe, Jane');
  assert.equal(rows[0].note, 'line1\nline2');
});

test('csvToJson: duplicate headers are disambiguated, not collided', () => {
  const { rows, header } = csvToJson('id,id\n1,2');
  assert.deepEqual(header, ['id', 'id_2']);
  assert.deepEqual(rows[0], { id: '1', id_2: '2' });
});

test('csvToJson: a width-mismatched record is reported, never dropped or padded', () => {
  const { rows, malformed } = csvToJson('a,b\n1,2\n3');
  assert.equal(rows.length, 1);
  assert.equal(malformed.length, 1);
  assert.equal(malformed[0].line, 3);
  assert.equal(malformed[0].actual, 1);
  assert.equal(malformed[0].expected, 2);
});

test('csvToJson: semicolon delimiter auto-detected', () => {
  const { rows, delimiter } = csvToJson('a;b\n1;2');
  assert.equal(delimiter, ';');
  assert.deepEqual(rows[0], { a: '1', b: '2' });
});

test('csvToJson: empty input yields no rows, no crash', () => {
  const { rows, header } = csvToJson('');
  assert.deepEqual(rows, []);
  assert.deepEqual(header, []);
});

/* ---------------- JSON -> CSV ---------------- */

test('jsonToCsv: array of objects -> header + rows (RFC 4180 CRLF)', () => {
  const { csv, columns, count } = jsonToCsv('[{"a":1,"b":2},{"a":3,"b":4}]');
  assert.deepEqual(columns, ['a', 'b']);
  assert.equal(count, 2);
  assert.equal(csv, 'a,b\r\n1,2\r\n3,4');
});

test('jsonToCsv: columns are the UNION across rows in first-seen order', () => {
  const { csv, columns } = jsonToCsv('[{"a":1},{"b":2},{"a":3,"c":4}]');
  assert.deepEqual(columns, ['a', 'b', 'c']);
  // row1 has no b/c, row2 has no a/c -> empty cells, nothing dropped
  assert.equal(csv, 'a,b,c\r\n1,,\r\n,2,\r\n3,,4');
});

test('jsonToCsv: fields needing quotes get RFC 4180 quoting', () => {
  const { csv } = jsonToCsv([{ x: 'a,b', y: 'she said "hi"', z: 'line1\nline2' }]);
  assert.equal(csv, 'x,y,z\r\n"a,b","she said ""hi""","line1\nline2"');
});

test('jsonToCsv: null/undefined become empty cells', () => {
  const { csv } = jsonToCsv([{ a: null, b: 1 }, { a: 2 }]);
  assert.equal(csv, 'a,b\r\n,1\r\n2,');
});

test('jsonToCsv: nested object/array is JSON-stringified into the cell', () => {
  const { csv } = jsonToCsv([{ a: { deep: 1 }, b: [1, 2] }]);
  assert.equal(csv, 'a,b\r\n"{""deep"":1}","[1,2]"');
});

test('jsonToCsv: a single object becomes one data row', () => {
  const { csv, count } = jsonToCsv('{"a":1,"b":2}');
  assert.equal(count, 1);
  assert.equal(csv, 'a,b\r\n1,2');
});

test('jsonToCsv: empty array -> empty output, no crash', () => {
  const { csv, count } = jsonToCsv('[]');
  assert.equal(csv, '');
  assert.equal(count, 0);
});

test('jsonToCsv: custom delimiter quotes on that delimiter', () => {
  const { csv } = jsonToCsv([{ a: 'x;y' }], { delimiter: ';' });
  assert.equal(csv, 'a\r\n"x;y"');
});

test('jsonToCsv: invalid JSON throws a plain-English error', () => {
  assert.throws(() => jsonToCsv('{not json'), /not valid JSON/);
});

test('jsonToCsv: a primitive is rejected with a clear reason', () => {
  assert.throws(() => jsonToCsv('42'), /must be an array of objects/);
});

test('jsonToCsv: an array containing a non-object row names the row', () => {
  assert.throws(() => jsonToCsv('[{"a":1}, 5]'), /Row 2 is not an object/);
});

/* ---------------- round trip ---------------- */

test('round trip: CSV -> JSON -> CSV is stable for well-formed data', () => {
  const csv = 'name,city\r\n"Doe, Jane",NYC\r\nBob,LA';
  const { rows } = csvToJson(csv);
  const back = jsonToCsv(rows).csv;
  assert.equal(back, csv);
});

/* ---------------- helpers ---------------- */

test('inferValue: exact round-trip rule', () => {
  assert.equal(inferValue(''), null);
  assert.equal(inferValue('0'), 0);
  assert.equal(inferValue('12'), 12);
  assert.equal(inferValue('-3.5'), -3.5);
  assert.equal(inferValue('true'), true);
  assert.equal(inferValue('007'), '007');   // leading zero preserved
  assert.equal(inferValue(' 12'), ' 12');   // whitespace preserved
  assert.equal(inferValue('1e999'), '1e999'); // overflow -> Infinity, not round-trip
});

test('csvCell: quotes only when needed', () => {
  assert.equal(csvCell('plain', ','), 'plain');
  assert.equal(csvCell('a,b', ','), '"a,b"');
  assert.equal(csvCell(null, ','), '');
  assert.equal(csvCell(5, ','), '5');
});
