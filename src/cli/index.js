'use strict';

// Entry point: parses arguments and hands off to a command or interactive mode.

const { parseArgs } = require('node:util');
const pkg = require('../../package.json');
const term = require('../ui/term');
const prompt = require('../ui/prompt');
const commands = require('./commands');
const interactive = require('./interactive');
const { printHelp } = require('./help');
const { UserError } = require('./helpers');

const { c, log } = term;

const OPTIONS = {
  user: { type: 'string', short: 'u' },
  repo: { type: 'string', short: 'r' },
  source: { type: 'string' },
  year: { type: 'string' },
  from: { type: 'string' },
  to: { type: 'string' },
  commits: { type: 'string', short: 'n' },
  density: { type: 'string' },
  'skip-weekends': { type: 'boolean' },
  'only-empty': { type: 'boolean' },
  seed: { type: 'string' },
  file: { type: 'string' },
  'dry-run': { type: 'boolean' },
  push: { type: 'boolean' },
  yes: { type: 'boolean', short: 'y' },
  list: { type: 'boolean' },
  json: { type: 'boolean' },
  'no-color': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
};

function findCommand(name) {
  for (const [key, command] of Object.entries(commands)) {
    if (key === name || command.aliases.includes(name)) return { key, command };
  }
  return null;
}

function printError(error) {
  log.line();
  log.error(error.message);
  if (error.hint) process.stderr.write(`    ${c.dim(error.hint)}\n`);
  if (process.env.DEBUG && error.stack && !(error instanceof UserError)) process.stderr.write(`${c.dim(error.stack)}\n`);
  log.line();
}

async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (error) {
    printError(new UserError(error.message.replace(/\. To specify.*$/s, '.'), 'Run gtc --help to see all options.'));
    process.exitCode = 1;
    return;
  }
  const opts = args.values;
  const [name, ...rest] = args.positionals;
  if (opts['no-color']) term.setDepth(1);
  if (opts.version) {
    process.stdout.write(`${pkg.version}\n`);
    return;
  }
  if (opts.help || name === 'help') {
    printHelp();
    return;
  }
  try {
    if (name === undefined) {
      if (prompt.isInteractive()) await interactive.run(opts);
      else printHelp();
      return;
    }
    const found = findCommand(name);
    if (!found) throw new UserError(`Unknown command "${name}".`, 'Run gtc --help to see the commands.');
    await found.command.run(opts, rest);
    if (rest.length && found.key !== 'date') log.warn(`Ignored extra arguments: ${rest.join(' ')}`);
  } catch (error) {
    if (error instanceof prompt.CancelledError) {
      log.line();
      process.exitCode = 130;
      return;
    }
    printError(error);
    process.exitCode = 1;
  }
}

module.exports = { main, UserError };
