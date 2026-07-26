#!/usr/bin/env node
/**
 * Compile Norbert MySQL dump → AuthorityCandidate NDJSON (persons + offices).
 *
 * Usage:
 *   node norbert/compile.mjs [--sql PATH] [--out DIR]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePackFile } from '../shared/ndjson.mjs';
import { compileNorbertPersons } from './compileRecords.mjs';
import { compileGeoAdminSuffixes, compileNorbertOffices } from './compileOffices.mjs';
import { loadNorbertTables } from './parseSqlDump.mjs';
import { NAME_TYPE_EXCLUDE } from './constants.mjs';
import { compileNorbertSurnamesFromNameRows } from './surnames.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultSql = path.resolve(__dirname, '../norbert_secret/norbert_humanum_2026-07-25-1938.sql');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const sqlPath = arg('--sql', defaultSql);
const outDir = arg('--out', path.resolve(__dirname, '../packs/norbert'));

const TABLES = [
  'person',
  'person_names',
  'date_dynasties',
  'nat_raw',
  'office',
];

export async function compileNorbertPack(options = {}) {
  const dumpPath = options.sqlPath ?? sqlPath;
  const outputDir = options.outDir ?? outDir;

  const tables = await loadNorbertTables(dumpPath, TABLES);
  const persons = compileNorbertPersons(
    tables.person,
    tables.person_names,
    tables.date_dynasties,
    [],
    tables.nat_raw,
  );
  const offices = compileNorbertOffices(tables.office);

  fs.mkdirSync(outputDir, { recursive: true });
  const personOut = writePackFile(outputDir, 'persons.ndjson', persons);
  const officeOut = writePackFile(outputDir, 'offices.ndjson', offices);
  const geoAdminSuffixes = compileGeoAdminSuffixes(offices);
  fs.writeFileSync(
    path.join(outputDir, 'geo-admin-suffixes.json'),
    `${JSON.stringify({ suffixes: geoAdminSuffixes, compiledAt: new Date().toISOString() }, null, 2)}\n`,
  );
  const surnames = compileNorbertSurnamesFromNameRows(tables.person_names);
  fs.writeFileSync(
    path.join(outputDir, 'surnames.json'),
    `${JSON.stringify({ surnames, compiledAt: new Date().toISOString() }, null, 2)}\n`,
  );
  const personStringCount = persons.reduce((n, c) => n + c.searchStrings.length, 0);
  const officeStringCount = offices.reduce((n, c) => n + c.searchStrings.length, 0);

  const manifest = {
    id: 'norbert',
    source: 'Norbert',
    buildToolVersion: '0.1.0',
    compiledAt: new Date().toISOString(),
    upstream: { sql: dumpPath },
    license: 'internal',
    attribution: 'Norbert person and office authority (Huma-Num).',
    files: {
      'persons.ndjson': {
        entityCount: personOut.count,
        stringCount: personStringCount,
      },
      'offices.ndjson': {
        entityCount: officeOut.count,
        stringCount: officeStringCount,
      },
      'surnames.json': {
        count: surnames.length,
      },
      'geo-admin-suffixes.json': {
        count: geoAdminSuffixes.length,
      },
    },
    policy: {
      version: '2026-07-25',
      rulesRef: 'norbert/README.md',
      nameTypeExclude: [...NAME_TYPE_EXCLUDE].sort((a, b) => a - b),
      minMatchLength: 2,
      officeMinMatchLength: 2,
    },
  };
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    persons: personOut.count,
    offices: officeOut.count,
    personStringCount,
    officeStringCount,
    outDir: outputDir,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Norbert compile');
  console.log(`  sql: ${sqlPath}`);
  console.log(`  out: ${outDir}`);
  const t0 = Date.now();
  compileNorbertPack()
    .then((result) => {
      console.log(
        `  → ${result.persons} persons (${result.personStringCount} strings), ${result.offices} offices (${result.officeStringCount} strings) (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
      );
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
