'use strict';

// Renders the gtc art font as rows of contribution-graph cells.

const { PALETTE } = require('../../src/ui/term');
const { renderText } = require('../../src/core/font');
const { createRng } = require('../../src/core/plan');

const CELL = 9;
const GAP = 2.5;
const PITCH = CELL + GAP;
const PAD = 28;
const LINE_GAP = 12;
const CAPTION = 26;
const HEADER = 74;
const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (v) => Number(v.toFixed(2));

/** sections: [{ title, lines: [text, ...] }] */
function fontSvg(sections, { title, subtitle }) {
  const rng = createRng('font');
  const lit = () => (rng() < 0.7 ? PALETTE.levels[4] : PALETTE.levels[3]);
  const blocks = sections.map((s) => ({ ...s, columns: s.lines.map((line) => renderText(line)) }));
  const maxCols = Math.max(...blocks.flatMap((b) => b.columns.map((c) => c.length)));
  const width = Math.ceil(PAD * 2 + maxCols * PITCH - GAP);
  const body = [];
  const defs = [];
  let y = HEADER;
  let line = 0;
  for (const block of blocks) {
    body.push(`<text x="${PAD}" y="${n(y + 15)}" fill="#7d8590" font-size="13" font-weight="600">${esc(block.title)}</text>`);
    y += CAPTION;
    for (const columns of block.columns) {
      // Empty cells come from one repeating pattern; only lit cells are drawn one by one.
      const id = `grid${line++}`;
      defs.push(
        `<pattern id="${id}" x="${PAD}" y="${n(y)}" width="${PITCH}" height="${PITCH}" patternUnits="userSpaceOnUse">` +
          `<rect width="${CELL}" height="${CELL}" rx="2" fill="${PALETTE.levels[0]}"/></pattern>`,
      );
      body.push(`<rect x="${PAD}" y="${n(y)}" width="${n(columns.length * PITCH - GAP)}" height="${n(7 * PITCH - GAP)}" fill="url(#${id})"/>`);
      columns.forEach((column, x) => {
        column.forEach((on, row) => {
          if (!on) return;
          body.push(`<rect x="${n(PAD + x * PITCH)}" y="${n(y + row * PITCH)}" width="${CELL}" height="${CELL}" rx="2" fill="${lit()}"/>`);
        });
      });
      y += 7 * PITCH + LINE_GAP;
    }
    y += 8;
  }
  const height = Math.ceil(y + PAD - LINE_GAP - 8);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">`,
    `<title>${esc(title)}</title>`,
    `<defs>${defs.join('')}</defs>`,
    `<g font-family="${SANS}">`,
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" fill="#0d1117" stroke="#30363d"/>`,
    `<text x="${PAD}" y="36" fill="#e6edf3" font-size="17" font-weight="600">${esc(title)}</text>`,
    `<text x="${PAD}" y="57" fill="#7d8590" font-size="13">${esc(subtitle)}</text>`,
    ...body,
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}

module.exports = { fontSvg };
