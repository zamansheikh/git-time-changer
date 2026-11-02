'use strict';

// Reads a user's contribution calendar from GitHub.
// 1. GraphQL API when a token is available (GITHUB_TOKEN, GH_TOKEN or `gh auth token`).
// 2. Otherwise the public contributions page that github.com itself renders.

const { execFile } = require('node:child_process');
const { formatDay, parts, fromParts } = require('../core/dates');

const USER_AGENT = 'git-time-changer (+https://github.com/zamansheikh/git-time-changer)';
const TIMEOUT_MS = 20_000;

class SourceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SourceError';
  }
}

let cachedToken;
async function getToken() {
  if (cachedToken !== undefined) return cachedToken;
  const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (env) return (cachedToken = env.trim());
  cachedToken = await new Promise((resolve) => {
    execFile('gh', ['auth', 'token'], { timeout: 5000, windowsHide: true }, (error, stdout) => {
      resolve(error ? null : stdout.trim() || null);
    });
  });
  return cachedToken;
}

async function request(url, init = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error.name === 'TimeoutError' ? 'the request timed out' : error.cause?.code || error.message;
    throw new SourceError(`Could not reach GitHub (${reason}).`);
  }
  return response;
}

async function graphql(token, query, variables) {
  const response = await request('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (response.status === 401) throw new SourceError('GitHub rejected the token (401).');
  if (!response.ok) throw new SourceError(`GitHub API error ${response.status}.`);
  const body = await response.json();
  if (body.errors?.length) throw new SourceError(body.errors[0].message);
  return body.data;
}

async function viewerLogin() {
  const token = await getToken();
  if (!token) return null;
  try {
    const data = await graphql(token, 'query { viewer { login } }', {});
    return data.viewer.login;
  } catch {
    return null;
  }
}

// Calendar years overlapping [from, to], each clipped to the range.
function yearChunks(from, to) {
  const chunks = [];
  for (let y = parts(from).y; y <= parts(to).y; y++) {
    chunks.push({ year: y, from: Math.max(from, fromParts(y, 1, 1)), to: Math.min(to, fromParts(y, 12, 31)) });
  }
  return chunks;
}

const CALENDAR_QUERY = `
  query ($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          weeks { contributionDays { date contributionCount } }
        }
      }
    }
  }`;

async function fromApi(token, login, from, to) {
  const counts = new Map();
  for (const chunk of yearChunks(from, to)) {
    const data = await graphql(token, CALENDAR_QUERY, {
      login,
      from: `${formatDay(chunk.from)}T00:00:00Z`,
      to: `${formatDay(chunk.to)}T23:59:59Z`,
    });
    if (!data.user) throw new SourceError(`GitHub user "${login}" was not found.`);
    for (const week of data.user.contributionsCollection.contributionCalendar.weeks) {
      for (const day of week.contributionDays) counts.set(day.date, day.contributionCount);
    }
  }
  return counts;
}

// Parses the HTML of github.com/users/<login>/contributions.
function parseContributionsHtml(html) {
  const tooltips = new Map();
  for (const match of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    tooltips.set(match[1], match[2].trim());
  }
  const counts = new Map();
  for (const match of html.matchAll(/<td\b[^>]*\bdata-date="(\d{4}-\d{2}-\d{2})"[^>]*>/g)) {
    const tag = match[0];
    const id = /\bid="([^"]+)"/.exec(tag)?.[1];
    const level = Number(/\bdata-level="(\d)"/.exec(tag)?.[1] || 0);
    const text = id ? tooltips.get(id) : undefined;
    let count;
    if (text !== undefined) {
      const n = /^([\d,]+)\s+contribution/i.exec(text);
      count = n ? Number(n[1].replace(/,/g, '')) : 0;
    } else {
      count = level; // No tooltip: the level is still enough to tell empty from active.
    }
    counts.set(match[1], count);
  }
  return counts;
}

async function fromWeb(login, from, to) {
  const counts = new Map();
  for (const chunk of yearChunks(from, to)) {
    const url =
      `https://github.com/users/${encodeURIComponent(login)}/contributions` +
      `?from=${formatDay(fromParts(chunk.year, 1, 1))}&to=${formatDay(fromParts(chunk.year, 12, 31))}`;
    const response = await request(url, { headers: { Accept: 'text/html' } });
    if (response.status === 404) throw new SourceError(`GitHub user "${login}" was not found.`);
    if (!response.ok) throw new SourceError(`GitHub returned ${response.status} for the contributions page.`);
    const parsed = parseContributionsHtml(await response.text());
    if (parsed.size === 0) throw new SourceError('Could not read the contributions page (the layout may have changed).');
    for (const [key, n] of parsed) counts.set(key, n);
  }
  return counts;
}

/**
 * Contribution counts for a user between two day numbers.
 * Returns { counts: Map<'YYYY-MM-DD', number>, via: 'api' | 'web' }.
 */
async function fetchContributions(login, from, to) {
  const token = await getToken();
  let counts;
  let via;
  if (token) {
    try {
      counts = await fromApi(token, login, from, to);
      via = 'api';
    } catch (error) {
      if (/not found/i.test(error.message)) throw error;
    }
  }
  if (!counts) {
    counts = await fromWeb(login, from, to);
    via = 'web';
  }
  const lo = formatDay(from);
  const hi = formatDay(to);
  for (const key of counts.keys()) if (key < lo || key > hi) counts.delete(key);
  return { counts, via };
}

module.exports = { fetchContributions, parseContributionsHtml, viewerLogin, getToken, yearChunks, SourceError };
