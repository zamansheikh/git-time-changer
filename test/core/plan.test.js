'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../../src/core/plan');
const { parseDay, formatDay, isWeekend } = require('../../src/core/dates');

const from = parseDay('2026-10-01');
const to = parseDay('2026-10-31');
const today = parseDay('2026-11-01');
const counts = new Map([
  ['2026-10-02', 3],
  ['2026-10-05', 1],
  ['2026-10-20', 7],
]);

test('createRng is deterministic per seed', () => {
  const a = p.createRng('abc');
  const b = p.createRng('abc');
  const c = p.createRng('xyz');
  const seqA = [a(), a(), a()];
  assert.deepEqual(seqA, [b(), b(), b()]);
  assert.notDeepEqual(seqA, [c(), c(), c()]);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test('parseCommitRange', () => {
  assert.deepEqual(p.parseCommitRange('3'), { min: 3, max: 3 });
  assert.deepEqual(p.parseCommitRange(' 1 - 4 '), { min: 1, max: 4 });
  assert.throws(() => p.parseCommitRange('0'), RangeError);
  assert.throws(() => p.parseCommitRange('4-1'), RangeError);
  assert.throws(() => p.parseCommitRange('lots'), RangeError);
  assert.throws(() => p.parseCommitRange('2000'), RangeError);
});

test('parsePercent', () => {
  assert.equal(p.parsePercent('100'), 1);
  assert.equal(p.parsePercent('75%'), 0.75);
  assert.equal(p.parsePercent('0.5'), 0.5);
  assert.throws(() => p.parsePercent('0'), RangeError);
  assert.throws(() => p.parsePercent('150'), RangeError);
});

test('planFill only touches empty days', () => {
  const plan = p.planFill({ counts, from, to, today, perDay: { min: 1, max: 4 }, rng: p.createRng(1) });
  assert.equal(plan.candidates, 28);
  assert.equal(plan.days.size, 28);
  for (const [key, n] of plan.days) {
    assert.ok(!counts.has(key), `${key} already had commits`);
    assert.ok(n >= 1 && n <= 4);
  }
  assert.equal(plan.commits, [...plan.days.values()].reduce((a, b) => a + b, 0));
});

test('planFill respects density and weekends', () => {
  const half = p.planFill({ counts, from, to, today, perDay: { min: 1, max: 1 }, density: 0.5, rng: p.createRng(2) });
  assert.equal(half.days.size, 14);
  const weekdays = p.planFill({ counts, from, to, today, perDay: { min: 1, max: 1 }, skipWeekends: true, rng: p.createRng(3) });
  for (const key of weekdays.days.keys()) assert.ok(!isWeekend(parseDay(key)), key);
});

test('planFill never plans after today', () => {
  const plan = p.planFill({ counts: new Map(), from: parseDay('2026-10-30'), to: parseDay('2026-11-05'), today, perDay: { min: 1, max: 1 }, rng: p.createRng(4) });
  assert.deepEqual([...plan.days.keys()], ['2026-10-30', '2026-10-31', '2026-11-01']);
});

test('planRandom spreads the exact total', () => {
  const plan = p.planRandom({ counts, from, to, today, total: 120, onlyEmpty: true, rng: p.createRng(5) });
  assert.equal(plan.commits, 120);
  for (const key of plan.days.keys()) assert.ok(!counts.has(key));
});

test('planDates uses the given days', () => {
  const days = [parseDay('2026-10-02'), parseDay('2026-10-09')];
  const plan = p.planDates({ days, perDay: { min: 2, max: 2 }, rng: p.createRng(6) });
  assert.deepEqual([...plan.days], [['2026-10-02', 2], ['2026-10-09', 2]]);
});

test('schedule: one sorted, unique timestamp per commit, on the planned local day', () => {
  const plan = p.planFill({ counts, from, to, today, perDay: { min: 1, max: 9 }, rng: p.createRng(7) });
  const commits = p.schedule(plan, { rng: p.createRng(8), now: new Date(2026, 10, 1, 18, 0) });
  assert.equal(commits.length, plan.commits);
  const times = commits.map((c) => c.date.getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.equal(new Set(times).size, times.length);
  for (const { day, date } of commits) {
    const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    assert.equal(local, day);
    assert.equal(date.toISOString().slice(0, 10), day, 'UTC date should match the local date');
  }
});

test('schedule never puts today\'s commits in the future', () => {
  const now = new Date(2026, 10, 1, 15, 30);
  const plan = { days: new Map([[formatDay(today), 5]]), commits: 5 };
  for (const { date } of p.schedule(plan, { rng: p.createRng(9), now })) assert.ok(date <= now);
});

test('applyPlan adds planned commits', () => {
  const plan = { days: new Map([['2026-10-02', 2], ['2026-10-03', 1]]) };
  const out = p.applyPlan(counts, plan);
  assert.equal(out.get('2026-10-02'), 5);
  assert.equal(out.get('2026-10-03'), 1);
  assert.equal(counts.get('2026-10-02'), 3, 'input is not mutated');
});
