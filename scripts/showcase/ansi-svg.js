'use strict';

// Converts colored terminal output (ANSI escape codes) into a terminal-window SVG.
// Calendar cells, box lines, progress bars and status icons are drawn as shapes,
// so the result looks the same whatever monospace font the viewer has.

const { PALETTE, width } = require('../../src/ui/term');


const FONT_SIZE = 14;
const CW = 8.4; // character width
const LH = 16.8; // line height (2 × CW keeps calendar cells square)
const PAD_X = 22;
const BAR_H = 38;
const PAD_TOP = 14;
const PAD_BOTTOM = 18;

const COLORS = {
  bg: '#0d1117',
  border: '#30363d',
  fg: '#e6edf3',
  dimOpacity: 0.55,
  31: '#ff7b72',
  32: '#3fb950',
  33: '#d29922',
  34: '#58a6ff',
  35: '#bc8cff',
  36: '#39c5cf',
  90: '#6e7681',
  97: '#f0f6fc',
};

// Splits a line with SGR codes into styled cells.
function parseLine(line) {
  const cells = [];
  const state = { fg: null, bold: false, dim: false, underline: false, inverse: false };
  const parts = line.split(/\x1b\[([0-9;]*)m/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const codes = parts[i] === '' ? [0] : parts[i].split(';').map(Number);
      for (let k = 0; k < codes.length; k++) {
        const code = codes[k];
        if (code === 0) Object.assign(state, { fg: null, bold: false, dim: false, underline: false, inverse: false });
        else if (code === 1) state.bold = true;
        else if (code === 2) state.dim = true;
        else if (code === 22) state.bold = state.dim = false;
        else if (code === 4) state.underline = true;
        else if (code === 24) state.underline = false;
        else if (code === 7) state.inverse = true;
        else if (code === 27) state.inverse = false;
        else if (code === 39) state.fg = null;
        else if (code === 38 && codes[k + 1] === 2) {
          const [r, g, b] = codes.slice(k + 2, k + 5);
          state.fg = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
          k += 4;
        } else if (COLORS[code]) state.fg = COLORS[code];
      }
      continue;
    }
    for (const ch of parts[i]) cells.push({ ch, ...state });
  }
  return cells;
}

// Also escapes quotes: the same text goes into aria-label="...", and a raw " breaks the SVG.
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v) => Number(v.toFixed(2));
const sameStyle = (a, b) => a.fg === b.fg && a.bold === b.bold && a.dim === b.dim && a.underline === b.underline;

// Characters drawn as shapes so they look the same with any font.
const BOX = new Set(['─', '│', '╭', '╮', '╰', '╯']);
const ICONS = new Set(['✔', '✖', '▲', '●', '❯']);

