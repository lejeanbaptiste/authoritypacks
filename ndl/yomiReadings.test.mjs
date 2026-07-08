import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addYomiSearchStrings,
  kanaSegmentsFromTranscription,
  katakanaToHiragana,
  yomiReadingsFromRaw,
} from './yomiReadings.mjs';

test('katakanaToHiragana', () => {
  assert.equal(katakanaToHiragana('マツヤマシ'), 'まつやまし');
  assert.equal(katakanaToHiragana('トウキョウト タイトウク'), 'とうきょうと たいとうく');
});

test('kanaSegmentsFromTranscription — strips dates', () => {
  assert.deepEqual(kanaSegmentsFromTranscription('ナツメ, ソウセキ, 1867-1916'), ['ナツメ', 'ソウセキ']);
  assert.deepEqual(kanaSegmentsFromTranscription('トウキョウト タイトウク'), ['トウキョウト', 'タイトウク']);
});

test('yomiReadingsFromRaw — place and person', () => {
  const place = yomiReadingsFromRaw({ yomi: 'マツヤマシ' });
  assert.ok(place.katakana.includes('マツヤマシ'));
  assert.ok(place.hiragana.includes('まつやまし'));
  assert.equal(place.primaryKatakana, 'マツヤマシ');

  const person = yomiReadingsFromRaw({
    yomi: 'ナツメ, ソウセキ, 1867-1916',
    yomiAlt: ['ナツメ, キンノスケ'],
  });
  assert.ok(person.katakana.includes('ナツメ ソウセキ'));
  assert.ok(person.katakana.includes('ナツメ'));
  assert.ok(person.katakana.includes('キンノスケ'));
  assert.ok(person.hiragana.includes('なつめ'));
});

test('addYomiSearchStrings dedupes', () => {
  const out = [];
  const seen = new Set();
  const add = (s) => {
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  addYomiSearchStrings({ yomi: 'マツヤマシ' }, add);
  assert.ok(out.includes('マツヤマシ'));
  assert.ok(out.includes('まつやまし'));
});
