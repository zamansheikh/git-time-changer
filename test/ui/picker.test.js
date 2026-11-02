'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const picker = require('../../src/ui/picker');
const term = require('../../src/ui/term');
const { parseDay, formatDay, weekday } = require('../../src/core/dates');

const first = parseDay('2026-10-01'); // a Thursday
const last = parseDay('2026-10-31'); // a Saturday
const counts = new Map([['2026-10-05', 3], ['2026-10-06', 1]]);
const view = { counts, first, last };

// Feeds key names ('left', 'space', 'return') or characters ('w', '1') to stepDays.
function keys(state, list) {
  for (const k of list) {
    const named = k.length > 1 || k === ' ';
    state = picker.stepDays(state, named ? (k === 'space' ? ' ' : '') : k, { name: k === ' ' ? 'space' : k }, view);
  }
  return state;
}
const start = (day) => ({ cursor: parseDay(day), selected: new Set() });
const picked = (state) => [...state.selected].sort();

test('arrows move a day up and down, a week left and right, and stop at the range ends', () => {
  assert.equal(formatDay(keys(start('2026-10-15'), ['up']).cursor), '2026-10-14');
  assert.equal(formatDay(keys(start('2026-10-15'), ['down']).cursor), '2026-10-16');
  assert.equal(formatDay(keys(start('2026-10-15'), ['left']).cursor), '2026-10-08');
  assert.equal(formatDay(keys(start('2026-10-15'), ['right']).cursor), '2026-10-22');
  assert.equal(formatDay(keys(start('2026-10-03'), ['left']).cursor), '2026-10-01');
  assert.equal(formatDay(keys(start('2026-10-29'), ['right', 'right']).cursor), '2026-10-31');
  assert.equal(formatDay(keys(start('2026-10-15'), ['home']).cursor), '2026-10-01');
  assert.equal(formatDay(keys(start('2026-10-15'), ['end']).cursor), '2026-10-31');
});

test('space toggles the day under the cursor', () => {
  assert.deepEqual(picked(keys(start('2026-10-15'), ['space', 'up', 'space'])), ['2026-10-14', '2026-10-15']);
  assert.deepEqual(picked(keys(start('2026-10-15'), ['space', 'space'])), []);
});

test('1-7 select every Monday to Sunday in the range, and clear them again', () => {
  const mondays = keys(start('2026-10-15'), ['1']);
  assert.deepEqual(picked(mondays), ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  assert.ok(picked(keys(start('2026-10-15'), ['7'])).every((key) => weekday(parseDay(key)) === 0), '7 is Sunday');
  assert.deepEqual(picked(keys(start('2026-10-15'), ['1', '1'])), []);
});

test('w selects the whole week under the cursor, within the range', () => {
  assert.equal(keys(start('2026-10-15'), ['w']).selected.size, 7);
  assert.equal(keys(start('2026-10-15'), ['W']).selected.size, 7, 'capital letters work too');
  assert.deepEqual(picked(keys(start('2026-10-02'), ['w'])), ['2026-10-01', '2026-10-02', '2026-10-03']);
});

test('e selects only the days without contributions, c clears', () => {
  const empty = keys(start('2026-10-15'), ['e']);
  assert.equal(empty.selected.size, 31 - 2);
  assert.ok(!empty.selected.has('2026-10-05'));
  assert.equal(keys(start('2026-10-15'), ['e', 'c']).selected.size, 0);
});

test('enter submits, picking the cursor day when nothing is selected; t asks to type', () => {
  const done = keys(start('2026-10-15'), ['return']);
  assert.equal(done.action, 'submit');
  assert.deepEqual(picked(done), ['2026-10-15']);
  assert.deepEqual(picked(keys(start('2026-10-15'), ['space', 'up', 'return'])), ['2026-10-15'], 'the cursor day is only added when nothing is selected');
  assert.equal(keys(start('2026-10-15'), ['t']).action, 'type');
});

test('the day picker shows the cursor day, its contributions and the selection', () => {
  term.setDepth(24);
  const state = keys(start('2026-10-05'), ['space']);
  const text = picker.render.days('Pick the days', { counts, from: first, to: last, today: last, ...state, maxColumns: 120 });
  assert.ok(text.includes('\x1b[7m'), 'cursor in inverse video');
  const plain = term.strip(text);
  assert.match(plain, /Mon, Oct 5, 2026 {2}· {2}3 contributions {2}· {2}selected/);
  assert.match(plain, /1 day selected/);
  term.setDepth(1);
  assert.match(picker.render.days('Pick the days', { counts, from: first, to: last, today: last, ...state, maxColumns: 120 }), /@/);
});

test('weekday picker: keys 1-7 toggle, w e a are shortcuts, enter needs a day', () => {
  const step = (state, k) => picker.stepWeekdays(state, k.length > 1 ? '' : k, { name: k === ' ' ? 'space' : k });
  const run = (list, selected = [0, 1, 2, 3, 4, 5, 6]) => list.reduce(step, { selected: new Set(selected), index: 0 });
  const days = (state) => [...state.selected].sort().join('');
  assert.equal(days(run(['6', '7'])), '12345', '6 and 7 turn off Saturday and Sunday');
  assert.equal(days(run(['a'])), '', 'a clears when every day is on');
  assert.equal(days(run(['a', 'a'])), '0123456');
  assert.equal(days(run(['w'], [])), '12345');
  assert.equal(days(run(['e'], [])), '06');
  assert.equal(days(run(['right', 'right', ' '], [])), '3', 'space toggles the chip under the cursor');
  assert.equal(run(['return'], []).error, 'Pick at least one day');
  assert.ok(run(['return'], [2]).submit);
});
