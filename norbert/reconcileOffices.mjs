#!/usr/bin/env node
/**
 * Derive Norbert office dates, build CBDB office concordance, and write
 * crosswalks into packs/norbert/offices.ndjson. Use this on the repo-root
 * `packs/` tree during development; `build:packs` runs the same steps
 * automatically (dates via compileNorbertPack, concordance in
 * build-pack-bundle.mjs).
 *
 * Usage:
 *   node norbert/reconcileOffices.mjs [--root .] [--hucker FILE]
 */
import fs from 'node:fs';
import path from 'node:path';
import { readNdjson, writeNdjson } from '../shared/ndjson.mjs';
import { deriveOfficeDates } from './deriveOfficeDates.mjs';
import { buildOfficeConcordance, integrateOfficeConcordance } from './officeConcordance.mjs';
import { indexHuckerOfficeEntries } from './huckerOfficeContinuity.mjs';
import { readHuckerPairs } from '../huckbot5000/lib.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const root = path.resolve(arg('--root', '.'));
const norbertDir = path.join(root, 'packs/norbert');
const cbdbOfficesPath = path.join(root, 'packs/cbdb/offices.ndjson');
const officesPath = path.join(norbertDir, 'offices.ndjson');
const personsPath = path.join(norbertDir, 'persons.ndjson');
const appointmentsPath = path.join(norbertDir, 'appointments.ndjson');
const relationsPath = path.join(norbertDir, 'office-relations.ndjson');
const concordancePath = path.join(norbertDir, 'office-concordance.ndjson');
const huckerPath = path.resolve(
  root,
  arg('--hucker', 'skunkworks/scripts/out/hucker_entries.ndjson'),
);

const offices = readNdjson(officesPath);
const persons = readNdjson(personsPath);
const appointments = readNdjson(appointmentsPath);
const relations = readNdjson(relationsPath);
const cbdbOffices = readNdjson(cbdbOfficesPath);

console.log('Deriving Norbert office dates from appointments…');
const { offices: datedOffices, stats } = deriveOfficeDates(offices, persons, appointments);
console.log(
  `  ${stats.officesWithEvidence} offices dated`
    + ` (${stats.singleDynasty} single-dynasty, ${stats.multiDynasty} multi-dynasty)`
    + ` from ${stats.appointmentsUsed} appointments`,
);

let huckerByZh = null;
if (fs.existsSync(huckerPath)) {
  huckerByZh = indexHuckerOfficeEntries(readHuckerPairs(huckerPath));
  console.log(`Loaded Hucker continuity index from ${path.relative(root, huckerPath)}`);
} else {
  console.warn(
    `WARNING: Hucker corpus not found at ${huckerPath}; undated Norbert offices will not be linked.`,
  );
}

console.log('Building office concordance (dated overlap + Hucker gate for undated)…');
const concordance = buildOfficeConcordance(datedOffices, cbdbOffices, { huckerByZh });
const byRule = concordance.reduce((acc, row) => {
  const rule = row.evidence?.rule ?? '?';
  acc[rule] = (acc[rule] ?? 0) + 1;
  return acc;
}, {});
console.log(`  ${concordance.length} Norbert→CBDB office links`, byRule);

console.log('Integrating crosswalks into Norbert offices…');
const integrated = integrateOfficeConcordance(concordance, datedOffices, relations);
console.log(`  ${integrated.applied} crosswalks applied`);

writeNdjson(officesPath, integrated.offices);
writeNdjson(relationsPath, integrated.relations);
writeNdjson(concordancePath, concordance);

console.log(`Wrote ${integrated.offices.length} offices -> ${officesPath}`);
console.log(`Wrote ${concordance.length} concordance rows -> ${concordancePath}`);
