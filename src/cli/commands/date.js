'use strict';

// gtc date <day...>: commit on specific days.

const dates = require('../../core/dates');
const planner = require('../../core/plan');
const { parsed, checkDays } = require('../helpers');
const { createContext, loadWithSpinner } = require('../context');
const { printContext, showGraph, printPlan } = require('../output');
const { execute } = require('../run');

async function run(opts, positionals) {
  const ctx = await createContext(opts, { repoRequired: true });
  const days = parsed(() => dates.parseDayList(positionals, ctx.today));
  checkDays(days, ctx.today);
  const perDay = parsed(() => planner.parseCommitRange(opts.commits ?? '1-4'));
  // Show at least the last 12 months, stretched back to the earliest date given.
  if (opts.year === undefined && opts.from === undefined) ctx.range.from = Math.min(ctx.range.from, days[0]);
  ctx.range.to = Math.max(ctx.range.to, days[days.length - 1]);
  const graph = await loadWithSpinner(ctx, opts);
  printContext(ctx);
  const plan = planner.planDates({ days, perDay, rng: ctx.rng });
  showGraph(ctx, graph, { plan, title: 'Preview' });
  printPlan(ctx, plan, { perDay });
  await execute(ctx, plan, { opts, interactive: false });
}

module.exports = { run };
