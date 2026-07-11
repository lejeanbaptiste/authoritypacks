import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileDila } from './compile.mjs';
import { readNdjson } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, 'fixtures');
const out = path.join(__dirname, '../packs/test-dila');

test('DILA compile fixture — persons and places', async () => {
  const result = compileDila({
    personsPath: path.join(fixtures, 'sample-persons.xml'),
    placesPath: path.join(fixtures, 'sample-places.xml'),
    districtsPath: path.join(fixtures, 'sample-places.xml'), // no districts in fixture
    outDir: out,
  });

  assert.equal(result.persons, 5);
  assert.equal(result.places, 4);

  const persons = readNdjson(path.join(out, 'persons.ndjson'));
  const jin = persons.find((p) => p.authorityId === 'A000001');
  assert.ok(jin);
  assert.equal(jin.primaryName, '金總持');
  assert.ok(jin.searchStrings.includes('寶輪大師'));
  assert.equal(jin.metadata?.dynasty, '北宋');

  const kalayashas = persons.find((p) => p.authorityId === 'A000004');
  assert.ok(kalayashas);
  assert.equal(kalayashas.metadata?.startYear, 383);
  assert.equal(kalayashas.metadata?.endYear, 442);
  assert.equal(kalayashas.metadata?.dynasty, '劉宋');

  const places = readNdjson(path.join(out, 'places.ndjson'));
  const jianye = places.find((p) => p.authorityId === 'PL000000000004');
  assert.ok(jianye);
  assert.equal(jianye.metadata?.startYear, 265);
  assert.equal(jianye.metadata?.endYear, 316);
  assert.equal(jianye.metadata?.description, '（265 ~ 316）郡級行政中心所在地');
});
