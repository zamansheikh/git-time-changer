'use strict';

// Terminal rendering of the contribution calendar: heatmap, legend, stats line
// and the list of empty days. Returns lines of text; printing is up to the caller.

const { c, theme, sym, getDepth, number, width, columns } = require('./term');
const { MONTHS, parts, weekday, isWeekend, formatDay } = require('../core/dates');
const { countOf, levelScale } = require('../core/stats');

const ROW_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const LABEL_WIDTH = 4;

function glyph(kind, level) {
  const color = getDepth() > 1;
  if (kind === 'planned') return color ? theme.planned(sym.cell) : '+';
  if (kind === 'empty') return color ? theme.empty(sym.cell) : '·';
  return color ? theme.level[level](sym.cell) : sym.cell;
}

// Pick the cell width and how many weeks fit on one line.
function layout(totalWeeks, availableColumns) {
  const room = availableColumns - LABEL_WIDTH - 2;
  if (totalWeeks * 2 <= room) return { cellWidth: 2, perBlock: totalWeeks };
  if (totalWeeks <= room) return { cellWidth: 1, perBlock: totalWeeks };
  return { cellWidth: 1, perBlock: Math.max(4, room) };
}

function monthHeader(start, w0, w1, from, to, cellWidth) {
  const labels = [];
  let previous = -1;
  for (let w = w0; w < w1; w++) {
    let first = null;
    for (let r = 0; r < 7; r++) {
      const day = start + w * 7 + r;
      if (day >= from && day <= to) {
        first = day;
        break;
      }
    }
    if (first === null) continue;
    const month = parts(first).m;
    if (month !== previous) labels.push({ pos: (w - w0) * cellWidth, text: MONTHS[month - 1] });
    previous = month;
  }
  // A partial first month too close to the next label is dropped, like GitHub does.
  if (labels.length > 1 && labels[1].pos - labels[0].pos < 4) labels.shift();
  const chars = Array.from({ length: (w1 - w0) * cellWidth + 4 }, () => ' ');
  let end = -1;
  for (const { pos, text } of labels) {
    if (pos <= end) continue;
    for (let i = 0; i < text.length; i++) chars[pos + i] = text[i];
    end = pos + text.length;
  }
  return chars.join('').trimEnd();
}

/**
 * Renders the heatmap as lines of text.
 * plan: optional Map of 'YYYY-MM-DD' -> commits that will be added (shown in purple).
 */
function renderCalendar({ counts, from, to, today, plan = null, maxColumns = columns(), indent = '  ' }) {
  const last = Math.min(to, today);
  const start = from - weekday(from);
  const end = to + (6 - weekday(to));
  const totalWeeks = (end - start + 1) / 7;
  const values = [];
  for (let day = from; day <= last; day++) values.push(countOf(counts, day));
  const scale = levelScale(values);
  const { cellWidth, perBlock } = layout(totalWeeks, maxColumns - indent.length);

  const lines = [];
  for (let w0 = 0; w0 < totalWeeks; w0 += perBlock) {
    const w1 = Math.min(totalWeeks, w0 + perBlock);
    if (w0 > 0) lines.push('');
    lines.push(indent + ' '.repeat(LABEL_WIDTH) + c.dim(monthHeader(start, w0, w1, from, to, cellWidth)));
    for (let r = 0; r < 7; r++) {
      let row = '';
      for (let w = w0; w < w1; w++) {
        const day = start + w * 7 + r;
        let cell = ' ';
        if (day >= from && day <= last) {
          const key = formatDay(day);
          const count = counts.get(key) || 0;
          if (plan && plan.has(key)) cell = glyph('planned');
          else if (count > 0) cell = glyph('level', scale(count));
          else cell = glyph('empty');
        }
        row += cell;
        if (cellWidth === 2 && w < w1 - 1) row += ' ';
      }
      lines.push(indent + c.dim(ROW_LABELS[r].padEnd(LABEL_WIDTH)) + row.trimEnd());
    }
  }
  return lines;
}

function renderLegend({ plan = false, indent = '  ' } = {}) {
  const color = getDepth() > 1;
  const levels = color ? [1, 2, 3, 4].map((l) => glyph('level', l)).join(' ') : sym.cell;
  const items = [
    `${c.dim('Less')} ${levels} ${c.dim('More')}`,
    `${glyph('empty')} ${c.dim('No contributions')}`,
  ];
  if (plan) items.push(`${glyph('planned')} ${c.dim('New commits')}`);
  return indent + ' '.repeat(LABEL_WIDTH) + items.join('     ');
}

function wrapItems(items, separator, maxWidth, indent) {
  const lines = [];
  let line = '';
  for (const item of items) {
    const next = line ? `${line}${separator}${item}` : item;
    if (line && width(indent + next) > maxWidth) {
      lines.push(indent + line);
      line = item;
    } else {
      line = next;
    }
  }
  if (line) lines.push(indent + line);
  return lines;
}

// Two lines: totals, then streaks. Narrow terminals wrap further.
function renderStats(stats, { indent = '  ', maxColumns = columns() } = {}) {
  const days = (n) => `${number(n)} ${n === 1 ? 'day' : 'days'}`;
  const totals = [
    `${c.bold(number(stats.total))} ${c.dim('contributions')}`,
    `${c.bold(number(stats.active))} ${c.dim('active days')}`,
    `${theme.empty(c.bold(number(stats.empty)))} ${c.dim(stats.empty === 1 ? 'empty day' : 'empty days')}`,
  ];
  const streaks = [
    `${c.dim('longest streak')} ${c.bold(days(stats.longestStreak))}`,
    `${c.dim('current streak')} ${c.bold(days(stats.currentStreak))}`,
    `${c.dim('longest gap')} ${c.bold(days(stats.longestGap))}`,
  ];
  const separator = c.gray('  ·  ');
  return [totals, streaks].flatMap((items) => wrapItems(items, separator, maxColumns, indent));
}

// Empty days grouped by month: "Jan 2026   4 days   3  4 10 17".
function renderEmptyList(days, { indent = '  ' } = {}) {
  if (days.length === 0) return [`${indent}${c.green(sym.ok)} No empty days in this range.`];
  const groups = new Map();
  for (const day of days) {
    const { y, m } = parts(day);
    const key = `${y}-${m}`;
    if (!groups.has(key)) groups.set(key, { y, m, days: [] });
    groups.get(key).days.push(day);
  }
  const lines = [];
  for (const { y, m, days: list } of groups.values()) {
    const label = c.bold(`${MONTHS[m - 1]} ${y}`);
    const count = c.dim(`${String(list.length).padStart(2)} ${list.length === 1 ? 'day ' : 'days'}`);
    const cells = list
      .map((day) => {
        const text = String(parts(day).d).padStart(2);
        return isWeekend(day) ? c.dim(text) : theme.empty(text);
      })
      .join(' ');
    lines.push(`${indent}${label}  ${count}   ${cells}`);
  }
  lines.push(`${indent}${c.dim('Weekend days are dimmed.')}`);
  return lines;
}

module.exports = {
  renderCalendar,
  renderLegend,
  renderStats,
  renderEmptyList,
  layout,
  LABEL_WIDTH,
};
