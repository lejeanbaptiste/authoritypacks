#!/usr/bin/env node
/**
 * Strip full CBDB sqlite to a person-enrichment reference database.
 *
 * Kept tables (A6 person enrichment only):
 *   BIOG_MAIN, ALTNAME_DATA, ALTNAME_CODES,
 *   DYNASTIES,
 *   BIOG_ADDR_DATA, ADDR_CODES, BIOG_ADDR_CODES,
 *   POSTING_DATA / ZZZ_POSTING_DATA,
 *   POSTED_TO_OFFICE_DATA / ZZZ_POSTED_TO_OFFICE_DATA,
 *   OFFICE_CODES
 *
 * Usage:
 *   node cbdb/stripReferenceDb.mjs --sqlite FULL.sqlite3 --out cbdb-person.sqlite3
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Core tables always copied when present. */
export const CBDB_PERSON_REFERENCE_TABLES = [
  'BIOG_MAIN',
  'ALTNAME_DATA',
  'ALTNAME_CODES',
  'DYNASTIES',
  'BIOG_ADDR_DATA',
  'ADDR_CODES',
  'BIOG_ADDR_CODES',
  'OFFICE_CODES',
];

/** Prefer live name; fall back to ZZZ_ archival alias used in some dumps. */
export const CBDB_PERSON_REFERENCE_ALIASES = [
  ['POSTING_DATA', 'ZZZ_POSTING_DATA'],
  ['POSTED_TO_OFFICE_DATA', 'ZZZ_POSTED_TO_OFFICE_DATA'],
];

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} name
 */
function tableExists(db, name) {
  return !!db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
  ).get(name);
}

/**
 * Resolve which physical table names to copy.
 * @param {import('better-sqlite3').Database} src
 * @returns {string[]}
 */
export function resolveCbdbReferenceTables(src) {
  /** @type {string[]} */
  const out = [];
  for (const name of CBDB_PERSON_REFERENCE_TABLES) {
    if (tableExists(src, name)) out.push(name);
  }
  for (const [preferred, fallback] of CBDB_PERSON_REFERENCE_ALIASES) {
    if (tableExists(src, preferred)) out.push(preferred);
    else if (tableExists(src, fallback)) out.push(fallback);
  }
  return out;
}

/**
 * @param {{ sqlitePath: string, outPath: string }} options
 */
export function stripCbdbReferenceDb({ sqlitePath, outPath }) {
  if (!fs.existsSync(sqlitePath)) throw new Error(`Missing CBDB sqlite: ${sqlitePath}`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

  const src = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const tables = resolveCbdbReferenceTables(src);
  if (!tables.includes('BIOG_MAIN')) {
    src.close();
    throw new Error('CBDB source is missing BIOG_MAIN');
  }

  const dest = new Database(outPath);
  dest.pragma('journal_mode = OFF');
  dest.pragma('synchronous = OFF');
  try {
    dest.exec(`ATTACH DATABASE '${sqlitePath.replace(/'/g, "''")}' AS src`);
    dest.exec('BEGIN');
    for (const table of tables) {
      dest.exec(`CREATE TABLE "${table}" AS SELECT * FROM src."${table}"`);
    }
    dest.exec('COMMIT');
    dest.exec('DETACH DATABASE src');
  } catch (err) {
    try { dest.exec('ROLLBACK'); } catch { /* ignore */ }
    dest.close();
    src.close();
    throw err;
  }
  dest.close();
  src.close();
  return { outPath, tables };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const defaultSqlite = [
    path.resolve(__dirname, '../.upstream/cbdb.sqlite3'),
    path.resolve(__dirname, '../../leaf-writer/databases/cbdb_20260627.sqlite3'),
  ].find((p) => fs.existsSync(p));
  const sqlitePath = path.resolve(arg('--sqlite', defaultSqlite ?? ''));
  const outPath = path.resolve(arg('--out', path.resolve(__dirname, '../dist/reference/cbdb-person.sqlite3')));
  if (!sqlitePath || !fs.existsSync(sqlitePath)) {
    console.error('Usage: node cbdb/stripReferenceDb.mjs --sqlite FULL.sqlite3 --out cbdb-person.sqlite3');
    process.exit(1);
  }
  const t0 = Date.now();
  const result = stripCbdbReferenceDb({ sqlitePath, outPath });
  const mb = (fs.statSync(result.outPath).size / 1e6).toFixed(2);
  console.log(`CBDB person reference: ${result.tables.join(', ')} → ${result.outPath} (${mb} MB, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
