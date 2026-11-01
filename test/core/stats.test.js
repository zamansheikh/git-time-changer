'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const stats = require('../../src/core/stats');
const { parseDay } = require('../../src/core/dates');

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

test('emptyDays lists days without contributions', () => {
  const empty = stats.emptyDays(counts, from, to, today);
  assert.equal(empty.length, 31 - counts.size);
  assert.ok(!empty.includes(parseDay('2026-10-10')));
  assert.ok(empty.includes(parseDay('2026-10-11')));
});

test('emptyDays never looks past today', () => {
  const empty = stats.emptyDays(new Map(), from, parseDay('2026-11-30'), today);
  assert.equal(empty[empty.length - 1], today);
});

test('computeStats', () => {
  const s = stats.computeStats(counts, from, to, today);
  assert.equal(s.total, 12);
  assert.equal(s.active, 6);
  assert.equal(s.empty, 25);
  assert.equal(s.longestStreak, 3);
  assert.equal(s.currentStreak, 2);
  assert.equal(s.longestGap, 19);
  assert.deepEqual(s.best, { day: parseDay('2026-10-03'), count: 4 });
});

test('current streak survives an empty today', () => {
  const s = stats.computeStats(counts, from, parseDay('2026-11-01'), parseDay('2026-11-01'));
  assert.equal(s.currentStreak, 2);
});

test('levelScale uses raw counts up to 4 and quartiles above', () => {
  const small = stats.levelScale([1, 2, 3, 4]);
  assert.deepEqual([0, 1, 2, 3, 4].map(small), [0, 1, 2, 3, 4]);
  const big = stats.levelScale([1, 2, 3, 4, 5, 6, 7, 8, 100]);
  assert.equal(big(0), 0);
  assert.equal(big(1), 1);
  assert.equal(big(100), 4);
});
