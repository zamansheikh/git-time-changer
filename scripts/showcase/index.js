#!/usr/bin/env node
'use strict';

// Renders the README screenshots in docs/images/ from the real UI code.
//   npm run showcase
// Every frame is produced by the same functions the CLI uses, captured as ANSI
// text and converted to SVG. The contribution data is synthetic and seeded, so
// the images are reproducible.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const term = require('../../src/ui/term');
const dates = require('../../src/core/dates');
const stats = require('../../src/core/stats');
const planner = require('../../src/core/plan');
const prompt = require('../../src/ui/prompt');
const output = require('../../src/cli/output');
const { describeSources } = require('../../src/cli/context');
const { staticSvg, animatedSvg } = require('./ansi-svg');

term.setDepth(24);
const { c, sym } = term;

// ─── Demo data ──────────────────────────────────────────────────────────────

const TODAY = dates.parseDay('2026-11-01');
const RANGE = dates.lastTwelveMonths(TODAY);

function demoCounts() {
  const rng = planner.createRng('showcase');
  const counts = new Map();
  const vacation = [dates.parseDay('2026-08-10'), dates.parseDay('2026-08-18')];
  let mood = 1;
  for (let day = RANGE.from; day <= TODAY; day++) {
    if (dates.weekday(day) === 1) mood = 0.7 + rng() * 0.5;
    if (day >= vacation[0] && day <= vacation[1]) continue;
    const chance = (dates.isWeekend(day) ? 0.72 : 0.95) * Math.min(1, mood + 0.12);
    if (rng() > chance) continue;
    const n = 1 + Math.floor(rng() ** 2 * 14 * mood);
    counts.set(dates.formatDay(day), n);
  }
  return counts;
}

const counts = demoCounts();
const ctx = {
  today: TODAY,
  range: { ...RANGE },
  source: 'auto',
  user: 'octocat',
  userFrom: 'your GitHub login',
  seed: '2048',
  rng: planner.createRng('2048'),
  file: 'data.json',
  repo: {
    isRepo: true,
    root: path.join(os.homedir(), 'code', 'contributions'),
    branch: 'main',
    remote: 'origin',
    name: 'Your Name',
    email: 'you@example.com',
  },
};
const graph = { counts, github: counts, local: new Map(), via: 'api', warnings: [] };

// ─── Capturing CLI output ───────────────────────────────────────────────────

function capture(fn) {
  const out = [];
  const original = term.log.line;
  term.log.line = (text = '') => out.push(text);
  try {
    fn();
  } finally {
    term.log.line = original;
  }
  return out.flatMap((text) => String(text).split('\n'));
}

const shell = (command) => `${c.green('❯')} ${c.bold(command)}`;
const ok = (text) => `  ${c.green(sym.ok)} ${text}`;
const hint = (text) => `    ${c.dim(text)}`;
const indent = (block) => block.split('\n').map((line) => `  ${line}`);

const MENU = (empty) => [
  { label: 'Fill empty days', hint: `commit only on the ${term.plural(empty, 'day')} with no contributions` },
  { label: 'List empty days', hint: 'see every date without contributions' },
  { label: 'Random commits', hint: 'spread a number of commits over the range' },
  { label: 'Specific dates', hint: 'commit on days you pick' },
  { label: 'Change range', hint: dates.prettyRange(RANGE.from, TODAY) },
  { label: 'Exit' },
];

const emptyList = stats.emptyDays(counts, RANGE.from, RANGE.to, TODAY);
const perDay = { min: 1, max: 4 };
const plan = planner.planFill({ counts, ...RANGE, today: TODAY, perDay, rng: planner.createRng('2048') });
const after = { ...graph, counts: planner.applyPlan(counts, plan) };
const progressLine = term.progress(plan.commits).render(plan.commits, '');
const createMsg = `Create ${term.plural(plan.commits, 'commit')} in contributions?`;

// ─── Scenes ─────────────────────────────────────────────────────────────────

// Each scene is a list of lines; `steps` reveal lines from an index after a delay (seconds).
function sceneStart() {
  const lines = [
    shell('gtc'),
    ...capture(() => output.printBanner()).slice(1),
    ...indent(prompt.render.answered('GitHub username', 'octocat')),
    ok(`Loaded ${describeSources(ctx, graph)}`),
    ...capture(() => output.printContext(ctx)),
    ...capture(() => output.showGraph(ctx, graph)),
    '',
  ];
  const menuAt = lines.length;
  lines.push(...indent(prompt.render.select('What would you like to do?', MENU(emptyList.length), 0)));
  return { lines, steps: [{ line: menuAt, at: 1.2 }] };
}

