import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAcceptableJapanesePersonName,
  isBareJapaneseFamilyName,
  looksLikeJapaneseDharmaOrArtName,
  parseNdlPersonHeading,
  sanitizeJapanesePersonSearchSurface,
} from './japanesePersonName.mjs';

test('blocks bare common surnames and single kanji', () => {
  assert.equal(isAcceptableJapanesePersonName('田中'), false);
  assert.equal(isAcceptableJapanesePersonName('佐藤'), false);
  assert.equal(isAcceptableJapanesePersonName('林'), false);
  assert.equal(isAcceptableJapanesePersonName('松'), false);
  assert.equal(isBareJapaneseFamilyName('山本'), true);
});

test('keeps full names', () => {
  assert.equal(
    isAcceptableJapanesePersonName('夏目漱石', { heading: '夏目, 漱石, 1867-1916' }),
    true,
  );
  assert.equal(isAcceptableJapanesePersonName('小林夕岐子'), true);
  assert.equal(
    isAcceptableJapanesePersonName('今敏', { heading: '今, 敏' }),
    true,
  );
});

test('keeps dharma / art mononyms', () => {
  assert.equal(looksLikeJapaneseDharmaOrArtName('日蓮'), true);
  assert.equal(isAcceptableJapanesePersonName('日蓮', { heading: '日蓮, 1222-1282' }), true);
  assert.equal(isAcceptableJapanesePersonName('栄西'), true);
  assert.equal(isAcceptableJapanesePersonName('一遍上人'), true);
});

test('NDL occupation-only heading marks surname stub', () => {
  assert.equal(
    isAcceptableJapanesePersonName('田中', { heading: '田中, 漫画家' }),
    false,
  );
  assert.equal(
    isAcceptableJapanesePersonName('木村', { heading: '木村, pub. 2019' }),
    false,
  );
  const parsed = parseNdlPersonHeading('田中, 漫画家');
  assert.equal(parsed.family, '田中');
  assert.equal(parsed.given, '');
});

test('sanitize strips yomi, spaces, and joke aliases', () => {
  assert.equal(sanitizeJapanesePersonSearchSurface('いのうえ ひさし'), null);
  assert.equal(sanitizeJapanesePersonSearchSurface('三船 敏郎'), '三船敏郎');
  assert.equal(sanitizeJapanesePersonSearchSurface('空母そそそそ'), null);
  assert.equal(sanitizeJapanesePersonSearchSurface('庵野秀明'), '庵野秀明');
});

test('Wikidata familyName-only primary is rejected', () => {
  assert.equal(
    isAcceptableJapanesePersonName('佐藤', { familyName: '佐藤', givenName: '太郎' }),
    false,
  );
  assert.equal(
    isAcceptableJapanesePersonName('佐藤太郎', { familyName: '佐藤', givenName: '太郎' }),
    true,
  );
});
