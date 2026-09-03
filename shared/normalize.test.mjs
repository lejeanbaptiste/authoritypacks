import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addSearchString,
  containsLatinLetters,
  isValidSearchString,
  normalizeTibetanSearchString,
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

test('normalizeTibetanSearchString strips terminal shad/tsheg and folds U+0F0C', () => {
  assert.equal(normalizeTibetanSearchString('བཀྲ་ཤིས།'), 'བཀྲ་ཤིས');
  assert.equal(normalizeTibetanSearchString('དབུས་གཙང་།'), 'དབུས་གཙང');
  assert.equal(normalizeTibetanSearchString('ཀ༌ཁ'), 'ཀ་ཁ');
  // interior tshegs are kept — they are syllable boundaries, not word ends
  assert.equal(normalizeTibetanSearchString('ཙོང་ཁ་པ'), 'ཙོང་ཁ་པ');
  // non-Tibetan is untouched
  assert.equal(normalizeTibetanSearchString('張衡'), '張衡');
});

test('addSearchString cleans Tibetan headwords for the matcher', () => {
  const set = new Set();
  addSearchString(set, 'བཀྲ་ཤིས།', { script: 'tibt' });
  addSearchString(set, 'ཐུབ་བསྟན་རྒྱ་མཚོ།', { script: 'tibt' });
  assert.deepEqual([...set], ['བཀྲ་ཤིས', 'ཐུབ་བསྟན་རྒྱ་མཚོ']);
});