function shapes(cells, top, { planned = [], planBase = PALETTE.empty } = {}) {
  const out = [];
  const color = (cell) => cell.fg || COLORS.fg;
  const opacity = (cell) => (cell.dim ? ` opacity="${COLORS.dimOpacity}"` : '');
  const cy = top + LH / 2;
  let i = 0;
  while (i < cells.length) {
    const cell = cells[i];
    const x = PAD_X + i * CW;
    if (cell.ch === '■' && cell.inverse) {
      // Inverse video (the day picker's cursor): a block in the cell's color with a dark square inside.
      const square = (s, fill, rx) =>
        `<rect x="${n(x + CW / 2 - s / 2)}" y="${n(cy - s / 2)}" width="${s}" height="${s}" rx="${rx}" fill="${fill}"/>`;
      out.push(square(16.8, color(cell), 3.4), square(7.6, COLORS.bg, 1.6));
      i++;
      continue;
    }
    if (cell.ch === '■') {
      const s = 12.4;
      const rect = (fill) => `<rect x="${n(x + CW / 2 - s / 2)}" y="${n(cy - s / 2)}" width="${s}" height="${s}" rx="2.4" fill="${fill}"${opacity(cell)}/>`;
      if (cell.fg === PALETTE.planned) planned.push({ x, base: rect(planBase), top: rect(cell.fg) });
      else out.push(rect(color(cell)));
      i++;
      continue;
    }
    if (cell.ch === '━') {
      let j = i;
      while (j < cells.length && cells[j].ch === '━' && sameStyle(cells[j], cell)) j++;
      out.push(`<rect x="${n(x)}" y="${n(cy - 1.5)}" width="${n((j - i) * CW)}" height="3" rx="1.5" fill="${color(cell)}"${opacity(cell)}/>`);
      i = j;
      continue;
    }
    if (BOX.has(cell.ch)) {
      const r = CW / 2;
      const mx = x + CW / 2;
      const d = {
        '─': `M${n(x)} ${n(cy)}H${n(x + CW)}`,
        '│': `M${n(mx)} ${n(top)}V${n(top + LH)}`,
        '╭': `M${n(x + CW)} ${n(cy)}H${n(mx + r)}Q${n(mx)} ${n(cy)} ${n(mx)} ${n(cy + r)}V${n(top + LH)}`,
        '╮': `M${n(x)} ${n(cy)}H${n(mx - r)}Q${n(mx)} ${n(cy)} ${n(mx)} ${n(cy + r)}V${n(top + LH)}`,
        '╰': `M${n(mx)} ${n(top)}V${n(cy - r)}Q${n(mx)} ${n(cy)} ${n(mx + r)} ${n(cy)}H${n(x + CW)}`,
        '╯': `M${n(mx)} ${n(top)}V${n(cy - r)}Q${n(mx)} ${n(cy)} ${n(mx - r)} ${n(cy)}H${n(x)}`,
      }[cell.ch];
      out.push(`<path d="${d}" stroke="${color(cell)}" stroke-width="1.2" fill="none"${opacity(cell)}/>`);
      i++;
      continue;
    }
    if (ICONS.has(cell.ch)) {
      const mx = x + CW / 2;
      const stroke = `stroke="${color(cell)}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"${opacity(cell)}`;
      const d = {
        '✔': `<path d="M${n(mx - 4)} ${n(cy + 0.2)}L${n(mx - 1.2)} ${n(cy + 3)}L${n(mx + 4.2)} ${n(cy - 3.4)}" ${stroke}/>`,
        '✖': `<path d="M${n(mx - 3.4)} ${n(cy - 3.4)}L${n(mx + 3.4)} ${n(cy + 3.4)}M${n(mx + 3.4)} ${n(cy - 3.4)}L${n(mx - 3.4)} ${n(cy + 3.4)}" ${stroke}/>`,
        '❯': `<path d="M${n(mx - 2)} ${n(cy - 4)}L${n(mx + 2.2)} ${n(cy)}L${n(mx - 2)} ${n(cy + 4)}" ${stroke}/>`,
        '▲': `<path d="M${n(mx)} ${n(cy - 4.5)}L${n(mx + 4.6)} ${n(cy + 3.6)}H${n(mx - 4.6)}Z" fill="${color(cell)}"${opacity(cell)}/>`,
        '●': `<circle cx="${n(mx)}" cy="${n(cy)}" r="3.4" fill="${color(cell)}"${opacity(cell)}/>`,
      }[cell.ch];
      out.push(d);
      i++;
      continue;
    }
    if (cell.ch === ' ' && !cell.inverse) {
      i++;
      continue;
    }
    // A word in one style. Words are placed one by one because SVG collapses repeated spaces.
    let j = i;
    while (
      j < cells.length &&
      sameStyle(cells[j], cell) &&
      cells[j].inverse === cell.inverse &&
      (cells[j].ch !== ' ' || cell.inverse) &&
      !['■', '━'].includes(cells[j].ch) &&
      !BOX.has(cells[j].ch) &&
      !ICONS.has(cells[j].ch)
    ) {
      j++;
    }
    const text = cells.slice(i, j).map((cc) => cc.ch).join('');
    const xs = Array.from({ length: j - i }, (_, k) => n(x + k * CW)).join(' ');
    const attrs = [
      `x="${xs}"`,
      `y="${n(top + LH / 2 + FONT_SIZE * 0.36)}"`,
      `fill="${cell.inverse ? COLORS.bg : color(cell)}"`,
      cell.bold ? 'font-weight="700"' : '',
      cell.underline ? 'text-decoration="underline"' : '',
      cell.dim ? `opacity="${COLORS.dimOpacity}"` : '',
    ].filter(Boolean);
    if (cell.inverse) {
      out.push(`<rect x="${n(x)}" y="${n(top + 1)}" width="${n((j - i) * CW)}" height="${n(LH - 2)}" fill="${color(cell)}" opacity="0.85"/>`);
    }
    if (text.trim()) out.push(`<text ${attrs.join(' ')}>${esc(text)}</text>`);
    i = j;
  }
  return out;
}

function frameSize(scenes) {
  const cols = Math.max(...scenes.flatMap((s) => s.lines.map(width)));
  const rowsCount = Math.max(...scenes.map((s) => s.lines.length));
  return {
    width: Math.ceil(PAD_X * 2 + cols * CW),
    height: Math.ceil(BAR_H + PAD_TOP + rowsCount * LH + PAD_BOTTOM),
  };
}

