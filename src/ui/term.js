'use strict';

// Terminal helpers: colors, symbols, layout, spinner and progress bar.
// No dependencies; respects NO_COLOR, FORCE_COLOR and --no-color.

const ESC = '\x1b[';
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;
const CLEAR_LINE = `\r${ESC}2K`;

// Color depth in bits: 1 = no color, 4 = 16 colors, 8 = 256 colors, 24 = truecolor.
let depth = detectDepth();

function detectDepth() {
  const env = process.env;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return 1;
  const out = process.stdout;
  if (out.isTTY && typeof out.getColorDepth === 'function') return out.getColorDepth();
  const force = env.FORCE_COLOR;
  if (force === undefined || force === '0' || force === 'false') return 1;
  return { 2: 8, 3: 24 }[force] || 4;
}

function setDepth(bits) {
  depth = bits;
}

function getDepth() {
  return depth;
}

const style = (open, close) => (text) =>
  depth > 1 ? `${ESC}${open}m${text}${ESC}${close}m` : String(text);

const c = {
  bold: style(1, 22),
  dim: style(2, 22),
  italic: style(3, 23),
  underline: style(4, 24),
  inverse: style(7, 27),
  red: style(31, 39),
  green: style(32, 39),
  yellow: style(33, 39),
  blue: style(34, 39),
  magenta: style(35, 39),
  cyan: style(36, 39),
  gray: style(90, 39),
  white: style(97, 39),
};

// xterm 256-color approximation of an RGB color.
function rgbTo256(r, g, b) {
  const levels = [0, 95, 135, 175, 215, 255];
  const nearest = (v) => {
    let best = 0;
    for (let i = 1; i < levels.length; i++) {
      if (Math.abs(levels[i] - v) < Math.abs(levels[best] - v)) best = i;
    }
    return best;
  };
  const [ri, gi, bi] = [nearest(r), nearest(g), nearest(b)];
  const cube = 16 + 36 * ri + 6 * gi + bi;
  const cubeDist = (levels[ri] - r) ** 2 + (levels[gi] - g) ** 2 + (levels[bi] - b) ** 2;
  const avg = (r + g + b) / 3;
  const grayIndex = Math.max(0, Math.min(23, Math.round((avg - 8) / 10)));
  const grayValue = 8 + grayIndex * 10;
  const grayDist = (grayValue - r) ** 2 + (grayValue - g) ** 2 + (grayValue - b) ** 2;
  return grayDist < cubeDist ? 232 + grayIndex : cube;
}

