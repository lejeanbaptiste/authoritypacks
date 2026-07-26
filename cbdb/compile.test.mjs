import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { compileCbdbAppointments, compileCbdbOrigins, compileCbdbPersons } from './compileRecords.mjs';
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
    const nameTexts = new Set(wang.names.map((n) => n.text));
    for (const s of wang.searchStrings) {
      assert.ok(nameTexts.has(s), `names[] should include search string ${s}`);
    }
    assert.ok(wang.names.length > wang.searchStrings.length, 'names[] superset of searchStrings');
    assert.equal(wang.searchStrings.includes('介甫'), false, 'bare 字 still excluded from searchStrings');
    const byText = Object.fromEntries(wang.names.map((n) => [n.text, n.type]));
    assert.equal(byText['王安石'], 'primary');
    assert.equal(byText['王介甫'], 'courtesy');
    assert.equal(byText['介甫'], 'courtesy');
    assert.equal(byText['王'], 'family');
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

test('CBDB origin assertions preserve category, source, and coordinates', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE BIOG_ADDR_DATA (
        c_personid INTEGER, c_addr_id INTEGER, c_addr_type INTEGER,
        c_sequence INTEGER, c_firstyear INTEGER, c_lastyear INTEGER,
        c_source TEXT, c_pages TEXT, c_notes TEXT, c_natal INTEGER, c_delete INTEGER
      );
      CREATE TABLE ADDR_CODES (
        c_addr_id INTEGER, c_name_chn TEXT, c_admin_type TEXT, x_coord REAL, y_coord REAL
      );
      CREATE TABLE BIOG_ADDR_CODES (c_addr_type INTEGER, c_addr_desc_chn TEXT);
      INSERT INTO BIOG_ADDR_CODES VALUES (1, '籍貫'), (8, '出生地');
      INSERT INTO ADDR_CODES VALUES (42, '鄱陽', NULL, 116.68, 28.21);
      INSERT INTO BIOG_ADDR_DATA VALUES (1762, 42, 1, 1, NULL, NULL, 'source', 'p. 2', 'note', 1, 0);
    `);
    const origins = compileCbdbOrigins(db);
    assert.deepEqual(origins.get(1762), [{
      source: 'CBDB',
      originType: 'jiguan',
      placeName: '鄱陽',
      placeAuthorityId: '42',
      sourceCategory: '籍貫',
      placeType: undefined,
      sourceRef: 'source p. 2',
      note: 'note',
      qualification: 'natal',
      geo: { lat: 28.21, lon: 116.68 },
    }]);
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
      // Range widened after `names[]` became a superset of `searchStrings`:
      // persons who previously had zero valid search strings but do have a
      // bare surname/mingzi now qualify via `names[]` alone.
      assert.ok(persons.length > 650_000 && persons.length < 670_000);
    } finally {
      db.close();
    }
  },
);
