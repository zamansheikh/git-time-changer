'use strict';

// Interactive mode (`gtc` with no command): graph, menu, preview, commit, push.

const dates = require('../core/dates');
const stats = require('../core/stats');
const planner = require('../core/plan');
const git = require('../services/git');
const term = require('../ui/term');
const prompt = require('../ui/prompt');
const { GITHUB_LOGIN, displayPath, check, checkDays } = require('./helpers');
const { createContext, findUser, loadWithSpinner } = require('./context');
const { printBanner, printContext, showGraph, printEmptyDays, printPlan } = require('./output');
const { execute, applyCommitted } = require('./run');

const { c, log } = term;

async function previewAndRun(ctx, graph, plan, info) {
  if (plan.commits === 0) {
    log.warn('No days match those settings.');
    log.line();
    return graph;
  }
  showGraph(ctx, graph, { plan, title: 'Preview' });
  printPlan(ctx, plan, info);
  const result = await execute(ctx, plan, { opts: {}, interactive: true });
  log.line();
  if (!result || !result.done) return graph;
  const updated = applyCommitted(graph, result.committed);
  showGraph(ctx, updated, { title: 'Updated graph', art: plan.kind === 'art' });
  log.line();
  return updated;
}

async function askCommitRange(message, initial, max = 1000) {
  const text = await prompt.input({
    message,
    initial,
    hint: 'a number, or a range like 1-4',
    validate: check((v) => planner.parseCommitRange(v, { max })),
  });
  return planner.parseCommitRange(text, { max });
}

async function fill(ctx, graph) {
  const empty = stats.emptyDays(graph.counts, ctx.range.from, ctx.range.to, ctx.today);
  if (!empty.length) {
    log.ok('No empty days in this range. Pick another range to find some.');
    log.line();
    return graph;
  }
  const perDay = await askCommitRange('Commits per empty day', '1-4');
  const density = await prompt.select({
    message: 'How many of the empty days?',
    options: [
      { label: 'All of them', hint: term.plural(empty.length, 'day'), value: 1 },
      { label: 'About 75%', hint: 'leaves a few gaps, looks more natural', value: 0.75 },
      { label: 'About 50%', value: 0.5 },
      { label: 'About 25%', value: 0.25 },
    ],
  });
  const skipWeekends = await prompt.confirm({ message: 'Skip weekends?', initial: false });
  const plan = planner.planFill({
    counts: graph.counts,
    ...ctx.range,
    to: Math.min(ctx.range.to, ctx.today),
    today: ctx.today,
    perDay,
    density,
    skipWeekends,
    rng: ctx.rng,
  });
  return previewAndRun(ctx, graph, plan, { perDay });
}

async function random(ctx, graph) {
  const total = await askCommitRange('How many commits in total?', '300', 100_000);
  const onlyEmpty = await prompt.confirm({ message: 'Only on empty days?', initial: true });
  const skipWeekends = await prompt.confirm({ message: 'Skip weekends?', initial: false });
  const plan = planner.planRandom({
    counts: graph.counts,
    ...ctx.range,
    to: Math.min(ctx.range.to, ctx.today),
    today: ctx.today,
    total: planner.randInt(ctx.rng, total.min, total.max),
    onlyEmpty,
    skipWeekends,
    rng: ctx.rng,
  });
  return previewAndRun(ctx, graph, plan);
}

async function specificDates(ctx, graph) {
  const parseDays = (text) => {
    const days = dates.parseDayList([text], ctx.today);
    checkDays(days, ctx.today);
    return days;
  };
  const text = await prompt.input({
    message: 'Which dates?',
    initial: dates.formatDay(ctx.today - 1),
    hint: 'YYYY-MM-DD, comma separated, A..B for a range',
    validate: check(parseDays),
  });
  const days = parseDays(text);
  const perDay = await askCommitRange('Commits per day', '1-4');
  const plan = planner.planDates({ days, perDay, rng: ctx.rng });
  if (days.some((d) => d < ctx.range.from || d > ctx.range.to)) {
    log.hint('Some dates are outside the range shown, so they are not on the preview.');
  }
  return previewAndRun(ctx, graph, plan, { perDay });
}

async function drawText(ctx, graph) {
  const to = Math.min(ctx.range.to, ctx.today);
  const { weeks } = planner.fullWeeks(ctx.range.from, to, ctx.today);
  const tryPlan = (text, perCell = null) =>
    planner.planArt({ text, counts: graph.counts, ...ctx.range, to, today: ctx.today, perCell, rng: ctx.rng });
  const text = await prompt.input({
    message: 'Text to draw',
    initial: 'Hello!',
    hint: `about ${Math.floor((weeks + 1) / 6)} characters fit · letters, digits, punctuation, ♥ ★`,
    validate: check((v) => tryPlan(v)),
  });
  const strength = await prompt.select({
    message: 'How dark should the letters be?',
    options: [
      { label: 'Darkest green', hint: 'adds just enough commits to each cell', value: 'auto' },
      { label: 'Custom', hint: 'choose the commits per cell yourself', value: 'custom' },
    ],
  });
  const perCell = strength === 'custom' ? await askCommitRange('Commits per cell', '1-4') : null;
  return previewAndRun(ctx, graph, tryPlan(text, perCell), { perDay: perCell });
}

