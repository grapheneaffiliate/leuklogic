/*
 * CronText — cron.mjs
 * Pure, dependency-free 5-field cron parsing, plain-English description, and
 * next-run computation. No DOM, no Node APIs, no network, no ambient clock:
 * nextRuns() takes the "from" time as an argument so it is fully deterministic
 * (the browser passes new Date(); the tests pass a fixed date).
 *
 * Grammar (standard Vixie/POSIX 5-field, the crontab.guru dialect):
 *   minute hour day-of-month month day-of-week
 *   each field: * | value | first-last (range) | * / step | a-b/step | list of these (comma)
 *   month accepts JAN..DEC, day-of-week accepts SUN..SAT (case-insensitive)
 *   day-of-week 0 and 7 both mean Sunday
 *   shortcuts: @yearly/@annually @monthly @weekly @daily/@midnight @hourly
 *
 * Honesty rule shared with the other tools: an invalid expression is reported
 * with a specific reason, never guessed at or silently "corrected".
 */

const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day-of-month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'] },
  { name: 'day-of-week', min: 0, max: 7, names: ['SUN','MON','TUE','WED','THU','FRI','SAT'] },
];

const SHORTCUTS = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const MONTH_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function nameToNum(token, names) {
  const i = names.indexOf(token.toUpperCase());
  return i === -1 ? null : (names === FIELDS[3].names ? i + 1 : i);
}

/**
 * parseField(raw, spec) -> { values:Set<number>, star:boolean } | throws Error
 * Expands one field into the concrete set of numbers it matches.
 */
