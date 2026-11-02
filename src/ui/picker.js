'use strict';

// Pickers for interactive mode: days on the contribution graph, and days of the week.
// Key handling lives in pure step functions, so tests can drive it without a terminal.

const { c, theme, sym, getDepth, columns, number, plural } = require('./term');
const calendar = require('./calendar');
const prompt = require('./prompt');
const dates = require('../core/dates');

const { formatDay, weekday, WEEKDAYS, WEEK_ORDER } = dates;
const { answered } = prompt.render;

const isEnter = (key) => key.name === 'return' || key.name === 'enter';

function toggle(set, item) {
  if (set.has(item)) set.delete(item);
  else set.add(item);
}

// Selects all of the items, or clears them if they are all selected already.
function toggleAll(set, items) {
  const all = items.every((item) => set.has(item));
  for (const item of items) {
    if (all) set.delete(item);
    else set.add(item);
  }
}

// ─── Days of the week ───────────────────────────────────────────────────────

// state: { selected: Set of weekday numbers (0 = Sunday), index: chip under the cursor }
function stepWeekdays(state, raw, key = {}) {
  const str = raw && raw.toLowerCase(); // W and w do the same, so Caps Lock doesn't matter
  const selected = new Set(state.selected);
  let { index } = state;
  const only = (list) => {
    selected.clear();
    list.forEach((w) => selected.add(w));
  };
  if (key.name === 'left' || str === 'h' || (key.name === 'tab' && key.shift)) index = (index + 6) % 7;
  else if (key.name === 'right' || str === 'l' || key.name === 'tab') index = (index + 1) % 7;
  else if (key.name === 'space') toggle(selected, WEEK_ORDER[index]);
  else if (str && /^[1-7]$/.test(str)) {
    index = Number(str) - 1;
    toggle(selected, WEEK_ORDER[index]);
  } else if (str === 'w') only([1, 2, 3, 4, 5]);
  else if (str === 'e') only([0, 6]);
  else if (str === 'a') only(selected.size === 7 ? [] : WEEK_ORDER);
  else if (isEnter(key)) {
    if (selected.size) return { selected, index, error: '', submit: true };
    return { selected, index, error: 'Pick at least one day' };
  }
  return { selected, index, error: '' };
}

function renderWeekdays(message, { selected, index, error = '' }) {
  const color = getDepth() > 1;
  const chips = WEEK_ORDER.map((w, i) => {
    const on = selected.has(w);
    const active = i === index;
    const box = color ? (on ? theme.planned(sym.cell) : theme.none(sym.cell)) : on ? '[x]' : '[ ]';
    const name = WEEKDAYS[w];
    const label = active ? theme.accent(c.bold(c.underline(name))) : on ? name : c.dim(name);
    return `${active ? theme.accent(sym.pointer) : ' '}${box} ${label}`;
  });
  const tail = error ? `  ${c.red(`${sym.err} ${error}`)}` : '';
  return [
    prompt.question(message),
    chips.join('  ') + tail,
    c.dim('  ←→ move · space or 1-7 toggle · w weekdays · e weekends · a all · enter done'),
  ].join('\n');
}

// Resolves to a Set of weekday numbers (0 = Sunday).
function pickWeekdays({ message, initial = WEEK_ORDER }) {
  let state = { selected: new Set(initial), index: 0, error: '' };
  const render = () => renderWeekdays(message, state);
  render.cancelText = () => prompt.cancelled(message);
  return prompt.session({
    render,
    onKey(str, key, control) {
      state = stepWeekdays(state, str, key);
      if (state.submit) return control.done(state.selected, answered(message, dates.describeWeekdays(state.selected)));
      control.redraw();
    },
  });
}

// ─── Days on the graph ──────────────────────────────────────────────────────

