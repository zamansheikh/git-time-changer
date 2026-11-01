'use strict';

// Thin wrapper around the git command line.

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { isoLocal, gitDate } = require('../core/dates');

class GitError extends Error {
  constructor(args, stderr, code) {
    const detail = String(stderr || '').trim().split('\n').filter(Boolean).slice(-3).join(' ');
    super(detail || `git ${args[0]} failed`);
    this.name = 'GitError';
    this.args = args;
    this.code = code;
  }
}

function git(args, { cwd, env, timeout = 0 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, env: env || process.env, timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          if (error.code === 'ENOENT') {
            reject(new GitError(args, 'git is not installed or not on your PATH.', 'ENOENT'));
          } else {
            reject(new GitError(args, stderr || error.message, error.code));
          }
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

const optional = (promise) => promise.catch(() => null);

// Owner of a GitHub remote URL: git@github.com:owner/repo.git or https://github.com/owner/repo
function githubOwner(url) {
  const match = /github\.com[:/]([^/\s]+)\/[^/\s]+?(?:\.git)?\/?$/i.exec(url || '');
  return match ? match[1] : null;
}

async function inspect(dir) {
  const cwd = path.resolve(dir);
  const root = await optional(git(['rev-parse', '--show-toplevel'], { cwd }));
  if (!root) return { dir: cwd, isRepo: false };
  const run = (args) => optional(git(args, { cwd: root }));
  const [branch, name, email, githubUser, remotes, head, upstream] = await Promise.all([
    run(['branch', '--show-current']),
    run(['config', 'user.name']),
    run(['config', 'user.email']),
    run(['config', 'github.user']),
    run(['remote']),
    run(['rev-parse', '--verify', '--quiet', 'HEAD']),
    run(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
  ]);
  const remoteNames = (remotes || '').split('\n').filter(Boolean);
  const remote = remoteNames.includes('origin') ? 'origin' : remoteNames[0] || null;
  const [remoteUrl, remoteHead] = remote
    ? await Promise.all([
        run(['remote', 'get-url', remote]),
        run(['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`]),
      ])
    : [null, null];
  return {
    dir: cwd,
    isRepo: true,
    root,
    branch: branch || null,
    name: name || null,
    email: email || null,
    githubUser: githubUser || null,
    hasCommits: Boolean(head),
    upstream: upstream || null,
    remote,
    remoteUrl: remoteUrl || null,
    remoteOwner: githubOwner(remoteUrl),
    defaultBranch: remoteHead ? remoteHead.replace(`${remote}/`, '') : null,
  };
}

// Commits per author-date on HEAD, optionally only by one author email.
async function localCounts(repo, { from, to } = {}) {
  const counts = new Map();
  if (!repo.isRepo || !repo.hasCommits) return counts;
  const args = ['log', 'HEAD', '--format=%as'];
  if (repo.email) args.push('-F', `--author=<${repo.email}>`);
  const out = await git(args, { cwd: repo.root });
  for (const key of out.split('\n')) {
    if (!key) continue;
    if ((from && key < from) || (to && key > to)) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

async function isTracked(repo, file) {
  try {
    await git(['ls-files', '--error-unmatch', '--', file], { cwd: repo.root });
    return true;
  } catch {
    return false;
  }
}

async function init(dir) {
  await git(['init'], { cwd: dir });
}

/**
 * Creates one commit per scheduled time. Only the data file is committed, so
 * anything else the user has staged is left alone.
 */
async function commitAll(repo, commits, { file = 'data.json', onProgress = () => {}, shouldStop = () => false } = {}) {
  const filePath = path.join(repo.root, file);
  let tracked = await isTracked(repo, file);
  let done = 0;
  for (const commit of commits) {
    if (shouldStop()) break;
    const iso = isoLocal(commit.date);
    const stamp = gitDate(commit.date);
    await fs.writeFile(filePath, `${JSON.stringify({ date: iso, author: repo.name || 'GitTimeChanger' })}\n`);
    if (!tracked) {
      await git(['add', '--', file], { cwd: repo.root });
      tracked = true;
    }
    await git(['commit', '--quiet', '--message', iso, '--', file], {
      cwd: repo.root,
      env: { ...process.env, GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp },
    });
    done++;
    onProgress(done, commit);
  }
  return done;
}

async function push(repo) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  if (repo.upstream) return git(['push', '--quiet'], { cwd: repo.root, env });
  if (!repo.remote) throw new GitError(['push'], 'This repository has no remote. Add one with: git remote add origin <url>');
  return git(['push', '--quiet', '--set-upstream', repo.remote, repo.branch || 'HEAD'], { cwd: repo.root, env });
}

module.exports = { git, GitError, inspect, localCounts, commitAll, push, init, githubOwner, isTracked };
