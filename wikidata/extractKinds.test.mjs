import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileWikidataKindPack } from './compileKind.mjs';
import { compileWikidataPersonPackFromRaw } from './compile.mjs';
import { entityMatchesKind } from './kindMatch.mjs';
import { extractWikidataKinds } from './extractKinds.mjs';
import { rawFileNameForKind } from './rawFromEntity.mjs';
import { resolveExtractSelection } from './dynastySelect.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const fixture = path.join(__dirname, 'fixtures/bo-multi.jsonl');

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

test('entityMatchesKind label-only bo — requires bo label and P31', () => {
  const kinds = loadJson('wikidata/kind-queries.json').kinds;
  const lines = fs.readFileSync(fixture, 'utf8').trim().split('\n');
  const person = JSON.parse(lines[0]);
  const enOnly = JSON.parse(lines[4]);
  const slice = {
    labelLangs: ['bo'],
    membership: 'label-only',
  };

  assert.equal(entityMatchesKind(person, 'person', kinds, slice), true);
  assert.equal(entityMatchesKind(enOnly, 'person', kinds, slice), false);
  assert.equal(entityMatchesKind(JSON.parse(lines[3]), 'work', kinds, slice), true);
});

test('extractKinds fixture → compile bo packs', async () => {
  const tmp = fs.mkdtempSync(path.join(path.dirname(fixture), 'tmp-bo-'));
  const rawDir = path.join(tmp, 'raw');
  const kinds = ['person', 'place', 'org', 'work'];
  const selection = resolveExtractSelection([], { membership: 'label-only' });

  const extracted = await extractWikidataKinds({
    dumpPath: fixture,
    kinds,
    languageSlices: [{ languageId: 'bo', labelLangs: ['bo'] }],
    membership: 'label-only',
    selection,
    kindQueries: loadJson('wikidata/kind-queries.json').kinds,
    outDir: rawDir,
  });

  assert.equal(extracted.matched.bo.person, 1);
  assert.equal(extracted.matched.bo.place, 1);
  assert.equal(extracted.matched.bo.org, 1);
  assert.equal(extracted.matched.bo.work, 1);

  const personPack = compileWikidataPersonPackFromRaw({
    rawPath: path.join(rawDir, rawFileNameForKind('person')),
    languageId: 'bo',
    outDir: path.join(tmp, 'person-bo'),
  });
  assert.equal(personPack.count, 1);

  for (const kind of ['place', 'org', 'work']) {
    const compiled = compileWikidataKindPack({
      rawPath: path.join(rawDir, rawFileNameForKind(kind)),
      kind,
      languageId: 'bo',
      outDir: path.join(tmp, `${kind}-bo`),
      script: 'tibt',
    });
    assert.equal(compiled.count, 1, kind);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('extractKinds multi-language zh-hant + ja org/work', async () => {
  const fixtureMulti = path.join(__dirname, 'fixtures/zh-ja-orgs-works.jsonl');
  const tmp = fs.mkdtempSync(path.join(path.dirname(fixtureMulti), 'tmp-zh-ja-'));
  const rawDir = path.join(tmp, 'raw');
  const kinds = ['org', 'work'];
  const selection = resolveExtractSelection([], { membership: 'label-only' });

  const extracted = await extractWikidataKinds({
    dumpPath: fixtureMulti,
    kinds,
    languageSlices: [
      { languageId: 'zh-hant', labelLangs: ['zh-hant', 'zh-tw'] },
      { languageId: 'ja', labelLangs: ['ja'] },
    ],
    membership: 'label-only',
    selection,
    kindQueries: loadJson('wikidata/kind-queries.json').kinds,
    outDir: rawDir,
  });

  assert.equal(extracted.matched['zh-hant'].org, 2);
  assert.equal(extracted.matched['zh-hant'].work, 1);
  assert.equal(extracted.matched.ja.org, 1);
  assert.equal(extracted.matched.ja.work, 1);
  assert.ok(fs.existsSync(path.join(rawDir, 'zh-hant', 'orgs.raw.ndjson')));
  assert.ok(fs.existsSync(path.join(rawDir, 'ja', 'works.raw.ndjson')));

  fs.rmSync(tmp, { recursive: true, force: true });
});
