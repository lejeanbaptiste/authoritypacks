import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUsableJapanesePersonName, personSearchStringsFromRaw, parseYear } from './personSearchStrings.mjs';
import { compileNdlPersonsPack, personCandidateFromRaw } from './compilePersons.mjs';
import { authorityIdFromUri } from './constants.mjs';
import { personCountQuery, personPageQuery } from './queries.mjs';
import { readNdjson } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, 'fixtures');
const out = path.join(__dirname, '../packs/test-ndl');

test('authorityIdFromUri', () => {
  assert.equal(authorityIdFromUri('http://id.ndl.go.jp/auth/ndlna/00054222'), '00054222');
});

test('parseYear', () => {
  assert.equal(parseYear('1867'), 1867);
  assert.equal(parseYear('1910-1999'), 1910);
  assert.equal(parseYear(undefined), undefined);
});

test('personSearchStringsFromRaw — native name only', () => {
  const strings = personSearchStringsFromRaw({
    authorityId: '1',
    authUri: 'http://example',
    name: '夏目漱石',
    heading: '夏目, 漱石, 1867-1916',
  });
  assert.deepEqual(strings, ['夏目漱石']);
});

test('personSearchStringsFromRaw — kana readings stay out of tag strings', () => {
  const strings = personSearchStringsFromRaw({
    authorityId: '00054222',
    authUri: 'http://example',
    name: '夏目漱石',
    yomi: 'ナツメ, ソウセキ, 1867-1916',
    yomiAlt: ['ナツメ, キンノスケ'],
  });
  assert.deepEqual(strings, ['夏目漱石']);
});

test('personSearchStringsFromRaw — rejects Latin-only and dated names', () => {
  assert.equal(isUsableJapanesePersonName('夏目漱石'), true);
  assert.equal(isUsableJapanesePersonName('Natsume Soseki'), false);
  assert.equal(isUsableJapanesePersonName('夏目漱石 1867-1916'), false);
});

test('personCandidateFromRaw — birth/death metadata', () => {
  const c = personCandidateFromRaw({
    authorityId: '00054222',
    authUri: 'http://id.ndl.go.jp/auth/ndlna/00054222',
    name: '夏目漱石',
    yomi: 'ナツメ, ソウセキ, 1867-1916',
    birthYear: 1867,
    deathYear: 1916,
  });
  assert.ok(c);
  assert.equal(c.metadata?.startYear, 1867);
  assert.equal(c.metadata?.endYear, 1916);
  assert.equal(c.metadata?.yomi, undefined);
  assert.equal(c.metadata?.yomiHiragana, undefined);
  assert.deepEqual(c.searchStrings, ['夏目漱石']);
});

test('SPARQL query templates include correct namespaces', () => {
  assert.match(personCountQuery(), /http:\/\/ndl\.go\.jp\/dcndl\/terms\//);
  assert.doesNotMatch(personPageQuery(), /OFFSET/i);
  assert.match(
    personPageQuery({ afterAuth: 'http://id.ndl.go.jp/auth/ndlna/00001000' }),
    /FILTER \(\?auth > <http:\/\/id\.ndl\.go\.jp\/auth\/ndlna\/00001000>\)/,
  );
});

test('NDL persons compile fixture', () => {
  const rawPath = path.join(fixtures, 'sample-persons.raw.ndjson');
  const result = compileNdlPersonsPack({
    rawPath,
    outDir: out,
    packId: 'test-ndl-persons',
  });
  assert.equal(result.count, 2);

  const persons = readNdjson(path.join(out, 'persons.ndjson'));
  const soseki = persons.find((p) => p.authorityId === '00054222');
  assert.ok(soseki);
  assert.ok(soseki.searchStrings.includes('夏目漱石'));
});
