import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorkLine, splitSemicolonField } from './parseWorks.mjs';
import { workSearchStringsFromRaw } from './workSearchStrings.mjs';
import { compileNdlWorksPack } from './compileWorks.mjs';
import { extractWorksToNdjson } from './parseWorks.mjs';
import { readNdjson } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, 'fixtures');
const out = path.join(__dirname, '../packs/test-ndl');

test('splitSemicolonField — trims and drops empties', () => {
  assert.deepEqual(splitSemicolonField('a ; b;  ;c'), ['a', 'b', 'c']);
});

test('parseWorkLine — real NDL row shape', () => {
  const row = parseWorkLine(
    "01089483\tUncle Tom's cabin\tアンクル・トムの小屋 ; トムじいやの小屋\tStowe, Harriet Beecher, 1811-1896\t20070611\t20240209",
  );
  assert.ok(row);
  assert.equal(row.id, '01089483');
  assert.equal(row.title, "Uncle Tom's cabin");
  assert.equal(row.variants.length, 2);
  assert.ok(row.variants.includes('トムじいやの小屋'));
});

test('workSearchStringsFromRaw — title plus variants', () => {
  const strings = workSearchStringsFromRaw({
    id: '1',
    title: 'Self-help',
    variants: ['自助論', 'セルフ・ヘルプ'],
    creators: [],
  });
  assert.deepEqual(strings, ['Self-help', '自助論', 'セルフ・ヘルプ']);
});

test('NDL works compile fixture', async () => {
  const rawPath = path.join(out, 'works.raw.ndjson');
  await extractWorksToNdjson({
    tsvPath: path.join(fixtures, 'sample-works.tsv'),
    outPath: rawPath,
  });

  const result = compileNdlWorksPack({
    rawPath,
    outDir: out,
    packId: 'test-ndl-works',
  });
  assert.equal(result.count, 3);

  const works = readNdjson(path.join(out, 'works.ndjson'));
  const walden = works.find((w) => w.authorityId === '01027888');
  assert.ok(walden);
  assert.equal(walden.kind, 'work');
  assert.equal(walden.source, 'NDL');
  assert.ok(walden.searchStrings.includes('森の生活'));
});
