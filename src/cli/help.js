'use strict';

const pkg = require('../../package.json');
const term = require('../ui/term');

const { c, theme, sym, log } = term;

function printHelp() {
  const section = (title) => `  ${c.bold(title)}`;
  const item = (left, right) => `    ${term.padEnd(left, 26)}${c.dim(right)}`;
  log.lines([
    '',
    `  ${theme.brand(sym.cell)} ${c.bold('GitTimeChanger')} ${c.dim(`v${pkg.version}`)}`,
    `  ${c.dim('Find the empty days on your GitHub contribution graph and fill only those.')}`,
    '',
    section('Usage'),
    item('gtc', 'interactive mode (recommended)'),
    item('gtc <command> [options]', ''),
    '',
    section('Commands'),
    item('calendar', 'show the graph, stats and empty days'),
    item('fill', 'commit only on days with no contributions'),
    item('random', 'spread commits randomly over a range'),
    item('date <day…>', 'commit on given days: YYYY-MM-DD, A..B, today'),
    item('art <text>', 'write text on the graph, like "Hello!"'),
    '',
    section('Options'),
    item('-u, --user <login>', 'GitHub user whose graph to read'),
    item('-r, --repo <path>', 'repository to commit into (default: .)'),
    item('    --source <name>', 'auto, github or local (default: auto)'),
    item('    --year <yyyy>', 'use a calendar year'),
    item('    --from <date>', 'start of the range, YYYY-MM-DD'),
    item('    --to <date>', 'end of the range (default: today)'),
    item('-n, --commits <n|a-b>', 'per day (fill/date: 1-4, art: auto), total for random (300)'),
    item('    --density <percent>', 'share of empty days to fill (default: 100)'),
    item('    --skip-weekends', 'leave Saturdays and Sundays alone'),
    item('    --start <date>', 'art: week the text starts in (default: quietest spot)'),
    item('    --only-empty', 'random: use empty days only'),
    item('    --seed <value>', 'make the random plan repeatable'),
    item('    --file <path>', 'file changed by each commit (default: data.json)'),
    item('    --dry-run', 'preview without committing'),
    item('    --push', 'push when done'),
    item('-y, --yes', 'do not ask for confirmation'),
    item('    --list', 'calendar: list every empty day'),
    item('    --json', 'calendar: print JSON'),
    item('    --no-color', 'plain output'),
    item('-h, --help', 'show this help'),
    item('-v, --version', 'show the version'),
    '',
    section('Examples'),
    `    ${c.dim('$')} gtc calendar --user octocat --list`,
    `    ${c.dim('$')} gtc fill --commits 1-3 --skip-weekends --dry-run`,
    `    ${c.dim('$')} gtc fill --year 2025 --density 80 --push`,
    `    ${c.dim('$')} gtc random -n 300 --only-empty`,
    `    ${c.dim('$')} gtc date 2026-10-01..2026-10-07 -n 5`,
    `    ${c.dim('$')} gtc art "I ♥ code" --year 2025 --dry-run`,
    '',
    `  ${c.dim('A GitHub token is optional. GITHUB_TOKEN, GH_TOKEN or a logged-in gh CLI is used when present;')}`,
    `  ${c.dim('otherwise the public profile graph is read.')}`,
    '',
  ]);
}

module.exports = { printHelp };
