import test from 'node:test';
import assert from 'node:assert/strict';
import { hiraganaReading, isKanaDominant, kanaReadingsFromEntity } from './kanaReadings.mjs';

test('isKanaDominant', () => {
  assert.equal(isKanaDominant('なつめ そうせき'), true);
  assert.equal(isKanaDominant('夏目漱石'), false);
  assert.equal(isKanaDominant('ナツメ ソウセキ'), true);
});

test('hiraganaReading normalizes katakana', () => {
  assert.equal(hiraganaReading('ナツメ ソウセキ'), 'なつめ そうせき');
  assert.equal(hiraganaReading('なつめ そうせき'), 'なつめ そうせき');
});

test('kanaReadingsFromEntity — P1814 and kana alias', () => {
  const entity = {
    labels: { ja: { value: '夏目漱石' } },
    aliases: { ja: [{ value: 'ナツメ ソウセキ' }] },
    claims: {
      P1814: [{ mainsnak: { datavalue: { value: 'なつめ そうせき' } } }],
    },
  };
  const readings = kanaReadingsFromEntity(entity, 'ja');
  assert.ok(readings);
  assert.equal(readings.yomiHiragana, 'なつめ そうせき');
  assert.ok(readings.nameInKana.includes('なつめ そうせき'));
});

test('kanaReadingsFromEntity — kana-primary label without P1814', () => {
  const entity = {
    labels: { ja: { value: 'フジサン' } },
    claims: {},
  };
  const readings = kanaReadingsFromEntity(entity, 'ja');
  assert.ok(readings);
  assert.equal(readings.yomiHiragana, 'ふじさん');
});
