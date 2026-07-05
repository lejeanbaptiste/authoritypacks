import test from 'node:test';
import assert from 'node:assert/strict';
import { personSearchStringsFromWikidata } from './personSearchStrings.mjs';

test('蔣防 — bare 字 aliases become 姓+字 only', () => {
  const strings = personSearchStringsFromWikidata({
    primaryLabel: '蔣防',
    familyName: '蔣',
    aliases: ['子徴', '子微'],
  });
  assert.ok(strings.includes('蔣防'));
  assert.ok(strings.includes('蔣徴') || strings.includes('蔣微'));
  assert.equal(strings.includes('子徴'), false);
  assert.equal(strings.includes('子微'), false);
});

test('李益 — 君虞 as 字 not bare', () => {
  const strings = personSearchStringsFromWikidata({
    primaryLabel: '李益',
    familyName: '李',
    aliases: ['君虞'],
  });
  assert.ok(strings.includes('李益'));
  assert.ok(strings.includes('李君虞'));
  assert.equal(strings.includes('君虞'), false);
});

test('岑參 — drops birth-order alias 岑二十七', () => {
  const strings = personSearchStringsFromWikidata({
    primaryLabel: '岑參',
    familyName: '岑',
    aliases: ['岑二十七', '岑嘉州', '高岑'],
  });
  assert.ok(strings.includes('岑參'));
  assert.ok(strings.includes('岑嘉州'));
  assert.equal(strings.includes('岑二十七'), false);
  assert.equal(strings.includes('高岑'), false, 'shorter alias without surname prefix');
});

test('blocks placeholder 李某', () => {
  const strings = personSearchStringsFromWikidata({
    primaryLabel: '李某',
    aliases: [],
  });
  assert.equal(strings.length, 0);
});

test('李晟 — keeps long honorific aliases', () => {
  const strings = personSearchStringsFromWikidata({
    primaryLabel: '李晟',
    familyName: '李',
    aliases: ['西平郡王', '西平忠武王晟公', '良器'],
  });
  assert.ok(strings.includes('李晟'));
  assert.ok(strings.includes('西平郡王'));
  assert.ok(strings.includes('李良器'));
  assert.equal(strings.includes('良器'), false);
});
