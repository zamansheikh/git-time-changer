'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../../src/core/dates');

test('parseDay and formatDay round-trip', () => {
  for (const text of ['1970-01-01', '2024-02-29', '2025-12-31', '2026-11-01']) {
    assert.equal(d.formatDay(d.parseDay(text)), text);
  }
});

test('parseDay rejects impossible dates', () => {
  for (const text of ['2025-02-29', '2025-13-01', '2025-1-1', 'tomorrow', '']) {
    assert.ok(Number.isNaN(d.parseDay(text)), text);
  }
});

test('weekday: 0 is Sunday', () => {
  assert.equal(d.weekday(d.parseDay('1970-01-01')), 4);
  assert.equal(d.weekday(d.parseDay('2026-11-01')), 0);
  assert.equal(d.weekday(d.parseDay('2026-10-31')), 6);
  assert.ok(d.isWeekend(d.parseDay('2026-10-31')));
  assert.ok(!d.isWeekend(d.parseDay('2026-10-30')));
});

test('addYears clamps Feb 29', () => {
  assert.equal(d.formatDay(d.addYears(d.parseDay('2024-02-29'), -1)), '2023-02-28');
  assert.equal(d.formatDay(d.addYears(d.parseDay('2026-11-01'), -1)), '2025-11-01');
});

test('resolveRange defaults to the last 12 months', () => {
  const today = d.parseDay('2026-11-01');
  const range = d.resolveRange({}, today);
  assert.equal(d.formatDay(range.from), '2025-11-02');
  assert.equal(d.formatDay(range.to), '2026-11-01');
});

test('resolveRange handles years and explicit ranges', () => {
  const today = d.parseDay('2026-11-01');
  const year = d.resolveRange({ year: '2025' }, today);
  assert.deepEqual([d.formatDay(year.from), d.formatDay(year.to)], ['2025-01-01', '2025-12-31']);
  const custom = d.resolveRange({ from: '2026-01-10', to: '2026-02-01' }, today);
  assert.deepEqual([d.formatDay(custom.from), d.formatDay(custom.to)], ['2026-01-10', '2026-02-01']);
  assert.throws(() => d.resolveRange({ from: '2026-02-01', to: '2026-01-01' }, today), RangeError);
  assert.throws(() => d.resolveRange({ year: 'abc' }, today), RangeError);
});

test('parseDayList understands lists, ranges and keywords', () => {
  const today = d.parseDay('2026-11-01');
  const days = d.parseDayList(['2026-10-30..2026-11-01', 'yesterday', '2026-01-05,today'], today);
  assert.deepEqual(days.map(d.formatDay), ['2026-01-05', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.throws(() => d.parseDayList(['2026-10-31..2026-10-01'], today), RangeError);
  assert.throws(() => d.parseDayList(['soon'], today), RangeError);
});

test('isoLocal and gitDate describe the same instant', () => {
  const date = new Date(2026, 4, 3, 14, 5, 9);
  const iso = d.isoLocal(date);
  assert.match(iso, /^2026-05-03T14:05:09[+-]\d{2}:\d{2}$/);
  assert.equal(new Date(iso).getTime(), date.getTime());
  const [seconds, offset] = d.gitDate(date).split(' ');
  assert.equal(Number(seconds), Math.floor(date.getTime() / 1000));
  assert.match(offset, /^[+-]\d{4}$/);
});
