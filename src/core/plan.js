'use strict';

// Builds commit plans (which days, how many commits) and their timestamps.

const { formatDay, isWeekend, localToday } = require('./dates');

// Small seeded PRNG (mulberry32) so a plan can be reproduced with --seed.
function createRng(seed = Date.now()) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) {
    h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// "3" -> {min: 3, max: 3}; "1-4" -> {min: 1, max: 4}
function parseCommitRange(text, { max = 1000 } = {}) {
  const match = /^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/.exec(String(text));
  if (!match) throw new RangeError(`"${text}" is not a number or range. Use a value like 3 or 1-4.`);
  const lo = Number(match[1]);
  const hi = match[2] === undefined ? lo : Number(match[2]);
  if (lo < 1) throw new RangeError('The number of commits must be at least 1.');
  if (hi < lo) throw new RangeError(`"${text}" is backwards. Put the smaller number first, like 1-4.`);
  if (hi > max) throw new RangeError(`${hi} is too many. The limit is ${max}.`);
  return { min: lo, max: hi };
}

// "80", "80%" or "0.8" -> 0.8
function parsePercent(text) {
  const raw = String(text).trim().replace(/%$/, '');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new RangeError(`"${text}" is not a valid percentage. Use a value from 1 to 100.`);
  const ratio = n <= 1 && raw.includes('.') ? n : n / 100;
  if (ratio > 1) throw new RangeError(`"${text}" is more than 100%.`);
  return ratio;
}

const describeRange = ({ min, max }) => (min === max ? String(min) : `${min}–${max}`);

function finalize(perDay, kind) {
  const days = new Map([...perDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  let commits = 0;
  for (const n of days.values()) commits += n;
  return { kind, days, commits };
}

function candidateDays({ counts, from, to, today, onlyEmpty, skipWeekends }) {
  const days = [];
  for (let day = from; day <= Math.min(to, today); day++) {
    if (skipWeekends && isWeekend(day)) continue;
    if (onlyEmpty && (counts.get(formatDay(day)) || 0) > 0) continue;
    days.push(day);
  }
  return days;
}

// Commit only on days with no contributions.
function planFill({ counts, from, to, today, perDay, density = 1, skipWeekends = false, rng }) {
  const candidates = candidateDays({ counts, from, to, today, onlyEmpty: true, skipWeekends });
  const take = Math.round(candidates.length * density);
  const chosen = density >= 1 ? candidates : shuffle(candidates, rng).slice(0, take);
  const plan = new Map();
  for (const day of chosen) plan.set(formatDay(day), randInt(rng, perDay.min, perDay.max));
  return { ...finalize(plan, 'fill'), candidates: candidates.length };
}

// Spread a total number of commits over random days (the old indexRan.js behaviour).
function planRandom({ counts, from, to, today, total, onlyEmpty = false, skipWeekends = false, rng }) {
  const candidates = candidateDays({ counts, from, to, today, onlyEmpty, skipWeekends });
  const plan = new Map();
  if (candidates.length) {
    for (let i = 0; i < total; i++) {
      const key = formatDay(candidates[Math.floor(rng() * candidates.length)]);
      plan.set(key, (plan.get(key) || 0) + 1);
    }
  }
  return { ...finalize(plan, 'random'), candidates: candidates.length };
}

// Commit on the given days.
function planDates({ days, perDay, rng }) {
  const plan = new Map();
  for (const day of days) plan.set(formatDay(day), randInt(rng, perDay.min, perDay.max));
  return { ...finalize(plan, 'date'), candidates: days.length };
}

/**
 * Local-time window (minutes after midnight) for commits on a day.
 * The window keeps the UTC date equal to the local date, so the commit lands on the
 * same square whichever time zone GitHub uses, and prefers 09:00-23:00 when possible.
 */
function dayWindow(y, m, d, { now = new Date(), isToday = false } = {}) {
  const offset = -new Date(y, m - 1, d, 12).getTimezoneOffset();
  let lo = Math.max(0, offset);
  let hi = Math.min(1440, 1440 + offset);
  const preferredLo = Math.max(lo, 9 * 60);
  const preferredHi = Math.min(hi, 23 * 60);
  if (preferredHi - preferredLo >= 60) {
    lo = preferredLo;
    hi = preferredHi;
  }
  if (isToday) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    hi = Math.min(hi, nowMinutes);
    if (hi - lo < 1) {
      lo = Math.max(0, nowMinutes - 60);
      hi = Math.max(lo + 1, nowMinutes);
    }
  }
  return { lo, hi };
}

// Turns a plan into a sorted list of commit times (Date objects, local time).
function schedule(plan, { rng, now = new Date() }) {
  const todayKey = formatDay(localToday(now));
  const commits = [];
  for (const [key, n] of plan.days) {
    const [y, m, d] = key.split('-').map(Number);
    const { lo, hi } = dayWindow(y, m, d, { now, isToday: key === todayKey });
    const span = Math.max(1, (hi - lo) * 60);
    const seconds = new Set();
    while (seconds.size < Math.min(n, span)) seconds.add(lo * 60 + Math.floor(rng() * span));
    const sorted = [...seconds].sort((a, b) => a - b);
    for (let i = sorted.length; i < n; i++) sorted.push(sorted[sorted.length - 1] + 1);
    for (const s of sorted) commits.push({ day: key, date: new Date(y, m - 1, d, 0, 0, s) });
  }
  return commits.sort((a, b) => a.date - b.date);
}

// Planned counts merged into existing counts (for the "after" view).
function applyPlan(counts, plan) {
  const out = new Map(counts);
  for (const [key, n] of plan.days) out.set(key, (out.get(key) || 0) + n);
  return out;
}

module.exports = {
  createRng,
  randInt,
  shuffle,
  parseCommitRange,
  parsePercent,
  describeRange,
  planFill,
  planRandom,
  planDates,
  dayWindow,
  schedule,
  applyPlan,
};
