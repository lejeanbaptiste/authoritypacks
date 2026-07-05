import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { compileCbdbPersons } from './compileRecords.mjs';
import { loadCbdbDynastyMap } from '../shared/dynastyMap.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlitePath = path.resolve(__dirname, '../../leaf-writer/databases/cbdb_20260627.sqlite3');

test('CBDB compile — 王安石 (person 1762)', () => {
  const db = new Database(sqlitePath, { readonly: true });
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
  const db = new Database(sqlitePath, { readonly: true });
  try {
    const dynastyMap = loadCbdbDynastyMap(db);
    const persons = compileCbdbPersons(db, dynastyMap);
    for (const p of persons) {
      for (const s of p.searchStrings) {
        assert.ok([...s].length >= 2, `single-char string "${s}" on ${p.authorityId}`);
      }
    }
  } finally {
    db.close();
  }
});

test('CBDB compile — person count in expected range', () => {
  const db = new Database(sqlitePath, { readonly: true });
  try {
    const dynastyMap = loadCbdbDynastyMap(db);
    const persons = compileCbdbPersons(db, dynastyMap);
    assert.ok(persons.length > 595_000 && persons.length < 615_000);
  } finally {
    db.close();
  }
});
