'use strict';

// gtc fill: commit only on days with no contributions.

const planner = require('../../core/plan');
const { log } = require('../../ui/term');
const { parsed } = require('../helpers');
const { createContext, capRangeAtToday, loadWithSpinner } = require('../context');
const { printContext, showGraph, printPlan } = require('../output');
const { execute } = require('../run');

async function run(opts) {
  const ctx = await createContext(opts, { repoRequired: true });
  capRangeAtToday(ctx);
  const perDay = parsed(() => planner.parseCommitRange(opts.commits ?? '1-4'));
  const density = parsed(() => planner.parsePercent(opts.density ?? '100'));
  const graph = await loadWithSpinner(ctx, opts);
  printContext(ctx);
  const plan = planner.planFill({
    counts: graph.counts,
    ...ctx.range,
    today: ctx.today,
    perDay,
    density,
    skipWeekends: Boolean(opts['skip-weekends']),
    rng: ctx.rng,
  });
  if (plan.commits === 0) {
    showGraph(ctx, graph);
    log.line();
    log.ok(plan.candidates ? 'No days selected. Try a higher --density.' : 'No empty days in this range. Nothing to fill.');
    return;
  }
  showGraph(ctx, graph, { plan, title: 'Preview' });
  printPlan(ctx, plan, { perDay });
  await execute(ctx, plan, { opts, interactive: false });
}

module.exports = { run };
