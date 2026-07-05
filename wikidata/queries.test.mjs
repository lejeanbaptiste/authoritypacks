import assert from 'node:assert/strict';
import test from 'node:test';
import { personAmbiguityQuery, personCountQuery, placeCountQuery } from './queries.mjs';

test('personCountQuery includes dynasty and language filter', () => {
  const q = personCountQuery({
    dynastyQid: 'Q9683',
    labelLang: 'zh-hant',
    excludeInstanceOf: ['Q15632617'],
  });
  assert.match(q, /wdt:P27 wd:Q9683/);
  assert.match(q, /LANG\(\?itemLabel\) = "zh-hant"/);
  assert.match(q, /Q15632617/);
});

test('personAmbiguityQuery groups by label', () => {
  const q = personAmbiguityQuery({ dynastyQid: 'Q1043', labelLang: 'zh-hant' });
  assert.match(q, /GROUP BY \?label/);
  assert.match(q, /HAVING \(COUNT\(DISTINCT \?item\) > 1\)/);
});

test('placeCountQuery uses instance-of values', () => {
  const q = placeCountQuery({
    labelLang: 'zh-hans',
    instanceOf: ['Q515', 'Q532'],
  });
  assert.match(q, /wd:Q515/);
  assert.match(q, /wd:Q532/);
});