// A foreground color from a hex value, with a 16-color fallback code.
function hex(value, fallback = 39) {
  const n = parseInt(value.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const ansi256 = rgbTo256(r, g, b);
  return (text) => {
    if (depth <= 1) return String(text);
    if (depth >= 24) return `${ESC}38;2;${r};${g};${b}m${text}${ESC}39m`;
    if (depth >= 8) return `${ESC}38;5;${ansi256}m${text}${ESC}39m`;
    return `${ESC}${fallback}m${text}${ESC}39m`;
  };
}

// GitHub's dark-theme palette.
const PALETTE = {
  levels: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
  empty: '#d29922',
  planned: '#a371f7',
  none: '#30363d',
  accent: '#58a6ff',
  brand: '#39d353',
};

const theme = {
  accent: hex(PALETTE.accent, 34),
  brand: hex(PALETTE.brand, 32),
  empty: hex(PALETTE.empty, 33),
  planned: hex(PALETTE.planned, 35),
  none: hex(PALETTE.none, 90),
  level: [
    hex(PALETTE.levels[0], 90),
    hex(PALETTE.levels[1], 32),
    hex(PALETTE.levels[2], 32),
    hex(PALETTE.levels[3], 92),
    hex(PALETTE.levels[4], 92),
  ],
};

const sym = {
  ok: '✔',
  err: '✖',
  warn: '▲',
  info: '●',
  pointer: '❯',
  arrow: '→',
  dot: '·',
  cell: '■',
  bar: '━',
};

const ANSI_PATTERN = /\x1b\[[0-9;?]*[A-Za-z]/g;

function strip(text) {
  return String(text).replace(ANSI_PATTERN, '');
}

function width(text) {
  return strip(text).length;
}

function padEnd(text, size) {
  return text + ' '.repeat(Math.max(0, size - width(text)));
}

// Cut a styled string to a visible width, keeping escape codes intact.
function truncate(text, max) {
  if (width(text) <= max) return text;
  let out = '';
  let visible = 0;
  const parts = String(text).split(/(\x1b\[[0-9;?]*[A-Za-z])/);
  for (const part of parts) {
    if (part.startsWith('\x1b[')) {
      out += part;
      continue;
    }
    for (const ch of part) {
      if (visible >= max - 1) return `${out}…${depth > 1 ? `${ESC}0m` : ''}`;
      out += ch;
      visible++;
    }
  }
  return out;
}

function columns() {
  return process.stdout.isTTY ? process.stdout.columns || 100 : 120;
}

function number(n) {
  return Number(n).toLocaleString('en-US');
}

function duration(seconds) {
  if (!Number.isFinite(seconds)) return '–';
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function plural(n, word, many = `${word}s`) {
  return `${number(n)} ${n === 1 ? word : many}`;
}

// Rounded box around lines of text.
function box(lines, { paint = c.gray, padding = 2, minWidth = 0 } = {}) {
  const inner = Math.max(minWidth, ...lines.map(width)) + padding * 2;
  const pad = ' '.repeat(padding);
  return [
    paint(`╭${'─'.repeat(inner)}╮`),
    ...lines.map((line) => `${paint('│')}${pad}${padEnd(line, inner - padding * 2)}${pad}${paint('│')}`),
    paint(`╰${'─'.repeat(inner)}╯`),
  ];
}

// Aligned "Label   value" rows.
function rows(pairs, indent = '  ') {
  const labelWidth = Math.max(...pairs.map(([label]) => label.length));
  return pairs.map(([label, value]) => `${indent}${c.dim(label.padEnd(labelWidth))}   ${value}`);
}

function heading(title, indent = '  ') {
  const line = '─'.repeat(Math.max(4, Math.min(columns(), 112) - indent.length * 2 - width(title) - 4));
  return `${indent}${c.bold(title)} ${c.gray(line)}`;
}

const log = {
  quiet: false,
  line(text = '') {
    if (!this.quiet) process.stdout.write(`${text}\n`);
  },
  lines(list) {
    for (const text of list) this.line(text);
  },
  ok(text) {
    this.line(`  ${c.green(sym.ok)} ${text}`);
  },
  warn(text) {
    this.line(`  ${c.yellow(sym.warn)} ${text}`);
  },
  info(text) {
    this.line(`  ${theme.accent(sym.info)} ${text}`);
  },
  error(text) {
    process.stderr.write(`  ${c.red(sym.err)} ${text}\n`);
  },
  hint(text) {
    this.line(`    ${c.dim(text)}`);
  },
};

const isTTY = () => Boolean(process.stdout.isTTY);

let cursorHidden = false;
function hideCursor() {
  if (isTTY() && !cursorHidden) {
    process.stdout.write(HIDE_CURSOR);
    cursorHidden = true;
  }
}
function showCursor() {
  if (cursorHidden) {
    process.stdout.write(SHOW_CURSOR);
    cursorHidden = false;
  }
}
process.on('exit', showCursor);

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function spinner(text) {
  let current = text;
  let frame = 0;
  let timer = null;
  const live = isTTY() && !log.quiet;
  const draw = () => {
    frame = (frame + 1) % SPINNER_FRAMES.length;
    process.stdout.write(`${CLEAR_LINE}  ${theme.accent(SPINNER_FRAMES[frame])} ${truncate(current, columns() - 5)}`);
  };
  if (live) {
    hideCursor();
    draw();
    timer = setInterval(draw, 80);
  }
  const stop = (mark, message) => {
    if (timer) clearInterval(timer);
    timer = null;
    if (live) {
      process.stdout.write(CLEAR_LINE);
      showCursor();
    }
    if (mark) log.line(`  ${mark} ${message ?? current}`);
  };
  return {
    update(next) {
      current = next;
    },
    succeed: (message) => stop(c.green(sym.ok), message),
    fail: (message) => stop(c.red(sym.err), message),
    warn: (message) => stop(c.yellow(sym.warn), message),
    stop: () => stop(null),
  };
}

function progress(total, { barWidth = 28 } = {}) {
  const started = Date.now();
  const live = isTTY() && !log.quiet;
  let lastDraw = 0;
  const render = (done, label) => {
    const ratio = total ? done / total : 1;
    const filled = Math.round(ratio * barWidth);
    const bar = theme.brand(sym.bar.repeat(filled)) + c.gray(sym.bar.repeat(barWidth - filled));
    const pct = `${String(Math.floor(ratio * 100)).padStart(3)}%`;
    const elapsed = (Date.now() - started) / 1000;
    const eta = done > 0 ? (elapsed / done) * (total - done) : NaN;
    const parts = [
      `  ${bar}`,
      c.bold(pct),
      c.dim(`${number(done)}/${number(total)}`),
      label ? theme.accent(label) : '',
      done < total ? c.dim(`ETA ${duration(eta)}`) : '',
    ].filter(Boolean);
    return parts.join('  ');
  };
  if (live) hideCursor();
  return {
    update(done, label) {
      if (!live) return;
      const now = Date.now();
      if (now - lastDraw < 40 && done < total) return;
      lastDraw = now;
      process.stdout.write(CLEAR_LINE + truncate(render(done, label), columns() - 1));
    },
    finish() {
      if (live) {
        process.stdout.write(CLEAR_LINE);
        showCursor();
      }
      return (Date.now() - started) / 1000;
    },
    render,
  };
}

module.exports = {
  ESC,
  HIDE_CURSOR,
  SHOW_CURSOR,
  CLEAR_LINE,
  PALETTE,
  c,
  theme,
  sym,
  hex,
  rgbTo256,
  setDepth,
  getDepth,
  strip,
  width,
  padEnd,
  truncate,
  columns,
  number,
  duration,
  plural,
  box,
  rows,
  heading,
  log,
  spinner,
  progress,
  hideCursor,
  showCursor,
};
