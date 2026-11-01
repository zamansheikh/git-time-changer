'use strict';

// gtc calendar: show the graph, stats and empty days.

const dates = require('../../core/dates');
const stats = require('../../core/stats');
const { log } = require('../../ui/term');
const { createContext, loadWithSpinner } = require('../context');
const { printContext, showGraph, printEmptyDays } = require('../output');

function toJson(ctx, graph, empty) {
  const { from, to } = ctx.range;
  const summary = stats.computeStats(graph.counts, from, to, ctx.today);
  const lo = dates.formatDay(from);
  const hi = dates.formatDay(to);
  return {
    user: ctx.user,
    from: lo,
    to: dates.formatDay(Math.min(to, ctx.today)),
    sources: [graph.github && `github-${graph.via}`, graph.local && 'local'].filter(Boolean),
    stats: { ...summary, best: summary.best && { date: dates.formatDay(summary.best.day), count: summary.best.count } },
    emptyDays: empty.map(dates.formatDay),
    days: Object.fromEntries([...graph.counts].filter(([k]) => k >= lo && k <= hi).sort()),
  };
}

async function run(opts) {
  const ctx = await createContext(opts, { repoRequired: false });
  if (opts.json) log.quiet = true;
  const graph = await loadWithSpinner(ctx, opts);
  const empty = stats.emptyDays(graph.counts, ctx.range.from, ctx.range.to, ctx.today);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(toJson(ctx, graph, empty), null, 2)}\n`);
    return;
  }
  printContext(ctx);
  showGraph(ctx, graph);
  if (opts.list) printEmptyDays(empty);
  log.line();
  if (empty.length) {
    if (!opts.list) log.hint(`gtc calendar --list   list all ${empty.length} empty days`);
    log.hint('gtc fill --dry-run    preview filling them');
    log.line();
  }
}

module.exports = { run };
