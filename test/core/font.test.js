'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FONT, normalize, renderText } = require('../../src/core/font');

test('every glyph is 7 rows of equal width, using only # and .', () => {
  for (const [ch, rows] of Object.entries(FONT)) {
    assert.equal(rows.length, 7, `${ch} has ${rows.length} rows`);
    for (const row of rows) {
      assert.equal(row.length, rows[0].length, `${ch} has uneven rows`);
      assert.match(row, /^[#.]+$/, `${ch} has odd characters`);
    }
  }
});

test('covers every printable ASCII character', () => {
  for (let code = 32; code <= 126; code++) {
    const ch = String.fromCharCode(code);
    assert.ok(FONT[ch], `missing glyph for "${ch}"`);
  }
});

test('lowercase letters are drawn as lowercase, not capitals', () => {
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
    assert.notDeepEqual(FONT[ch], FONT[ch.toUpperCase()], ch);
  }
  assert.equal(normalize('Hello World'), 'Hello World');
});

test('lowercase letters without ascenders leave the top rows empty', () => {
  for (const ch of 'acemnorsuvwxz') {
    assert.ok(!FONT[ch][0].includes('#') && !FONT[ch][1].includes('#'), ch);
  }
});

test('accented lowercase letters have their own glyphs', () => {
  for (const ch of 'áéíóúàèìòùâêîôûäëïöüãõñ') {
    assert.ok(FONT[ch], ch);
    const base = ch.normalize('NFD')[0];
    assert.notDeepEqual(FONT[ch], FONT[base], `${ch} looks the same as ${base}`);
  }
});

test('characters without room for an accent fall back to the plain letter', () => {
  assert.equal(normalize('ÉCOLE'), 'ECOLE');
  assert.equal(normalize('ça'), 'ca');
  assert.equal(normalize('Straße'), 'Strasse');
});

test('normalize tidies spaces and typographic punctuation', () => {
  assert.equal(normalize('  it’s   “fine” — ok… '), 'it\'s "fine" - ok...');
  assert.equal(normalize('I ❤️ git'), 'I ♥ git');
});

test('normalize rejects characters it cannot draw', () => {
  assert.throws(() => normalize('漢字'), /Can't draw "漢", "字"/);
  assert.throws(() => normalize('hi 🙂'), /"🙂"/);
});

test('renderText puts one empty column between characters', () => {
  const columns = renderText('Hi');
  assert.equal(columns.length, 5 + 1 + 3);
  assert.ok(columns.every((col) => col.length === 7));
  assert.deepEqual(columns[5], Array(7).fill(false));
  assert.deepEqual(columns[0], Array(7).fill(true));
});

test('mirrored brackets match their pair', () => {
  assert.deepEqual(FONT[')'], FONT['('].map((r) => [...r].reverse().join('')));
  assert.deepEqual(FONT['>'], FONT['<'].map((r) => [...r].reverse().join('')));
});
