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

  const fictional = JSON.parse(fs.readFileSync(fixture, 'utf8').split('\n')[3]);
  const ficCand = personCandidateFromRaw(rawPersonFromEntity(fictional, 'zh-hant'), {
    dynasty: { id: 'tang', labelZh: '唐', startYear: 618, endYear: 907 },
  });
  assert.equal(ficCand?.metadata?.ana, 'fictional');
  assert.ok(ficCand?.searchStrings.includes('虬髯客'));

  fs.rmSync(tmp, { recursive: true, force: true });
});
