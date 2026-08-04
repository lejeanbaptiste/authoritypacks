import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isBlockedKindSearchString,
  kindSearchStringsFromWikidata,
} from './kindSearchStrings.mjs';

test('blocks foreign admin suffixes for place and org', () => {
  assert.equal(isBlockedKindSearchString('センター郡区', 'place'), true);
  assert.equal(isBlockedKindSearchString('モンロー・タウンシップ', 'org'), true);
  assert.equal(isBlockedKindSearchString('ビエンヴィル・パリッシュ', 'place'), true);
  assert.equal(isBlockedKindSearchString('東京', 'place'), false);
});

test('blocks underspecified short school names for org', () => {
  assert.equal(isBlockedKindSearchString('桜小学校', 'org'), true);
  assert.equal(isBlockedKindSearchString('中央中学校', 'org'), true);
  assert.equal(isBlockedKindSearchString('東京都立日比谷高等学校', 'org'), false);
});

test('blocks geo-generic org labels but not place Japan', () => {
  assert.equal(isBlockedKindSearchString('アメリカ', 'org'), true);
  assert.equal(isBlockedKindSearchString('日本', 'place'), false);
  assert.equal(isBlockedKindSearchString('日本', 'org'), true);
});

test('kindSearchStringsFromWikidata drops blocked aliases', () => {
  const strings = kindSearchStringsFromWikidata(
    {
      primaryLabel: '桜小学校',
      aliases: ['さくらしょうがっこう', 'Monroe Township', 'モンロー・タウンシップ'],
    },
    { kind: 'org' },
  );
  assert.equal(strings.includes('桜小学校'), false);
  assert.equal(strings.includes('モンロー・タウンシップ'), false);
});
