#!/usr/bin/env node
/**
 * Build cbdb/fixtures/sample.sqlite3 from a full CBDB dump (local dev only).
 *
 * Usage: node scripts/create-cbdb-fixture.mjs [--sqlite PATH]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const candidates = [
  arg('--sqlite', null),
  path.join(repoRoot, '.upstream/cbdb.sqlite3'),
  path.resolve(repoRoot, '../leaf-writer/test_project/authority-databases/cbdb.sqlite3'),
  path.resolve(repoRoot, '../leaf-writer/databases/cbdb_20260627.sqlite3'),
].filter(Boolean);

const sourcePath = candidates.find((p) => fs.existsSync(p));
if (!sourcePath) {
  console.error('Full CBDB sqlite not found. Pass --sqlite PATH');
  process.exit(1);
}

const fixtureDir = path.join(repoRoot, 'cbdb/fixtures');
const fixturePath = path.join(fixtureDir, 'sample.sqlite3');
const seedPersonIds = [1762, 1, 2, 3, 4];

fs.mkdirSync(fixtureDir, { recursive: true });
if (fs.existsSync(fixturePath)) fs.unlinkSync(fixturePath);

const src = new Database(sourcePath, { readonly: true });
const dest = new Database(fixturePath);

const escapedSource = sourcePath.replace(/'/g, "''");
dest.exec(`ATTACH DATABASE '${escapedSource}' AS src`);

for (const table of ['BIOG_MAIN', 'DYNASTIES', 'ALTNAME_DATA']) {
  dest.exec(`CREATE TABLE ${table} AS SELECT * FROM src.${table} WHERE 0`);
}

dest.exec(`INSERT INTO DYNASTIES SELECT * FROM src.DYNASTIES`);

const idList = seedPersonIds.join(',');
dest.exec(`INSERT INTO BIOG_MAIN SELECT * FROM src.BIOG_MAIN WHERE c_personid IN (${idList})`);
dest.exec(
  `INSERT INTO ALTNAME_DATA SELECT * FROM src.ALTNAME_DATA WHERE c_personid IN (${idList})`,
);

const extraIds = src
  .prepare(
    `SELECT DISTINCT c_personid FROM ALTNAME_DATA
     WHERE LENGTH(TRIM(c_alt_name_chn)) = 1
     LIMIT 5`,
  )
  .all()
  .map((r) => r.c_personid)
  .filter((id) => !seedPersonIds.includes(id));

for (const personId of extraIds) {
  dest.exec(`INSERT OR IGNORE INTO BIOG_MAIN SELECT * FROM src.BIOG_MAIN WHERE c_personid = ?`, [
    personId,
  ]);
  dest.exec(
    `INSERT OR IGNORE INTO ALTNAME_DATA SELECT * FROM src.ALTNAME_DATA WHERE c_personid = ?`,
    [personId],
  );
}

dest.close();
src.close();

const stat = fs.statSync(fixturePath);
console.log(`Wrote ${fixturePath} (${stat.size} bytes)`);
