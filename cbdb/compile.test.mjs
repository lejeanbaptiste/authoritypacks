import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { compileCbdbAppointments, compileCbdbPersons } from './compileRecords.mjs';
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

test('CBDB compile — 王安石 names[] carries LJB type per entry', () => {
  const db = openDb(FIXTURE_SQLITE);
  try {
    const dynastyMap = loadCbdbDynastyMap(db);
    const persons = compileCbdbPersons(db, dynastyMap);
    const wang = persons.find((p) => p.authorityId === '1762');
    assert.ok(wang?.names?.length, 'names[] should be populated');
    assert.equal(wang.names.length, wang.searchStrings.length, 'names[] mirrors searchStrings 1:1');
    const byText = Object.fromEntries(wang.names.map((n) => [n.text, n.type]));
    assert.equal(byText['王安石'], 'primary');
    assert.equal(byText['王介甫'], 'courtesy');
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

test('CBDB appointment compile preserves person and office assertions', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE POSTING_DATA (c_posting_id INTEGER, c_personid INTEGER);
      CREATE TABLE POSTED_TO_OFFICE_DATA (
        c_posting_id INTEGER,
        c_office_id INTEGER,
        c_appt_code TEXT,
        c_source TEXT
      );
      INSERT INTO POSTING_DATA VALUES (7, 1762);
      INSERT INTO POSTED_TO_OFFICE_DATA VALUES (7, 42, 'regular', 'source A');
    `);
    const appointments = compileCbdbAppointments(db, [{
      authorityId: '42',
      primaryName: '尚書',
      searchStrings: ['尚書'],
      source: 'CBDB',
      kind: 'office',
    }]);
    assert.deepEqual(appointments, [{
      source: 'CBDB',
      authorityId: '7:42:0',
      person: { source: 'CBDB', authorityId: '1762' },
      office: { source: 'CBDB', authorityId: '42', name: '尚書' },
      appointmentType: 'regular',
      sourceRef: 'source A',
    }]);
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
