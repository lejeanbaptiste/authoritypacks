import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { entityMatchesPersonSlice } from './entityParse.mjs';
import { extractWikidataPersons } from './extract.mjs';
import { compileWikidataPreMingPack } from './compile.mjs';
import { preMingMembershipSpec, rawPersonMatchesPreMing } from './periodMembership.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dynasties = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'dynasties.json'), 'utf8'),
).dynasties;
const spec = preMingMembershipSpec(dynasties);

test('rawPersonMatchesPreMing accepts Tang P27 and dated pre-Ming rows', () => {
  assert.equal(
    rawPersonMatchesPreMing({ p27: ['Q9683'], birthYear: 701, deathYear: 762 }, spec),
    true,
  );
  assert.equal(
    rawPersonMatchesPreMing({ p27: [], birthYear: 1100, deathYear: 1200 }, spec),
    true,
  );
  assert.equal(
    rawPersonMatchesPreMing({ p27: ['Q9903'], birthYear: 1400, deathYear: 1450 }, spec),
    false,
  );
  assert.equal(
    rawPersonMatchesPreMing({ p27: ['Q9903'], birthYear: 1300, deathYear: 1340 }, spec),
    true,
  );
});

test('entityMatchesPersonSlice pre-ming accepts date-only Song person', () => {
  const songByDate = {
    type: 'item',
    id: 'Q9000001',
    labels: { 'zh-hant': { language: 'zh-hant', value: '蘇軾' } },
    claims: {
      P31: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'wikibase-entityid', value: { id: 'Q5' } } } }],
      P569: [{ mainsnak: { snaktype: 'value', datavalue: { value: { time: '+1037-00-00T00:00:00Z' } } } }],
      P570: [{ mainsnak: { snaktype: 'value', datavalue: { value: { time: '+1101-00-00T00:00:00Z' } } } }],
    },
  };
  assert.equal(
    entityMatchesPersonSlice(songByDate, {
      labelLang: 'zh-hant',
      membership: 'pre-ming',
      preMingSpec: spec,
    }),
    true,
  );
});

test('extract pre-ming fixture includes date-only person', async () => {
  const tmp = fs.mkdtempSync(path.join(__dirname, 'tmp-pre-ming-'));
  const fixture = path.join(tmp, 'pre-ming-persons.jsonl');
  fs.writeFileSync(
    fixture,
    [
      {
        type: 'item',
        id: 'Q5581',
        labels: { 'zh-hant': { language: 'zh-hant', value: '李白' } },
        claims: {
          P31: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'wikibase-entityid', value: { id: 'Q5' } } } }],
          P27: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'wikibase-entityid', value: { id: 'Q9683' } } } }],
        },
      },
      {
        type: 'item',
        id: 'Q9000001',
        labels: { 'zh-hant': { language: 'zh-hant', value: '蘇軾' } },
        claims: {
          P31: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'wikibase-entityid', value: { id: 'Q5' } } } }],
          P569: [{ mainsnak: { snaktype: 'value', datavalue: { value: { time: '+1037-00-00T00:00:00Z' } } } }],
          P570: [{ mainsnak: { snaktype: 'value', datavalue: { value: { time: '+1101-00-00T00:00:00Z' } } } }],
        },
      },
      {
        type: 'item',
        id: 'Q9000002',
        labels: { 'zh-hant': { language: 'zh-hant', value: '晚明人' } },
        claims: {
          P31: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'wikibase-entityid', value: { id: 'Q5' } } } }],
          P27: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'wikibase-entityid', value: { id: 'Q9903' } } } }],
          P569: [{ mainsnak: { snaktype: 'value', datavalue: { value: { time: '+1400-00-00T00:00:00Z' } } } }],
        },
      },
    ]
      .map((row) => JSON.stringify(row))
      .join('\n')
      .concat('\n'),
  );

  const rawDir = path.join(tmp, 'raw');
  const extracted = await extractWikidataPersons({
    dumpPath: fixture,
    membership: 'pre-ming',
    languageId: 'zh-hant',
    outDir: rawDir,
  });
  assert.equal(extracted.count, 2);

  const packDir = path.join(tmp, 'pack');
  const compiled = compileWikidataPreMingPack({
    rawPath: path.join(rawDir, 'persons.raw.ndjson'),
    languageId: 'zh-hant',
    outDir: packDir,
  });
  assert.equal(compiled.count, 2);

  fs.rmSync(tmp, { recursive: true, force: true });
});
