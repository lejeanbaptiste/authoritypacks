import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addSearchString,
  containsLatinLetters,
  isValidSearchString,
} from './normalize.mjs';

test('containsLatinLetters catches ASCII, accented, and fullwidth', () => {
  assert.equal(containsLatinLetters('東京'), false);
  assert.equal(containsLatinLetters('OGカイ'), true);
  assert.equal(containsLatinLetters('Śūra'), true);
  assert.equal(containsLatinLetters('ＡＰＣ諸国'), true);
  assert.equal(containsLatinLetters('馬木IC'), true);
});

test('isValidSearchString rejects any Latin letter', () => {
  assert.equal(isValidSearchString('夏目漱石'), true);
  assert.equal(isValidSearchString('Self-help'), false);
  assert.equal(isValidSearchString('ACP諸国'), false);
  assert.equal(isValidSearchString('salary'), false);
});

test('addSearchString drops Latin surfaces', () => {
  const set = new Set();
  addSearchString(set, '東大寺');
  addSearchString(set, 'Tokyo');
  addSearchString(set, '東大寺OG');
  assert.deepEqual([...set], ['東大寺']);
});