function parseField(raw, spec) {
  const star = raw === '*';
  const values = new Set();
  const parts = raw.split(',');
  for (const part of parts) {
    if (part === '') throw new Error(`Empty term in the ${spec.name} field.`);
    let range = part;
    let step = 1;
    const slash = part.split('/');
    if (slash.length > 2) throw new Error(`Too many "/" in the ${spec.name} field: "${part}".`);
    if (slash.length === 2) {
      range = slash[0];
      step = Number(slash[1]);
      if (!Number.isInteger(step) || step < 1) throw new Error(`Step must be a positive whole number in the ${spec.name} field: "${part}".`);
    }
    let lo, hi;
    if (range === '*') {
      lo = spec.min;
      hi = spec.max;
    } else {
      const ends = range.split('-');
      if (ends.length > 2) throw new Error(`Malformed range in the ${spec.name} field: "${range}".`);
      const toNum = (t) => {
        if (t === '') return null;
        if (spec.names) {
          const n = nameToNum(t, spec.names);
          if (n !== null) return n;
        }
        const n = Number(t);
        return Number.isInteger(n) ? n : null;
      };
      lo = toNum(ends[0]);
      hi = ends.length === 2 ? toNum(ends[1]) : lo;
      if (lo === null || hi === null) throw new Error(`"${range}" is not valid in the ${spec.name} field.`);
    }
    // Normalise day-of-week 7 -> 0 (both mean Sunday).
    if (spec.name === 'day-of-week') {
      if (lo === 7) lo = 0;
      if (hi === 7) hi = 0;
    }
    if (lo < spec.min || hi > spec.max) {
      throw new Error(`Value out of range in the ${spec.name} field (allowed ${spec.min}-${spec.max}): "${part}".`);
    }
    if (lo > hi) throw new Error(`Range goes backwards in the ${spec.name} field: "${range}".`);
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return { values, star };
}

/**
 * parseCron(expr) -> { minute, hour, dom, month, dow } (each {values,star})
 * Throws Error with a plain-English reason on anything malformed.
 */
export function parseCron(expr) {
  if (typeof expr !== 'string') throw new Error('Enter a cron expression.');
  let s = expr.trim().replace(/\s+/g, ' ');
  if (s === '') throw new Error('Enter a cron expression.');
  if (s.startsWith('@')) {
    const mapped = SHORTCUTS[s.toLowerCase()];
    if (!mapped) throw new Error(`Unknown shortcut "${s}". Supported: ${Object.keys(SHORTCUTS).join(', ')}.`);
    s = mapped;
  }
  const cells = s.split(' ');
  if (cells.length !== 5) {
    throw new Error(`A cron expression needs exactly 5 fields (minute hour day-of-month month day-of-week) — got ${cells.length}.`);
  }
  return {
    minute: parseField(cells[0], FIELDS[0]),
    hour: parseField(cells[1], FIELDS[1]),
    dom: parseField(cells[2], FIELDS[2]),
    month: parseField(cells[3], FIELDS[3]),
    dow: parseField(cells[4], FIELDS[4]),
  };
}

/* ---------------- description ---------------- */

function listHuman(nums, fmt) {
  const arr = [...nums].sort((a, b) => a - b).map(fmt);
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`;
}

function describeField(field, spec, fmt) {
  if (field.star) return null;
  const vals = [...field.values].sort((a, b) => a - b);
  // Detect a clean "every N" step starting at min covering the whole range.
  if (vals.length > 2) {
    const step = vals[1] - vals[0];
    let even = step > 1 && vals[0] === spec.min;
    for (let i = 1; i < vals.length && even; i++) if (vals[i] - vals[i - 1] !== step) even = false;
    if (even && vals[vals.length - 1] + step > spec.max) return { every: step };
  }
  return { list: listHuman(field.values, fmt) };
}

/**
 * describeCron(expr) -> string  (throws on invalid input)
 * A plain-English sentence. Deliberately readable over terse.
 */
export function describeCron(expr) {
  const c = parseCron(expr);
  const two = (n) => String(n).padStart(2, '0');

  // Time-of-day clause.
  let time;
  const mStar = c.minute.star, hStar = c.hour.star;
  if (mStar && hStar) {
    time = 'Every minute';
  } else if (!mStar && c.minute.values.size === 1 && !hStar && c.hour.values.size === 1) {
    const h = [...c.hour.values][0], m = [...c.minute.values][0];
    time = `At ${two(h)}:${two(m)}`;
  } else {
    const parts = [];
    const md = describeField(c.minute, FIELDS[0], (n) => String(n));
    const hd = describeField(c.hour, FIELDS[1], (n) => String(n));
    if (mStar) parts.push('every minute');
    else if (md && md.every) parts.push(`every ${md.every} minutes`);
    else parts.push(`at minute ${md.list}`);
    if (!hStar) {
      if (hd && hd.every) parts.push(`every ${hd.every} hours`);
      else parts.push(`past hour ${hd.list}`);
    }
    time = parts.join(', ').replace(/^./, (ch) => ch.toUpperCase());
  }

  // Day / month clauses.
  const clauses = [];
  const domD = describeField(c.dom, FIELDS[2], (n) => `the ${ordinal(n)}`);
  if (domD) clauses.push(domD.every ? `every ${domD.every} days` : `on ${domD.list} of the month`);
  const dowD = describeField(c.dow, FIELDS[4], (n) => DOW_LONG[n]);
  if (dowD) clauses.push(domD ? `and on ${dowD.list}` : `on ${dowD.list}`);
  const monD = describeField(c.month, FIELDS[3], (n) => MONTH_LONG[n - 1]);
  if (monD) clauses.push(`in ${monD.list}`);

  return clauses.length ? `${time} ${clauses.join(' ')}.` : `${time}.`;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ---------------- next runs ---------------- */

/**
 * nextRuns(expr, from, count=5) -> Date[]
 * Deterministic: steps forward minute-by-minute from `from` (a Date), in LOCAL
 * time, collecting the next `count` matches. Bounded to ~366 days of search so
 * an impossible expression (e.g. Feb 30) returns [] instead of looping forever.
 * Day-of-month + day-of-week follow the cron convention: if BOTH are restricted
 * (neither is "*"), a match on EITHER counts.
 */
export function nextRuns(expr, from, count = 5) {
  const c = parseCron(expr);
  const out = [];
  const t = new Date(from.getTime());
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1); // strictly after `from`
  const limit = new Date(from.getTime());
  limit.setFullYear(limit.getFullYear() + 1);
  limit.setDate(limit.getDate() + 1);

  const domRestricted = !c.dom.star;
  const dowRestricted = !c.dow.star;

  while (out.length < count && t <= limit) {
    if (
      c.minute.values.has(t.getMinutes()) &&
      c.hour.values.has(t.getHours()) &&
      c.month.values.has(t.getMonth() + 1)
    ) {
      const domOk = c.dom.values.has(t.getDate());
      const dowOk = c.dow.values.has(t.getDay());
      const dayOk =
        domRestricted && dowRestricted ? domOk || dowOk
        : domRestricted ? domOk
        : dowRestricted ? dowOk
        : true;
      if (dayOk) out.push(new Date(t.getTime()));
    }
    t.setMinutes(t.getMinutes() + 1);
  }
  return out;
}

export default { parseCron, describeCron, nextRuns };
