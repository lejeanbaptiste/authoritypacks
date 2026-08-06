import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  addCrosswalkToPairMaps,
  createPairState,
  crosswalkRowFromEntity,
  extractCrosswalkConcordance,
  writePairConcordanceFiles,
} from './extractCrosswalkConcordance.mjs';

test('crosswalkRowFromEntity keeps only requested keys', () => {
  const entity = {
    id: 'Q9753',
    claims: {
      P214: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: '24645678' } } }],
      P497: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: '0001762' } } }],
      P349: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: '00621584' } } }],
      P1187: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: 'A001492' } } }],
    },
  };
  const row = crosswalkRowFromEntity(entity, ['viaf', 'cbdb', 'ndl']);
  assert.deepEqual(row, {
    wikidata: 'Q9753',
    crosswalk: { viaf: '24645678', cbdb: '1762', ndl: '00621584' },
  });
  assert.deepEqual(crosswalkRowFromEntity(entity, ['dila'])?.crosswalk, { dila: 'A001492' });
});

test('addCrosswalkToPairMaps skips ambiguous authority ids', () => {
  const pairState = createPairState();
  addCrosswalkToPairMaps('Q1', { viaf: '99' }, pairState);
  addCrosswalkToPairMaps('Q2', { viaf: '99' }, pairState);
  assert.equal(pairState.viaf.map.get('99'), 'Q1');
  assert.equal(pairState.viaf.ambiguous, 1);
});

test('extractCrosswalkConcordance writes crosswalk rows and pair sidecars', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crosswalk-extract-'));
  const dumpPath = path.join(dir, 'mini.jsonl');
  fs.writeFileSync(
    dumpPath,
    [
      JSON.stringify({
        id: 'Q31',
        claims: {
          P214: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: '144248059' } } }],
        },
      }),
      JSON.stringify({
        id: 'Q9753',
        claims: {
          P497: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: '1762' } } }],
          P349: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: '00621584' } } }],
        },
      }),
      JSON.stringify({ id: 'Q999', claims: {} }),
      '',
    ].join('\n'),
    'utf8',
  );

  const outDir = path.join(dir, 'out');
  const meta = await extractCrosswalkConcordance({
    dumpPath,
    outDir,
    keys: ['viaf', 'cbdb', 'ndl'],
    progressEvery: 0,
    checkpointEvery: 0,
  });

  assert.equal(meta.rowsMatched, 2);
  assert.equal(meta.pairCounts.viaf, 1);
  assert.equal(meta.pairCounts.cbdb, 1);
  assert.equal(meta.pairCounts.ndl, 1);

  const crosswalkLines = fs
    .readFileSync(path.join(outDir, 'wikidata-authority-crosswalk.ndjson'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(crosswalkLines, [
    { wikidata: 'Q31', crosswalk: { viaf: '144248059' } },
    { wikidata: 'Q9753', crosswalk: { cbdb: '1762', ndl: '00621584' } },
  ]);

  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outDir, 'viaf-wikidata-concordance.ndjson'), 'utf8')), {
    wikidata: 'Q31',
    viaf: '144248059',
  });
});

test('writePairConcordanceFiles sorts output deterministically', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-write-'));
  const pairState = createPairState();
  pairState.cbdb.map.set('2', 'Q2');
  pairState.cbdb.map.set('1', 'Q1');
  writePairConcordanceFiles(pairState, dir);
  const lines = fs.readFileSync(path.join(dir, 'cbdb-wikidata-concordance.ndjson'), 'utf8').trim().split('\n');
  assert.deepEqual(lines.map((line) => JSON.parse(line)), [
    { wikidata: 'Q1', cbdb: '1' },
    { wikidata: 'Q2', cbdb: '2' },
  ]);
});
