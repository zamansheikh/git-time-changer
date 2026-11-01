'use strict';

// Turns a plan into real commits: checks, confirmation, progress, push.

const path = require('node:path');
const planner = require('../core/plan');
const git = require('../services/git');
const term = require('../ui/term');
const prompt = require('../ui/prompt');
const { UserError } = require('./helpers');

const { c, log } = term;

function preflight(ctx) {
  const { repo } = ctx;
  if (!repo.email) {
    throw new UserError(
      'git user.email is not set, so GitHub could not link the commits to you.',
      'Run: git config --global user.email "you@example.com" (use an email on your GitHub account)',
    );
  }
  if (repo.defaultBranch && repo.branch && repo.branch !== repo.defaultBranch) {
    log.warn(`You are on "${repo.branch}". GitHub only counts commits on the default branch "${repo.defaultBranch}".`);
  }
  if (!repo.branch) log.warn('HEAD is detached. Check out a branch first so the commits are not lost.');
}

async function maybePush(ctx, opts, interactive) {
  const { repo } = ctx;
  let push = Boolean(opts.push);
  if (!push && interactive && repo.remote) {
    push = await prompt.confirm({ message: `Push to ${repo.remote}/${repo.branch || 'HEAD'} now?`, initial: true });
  }
  if (!push) {
    if (repo.remote) log.hint('Publish them when you are ready:  git push');
    else log.hint(`Add a remote to publish them:  git remote add origin <url> && git push -u origin ${repo.branch || 'main'}`);
    return;
  }
  const spin = term.spinner(`Pushing to ${repo.remote || 'remote'}…`);
  try {
    await git.push(repo);
    spin.succeed(`Pushed to ${repo.remote}/${repo.branch}`);
    ctx.repo = await git.inspect(repo.root);
    if (ctx.user) log.hint(`Your graph: https://github.com/${ctx.user}  (it can take a few minutes to update)`);
  } catch (error) {
    spin.fail(`Push failed: ${error.message}`);
    log.hint('Fix the problem above, then run:  git push');
    process.exitCode = 1;
  }
}

/**
 * Commits a plan. Returns null when nothing was written (dry run, declined,
 * empty plan), otherwise { done, committed }.
 */
async function execute(ctx, plan, { opts, interactive }) {
  if (plan.commits === 0) {
    log.ok('Nothing to do. The plan is empty.');
    return null;
  }
  preflight(ctx);
  if (opts['dry-run']) {
    log.info('Dry run: nothing was committed.');
    log.hint('Run the same command without --dry-run to create these commits.');
    return null;
  }
  if (!opts.yes) {
    if (!prompt.isInteractive()) {
      throw new UserError('This needs a confirmation.', 'Add --yes to run without asking, or --dry-run to only preview.');
    }
    const ok = await prompt.confirm({
      message: `Create ${term.plural(plan.commits, 'commit')} in ${path.basename(ctx.repo.root)}?`,
      initial: true,
    });
    if (!ok) {
      log.info('Nothing was committed.');
      return null;
    }
  }

  const commits = planner.schedule(plan, { rng: ctx.rng });
  const bar = term.progress(commits.length);
  let stop = false;
  let done = 0;
  const onInterrupt = () => {
    stop = true;
  };
  process.on('SIGINT', onInterrupt);
  try {
    await git.commitAll(ctx.repo, commits, {
      file: ctx.file,
      onProgress: (n, commit) => {
        done = n;
        bar.update(n, commit.day);
      },
      shouldStop: () => stop,
    });
  } catch (error) {
    bar.finish();
    // Ctrl+C also reaches the running git process; that is a stop, not a failure.
    if (!stop) throw new UserError(`git commit failed after ${term.plural(done, 'commit')}: ${error.message}`);
  } finally {
    process.removeListener('SIGINT', onInterrupt);
  }
  const seconds = bar.finish();
  if (stop) log.warn(`Stopped after ${term.plural(done, 'commit')}.`);
  else log.ok(`Created ${c.bold(term.plural(done, 'commit'))} on ${term.plural(plan.days.size, 'day')} in ${term.duration(seconds)}`);

  if (done > 0) await maybePush(ctx, opts, interactive);
  return { done, committed: commits.slice(0, done) };
}

// The graph after some commits were created (for the "Updated graph" view).
function applyCommitted(graph, committed) {
  const counts = new Map(graph.counts);
  for (const { day } of committed) counts.set(day, (counts.get(day) || 0) + 1);
  return { ...graph, counts };
}

module.exports = { execute, applyCommitted };
