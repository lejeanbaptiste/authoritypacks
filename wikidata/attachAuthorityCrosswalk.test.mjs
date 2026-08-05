import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeQid,
  mergePersonCrosswalk,
  attachAuthorityCrosswalk,
} from './attachAuthorityCrosswalk.mjs';

test('normalizeQid accepts bare and Q-prefixed ids', () => {
  assert.equal(normalizeQid('Q5816'), 'Q5816');
  assert.equal(normalizeQid('5816'), 'Q5816');
  assert.equal(normalizeQid(''), '');
});

test('mergePersonCrosswalk preserves norbert and fills sidecar keys', () => {
  const merged = mergePersonCrosswalk(
    { norbert: 'person-1736' },
    { cbdb: '20614', viaf: '123' },
    'Q999',
  );
  assert.deepEqual(merged, {
    norbert: 'person-1736',
    cbdb: '20614',
    viaf: '123',
    wikidata: ['999'],
  });
});

test('mergePersonCrosswalk does not overwrite existing cbdb', () => {
  const merged = mergePersonCrosswalk({ cbdb: '1' }, { cbdb: '2', ndl: 'x' }, 'Q1');
  assert.equal(merged.cbdb, '1');
  assert.equal(merged.ndl, 'x');
});

test('attachAuthorityCrosswalk joins sidecar onto person packs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attach-cw-'));
  const packDir = path.join(dir, 'person-test');
  fs.mkdirSync(packDir);
  fs.writeFileSync(
    path.join(packDir, 'persons.ndjson'),
    [
      JSON.stringify({
        source: 'Wikidata',
        authorityId: 'Q1',
        kind: 'person',
        primaryName: 'A',
        searchStrings: ['A'],
        metadata: { norbert: undefined, crosswalk: { norbert: '5' } },
      }),
      JSON.stringify({
        source: 'Wikidata',
        authorityId: 'Q2',
        kind: 'person',
        primaryName: 'B',
        searchStrings: ['B'],
        metadata: {},
      }),
    ].join('\n') + '\n',
  );
  const crosswalkPath = path.join(dir, 'wikidata-authority-crosswalk.ndjson');
  fs.writeFileSync(
    crosswalkPath,
    JSON.stringify({ wikidata: 'Q1', crosswalk: { cbdb: '10', viaf: '99' } }) + '\n',
  );

  const result = await attachAuthorityCrosswalk({
    wikidataRoot: dir,
    crosswalkPath,
  });
  assert.equal(result.indexed, 1);
  assert.equal(result.packs['person-test'].withSidecar, 1);

  const rows = fs
    .readFileSync(path.join(packDir, 'persons.ndjson'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(rows[0].metadata.crosswalk, {
    norbert: '5',
    cbdb: '10',
    viaf: '99',
    wikidata: ['1'],
  });
  assert.deepEqual(rows[1].metadata.crosswalk, { wikidata: ['2'] });
});
