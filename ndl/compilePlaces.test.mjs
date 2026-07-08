import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeSearchStringsFromRaw } from './placeSearchStrings.mjs';
import { compileNdlPlacesPack, placeCandidateFromRaw } from './compilePlaces.mjs';
import { placeCountQuery, placePageQuery } from './queries.mjs';
import { readNdjson } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, 'fixtures');
const out = path.join(__dirname, '../packs/test-ndl');

test('placeSearchStringsFromRaw — strips prefecture parenthetical', () => {
  const strings = placeSearchStringsFromRaw({
    authorityId: '1',
    authUri: 'http://example',
    name: '袖崎村 (山形県)',
    heading: '袖崎村 (山形県)',
  });
  assert.ok(strings.includes('袖崎村 (山形県)'));
  assert.ok(strings.includes('袖崎村'));
});

test('placeSearchStringsFromRaw — kana readings', () => {
  const strings = placeSearchStringsFromRaw({
    authorityId: '00267522',
    authUri: 'http://example',
    name: '東京都台東区',
    yomi: 'トウキョウト タイトウク',
  });
  assert.ok(strings.includes('トウキョウト タイトウク'));
  assert.ok(strings.includes('トウキョウトタイトウク'));
  assert.ok(strings.includes('とうきょうと たいとうく'));
});

test('placeCandidateFromRaw — kind place', () => {
  const c = placeCandidateFromRaw({
    authorityId: '00263620',
    authUri: 'http://id.ndl.go.jp/auth/ndlna/00263620',
    name: '松山市',
    yomi: 'マツヤマシ',
  });
  assert.ok(c);
  assert.equal(c.kind, 'place');
  assert.ok(c.searchStrings.includes('松山市'));
  assert.equal(c.metadata?.yomi, 'マツヤマシ');
  assert.equal(c.metadata?.yomiHiragana, 'まつやまし');
});

test('place SPARQL templates use geographicNames scheme', () => {
  assert.match(placeCountQuery(), /ndlaScheme:geographicNames/);
  assert.match(placeCountQuery(), /!regex\(\?label, "--"\)/);
  assert.doesNotMatch(placePageQuery(), /OFFSET/i);
});

test('NDL places compile fixture', () => {
  const rawPath = path.join(fixtures, 'sample-places.raw.ndjson');
  const result = compileNdlPlacesPack({
    rawPath,
    outDir: out,
    packId: 'test-ndl-places',
  });
  assert.equal(result.count, 2);

  const places = readNdjson(path.join(out, 'places.ndjson'));
  const matsuyama = places.find((p) => p.authorityId === '00263620');
  assert.ok(matsuyama);
  assert.equal(matsuyama.kind, 'place');
});
