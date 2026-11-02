'use strict';

// Calendar days are plain integers: days since 1970-01-01.
// That keeps day math free of time zones and daylight-saving surprises.

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fromParts(y, m, d) {
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

// 'YYYY-MM-DD' -> day number, or NaN when the text is not a real date.
function parseDay(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text).trim());
  if (!match) return NaN;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const day = fromParts(y, m, d);
  const back = parts(day);
  return back.y === y && back.m === m && back.d === d ? day : NaN;
}

function parts(day) {
  const date = new Date(day * DAY_MS);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

function formatDay(day) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

// 0 = Sunday ... 6 = Saturday. 1970-01-01 was a Thursday.
function weekday(day) {
  return (((day + 4) % 7) + 7) % 7;
}

function isWeekend(day) {
  const w = weekday(day);
  return w === 0 || w === 6;
}

// Today's date in the local time zone.
function localToday(now = new Date()) {
  return fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function addYears(day, years) {
  const { y, m, d } = parts(day);
  const lastOfMonth = parts(fromParts(y + years, m + 1, 0)).d;
  return fromParts(y + years, m, Math.min(d, lastOfMonth));
}

function pretty(day) {
  const { y, m, d } = parts(day);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function prettyRange(from, to) {
  return `${pretty(from)} → ${pretty(to)}`;
}

function yearRange(year) {
  return { from: fromParts(year, 1, 1), to: fromParts(year, 12, 31) };
}

function lastTwelveMonths(today) {
  return { from: addYears(today, -1) + 1, to: today };
}

// Turns --year / --from / --to into a { from, to } day range.
function resolveRange({ year, from, to } = {}, today) {
  let range;
  if (year !== undefined && year !== '') {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 1970 || y > 2100) throw new RangeError(`"${year}" is not a valid year.`);
    range = yearRange(y);
  } else {
    const end = to ? parseDay(to) : today;
    if (Number.isNaN(end)) throw new RangeError(`"${to}" is not a valid date. Use YYYY-MM-DD.`);
    const start = from ? parseDay(from) : lastTwelveMonths(end).from;
    if (Number.isNaN(start)) throw new RangeError(`"${from}" is not a valid date. Use YYYY-MM-DD.`);
    range = { from: start, to: end };
  }
  if (range.from > range.to) {
    throw new RangeError(`The start date ${formatDay(range.from)} is after the end date ${formatDay(range.to)}.`);
  }
  return range;
}

// 'today' | 'yesterday' | 'YYYY-MM-DD' | 'YYYY-MM-DD..YYYY-MM-DD' -> sorted unique days.
function parseDayList(items, today) {
  const days = new Set();
  for (const raw of items.flatMap((item) => String(item).split(','))) {
    const text = raw.trim().toLowerCase();
    if (!text) continue;
    if (text === 'today') {
      days.add(today);
      continue;
    }
    if (text === 'yesterday') {
      days.add(today - 1);
      continue;
    }
    const span = text.split('..');
    if (span.length === 2) {
      const [a, b] = span.map(parseDay);
      if (Number.isNaN(a) || Number.isNaN(b) || a > b) {
        throw new RangeError(`"${raw.trim()}" is not a valid range. Use YYYY-MM-DD..YYYY-MM-DD.`);
      }
      for (let d = a; d <= b; d++) days.add(d);
      continue;
    }
    const day = parseDay(text);
    if (Number.isNaN(day)) throw new RangeError(`"${raw.trim()}" is not a valid date. Use YYYY-MM-DD.`);
    days.add(day);
  }
  return [...days].sort((a, b) => a - b);
}

// ─── Days of the week ───────────────────────────────────────────────────────

// Monday first, the order people pick weekdays in. Keys 1-7 in the pickers follow it.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_GROUPS = { weekdays: [1, 2, 3, 4, 5], weekends: [0, 6], weekend: [0, 6], all: [0, 1, 2, 3, 4, 5, 6] };

// "mo", "mon" or "monday" -> 1. Two letters are enough to tell any two days apart.
function weekdayNumber(word) {
  const w = word.toLowerCase();
  return w.length >= 2 ? WEEKDAY_NAMES.findIndex((name) => name.startsWith(w)) : -1;
}

// "mon,wed,fri", "mon-fri", "fri-mon", "weekdays", "weekends" or "all"
// -> Set of weekday numbers, 0 = Sunday ... 6 = Saturday.
function parseWeekdays(text) {
  const result = new Set();
  for (const token of String(text).split(/[\s,]+/).filter(Boolean)) {
    const group = WEEKDAY_GROUPS[token.toLowerCase()];
    if (group) {
      group.forEach((w) => result.add(w));
      continue;
    }
    const ends = token.split(/-|\.\./).map(weekdayNumber);
    if (ends.length > 2 || ends.some((w) => w === -1)) {
      throw new RangeError(`"${token}" is not a day of the week. Use names like mon,wed,fri or a range like mon-fri.`);
    }
    const [a, b = a] = ends;
    // Walk forward from a to b, wrapping past Sunday, so fri-mon means Fri, Sat, Sun, Mon.
    for (let w = a; ; w = (w + 1) % 7) {
      result.add(w);
      if (w === b) break;
    }
  }
  if (result.size === 0) throw new RangeError('Give at least one day of the week, like mon-fri.');
  return result;
}

// Set of weekday numbers -> "every day", "Mon–Fri" or "Mon, Wed, Fri".
function describeWeekdays(set) {
  if (set.size === 7) return 'every day';
  const runs = [];
  for (const w of WEEK_ORDER) {
    if (!set.has(w)) continue;
    const run = runs[runs.length - 1];
    if (run && WEEK_ORDER.indexOf(run[run.length - 1]) === WEEK_ORDER.indexOf(w) - 1) run.push(w);
    else runs.push([w]);
  }
  return runs
    .map((run) => (run.length >= 3 ? `${WEEKDAYS[run[0]]}–${WEEKDAYS[run[run.length - 1]]}` : run.map((w) => WEEKDAYS[w]).join(', ')))
    .join(', ');
}

function offsetString(date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(2, '0')}`;
}

// 2024-09-10T09:37:48+06:00 in the local time zone.
function isoLocal(date) {
  const p = (n) => String(n).padStart(2, '0');
  const off = offsetString(date);
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}` +
    `${off.slice(0, 3)}:${off.slice(3)}`
  );
}

// Git's internal date format: "<unix seconds> <+hhmm>".
function gitDate(date) {
  return `${Math.floor(date.getTime() / 1000)} ${offsetString(date)}`;
}

module.exports = {
  DAY_MS,
  MONTHS,
  WEEKDAYS,
  fromParts,
  parseDay,
  parts,
  formatDay,
  weekday,
  isWeekend,
  localToday,
  addYears,
  pretty,
  prettyRange,
  yearRange,
  lastTwelveMonths,
  resolveRange,
  parseDayList,
  WEEK_ORDER,
  parseWeekdays,
  describeWeekdays,
  offsetString,
  isoLocal,
  gitDate,
};
