import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { compileCbdbPersons } from './compileRecords.mjs';
import { loadCbdbDynastyMap } from '../shared/dynastyMap.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/** CI-safe fixture (committed). Full dump used locally when present for integration test. */
const FIXTURE_SQLITE = path.join(__dirname, 'fixtures/sample.sqlite3');

const FULL_SQLITE_CANDIDATES = [
  process.env.CBDB_SQLITE,
  path.join(repoRoot, '.upstream/cbdb.sqlite3'),
  path.resolve(repoRoot, '../leaf-writer/test_project/authority-databases/cbdb.sqlite3'),
  path.resolve(repoRoot, '../leaf-writer/databases/cbdb_20260627.sqlite3'),
]
  .filter(Boolean)
  .find((p) => fs.existsSync(p));

function openDb(filePath) {
  return new Database(filePath, { readonly: true });
}

test('CBDB compile — 王安石 (person 1762)', () => {
  assert.ok(fs.existsSync(FIXTURE_SQLITE), `missing ${FIXTURE_SQLITE} — run scripts/create-cbdb-fixture.mjs`);
  const db = openDb(FIXTURE_SQLITE);
  try {
    const dynastyMap = loadCbdbDynastyMap(db);
    const persons = compileCbdbPersons(db, dynastyMap);
    const wang = persons.find((p) => p.authorityId === '1762');
    assert.ok(wang, '王安石 should be present');
    assert.equal(wang.primaryName, '王安石');
    assert.ok(wang.searchStrings.includes('王安石'));
    assert.ok(wang.searchStrings.includes('王介甫'), '字 should compile as 姓+字');
    assert.equal(wang.searchStrings.includes('介甫'), false, 'bare 字 excluded');
    assert.ok(wang.metadata?.description?.includes('王安石'));
    assert.ok(wang.metadata?.dynasty?.includes('宋') || wang.metadata?.description?.includes('Song'));
  } finally {
    db.close();
  }
});

test('CBDB compile — drops single-character search strings', () => {
  const db = openDb(FIXTURE_SQLITE);
  try {
    const dynastyMap = loadCbdbDynastyMap(db);
    const persons = compileCbdbPersons(db, dynastyMap);
    assert.ok(persons.length > 0);
    for (const p of persons) {
      for (const s of p.searchStrings) {
        assert.ok([...s].length >= 2, `single-char string "${s}" on ${p.authorityId}`);
      }
    }
  } finally {
    db.close();
  }
});

test('CBDB compile — fixture person count', () => {
  const db = openDb(FIXTURE_SQLITE);
  try {
    const dynastyMap = loadCbdbDynastyMap(db);
    const persons = compileCbdbPersons(db, dynastyMap);
    assert.ok(persons.length >= 5 && persons.length < 20, `unexpected fixture size: ${persons.length}`);
  } finally {
    db.close();
  }
});

test(
  'CBDB compile — full dump person count (integration)',
  { skip: !FULL_SQLITE_CANDIDATES },
  () => {
    const db = openDb(FULL_SQLITE_CANDIDATES);
    try {
      const dynastyMap = loadCbdbDynastyMap(db);
      const persons = compileCbdbPersons(db, dynastyMap);
      assert.ok(persons.length > 595_000 && persons.length < 615_000);
    } finally {
      db.close();
    }
  },
);
