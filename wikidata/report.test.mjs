import test from 'node:test';
import assert from 'node:assert/strict';
import { ambiguityCsv, ambiguousRows, ambiguityStats } from './report.mjs';

/** @type {import('../shared/types.mjs').AuthorityCandidate[]} */
const candidates = [
  {
    source: 'Wikidata',
    authorityId: 'Q1',
    kind: 'person',
    primaryName: '李白',
    searchStrings: ['李白', '李太白'],
  },
  {
    source: 'Wikidata',
    authorityId: 'Q2',
    kind: 'person',
    primaryName: '李益',
    searchStrings: ['李益', '李白'],
  },
  {
    source: 'Wikidata',
    authorityId: 'Q3',
    kind: 'person',
    primaryName: '王維',
    searchStrings: ['王維'],
  },
];

test('ambiguousRows finds shared search strings', () => {
  const rows = ambiguousRows(candidates);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].surface, '李白');
  assert.equal(rows[0].count, 2);
  assert.deepEqual(rows[0].authorityIds, ['Q1', 'Q2']);
});

test('ambiguityStats counts surfaces', () => {
  const stats = ambiguityStats(candidates);
  assert.equal(stats.entityCount, 3);
  assert.equal(stats.searchStringCount, 5);
  assert.equal(stats.uniqueSurfaces, 4);
  assert.equal(stats.ambiguousSurfaceCount, 1);
});

test('ambiguityCsv escapes quotes', () => {
  const csv = ambiguityCsv([
    {
      surface: 'Say "hello"',
      count: 2,
      authorityIds: ['Q1', 'Q2'],
      primaryNames: ['A', 'B'],
    },
  ]);
  assert.ok(csv.includes('"Say ""hello"""'));
});