function chrome({ width, height }, title) {
  return [
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" fill="${COLORS.bg}" stroke="${COLORS.border}"/>`,
    `<path d="M0.5 ${BAR_H}H${width - 0.5}" stroke="${COLORS.border}"/>`,
    `<circle cx="20" cy="${BAR_H / 2}" r="6" fill="#ff5f57"/>`,
    `<circle cx="40" cy="${BAR_H / 2}" r="6" fill="#febc2e"/>`,
    `<circle cx="60" cy="${BAR_H / 2}" r="6" fill="#28c840"/>`,
    `<text x="${width / 2}" y="${BAR_H / 2 + 4.5}" text-anchor="middle" fill="#7d8590" font-size="12.5">${esc(title)}</text>`,
  ];
}

// SMIL opacity animation over a looping timeline of `total` seconds.
function opacityAnim(points, total) {
  const keyTimes = points.map(([t]) => n(t / total)).join(';');
  const values = points.map(([, v]) => v).join(';');
  return `<animate attributeName="opacity" dur="${total}s" repeatCount="indefinite" keyTimes="${keyTimes}" values="${values}" calcMode="linear"/>`;
}

function renderScene(scene, { start = 0, total = 0, id = 's' } = {}) {
  const out = [];
  const planned = [];
  const boundaries = [0, ...(scene.steps || []).map((s) => s.line), scene.lines.length];
  const delays = [0, ...(scene.steps || []).map((s) => s.at)];
  for (let seg = 0; seg < boundaries.length - 1; seg++) {
    const body = [];
    for (let row = boundaries[seg]; row < boundaries[seg + 1]; row++) {
      body.push(...shapes(parseLine(scene.lines[row]), BAR_H + PAD_TOP + row * LH, { planned, planBase: PALETTE[scene.planBase || 'empty'] }));
    }
    if (total && delays[seg] > 0) {
      const t = start + delays[seg];
      out.push(`<g opacity="1">${opacityAnim([[0, 0], [t, 0], [t + 0.25, 1], [total, 1]], total)}${body.join('')}</g>`);
    } else {
      out.push(...body);
    }
  }
  if (planned.length) {
    out.push(...planned.map((p) => p.base));
    if (total && scene.wipe) {
      // The sweep runs from the first planned cell to the last one.
      const left = Math.min(...planned.map((p) => p.x)) - CW;
      const w = Math.max(...planned.map((p) => p.x)) + CW * 2 - left;
      const a = start + scene.wipe.from;
      const b = start + scene.wipe.to;
      const anim = `<animate attributeName="width" dur="${total}s" repeatCount="indefinite" keyTimes="0;${n(a / total)};${n(b / total)};1" values="0;0;${n(w)};${n(w)}"/>`;
      out.push(`<clipPath id="${id}-wipe"><rect x="${n(left)}" y="0" width="0" height="4000">${anim}</rect></clipPath>`);
      out.push(`<g clip-path="url(#${id}-wipe)">${planned.map((p) => p.top).join('')}</g>`);
    } else {
      out.push(...planned.map((p) => p.top));
    }
  }
  return out;
}

const FONT = `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`;

function svgDocument(size, title, body, label) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}" role="img" aria-label="${esc(label)}">`,
    `<title>${esc(label)}</title>`,
    `<g font-family="${FONT}" font-size="${FONT_SIZE}">`,
    ...chrome(size, title),
    ...body,
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}

function staticSvg(scene, title, label) {
  const size = frameSize([scene]);
  return svgDocument(size, title, renderScene(scene), label);
}

// Scenes play one after another with a short crossfade, then loop.
function animatedSvg(scenes, durations, title, label) {
  const size = frameSize(scenes);
  const total = durations.reduce((a, b) => a + b, 0);
  const fade = 0.35;
  const body = [];
  let start = 0;
  scenes.forEach((scene, i) => {
    const end = start + durations[i];
    const points =
      i === 0
        ? [[0, 1], [end - fade, 1], [end, 0], [total - fade, 0], [total, 1]]
        : i === scenes.length - 1
          ? [[0, 0], [start, 0], [start + fade, 1], [total - fade, 1], [total, 0]]
          : [[0, 0], [start, 0], [start + fade, 1], [end - fade, 1], [end, 0], [total, 0]];
    body.push(`<g opacity="${i === 0 ? 1 : 0}">${opacityAnim(points, total)}`);
    body.push(...renderScene(scene, { start, total, id: `s${i}` }));
    body.push('</g>');
    start = end;
  });
  return svgDocument(size, title, body, label);
}

module.exports = { staticSvg, animatedSvg };
