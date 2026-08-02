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
import { compileNorbertAppointments } from './compileAppointments.mjs';
import { loadNorbertTables } from './parseSqlDump.mjs';
import { extractDynastyLabelsFromSql } from './sanitizeDump.mjs';
import { NAME_TYPE_EXCLUDE } from './constants.mjs';
import { compileNorbertSurnamesFromNameRows } from './surnames.mjs';
import { inferNorbertSourceRelations } from '../shared/officeGraph.mjs';
import { attachAppointmentsToPersons } from '../shared/appointmentIndex.mjs';
import { compileNorbertPersonWrappers } from './personWrappers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultSql = path.resolve(__dirname, '../norbert_secret/norbert-authority.sql');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const sqlPath = arg('--sql', defaultSql);
const outDir = arg('--out', path.resolve(__dirname, '../packs/norbert'));

/** Public allowlist tables needed for compile (see sanitizeDump DEFAULT_TABLES). */
const TABLES = [
  'person',
  'person_names',
  'nat_raw',
  'person_dynasties',
  'person_origin',
  'office',
  'officeholding_raw',
  'person_nt',
];

/**
 * Dynasty labels live in dynasty-labels.json beside the sanitized dump
 * (date_* tables are not shipped). Fall back to extracting from a private dump.
 * @param {string} dumpPath
 */
function loadDynastyLabels(dumpPath) {
  const sidecar = path.join(path.dirname(dumpPath), 'dynasty-labels.json');
  if (fs.existsSync(sidecar)) {
    const raw = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
    return raw.dynasties ?? {};
  }
  const sql = fs.readFileSync(dumpPath, 'utf8');
  return extractDynastyLabelsFromSql(sql);
}

export async function compileNorbertPack(options = {}) {
  const dumpPath = options.sqlPath ?? sqlPath;
  const outputDir = options.outDir ?? outDir;

  const tables = await loadNorbertTables(dumpPath, TABLES);
  const dynastyLabels = options.dynastyLabels ?? loadDynastyLabels(dumpPath);
  const persons = compileNorbertPersons(
    tables.person,
    tables.person_names,
    dynastyLabels,
    tables.person_dynasties,
    tables.nat_raw,
    tables.person_origin,
    tables.person_nt,
  );
  const offices = compileNorbertOffices(tables.office);
  const appointments = compileNorbertAppointments(tables.officeholding_raw, offices);
  attachAppointmentsToPersons(persons, appointments);

  const peopleById = new Map();
  for (const person of persons) {
    // Wrappers look up by raw SQL person_id; also key the namespaced form.
    const bare = String(person.authorityId).replace(/^person[-:]/i, '');
    peopleById.set(bare, person);
    peopleById.set(String(person.authorityId), person);
  }
  const personWrappers = compileNorbertPersonWrappers(
    tables.person_nt,
    peopleById,
  );

  fs.mkdirSync(outputDir, { recursive: true });
  const personOut = writePackFile(outputDir, 'persons.ndjson', persons);
  const officeOut = writePackFile(outputDir, 'offices.ndjson', offices);
  const appointmentOut = writePackFile(outputDir, 'appointments.ndjson', appointments);
  const wrapperOut = writePackFile(outputDir, 'person-wrappers.ndjson', personWrappers);
  const officeRelations = inferNorbertSourceRelations(offices);
  const officeRelationOut = writePackFile(
    outputDir,
    'office-relations.ndjson',
    officeRelations,
  );
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
    // Never record the private SQL path in a derived pack or manifest.
    upstream: { source: 'Norbert SQL dump' },
    license: 'internal',
    attribution: 'Norbert person and office authority (Huma-Num).',
    files: {
      'persons.ndjson': {
        entityCount: personOut.count,
        stringCount: personStringCount,
        originAssertionCount: persons.reduce((n, p) => n + (p.metadata?.origin?.length ?? 0), 0),
      },
      'offices.ndjson': {
        entityCount: officeOut.count,
        stringCount: officeStringCount,
      },
      'office-relations.ndjson': {
        relationCount: officeRelationOut.count,
      },
      'appointments.ndjson': {
        entityCount: appointmentOut.count,
      },
      'person-wrappers.ndjson': {
        entityCount: wrapperOut.count,
        stringCount: personWrappers.reduce((n, p) => n + p.searchStrings.length, 0),
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
    originAssertions: persons.reduce((n, p) => n + (p.metadata?.origin?.length ?? 0), 0),
    offices: officeOut.count,
    appointments: appointmentOut.count,
    personWrappers: wrapperOut.count,
    officeRelations: officeRelationOut.count,
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
        `  → ${result.persons} persons (${result.personStringCount} strings), ${result.personWrappers} wrappers, ${result.offices} offices (${result.officeStringCount} strings) (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
      );
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
