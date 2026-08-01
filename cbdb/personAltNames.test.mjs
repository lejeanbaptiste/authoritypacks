import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isBlockedCbdbPersonString,
  personNameEntriesFromAlts,
  personSearchStringsFromAlts,
} from './personAltNames.mjs';

const WANG_ANSHI = {
  c_name_chn: '王安石',
  c_surname_chn: '王',
  c_mingzi_chn: '安石',
  alts: [
    { type: 4, value: '介甫' },
    { type: 5, value: '半山老人' },
    { type: 6, value: '文' },
    { type: 8, value: '王荊公' },
    { type: 10, value: '獾郎' },
  ],
};

test('blocks symbols, Latin, and surname+氏/某', () => {
  assert.equal(isBlockedCbdbPersonString('王*公', '王'), true);
  assert.equal(isBlockedCbdbPersonString('Wang', '王'), true);
  assert.equal(isBlockedCbdbPersonString('王氏', '王'), true);
  assert.equal(isBlockedCbdbPersonString('王某', '王'), true);
  assert.equal(isBlockedCbdbPersonString('王安石', '王'), false);
});

test('王安石 — searchStrings phase-1 only (excludes bare short forms)', () => {
  const strings = personSearchStringsFromAlts(WANG_ANSHI);
  assert.ok(strings.includes('王安石'));
  assert.ok(strings.includes('王介甫'));
  assert.ok(strings.includes('半山老人'));
  assert.ok(strings.includes('王荊公'));
  for (const excluded of ['介甫', '安石', '王', '文', '獾郎']) {
    assert.equal(strings.includes(excluded), false, `searchStrings must exclude ${excluded}`);
  }
});

test('王安石 — names[] includes bare short forms with types', () => {
  const entries = personNameEntriesFromAlts(WANG_ANSHI);
  const byText = Object.fromEntries(entries.map((e) => [e.text, e.type]));
  assert.equal(byText['王安石'], 'primary');
  assert.equal('王介甫' in byText, false, '姓+字 courtesy is search-only');
  assert.equal(byText['介甫'], 'courtesy');
  assert.equal(byText['王'], 'family');
  assert.equal(byText['安石'], 'given');
  assert.equal(byText['文'], 'posthumous');
  assert.equal(byText['半山老人'], 'art');
  assert.equal(byText['王荊公'], 'variant');
  assert.equal('獾郎' in byText, false, 'childhood type 10 excluded from names[]');
});

test('type 12 + 13 concatenate; Latin type 13 skipped', () => {
  const strings = personSearchStringsFromAlts({
    c_name_chn: '善堅',
    c_surname_chn: '善',
    c_mingzi_chn: '堅',
    alts: [
      { type: 12, value: '丁' },
      { type: 13, value: 'Tao' },
    ],
  });
  assert.equal(strings.includes('Tao'), false);
  assert.equal(strings.includes('丁'), false);
});

test('type 18 uses full value when already longer than surname', () => {
  const strings = personSearchStringsFromAlts({
    c_name_chn: '周旭鑑',
    c_surname_chn: '周',
    c_mingzi_chn: '旭鑑',
    alts: [{ type: 18, value: '丘旭鑑' }],
  });
  assert.ok(strings.includes('丘旭鑑'));
  assert.equal(strings.includes('丘旭鑑旭鑑'), false);
});

test('temple, dharma, and Daoist-name codes map correctly (道號 folds into dharma)', () => {
  const entries = personNameEntriesFromAlts({
    c_name_chn: '甲',
    c_surname_chn: '',
    c_mingzi_chn: '',
    alts: [
      { type: 14, value: '太祖' },
      { type: 19, value: '道濟禪師' },
      { type: 20, value: '純陽子' },
    ],
  });
  const byText = Object.fromEntries(entries.map((e) => [e.text, e.type]));
  assert.equal(byText['太祖'], 'temple');
  assert.equal(byText['道濟禪師'], 'dharma');
  assert.equal(byText['純陽子'], 'dharma');
});

test('secular name (12+13) and 別名 (3) map to variant; first-qualifying type wins on dedup', () => {
  const entries = personNameEntriesFromAlts({
    c_name_chn: '善堅',
    c_surname_chn: '善',
    c_mingzi_chn: '堅',
    alts: [
      { type: 12, value: '丁' },
      { type: 13, value: '謂' },
      { type: 3, value: '善堅曾用名' },
      { type: 4, value: '善堅曾用名' },
    ],
  });
  const byText = Object.fromEntries(entries.map((e) => [e.text, e.type]));
  assert.equal(byText['丁謂'], 'variant');
  assert.equal(byText['善堅曾用名'], 'variant', 'first entry to qualify keeps its type');
  assert.equal(entries.filter((e) => e.text === '善堅曾用名').length, 1, 'deduped, not doubled');
});

test('personSearchStringsFromAlts may include 姓+字 courtesy not stored in names[]', () => {
  const search = personSearchStringsFromAlts(WANG_ANSHI);
  const nameTexts = new Set(personNameEntriesFromAlts(WANG_ANSHI).map((e) => e.text));
  assert.ok(search.includes('王介甫'));
  assert.equal(nameTexts.has('王介甫'), false);
  assert.ok(nameTexts.has('介甫'));
  for (const s of search) {
    if (s === '王介甫') continue;
    assert.ok(nameTexts.has(s), `search string ${s} missing from names[]`);
  }
});
