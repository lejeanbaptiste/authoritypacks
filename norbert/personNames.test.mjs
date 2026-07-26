import test from 'node:test';
import assert from 'node:assert/strict';
import { parseValueTuples } from './parseSqlDump.mjs';
import { personNameEntriesFromNorbert } from './personNames.mjs';

test('parseValueTuples handles strings, NULL, and _binary', () => {
  const rows = [...parseValueTuples("(1,'卜顯',NULL,'疇人',NULL),(2,'蔡子元',NULL,NULL,_binary '\\0')")];
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].slice(0, 4), [1, '卜顯', null, '疇人']);
  assert.equal(rows[1][0], 2);
  assert.equal(rows[1][1], '蔡子元');
});

test('courtesy name is prefixed with surname', () => {
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
  assert.equal(byText['王介甫'], 'courtesy');
  assert.equal(byText['介甫'], undefined);
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
