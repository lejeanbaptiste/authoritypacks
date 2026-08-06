import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { resolveCbdbReferenceTables, stripCbdbReferenceDb } from './stripReferenceDb.mjs';

test('stripCbdbReferenceDb keeps person enrichment tables only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cbdb-strip-'));
  const srcPath = path.join(dir, 'full.sqlite3');
  const outPath = path.join(dir, 'cbdb-person.sqlite3');
  const src = new Database(srcPath);
  src.exec(`
    CREATE TABLE BIOG_MAIN (c_personid INTEGER, c_name_chn TEXT);
    CREATE TABLE ALTNAME_DATA (c_personid INTEGER, c_alt_name_chn TEXT);
    CREATE TABLE DYNASTIES (c_dy INTEGER, c_dynasty_chn TEXT);
    CREATE TABLE BIOG_ADDR_DATA (c_personid INTEGER, c_addr_id INTEGER);
    CREATE TABLE ADDR_CODES (c_addr_id INTEGER, c_name_chn TEXT);
    CREATE TABLE BIOG_ADDR_CODES (c_addr_type INTEGER, c_addr_desc_chn TEXT);
    CREATE TABLE POSTING_DATA (c_posting_id INTEGER, c_personid INTEGER);
    CREATE TABLE POSTED_TO_OFFICE_DATA (c_posting_id INTEGER, c_office_id INTEGER);
    CREATE TABLE OFFICE_CODES (c_office_id INTEGER, c_office_chn TEXT);
    CREATE TABLE KIN_DATA (c_personid INTEGER, c_kin_id INTEGER);
    CREATE TABLE PLACE_DATA (c_placeid INTEGER);
    INSERT INTO BIOG_MAIN VALUES (1, '王安石');
    INSERT INTO KIN_DATA VALUES (1, 2);
  `);
  src.close();

  const result = stripCbdbReferenceDb({ sqlitePath: srcPath, outPath });
  assert.ok(result.tables.includes('BIOG_MAIN'));
  assert.ok(result.tables.includes('POSTING_DATA'));
  assert.ok(!result.tables.includes('KIN_DATA'));

  const dest = new Database(outPath, { readonly: true });
  const names = dest.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name);
  assert.ok(names.includes('BIOG_MAIN'));
  assert.ok(!names.includes('KIN_DATA'));
  assert.ok(!names.includes('PLACE_DATA'));
  assert.equal(dest.prepare('SELECT c_name_chn FROM BIOG_MAIN').get().c_name_chn, '王安石');
  dest.close();
});

test('stripCbdbReferenceDb keeps CBDB (Hucker)-tagged office translations', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cbdb-strip-hucker-'));
  const srcPath = path.join(dir, 'full.sqlite3');
  const outPath = path.join(dir, 'cbdb-person.sqlite3');
  const src = new Database(srcPath);
  src.exec(`
    CREATE TABLE BIOG_MAIN (c_personid INTEGER, c_name_chn TEXT);
    CREATE TABLE OFFICE_CODES (
      c_office_id INTEGER,
      c_office_chn TEXT,
      c_office_trans TEXT
    );
    INSERT INTO BIOG_MAIN VALUES (1, '王安石');
    INSERT INTO OFFICE_CODES VALUES (1, '提舉', 'Supervisor (Hucker)');
    INSERT INTO OFFICE_CODES VALUES (2, '知縣', 'District Magistrate');
  `);
  src.close();

  stripCbdbReferenceDb({ sqlitePath: srcPath, outPath });
  const dest = new Database(outPath, { readonly: true });
  const hucker = dest.prepare(
    `SELECT c_office_trans FROM OFFICE_CODES WHERE c_office_chn = '提舉'`,
  ).get();
  const plain = dest.prepare(
    `SELECT c_office_trans FROM OFFICE_CODES WHERE c_office_chn = '知縣'`,
  ).get();
  assert.equal(hucker.c_office_trans, 'Supervisor (Hucker)');
  assert.equal(plain.c_office_trans, 'District Magistrate');
  dest.close();
});

test('resolveCbdbReferenceTables prefers live posting tables over ZZZ_', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cbdb-resolve-'));
  const srcPath = path.join(dir, 'full.sqlite3');
  const src = new Database(srcPath);
  src.exec(`
    CREATE TABLE BIOG_MAIN (c_personid INTEGER);
    CREATE TABLE ZZZ_POSTING_DATA (c_posting_id INTEGER);
    CREATE TABLE POSTING_DATA (c_posting_id INTEGER);
  `);
  const tables = resolveCbdbReferenceTables(src);
  src.close();
  assert.ok(tables.includes('POSTING_DATA'));
  assert.ok(!tables.includes('ZZZ_POSTING_DATA'));
});
