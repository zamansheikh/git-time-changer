'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { splitShellComment, artText } = require('../../src/cli/helpers');

test('splitShellComment drops a comment that zsh or cmd passed as arguments', () => {
  const result = splitShellComment(['art', 'Hello', '--push', '#', 'draw', 'it', 'and', 'push']);
  assert.deepEqual(result.argv, ['art', 'Hello', '--push']);
  assert.equal(result.comment, '# draw it and push');
  assert.deepEqual(splitShellComment(['fill', '--dry-run', '#', 'preview']).argv, ['fill', '--dry-run']);
});

test('splitShellComment keeps a # that may be the text to draw', () => {
  for (const argv of [['art', '#'], ['art', '#', '--dry-run'], ['art', '-n', '3', '#'], ['art', '#1'], ['art', 'C #']]) {
    assert.deepEqual(splitShellComment(argv), { argv, comment: '' });
  }
});

test('artText joins words and keeps plain text as it is', () => {
  assert.equal(artText(['Hello']), 'Hello');
  assert.equal(artText(['I', '♥', 'code']), 'I ♥ code');
  assert.equal(artText(['Hi!']), 'Hi!');
  assert.equal(artText(["Don't"]), "Don't");
  assert.equal(artText([]), '');
});

test('artText undoes common shell quoting slips', () => {
  assert.equal(artText(['Hi\\!']), 'Hi!', 'bash keeps the backslash in "Hi\\!"');
  assert.equal(artText(["'Hi!'"]), 'Hi!', "cmd passes 'Hi!' with its quotes");
  assert.equal(artText(["'Hello", "world'"]), 'Hello world', 'cmd splits quoted words');
  assert.equal(artText(['“Hello”']), 'Hello', 'curly double quotes from a chat app');
  assert.equal(artText(['‘Hi’']), 'Hi', 'curly single quotes from a chat app');
  assert.equal(artText(["'"]), "'", 'a lone quote is text');
});
