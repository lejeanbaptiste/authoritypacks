import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { orgSearchStringsFromRaw } from './orgSearchStrings.mjs';
import { compileNdlOrgsPack, orgCandidateFromRaw } from './compileOrgs.mjs';
import { orgCountQuery, orgPageQuery } from './queries.mjs';
import { readNdjson } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, 'fixtures');
const out = path.join(__dirname, '../packs/test-ndl');

test('orgSearchStringsFromRaw — strips location parenthetical', () => {
  const strings = orgSearchStringsFromRaw({
    authorityId: '00305304',
    authUri: 'http://example',
    name: '東大寺 (奈良市)',
    heading: '東大寺 (奈良市)',
    yomi: 'トウダイジ (ナラシ)',
  });
  assert.ok(strings.includes('東大寺 (奈良市)'));
  assert.ok(strings.includes('東大寺'));
  assert.ok(strings.includes('トウダイジ (ナラシ)'));
  assert.ok(strings.includes('とうだいじ (ならし)'));
});

test('orgCandidateFromRaw — kind org', () => {
  const c = orgCandidateFromRaw({
    authorityId: '001152848',
    authUri: 'http://id.ndl.go.jp/auth/ndlna/001152848',
    name: '日本曳家協会',
    yomi: 'ニホン ヒキヤ キョウカイ',
  });
  assert.ok(c);
  assert.equal(c.kind, 'org');
  assert.equal(c.metadata?.yomi, 'ニホン ヒキヤ キョウカイ');
});

test('org SPARQL templates use corporateNames scheme', () => {
  assert.match(orgCountQuery(), /ndlaScheme:corporateNames/);
  assert.match(orgCountQuery(), /!regex\(\?label, "--"\)/);
  assert.doesNotMatch(orgPageQuery(), /OFFSET/i);
});

test('NDL orgs compile fixture', () => {
  const rawPath = path.join(fixtures, 'sample-orgs.raw.ndjson');
  const result = compileNdlOrgsPack({
    rawPath,
    outDir: out,
    packId: 'test-ndl-orgs',
  });
  assert.equal(result.count, 2);

  const orgs = readNdjson(path.join(out, 'orgs.ndjson'));
  const todaiji = orgs.find((o) => o.authorityId === '00305304');
  assert.ok(todaiji);
  assert.equal(todaiji.kind, 'org');
  assert.ok(todaiji.searchStrings.includes('東大寺'));
});
