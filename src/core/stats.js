'use strict';

// Contribution stats and empty-day detection. Pure functions, no output.
// `counts` is always a Map of 'YYYY-MM-DD' -> number of contributions.

const { formatDay, isWeekend } = require('./dates');

const countOf = (counts, day) => counts.get(formatDay(day)) || 0;

// Maps a contribution count to a level 1-4 using quartiles, like GitHub.
function levelScale(values) {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  const max = sorted.length ? sorted[sorted.length - 1] : 0;
  if (max <= 4) return (count) => Math.min(4, Math.max(0, count));
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  return (count) => {
    if (count <= 0) return 0;
    if (count >= max) return 4;
    if (count <= q1) return 1;
    if (count <= q2) return 2;
    if (count <= q3) return 3;
    return 4;
  };
}

// Days in [from, to] (never after today) that have no contributions.
function emptyDays(counts, from, to, today) {
  const days = [];
  for (let day = from; day <= Math.min(to, today); day++) {
    if (countOf(counts, day) === 0) days.push(day);
  }
  return days;
}

function computeStats(counts, from, to, today) {
  const last = Math.min(to, today);
  const stats = {
    days: 0,
    total: 0,
    active: 0,
    empty: 0,
    emptyWeekdays: 0,
    longestStreak: 0,
    currentStreak: 0,
    longestGap: 0,
    best: null,
  };
  let streak = 0;
  let gap = 0;
  for (let day = from; day <= last; day++) {
    const count = countOf(counts, day);
    stats.days++;
    stats.total += count;
    if (count > 0) {
      stats.active++;
      streak++;
      gap = 0;
      if (!stats.best || count > stats.best.count) stats.best = { day, count };
    } else {
      stats.empty++;
      if (!isWeekend(day)) stats.emptyWeekdays++;
      streak = 0;
      gap++;
    }
    stats.longestStreak = Math.max(stats.longestStreak, streak);
    stats.longestGap = Math.max(stats.longestGap, gap);
  }
  // Like GitHub, a streak is still "current" if today has no commits yet.
  let day = last;
  if (day === today && countOf(counts, day) === 0) day--;
  while (day >= from && countOf(counts, day) > 0) {
    stats.currentStreak++;
    day--;
  }
  return stats;
}

module.exports = { countOf, levelScale, emptyDays, computeStats };
