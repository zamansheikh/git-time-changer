'use strict';

// The context every command works with: date range, target repo, GitHub user,
// and the contribution data loaded for them.

const path = require('node:path');
const dates = require('../core/dates');
const planner = require('../core/plan');
const git = require('../services/git');
const github = require('../services/github');
const term = require('../ui/term');
const { UserError, GITHUB_LOGIN, displayPath, expandHome, parsed, dataFile } = require('./helpers');

const { log } = term;

async function createContext(opts, { repoRequired }) {
  const today = dates.localToday();
  const range = parsed(() => dates.resolveRange(opts, today));
  const source = opts.source || 'auto';
  if (!['auto', 'github', 'local'].includes(source)) {
    throw new UserError(`Unknown --source "${source}".`, 'Use auto, github or local.');
  }
  const dir = path.resolve(expandHome(opts.repo || '.'));
  const repo = await git.inspect(dir);
  if (!repo.isRepo && repoRequired) {
    throw new UserError(
      `${displayPath(dir)} is not a git repository.`,
      'Run gtc inside the repository you want to commit into, or pass --repo <path>.',
    );
  }
  const seed = opts.seed ?? String(Math.floor(Math.random() * 1e6));
  return {
    today,
    range,
    source,
    repo,
    user: undefined,
    userFrom: null,
    seed,
    rng: planner.createRng(seed),
    file: dataFile(opts.file),
  };
}

// Commits can't go in the future, so commands that write cap the range at today.
function capRangeAtToday(ctx) {
  ctx.range.to = Math.min(ctx.range.to, ctx.today);
  if (ctx.range.from > ctx.range.to) throw new UserError('That range is in the future. Pick dates up to today.');
}

async function findUser(opts, repo) {
  if (opts.user) {
    const login = opts.user.replace(/^@/, '');
    if (!GITHUB_LOGIN.test(login)) throw new UserError(`"${opts.user}" is not a valid GitHub username.`);
    return { login, from: '--user' };
  }
  if (process.env.GTC_USER) return { login: process.env.GTC_USER, from: 'GTC_USER' };
  if (repo.githubUser) return { login: repo.githubUser, from: 'git config github.user' };
  const viewer = await github.viewerLogin();
  if (viewer) return { login: viewer, from: 'your GitHub login' };
  if (repo.remoteOwner) return { login: repo.remoteOwner, from: `the ${repo.remote} remote` };
  return null;
}

async function loadGraph(ctx) {
  const { repo, source, range } = ctx;
  const graph = { counts: new Map(), github: null, local: null, via: null, warnings: [] };
  if (source === 'github' && !ctx.user) {
    throw new UserError('No GitHub username to read.', 'Pass --user <login>.');
  }
  if (source !== 'local' && ctx.user) {
    try {
      const result = await github.fetchContributions(ctx.user, range.from, range.to);
      graph.github = result.counts;
      graph.via = result.via;
    } catch (error) {
      if (source === 'github') throw new UserError(error.message);
      graph.warnings.push(`${error.message} Using local commits only.`);
    }
  }
  if (source !== 'github' && repo.isRepo) {
    graph.local = await git.localCounts(repo, {
      from: dates.formatDay(range.from),
      to: dates.formatDay(range.to),
    });
  }
  // A day counts as active if either GitHub or the local repo has commits on it.
  for (const map of [graph.github, graph.local]) {
    if (!map) continue;
    for (const [key, n] of map) graph.counts.set(key, Math.max(graph.counts.get(key) || 0, n));
  }
  return graph;
}

function describeSources(ctx, graph) {
  const list = [];
  if (graph.github) list.push(`GitHub ${graph.via === 'api' ? 'API' : 'profile'} for @${ctx.user}`);
  if (graph.local) list.push('local commits');
  return list.length ? list.join(' + ') : 'no sources';
}

async function loadWithSpinner(ctx, opts) {
  const spin = term.spinner('Reading contributions…');
  try {
    if (ctx.user === undefined) {
      const found = ctx.source === 'local' ? null : await findUser(opts, ctx.repo);
      ctx.user = found ? found.login : null;
      ctx.userFrom = found ? found.from : null;
    }
    if (ctx.user) spin.update(`Reading @${ctx.user}'s contributions…`);
    const graph = await loadGraph(ctx);
    spin.succeed(`Loaded ${describeSources(ctx, graph)}`);
    for (const warning of graph.warnings) log.warn(warning);
    return graph;
  } catch (error) {
    spin.fail('Could not load contributions');
    throw error;
  }
}

module.exports = { createContext, capRangeAtToday, findUser, loadGraph, describeSources, loadWithSpinner };
