import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  entityMatchesPersonSlice,
  rawPersonFromEntity,
  timeClaimYear,
} from './entityParse.mjs';
import { extractWikidataPersons } from './extract.mjs';
import { compileWikidataPersonPack, personCandidateFromRaw } from './compile.mjs';
import { rawPersonMatchesDynasty } from './entityParse.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, 'fixtures/tang-persons.jsonl');

test('timeClaimYear parses Wikidata time', () => {
  const entity = {
    claims: {
      P569: [
        {
          mainsnak: {
            datavalue: { value: { time: '+0701-00-00T00:00:00Z' } },
          },
        },
      ],
    },
  };
  assert.equal(timeClaimYear(entity, 'P569'), 701);
});

test('raw person rows preserve names without synthesizing components', () => {
  const entity = {
    type: 'item',
    id: 'Q42',
    labels: {
      'zh-hant': { value: '甲乙' },
    },
    aliases: {
      'zh-hant': [{ value: '甲子' }],
    },
    descriptions: {
    },
    claims: {
      P1705: [{ mainsnak: { datavalue: { value: '甲乙' } } }],
      P31: [],
    },
  };

  const raw = rawPersonFromEntity(entity, 'zh-hant');
  assert.deepEqual(raw?.aliases, ['甲子']);
});

test('entityMatchesPersonSlice requires zh-hant label and Tang P27', () => {
  const lines = fs.readFileSync(fixture, 'utf8').trim().split('\n');
  const libai = JSON.parse(lines[0]);
  const noLabel = JSON.parse(lines[4]);

  assert.equal(
    entityMatchesPersonSlice(libai, { dynastyQid: 'Q9683', labelLang: 'zh-hant' }),
    true,
  );
  assert.equal(
    entityMatchesPersonSlice(noLabel, { dynastyQid: 'Q9683', labelLang: 'zh-hant' }),
    false,
  );
});