async function changeRange(ctx) {
  const year = dates.parts(ctx.today).y;
  const choice = await prompt.select({
    message: 'Which dates do you want to look at?',
    options: [
      { label: 'Last 12 months', value: 'last' },
      { label: `This year (${year})`, value: year },
      { label: `Last year (${year - 1})`, value: year - 1 },
      { label: 'Another year…', value: 'year' },
      { label: 'Custom range…', value: 'custom' },
    ],
  });
  if (choice === 'last') ctx.range = dates.lastTwelveMonths(ctx.today);
  else if (typeof choice === 'number') ctx.range = dates.yearRange(choice);
  else if (choice === 'year') {
    const text = await prompt.input({
      message: 'Year',
      initial: String(year - 2),
      validate: check((v) => dates.resolveRange({ year: v }, ctx.today)),
    });
    ctx.range = dates.resolveRange({ year: text }, ctx.today);
  } else {
    const from = await prompt.input({
      message: 'From',
      initial: dates.formatDay(ctx.range.from),
      hint: 'YYYY-MM-DD',
      validate: check((v) => dates.resolveRange({ from: v }, ctx.today)),
    });
    const to = await prompt.input({
      message: 'To',
      initial: dates.formatDay(ctx.today),
      hint: 'YYYY-MM-DD',
      validate: check((v) => dates.resolveRange({ from, to: v }, ctx.today)),
    });
    ctx.range = dates.resolveRange({ from, to }, ctx.today);
  }
}

// Makes sure there is a repo to commit into; offers `git init` if not.
async function ensureRepo(ctx) {
  if (ctx.repo.isRepo) return true;
  log.warn(`${displayPath(ctx.repo.dir)} is not a git repository.`);
  const create = await prompt.confirm({ message: 'Create a new git repository here?', initial: false });
  if (!create) {
    log.hint('cd into the repository you want to commit into, then run gtc again.');
    log.line();
    return false;
  }
  await git.init(ctx.repo.dir);
  ctx.repo = await git.inspect(ctx.repo.dir);
  log.ok('Created an empty git repository.');
  return true;
}

async function askUser(ctx, opts) {
  if (ctx.source === 'local') {
    ctx.user = null;
    return;
  }
  const spin = term.spinner('Looking for your GitHub account…');
  const found = await findUser(opts, ctx.repo);
  spin.stop();
  const login = await prompt.input({
    message: 'GitHub username',
    initial: found ? found.login : '',
    hint: found ? `from ${found.from}` : 'leave empty to use local commits only',
    validate: (v) => !v || GITHUB_LOGIN.test(v.replace(/^@/, '')) || 'That is not a valid GitHub username',
  });
  ctx.user = login.replace(/^@/, '') || null;
  ctx.userFrom = null;
}

const menu = (ctx, empty) => [
  { label: 'Fill empty days', hint: `commit only on the ${term.plural(empty.length, 'day')} with no contributions`, value: 'fill' },
  { label: 'List empty days', hint: 'see every date without contributions', value: 'list' },
  { label: 'Draw text', hint: 'write words across your graph, like Hello!', value: 'art' },
  { label: 'Random commits', hint: 'spread a number of commits over the range', value: 'random' },
  { label: 'Specific dates', hint: 'commit on days you pick', value: 'date' },
  { label: 'Change range', hint: dates.prettyRange(ctx.range.from, Math.min(ctx.range.to, ctx.today)), value: 'range' },
  { label: 'Exit', value: 'exit' },
];

async function run(opts) {
  printBanner();
  const ctx = await createContext(opts, { repoRequired: false });
  if (!(await ensureRepo(ctx))) return;
  await askUser(ctx, opts);

  let graph = await loadWithSpinner(ctx, opts);
  printContext(ctx);
  showGraph(ctx, graph);
  log.line();

  for (;;) {
    const empty = stats.emptyDays(graph.counts, ctx.range.from, ctx.range.to, ctx.today);
    let action;
    try {
      action = await prompt.select({ message: 'What would you like to do?', options: menu(ctx, empty) });
    } catch (error) {
      if (error instanceof prompt.CancelledError) break;
      throw error;
    }
    if (action === 'exit') break;
    try {
      if (action === 'fill') graph = await fill(ctx, graph);
      else if (action === 'art') graph = await drawText(ctx, graph);
      else if (action === 'random') graph = await random(ctx, graph);
      else if (action === 'date') graph = await specificDates(ctx, graph);
      else if (action === 'list') {
        printEmptyDays(empty);
        log.line();
      } else if (action === 'range') {
        await changeRange(ctx);
        graph = await loadWithSpinner(ctx, opts);
        showGraph(ctx, graph);
        log.line();
      }
    } catch (error) {
      // Esc inside a sub-prompt goes back to the menu; Ctrl+C quits.
      if (error instanceof prompt.CancelledError && !error.interrupt) {
        log.line();
        continue;
      }
      throw error;
    }
  }
  log.line();
  log.line(`  ${c.dim('Done. Run')} gtc calendar ${c.dim('any time to check your graph.')}`);
  log.line();
}

module.exports = { run, menu };
