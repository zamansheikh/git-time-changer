'use strict';

// gtc art <text>: write text across the contribution graph.

const dates = require('../../core/dates');
const planner = require('../../core/plan');
const { renderText } = require('../../core/font');
const { parsed, UserError } = require('../helpers');
const { createContext, capRangeAtToday, loadWithSpinner } = require('../context');
const { printContext, showGraph, printPlan } = require('../output');
const { execute } = require('../run');

async function run(opts, positionals) {
  const ctx = await createContext(opts, { repoRequired: true });
  capRangeAtToday(ctx);
  const text = positionals.join(' ').trim();
  if (!text) throw new UserError('Give the text to draw.', 'Example: gtc art "HELLO" --dry-run');
  const perCell = opts.commits ? parsed(() => planner.parseCommitRange(opts.commits)) : null;
  let start;
  if (opts.start) {
    start = dates.parseDay(opts.start);
    if (Number.isNaN(start)) throw new UserError(`"${opts.start}" is not a valid date. Use YYYY-MM-DD.`);
    // Make sure the preview shows the whole text.
    const sunday = start - dates.weekday(start);
    const width = parsed(() => renderText(text).length);
    ctx.range.from = Math.min(ctx.range.from, sunday);
    ctx.range.to = Math.min(ctx.today, Math.max(ctx.range.to, sunday + width * 7 - 1));
  }
  // Validate the text before going to the network.
  parsed(() => planner.planArt({ text, counts: new Map(), ...ctx.range, today: ctx.today, start, perCell, rng: ctx.rng }));
  const graph = await loadWithSpinner(ctx, opts);
  printContext(ctx);
  const plan = parsed(() =>
    planner.planArt({ text, counts: graph.counts, ...ctx.range, today: ctx.today, start, perCell, rng: ctx.rng }),
  );
  showGraph(ctx, graph, { plan, title: 'Preview' });
  printPlan(ctx, plan, { perDay: perCell });
  await execute(ctx, plan, { opts, interactive: false });
}

module.exports = { run };