test('extract fixture → compile Tang pack', async () => {
  const tmp = fs.mkdtempSync(path.join(path.dirname(fixture), 'tmp-wd-'));
  const rawDir = path.join(tmp, 'raw');
  const packDir = path.join(tmp, 'pack');

  const extracted = await extractWikidataPersons({
    dumpPath: fixture,
    dynastyId: 'tang',
    languageId: 'zh-hant',
    outDir: rawDir,
  });
  assert.equal(extracted.count, 4, 'includes 李某 in raw; en-only row skipped');

  const compiled = compileWikidataPersonPack({
    rawPath: path.join(rawDir, 'persons.raw.ndjson'),
    dynastyId: 'tang',
    languageId: 'zh-hant',
    outDir: packDir,
  });
  assert.equal(compiled.count, 3);

  const libai = personCandidateFromRaw(
    rawPersonFromEntity(JSON.parse(fs.readFileSync(fixture, 'utf8').split('\n')[0]), 'zh-hant'),
    {
      dynasty: {
        id: 'tang',
        labelZh: '唐',
        startYear: 618,
        endYear: 907,
      },
    },
  );
  assert.ok(libai?.searchStrings.includes('李白'));
  assert.ok(libai?.searchStrings.includes('李太白'));
  assert.equal(libai?.metadata?.crosswalk, undefined);

  const fictional = JSON.parse(fs.readFileSync(fixture, 'utf8').split('\n')[3]);
  const ficCand = personCandidateFromRaw(rawPersonFromEntity(fictional, 'zh-hant'), {
    dynasty: { id: 'tang', labelZh: '唐', startYear: 618, endYear: 907 },
  });
  assert.equal(ficCand?.metadata?.ana, 'fictional');
  assert.ok(ficCand?.searchStrings.includes('虬髯客'));
  assert.equal(ficCand?.metadata?.yomi, undefined);
  assert.equal(ficCand?.metadata?.yomiHiragana, undefined);

  const soseki = {
    type: 'item',
    id: 'Q180903',
    labels: { ja: { value: '夏目漱石' } },
    aliases: { ja: [{ value: '夏目金之助' }] },
    claims: {
      P31: [
        {
          mainsnak: {
            snaktype: 'value',
            datavalue: { type: 'wikibase-entityid', value: { id: 'Q5' } },
          },
        },
      ],
      P27: [
        {
          mainsnak: {
            snaktype: 'value',
            datavalue: { type: 'wikibase-entityid', value: { id: 'Q17' } },
          },
        },
      ],
      P1814: [{ mainsnak: { snaktype: 'value', datavalue: { value: 'なつめ そうせき' } } }],
    },
  };
  const sosekiRaw = rawPersonFromEntity(soseki, 'ja');
  assert.ok(sosekiRaw);
  assert.equal(sosekiRaw.yomiHiragana, 'なつめ そうせき');
  assert.deepEqual(sosekiRaw.nameInKana, ['なつめ そうせき']);
  assert.equal(
    entityMatchesPersonSlice(soseki, {
      labelLang: 'ja',
      membership: 'country-p27',
      countryQids: ['Q17'],
    }),
    true,
  );
  assert.equal(
    entityMatchesPersonSlice(soseki, {
      labelLang: 'ja',
      membership: 'dynasty-p27',
      dynastyQids: ['Q9683'],
    }),
    false,
  );

  const withIds = {
    ...JSON.parse(fs.readFileSync(fixture, 'utf8').split('\n')[0]),
    claims: {
      ...JSON.parse(fs.readFileSync(fixture, 'utf8').split('\n')[0]).claims,
      P497: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: '0005581' } } }],
      P214: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: '24645678' } } }],
    },
  };
  const libaiRaw = rawPersonFromEntity(withIds, 'zh-hant');
  assert.equal(libaiRaw?.crosswalk?.cbdb, '5581');
  assert.equal(libaiRaw?.crosswalk?.viaf, '24645678');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('extract --resume skips scanned entities and appends', async () => {
  const tmp = fs.mkdtempSync(path.join(path.dirname(fixture), 'tmp-wd-resume-'));
  const outDir = path.join(tmp, 'raw');
  fs.mkdirSync(outDir, { recursive: true });

  const checkpointPath = path.join(outDir, 'extract.checkpoint.json');
  fs.writeFileSync(
    checkpointPath,
    `${JSON.stringify({
      dumpPath: fixture,
      dynastyIds: ['tang'],
      dynastyQids: ['Q9683'],
      languageId: 'zh-hant',
      labelLang: 'zh-hant',
      entitiesScanned: 3,
      personsMatched: 2,
      skipUntil: 3,
      outFile: path.join(outDir, 'persons.raw.ndjson'),
    })}\n`,
  );
  fs.writeFileSync(
    path.join(outDir, 'persons.raw.ndjson'),
    `${JSON.stringify({ qid: 'Q5581', primaryLabel: '李白', aliases: [], p27: ['Q9683'], p31: ['Q5'] })}\n${JSON.stringify({ qid: 'Q3237588', primaryLabel: '李益', aliases: [], p27: ['Q9683'], p31: ['Q5'] })}\n`,
  );

  const result = await extractWikidataPersons({
    dumpPath: fixture,
    dynastyId: 'tang',
    languageId: 'zh-hant',
    outDir,
    resume: true,
  });

  assert.equal(result.count, 3, '2 existing + 1 new (虬髯客; 李某 has no compile strings but is in raw)');
  assert.equal(result.entitiesScanned, 5);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('compile filters master raw by dynasty p27', async () => {
  const tmp = fs.mkdtempSync(path.join(path.dirname(fixture), 'tmp-wd-filter-'));
  const rawPath = path.join(tmp, 'persons.raw.ndjson');
  fs.writeFileSync(
    rawPath,
    [
      { qid: 'Q1', primaryLabel: '唐人', aliases: [], p27: ['Q9683'], p31: ['Q5'] },
      { qid: 'Q2', primaryLabel: '宋人', aliases: [], p27: ['Q1107'], p31: ['Q5'] },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n')
      .concat('\n'),
  );

  assert.equal(rawPersonMatchesDynasty({ p27: ['Q9683'] }, 'Q9683'), true);
  assert.equal(rawPersonMatchesDynasty({ p27: ['Q1107'] }, 'Q9683'), false);

  const tangDir = path.join(tmp, 'tang');
  const tang = compileWikidataPersonPack({
    rawPath,
    dynastyId: 'tang',
    languageId: 'zh-hant',
    outDir: tangDir,
  });
  assert.equal(tang.count, 1);

  fs.rmSync(tmp, { recursive: true, force: true });
});
