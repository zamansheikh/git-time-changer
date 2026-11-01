'use strict';

// Minimal interactive prompts: select, confirm and text input.

const readline = require('node:readline');
const { c, theme, sym, width, truncate, columns, hideCursor, showCursor } = require('./term');

class CancelledError extends Error {
  // interrupt = Ctrl+C (quit); otherwise Esc (go back).
  constructor(interrupt) {
    super(interrupt ? 'Interrupted' : 'Cancelled');
    this.name = 'CancelledError';
    this.interrupt = interrupt;
  }
}

const isInteractive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

const question = (message) => `${theme.accent('?')} ${c.bold(message)}`;
const answered = (message, value) => `${c.green(sym.ok)} ${c.bold(message)} ${c.gray(sym.dot)} ${theme.accent(value)}`;
const cancelled = (message) => `${c.gray(sym.err)} ${c.dim(message)}`;

// Pure renderers, shared by the prompts below and by scripts/showcase.js.

function renderSelect(message, options, index) {
  const labelWidth = Math.max(...options.map((o) => o.label.length));
  const lines = [`${question(message)} ${c.dim('↑↓ move · enter select · esc back')}`];
  options.forEach((option, i) => {
    const active = i === index;
    const pointer = active ? theme.accent(sym.pointer) : ' ';
    const label = active ? theme.accent(c.bold(option.label.padEnd(labelWidth))) : option.label.padEnd(labelWidth);
    const hint = option.hint ? `   ${c.dim(option.hint)}` : '';
    lines.push(truncate(`${pointer} ${label}${hint}`.trimEnd(), columns() - 3));
  });
  return lines.join('\n');
}

function renderConfirm(message, value) {
  const yes = value ? theme.accent(c.underline('Yes')) : c.dim('Yes');
  const no = value ? c.dim('No') : theme.accent(c.underline('No'));
  return `${question(message)} ${yes} ${c.gray('/')} ${no}`;
}

function renderInput(message, { value = '', initial = '', hint = '', error = '' } = {}) {
  let field;
  if (value) field = value + c.inverse(' ');
  else if (initial) field = c.inverse(initial[0]) + c.dim(initial.slice(1));
  else field = c.inverse(' ');
  const tail = error ? `  ${c.red(`${sym.err} ${error}`)}` : hint && !value ? `  ${c.dim(hint)}` : '';
  return `${question(message)} ${c.gray('›')} ${field}${tail}`;
}

// Number of terminal rows a block of text occupies (long lines wrap).
function rowCount(text) {
  const cols = columns();
  return text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(width(line) / cols)), 0);
}

function session({ render, onKey, indent = '  ' }) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    readline.emitKeypressEvents(stdin);
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    hideCursor();

    let rendered = 0;
    const draw = (text) => {
      const block = text
        .split('\n')
        .map((line) => indent + line)
        .join('\n');
      if (rendered > 1) stdout.write(`\x1b[${rendered - 1}A`);
      stdout.write(`\r\x1b[0J${block}`);
      rendered = rowCount(block);
    };

    const finish = (error, value, finalText) => {
      stdin.removeListener('keypress', handler);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      draw(finalText);
      stdout.write('\n');
      showCursor();
      if (error) reject(error);
      else resolve(value);
    };

    const control = {
      done: (value, finalText) => finish(null, value, finalText),
      redraw: () => draw(render()),
    };

    const handler = (str, key = {}) => {
      if (key.ctrl && key.name === 'c') return finish(new CancelledError(true), null, render.cancelText());
      if (key.name === 'escape') return finish(new CancelledError(false), null, render.cancelText());
      onKey(str, key, control);
    };

    stdin.on('keypress', handler);
    draw(render());
  });
}

async function select({ message, options, initial = 0 }) {
  let index = Math.max(0, Math.min(options.length - 1, initial));
  const render = () => renderSelect(message, options, index);
  render.cancelText = () => cancelled(message);
  return session({
    render,
    onKey(str, key, control) {
      const n = options.length;
      if (key.name === 'up' || key.name === 'k' || (key.name === 'tab' && key.shift)) index = (index - 1 + n) % n;
      else if (key.name === 'down' || key.name === 'j' || key.name === 'tab') index = (index + 1) % n;
      else if (key.name === 'home') index = 0;
      else if (key.name === 'end') index = n - 1;
      else if (str && /^[1-9]$/.test(str) && Number(str) <= n) index = Number(str) - 1;
      else if (key.name === 'return' || key.name === 'enter') {
        const option = options[index];
        return control.done(option.value, answered(message, option.answer || option.label));
      }
      control.redraw();
    },
  });
}

async function confirm({ message, initial = true }) {
  let value = initial;
  const render = () => renderConfirm(message, value);
  render.cancelText = () => cancelled(message);
  return session({
    render,
    onKey(str, key, control) {
      const done = (v) => control.done(v, answered(message, v ? 'Yes' : 'No'));
      if (str === 'y' || str === 'Y') return done(true);
      if (str === 'n' || str === 'N') return done(false);
      if (key.name === 'return' || key.name === 'enter') return done(value);
      if (['left', 'right', 'tab', 'h', 'l', 'up', 'down'].includes(key.name)) value = !value;
      control.redraw();
    },
  });
}

// Text input. The default is shown dimmed; enter accepts it, tab copies it for editing.
async function input({ message, initial = '', hint = '', validate = () => true }) {
  let value = '';
  let error = '';
  const render = () => renderInput(message, { value, initial, hint, error });
  render.cancelText = () => cancelled(message);
  return session({
    render,
    onKey(str, key, control) {
      if (key.name === 'return' || key.name === 'enter') {
        const result = value || initial;
        const check = validate(result);
        if (check === true) return control.done(result, answered(message, result || '(none)'));
        error = typeof check === 'string' ? check : 'Invalid value';
      } else if (key.name === 'backspace') {
        value = value.slice(0, -1);
        error = '';
      } else if (key.ctrl && key.name === 'u') {
        value = '';
        error = '';
      } else if (key.name === 'tab' && !value) {
        value = initial;
      } else if (str && !key.ctrl && !key.meta && str.length === 1 && str >= ' ') {
        value += str;
        error = '';
      }
      control.redraw();
    },
  });
}

module.exports = {
  select,
  confirm,
  input,
  isInteractive,
  CancelledError,
  render: { select: renderSelect, confirm: renderConfirm, input: renderInput, answered },
};
