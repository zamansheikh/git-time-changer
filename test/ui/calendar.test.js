'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const term = require('../../src/ui/term');
const cal = require('../../src/ui/calendar');
const { parseDay } = require('../../src/core/dates');

term.setDepth(1);

const from = parseDay('2026-10-01');
const to = parseDay('2026-10-31');
const today = parseDay('2026-10-31');
const counts = new Map([
  ['2026-10-01', 2],
  ['2026-10-02', 1],
  ['2026-10-03', 4],
  ['2026-10-10', 1],
  ['2026-10-30', 3],
  ['2026-10-31', 1],
]);

test('renderCalendar draws 7 rows, a month header and one cell per day', () => {
  const lines = cal.renderCalendar({ counts, from, to, today, maxColumns: 120 }).map(term.strip);
  assert.equal(lines.length, 8);
  assert.match(lines[0], /Oct/);
  const cells = lines.slice(1).join('');
  assert.equal((cells.match(/■/g) || []).length, counts.size);
  assert.equal((cells.match(/·/g) || []).length, 31 - counts.size);
});

test('renderCalendar marks planned days', () => {
  const plan = new Map([['2026-10-11', 2], ['2026-10-12', 1]]);
  const cells = cal.renderCalendar({ counts, from, to, today, plan, maxColumns: 120 }).map(term.strip).join('');
  assert.equal((cells.match(/\+/g) || []).length, 2);
});

test('layout narrows cells, then splits into blocks', () => {
  assert.deepEqual(cal.layout(53, 120), { cellWidth: 2, perBlock: 53 });
  assert.deepEqual(cal.layout(53, 80), { cellWidth: 1, perBlock: 53 });
  assert.equal(cal.layout(106, 80).perBlock < 106, true);
});

test('renderStats puts totals and streaks on separate lines', () => {
  const lines = cal.renderStats({ total: 12, active: 6, empty: 1, longestStreak: 3, currentStreak: 2, longestGap: 19 }, { maxColumns: 120 }).map(term.strip);
  assert.deepEqual(lines, [
    '  12 contributions  ·  6 active days  ·  1 empty day',
    '  longest streak 3 days  ·  current streak 2 days  ·  longest gap 19 days',
  ]);
});

test('renderEmptyList groups by month', () => {
  const lines = cal.renderEmptyList([parseDay('2026-09-30'), parseDay('2026-10-01'), parseDay('2026-10-05')]).map(term.strip);
  assert.match(lines[0], /^ {2}Sep 2026 +1 day +30$/);
  assert.match(lines[1], /^ {2}Oct 2026 +2 days +1 +5$/);
});