// state: { cursor: day number, selected: Set of 'YYYY-MM-DD' }
// view: { counts, first, last } where first..last are the days that can be picked.
// Returns the next state; action is 'submit', 'type' or null.
function stepDays(state, raw, key, { counts, first, last }) {
  const str = raw && raw.toLowerCase();
  const selected = new Set(state.selected);
  let { cursor } = state;
  const move = (delta) => {
    cursor = Math.max(first, Math.min(last, cursor + delta));
  };
  const daysWhere = (test) => {
    const keys = [];
    for (let day = first; day <= last; day++) if (test(day)) keys.push(formatDay(day));
    return keys;
  };
  const { name } = key;
  if (name === 'left' || str === 'h') move(-7);
  else if (name === 'right' || str === 'l') move(7);
  else if (name === 'up' || str === 'k') move(-1);
  else if (name === 'down' || str === 'j') move(1);
  else if (name === 'pageup') move(-28);
  else if (name === 'pagedown') move(28);
  else if (name === 'home') cursor = first;
  else if (name === 'end') cursor = last;
  else if (name === 'space') toggle(selected, formatDay(cursor));
  else if (str && /^[1-7]$/.test(str)) {
    const w = WEEK_ORDER[Number(str) - 1];
    toggleAll(selected, daysWhere((day) => weekday(day) === w));
  } else if (str === 'w') {
    const sunday = cursor - weekday(cursor);
    toggleAll(selected, daysWhere((day) => day >= sunday && day <= sunday + 6));
  } else if (str === 'e') toggleAll(selected, daysWhere((day) => !(counts.get(formatDay(day)) > 0)));
  else if (str === 'c') selected.clear();
  else if (str === 't') return { cursor, selected, action: 'type' };
  else if (isEnter(key)) {
    if (!selected.size) selected.add(formatDay(cursor));
    return { cursor, selected, action: 'submit' };
  }
  return { cursor, selected, action: null };
}

const DAY_KEYS = [
  '←→ week',
  '↑↓ day',
  'space select',
  '1-7 every Mon…Sun',
  'w whole week',
  'e empty days',
  'c clear',
  't type dates',
  'enter done',
  'esc back',
];

function renderDayPicker(message, { counts, from, to, today, cursor, selected, maxColumns = columns() - 2 }) {
  const pad = ' '.repeat(calendar.LABEL_WIDTH);
  const key = formatDay(cursor);
  const count = counts.get(key) || 0;
  const status = [
    c.bold(`${WEEKDAYS[weekday(cursor)]}, ${dates.pretty(cursor)}`),
    count ? `${number(count)} ${count === 1 ? 'contribution' : 'contributions'}` : theme.empty('no contributions'),
  ];
  if (selected.has(key)) status.push(theme.planned('selected'));
  const picked = `${getDepth() > 1 ? theme.planned(sym.cell) : '+'} ${c.bold(plural(selected.size, 'day'))} selected`;
  const keys = calendar.wrapItems(DAY_KEYS.map((k) => c.dim(k)), c.gray(' · '), maxColumns, pad);
  return [
    prompt.question(message),
    '',
    ...calendar.renderCalendar({ counts, from, to, today, plan: selected, cursor, maxColumns, indent: '' }),
    '',
    pad + status.join(c.gray('  ·  ')),
    pad + picked,
    ...keys,
  ].join('\n');
}

function describeDays(days) {
  const first = days[0];
  const last = days[days.length - 1];
  const span = first === last ? dates.pretty(first) : dates.prettyRange(first, last);
  return `${plural(days.length, 'day')}, ${span}`;
}

// Resolves to the picked days (sorted day numbers), or null to type dates instead.
function pickDays({ message, counts, from, to, today, initial }) {
  const first = from;
  const last = Math.min(to, today);
  const view = { counts, first, last };
  let state = { cursor: Math.max(first, Math.min(last, initial ?? last)), selected: new Set() };
  const render = () => renderDayPicker(message, { counts, from, to, today, ...state });
  render.cancelText = () => prompt.cancelled(message);
  return prompt.session({
    render,
    onKey(str, key, control) {
      state = stepDays(state, str, key, view);
      if (state.action === 'type') return control.done(null, answered(message, 'type them instead'));
      if (state.action === 'submit') {
        const days = [...state.selected].map(dates.parseDay).sort((a, b) => a - b);
        return control.done(days, answered(message, describeDays(days)));
      }
      control.redraw();
    },
  });
}

module.exports = {
  pickDays,
  pickWeekdays,
  stepDays,
  stepWeekdays,
  render: { days: renderDayPicker, weekdays: renderWeekdays },
};
