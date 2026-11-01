'use strict';

// gtc random: spread a total number of commits over random days in the range.

const planner = require('../../core/plan');
const { log } = require('../../ui/term');
const { parsed } = require('../helpers');
const { createContext, capRangeAtToday, loadWithSpinner } = require('../context');
const { printContext, showGraph, printPlan } = require('../output');
const { execute } = require('../run');

async function run(opts) {
  const ctx = await createContext(opts, { repoRequired: true });
  capRangeAtToday(ctx);
  const total = parsed(() => planner.parseCommitRange(opts.commits ?? '300', { max: 100_000 }));
  const graph = await loadWithSpinner(ctx, opts);
  printContext(ctx);
  const plan = planner.planRandom({
    counts: graph.counts,
    ...ctx.range,
    today: ctx.today,
    total: planner.randInt(ctx.rng, total.min, total.max),
    onlyEmpty: Boolean(opts['only-empty']),
    skipWeekends: Boolean(opts['skip-weekends']),
    rng: ctx.rng,
  });
  if (plan.commits === 0) {
    showGraph(ctx, graph);
    log.ok('No matching days in this range.');
    return;
  }
  showGraph(ctx, graph, { plan, title: 'Preview' });
  printPlan(ctx, plan);
  await execute(ctx, plan, { opts, interactive: false });
}

module.exports = { run };
