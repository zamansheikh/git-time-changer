'use strict';

// The blocks the CLI prints: banner, context rows, graph and plan summary.
// Everything goes through term.log, so scripts/showcase.js can capture it.

const pkg = require('../../package.json');
const dates = require('../core/dates');
const stats = require('../core/stats');
const planner = require('../core/plan');
const term = require('../ui/term');
const calendar = require('../ui/calendar');
const { displayPath } = require('./helpers');

const { c, theme, sym, log } = term;

function printBanner() {
  const cells = (list) =>
    list.map((k) => (k === 'e' ? theme.empty : k === 'p' ? theme.planned : theme.level[k])(sym.cell)).join(' ');
  const lines = [
    `${cells([4, 2, 'e', 3])}   ${c.bold('GitTimeChanger')} ${c.dim(`v${pkg.version}`)}`,
    `${cells([1, 3, 'p', 4])}   ${c.dim('Fill the empty days on your GitHub graph, or write words on it.')}`,
  ];
  log.line();
  log.lines(term.box(lines).map((line) => `  ${line}`));
  log.line();
}

function printContext(ctx) {
  const { repo } = ctx;
  const pairs = [];
  if (ctx.user) {
    pairs.push(['GitHub', `${c.bold(`@${ctx.user}`)}${ctx.userFrom ? c.dim(`  from ${ctx.userFrom}`) : ''}`]);
  } else if (ctx.source !== 'local') {
    pairs.push(['GitHub', c.dim('not set, pass --user <login> to read your GitHub graph')]);
  }
  if (repo.isRepo) {
    const where = [repo.branch || c.yellow('detached HEAD')];
    if (repo.remote) where.push(c.dim(`→ ${repo.remote}`));
    pairs.push(['Repo', `${displayPath(repo.root)}  ${where.join(' ')}`]);
    pairs.push(['Author', repo.email ? `${repo.name || '(no name)'} ${c.dim(`<${repo.email}>`)}` : c.yellow('git user.email is not set')]);
  } else {
    pairs.push(['Repo', c.dim(`${displayPath(repo.dir)} is not a git repository`)]);
  }
  log.line();
  log.lines(term.rows(pairs));
}

// Art views show empty days in plain gray so the letters stand out.
function showGraph(ctx, graph, { plan = null, title = 'Contributions', art = plan?.kind === 'art' } = {}) {
  const { range, today } = ctx;
  const last = Math.min(range.to, today);
  log.line();
  log.line(term.heading(`${title}  ${c.dim(dates.prettyRange(range.from, Math.max(range.from, last)))}`));
  log.line();
  const highlightEmpty = !art;
  log.lines(calendar.renderCalendar({ counts: graph.counts, from: range.from, to: range.to, today, plan: plan?.days, highlightEmpty }));
  log.line();
  log.line(calendar.renderLegend({ plan: Boolean(plan), highlightEmpty }));
  log.line();
  if (!plan) log.lines(calendar.renderStats(stats.computeStats(graph.counts, range.from, range.to, today)));
}

function printEmptyDays(days) {
  log.line();
  log.line(term.heading(`Empty days  ${c.dim(String(days.length))}`));
  log.line();
  log.lines(calendar.renderEmptyList(days));
}

function printArtPlan(ctx, plan, { perDay } = {}) {
  const keys = [...plan.days.keys()];
  const span = dates.prettyRange(dates.parseDay(keys[0]), dates.parseDay(keys[keys.length - 1]));
  const strength = perDay
    ? `${planner.describeRange(perDay)} per cell`
    : `tops each cell up to ${plan.target}, the darkest green`;
  const pairs = [
    ['Text', `${theme.planned(c.bold(plan.text))}  ${c.dim(`${plan.width} weeks wide`)}`],
    ['Commits', `${theme.planned(c.bold(term.number(plan.commits)))} new commits${c.dim(`  (${strength})`)}`],
    ['Cells', `${c.bold(term.number(plan.days.size))}  ${c.dim(span)}`],
    ['Into', `${displayPath(ctx.repo.root)}  ${c.dim(`${ctx.repo.branch || 'HEAD'} · ${ctx.file}`)}`],
  ];
  log.lines(term.rows(pairs));
  log.line();
  if (plan.noise > 0) {
    log.warn(`${term.plural(plan.noise, 'day')} around the letters already ${plan.noise === 1 ? 'has' : 'have'} contributions, so the text won't be perfectly clean.`);
    log.hint('Try another --year, or move it with --start <date>, for a quieter spot.');
    log.line();
  }
}

function printPlan(ctx, plan, { perDay } = {}) {
  if (plan.kind === 'art') return printArtPlan(ctx, plan, { perDay });
  const keys = [...plan.days.keys()];
  const first = dates.parseDay(keys[0]);
  const last = dates.parseDay(keys[keys.length - 1]);
  const span = first === last ? dates.pretty(first) : dates.prettyRange(first, last);
  const perDayText = perDay ? c.dim(`  (${planner.describeRange(perDay)} per day)`) : '';
  const daysText =
    plan.kind === 'fill'
      ? `${c.bold(term.number(plan.days.size))} of ${term.plural(plan.candidates, 'empty day')}`
      : `${c.bold(term.plural(plan.days.size, 'day'))}`;
  const pairs = [
    ['Commits', `${theme.planned(c.bold(term.number(plan.commits)))} new ${plan.commits === 1 ? 'commit' : 'commits'}${perDayText}`],
    ['Days', `${daysText}  ${c.dim(span)}`],
    ['Into', `${displayPath(ctx.repo.root)}  ${c.dim(`${ctx.repo.branch || 'HEAD'} · ${ctx.file}`)}`],
    ['Seed', c.dim(`${ctx.seed}  (add --seed ${ctx.seed} to get the same plan again)`)],
  ];
  log.lines(term.rows(pairs));
  log.line();
}

module.exports = { printBanner, printContext, showGraph, printEmptyDays, printPlan };
