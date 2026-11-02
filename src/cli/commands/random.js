'use strict';

// gtc random: spread a total number of commits over random days in the range.

const planner = require('../../core/plan');
const { log } = require('../../ui/term');
const { parsed, weekdayFilter } = require('../helpers');
const { createContext, capRangeAtToday, loadWithSpinner } = require('../context');
const { printContext, showGraph, printPlan } = require('../output');
const { execute } = require('../run');

async function run(opts) {
  const ctx = await createContext(opts, { repoRequired: true });
  capRangeAtToday(ctx);
  const total = parsed(() => planner.parseCommitRange(opts.commits ?? '300', { max: 100_000 }));
  const weekdays = weekdayFilter(opts);
  const graph = await loadWithSpinner(ctx, opts);
  printContext(ctx);
  const plan = planner.planRandom({
    counts: graph.counts,
    ...ctx.range,
    today: ctx.today,
    total: planner.randInt(ctx.rng, total.min, total.max),
    onlyEmpty: Boolean(opts['only-empty']),
    weekdays,
    rng: ctx.rng,
  });
  if (plan.commits === 0) {
    showGraph(ctx, graph);
    log.ok('No matching days in this range.');
    return;
  }
  showGraph(ctx, graph, { plan, title: 'Preview' });
  printPlan(ctx, plan, { weekdays });
  await execute(ctx, plan, { opts, interactive: false });
}

module.exports = { run };