function scenePreview() {
  const lines = [
    ...indent(prompt.render.answered('What would you like to do?', 'Fill empty days')),
    ...indent(prompt.render.answered('Commits per empty day', '1-4')),
    ...indent(prompt.render.answered('How many of the empty days?', 'All of them')),
    ...indent(prompt.render.answered('Skip weekends?', 'No')),
    ...capture(() => output.showGraph(ctx, graph, { plan, title: 'Preview' })),
  ];
  const planAt = lines.length;
  lines.push(...capture(() => output.printPlan(ctx, plan, { perDay })));
  const confirmAt = lines.length;
  lines.push(...indent(prompt.render.confirm(createMsg, true)));
  return { lines, wipe: { from: 0.5, to: 2.3 }, steps: [{ line: planAt, at: 2.6 }, { line: confirmAt, at: 3.4 }] };
}

function sceneDone() {
  const lines = [...indent(prompt.render.answered(createMsg, 'Yes')), progressLine];
  const createdAt = lines.length;
  lines.push(ok(`Created ${c.bold(term.plural(plan.commits, 'commit'))} on ${term.plural(plan.days.size, 'day')} in 1.4s`));
  lines.push(...indent(prompt.render.answered('Push to origin/main now?', 'Yes')));
  const pushedAt = lines.length;
  lines.push(ok('Pushed to origin/main'), hint('Your graph: https://github.com/octocat  (it can take a few minutes to update)'));
  const graphAt = lines.length;
  lines.push(...capture(() => output.showGraph(ctx, after, { title: 'Updated graph' })));
  return {
    lines,
    steps: [
      { line: createdAt, at: 0.6 },
      { line: pushedAt, at: 1.2 },
      { line: graphAt, at: 1.8 },
    ],
  };
}

function sceneCalendar() {
  return {
    lines: [
      shell('gtc calendar --list'),
      ok(`Loaded ${describeSources(ctx, graph)}`),
      ...capture(() => output.printContext(ctx)),
      ...capture(() => output.showGraph(ctx, graph)),
      ...capture(() => output.printEmptyDays(emptyList)),
      '',
      hint('gtc fill --dry-run    preview filling them'),
    ],
  };
}

function sceneFill() {
  const weekdayPlan = planner.planFill({
    counts,
    ...RANGE,
    today: TODAY,
    perDay: { min: 1, max: 3 },
    skipWeekends: true,
    rng: planner.createRng('7'),
  });
  return {
    lines: [
      shell('gtc fill --commits 1-3 --skip-weekends --push --yes'),
      ok(`Loaded ${describeSources(ctx, graph)}`),
      ...capture(() => output.printContext(ctx)),
      ...capture(() => output.showGraph(ctx, graph, { plan: weekdayPlan, title: 'Preview' })),
      ...capture(() => output.printPlan({ ...ctx, seed: '7' }, weekdayPlan, { perDay: { min: 1, max: 3 } })),
      term.progress(weekdayPlan.commits).render(weekdayPlan.commits, ''),
      ok(`Created ${c.bold(term.plural(weekdayPlan.commits, 'commit'))} on ${term.plural(weekdayPlan.days.size, 'day')} in 0.9s`),
      ok('Pushed to origin/main'),
      hint('Your graph: https://github.com/octocat  (it can take a few minutes to update)'),
    ],
  };
}

// ─── Write files ────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, '..', '..', 'docs', 'images');
fs.mkdirSync(outDir, { recursive: true });

const files = {
  'demo.svg': animatedSvg(
    [sceneStart(), scenePreview(), sceneDone()],
    [5.5, 6.5, 6],
    'gtc — ~/code/contributions',
    'GitTimeChanger interactive session: read the graph, preview the empty days being filled, commit and push.',
  ),
  'calendar.svg': staticSvg(sceneCalendar(), 'gtc calendar — ~/code/contributions', 'gtc calendar --list: the graph with empty days highlighted, stats and a list of every empty day.'),
  'fill.svg': staticSvg(sceneFill(), 'gtc fill — ~/code/contributions', 'gtc fill: a preview of the commits that will go on empty weekdays, then the commits being created and pushed.'),
};

for (const [name, svg] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), svg);
  process.stdout.write(`  ${c.green(sym.ok)} docs/images/${name}  ${c.dim(`${(svg.length / 1024).toFixed(0)} KB`)}\n`);
}
process.stdout.write(`  ${c.dim(`${plan.commits} demo commits on ${plan.days.size} of ${emptyList.length} empty days`)}\n`);
