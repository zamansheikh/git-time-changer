'use strict';

// Small helpers shared by the commands and the interactive mode.

const os = require('node:os');
const path = require('node:path');
const dates = require('../core/dates');

// An error with a friendly message (and optional hint) instead of a stack trace.
class UserError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = 'UserError';
    this.hint = hint;
  }
}

const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

function displayPath(p) {
  const home = os.homedir();
  return p === home || p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
}

function expandHome(p) {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

// Runs a parser and turns its RangeError into a UserError.
function parsed(fn, hint) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof RangeError) throw new UserError(error.message, hint);
    throw error;
  }
}

// For prompt validation: returns true, or the error message.
const check = (fn) => (value) => {
  try {
    fn(value);
    return true;
  } catch (error) {
    return error.message;
  }
};

function dataFile(value = 'data.json') {
  const normal = path.normalize(value);
  if (path.isAbsolute(normal) || normal.startsWith('..')) {
    throw new UserError(`--file must be a path inside the repository, got "${value}".`);
  }
  return normal;
}

function checkDays(days, today) {
  if (!days.length) {
    throw new UserError('Give at least one date.', 'Example: gtc date 2026-10-30 2026-10-01..2026-10-07 -n 3');
  }
  const future = days.filter((d) => d > today);
  if (future.length) throw new UserError(`${dates.formatDay(future[0])} is in the future. Pick dates up to today.`);
}

module.exports = { UserError, GITHUB_LOGIN, displayPath, expandHome, parsed, check, dataFile, checkDays };
