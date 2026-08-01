import test from 'node:test';
import assert from 'node:assert/strict';
import { parseValueTuples } from './parseSqlDump.mjs';
import {
  collapseTypedNamesAfterZiClean,
  personNameEntriesFromNorbert,
  personSearchStringsFromNorbert,
} from './personNames.mjs';

test('parseValueTuples handles strings, NULL, and _binary', () => {
  const rows = [...parseValueTuples("(1,'卜顯',NULL,'疇人',NULL),(2,'蔡子元',NULL,NULL,_binary '\\0')")];
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].slice(0, 4), [1, '卜顯', null, '疇人']);
  assert.equal(rows[1][0], 2);
  assert.equal(rows[1][1], '蔡子元');
});

test('courtesy name is imported one-to-one without surname synthesis', () => {
  const entries = personNameEntriesFromNorbert({
    can_name: '王安石',
    names: [
      { type: 0, value: '王' },
      { type: 1, value: '安石' },
      { type: 2, value: '介甫' },
    ],
  });
  const byText = Object.fromEntries(entries.map((e) => [e.text, e.type]));
  assert.equal(byText['王安石'], 'primary');
  assert.equal(byText['介甫'], 'courtesy');
  assert.equal(byText['王介甫'], undefined);
});

test('family-prefixed courtesy values are stripped to bare 字', () => {
  const entries = personNameEntriesFromNorbert({
    can_name: '王安石',
    names: [
      { type: 0, value: '王' },
      { type: 1, value: '安石' },
      { type: 2, value: '王介甫' },
    ],
  });
  const byText = Object.fromEntries(entries.map((e) => [e.text, e.type]));
  assert.equal(byText['介甫'], 'courtesy');
  assert.equal(byText['王介甫'], undefined);
});

test('collapseTypedNamesAfterZiClean collapses prefixed + bare 字', () => {
  const collapsed = collapseTypedNamesAfterZiClean([
    { text: '安惇', type: 'primary' },
    { text: '安', type: 'family' },
    { text: '安處厚', type: 'courtesy' },
    { text: '處厚', type: 'courtesy' },
  ]);
  const courtesies = collapsed.filter((n) => n.type === 'courtesy').map((n) => n.text);
  assert.deepEqual(courtesies, ['處厚']);
});


test('compound Norbert name rows are not concatenated', () => {
  const entries = personNameEntriesFromNorbert({
    can_name: '成公世德',
    names: [
      { type: 11, value: '成公' },
      { type: 12, value: '世德' },
    ],
  });
  assert.deepEqual(entries.map((entry) => entry.text), ['成公世德', '成公', '世德']);
});

test('childhood names are excluded', () => {
  const entries = personNameEntriesFromNorbert({
    can_name: '王安石',
    names: [
      { type: 5, value: '獾郎' },
      { type: 6, value: '小字某' },
    ],
  });
  assert.deepEqual(entries, [{ text: '王安石', type: 'primary' }]);
});

test('intake names keep single-character 姓/名; tagging searchStrings do not', () => {
  const person = {
    can_name: '王安石',
    names: [
      { type: 0, value: '王' },
      { type: 1, value: '安石' },
      { type: 2, value: '介甫' },
    ],
  };
  const entries = personNameEntriesFromNorbert(person);
  const byType = Object.fromEntries(entries.map((e) => [e.type, e.text]));
  assert.equal(byType.family, '王');
  assert.equal(byType.given, '安石');
  assert.equal(byType.courtesy, '介甫');

  const search = personSearchStringsFromNorbert(person);
  assert.ok(search.includes('王安石'));
  assert.ok(search.includes('介甫'));
  assert.equal(search.includes('王'), false);
  assert.equal(search.includes('安石'), false, 'given name is intake-only, not a tag seed');
});

test('dump token nan is never a primary or typed name', () => {
  const entries = personNameEntriesFromNorbert({
    can_name: 'nan',
    names: [{ type: 10, value: '息齋道人' }],
  });
  assert.equal(
    entries.some((e) => /^nan$/i.test(e.text)),
    false,
  );
  assert.ok(entries.some((e) => e.text === '息齋道人'));
});
