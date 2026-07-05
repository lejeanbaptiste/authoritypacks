#!/usr/bin/env node
/**
 * Compile CBDB sqlite → AuthorityCandidate NDJSON.
 *
 * Usage:
 *   node cbdb/compile.mjs [--sqlite PATH] [--out DIR]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { writePackFile } from '../shared/ndjson.mjs';
import { compileCbdb } from './compileRecords.mjs';
import { ALTNAME_EXCLUDE } from './constants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultSqlite = path.resolve(__dirname, '../../leaf-writer/databases/cbdb_20260627.sqlite3');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const sqlitePath = arg('--sqlite', defaultSqlite);
const outDir = arg('--out', path.resolve(__dirname, '../packs/cbdb'));

export function compileCbdbPack(options = {}) {
  const dbFile = options.sqlitePath ?? sqlitePath;
  const outputDir = options.outDir ?? outDir;

  const db = new Database(dbFile, { readonly: true });
  try {
    const { persons, places, offices } = compileCbdb(db);

    fs.mkdirSync(outputDir, { recursive: true });
    const personOut = writePackFile(outputDir, 'persons.ndjson', persons);
    const placeOut = writePackFile(outputDir, 'places.ndjson', places);
    const officeOut = writePackFile(outputDir, 'offices.ndjson', offices);

    const stringCount = (arr) => arr.reduce((n, c) => n + c.searchStrings.length, 0);

    const manifest = {
      id: 'cbdb',
      source: 'CBDB',
      buildToolVersion: '0.1.0',
      compiledAt: new Date().toISOString(),
      upstream: { sqlite: dbFile },
      license: 'CC-BY-NC-SA-4.0',
      attribution:
        'China Biographical Database (CBDB), Harvard FAS, Academia Sinica, Peking University.',
      files: {
        'persons.ndjson': {
          entityCount: personOut.count,
          stringCount: stringCount(persons),
        },
        'places.ndjson': { entityCount: placeOut.count, stringCount: stringCount(places) },
        'offices.ndjson': { entityCount: officeOut.count, stringCount: stringCount(offices) },
      },
      policy: {
        version: '2026-07-05',
        rulesRef: 'cbdb/README.md',
        altnameExclude: [...ALTNAME_EXCLUDE].sort((a, b) => a - b),
        minMatchLength: 2,
        officeTeiTag: 'roleName',
      },
    };
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    return {
      persons: personOut.count,
      places: placeOut.count,
      offices: officeOut.count,
      outDir: outputDir,
    };
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('CBDB compile');
  console.log(`  sqlite: ${sqlitePath}`);
  console.log(`  out:    ${outDir}`);
  const t0 = Date.now();
  const result = compileCbdbPack();
  console.log(
    `  → ${result.persons} persons, ${result.places} places, ${result.offices} offices (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
}
