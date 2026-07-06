#!/usr/bin/env node
/**
 * Compile DILA person + place TEI XML → AuthorityCandidate NDJSON.
 *
 * Usage:
 *   node dila/compile.mjs [--persons PATH] [--places PATH] [--districts PATH] [--crosswalk PATH] [--out DIR]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChgisDilaCrosswalk } from '../crosswalks/loadChgisDila.mjs';
import { loadCbdbDynastyMap } from '../shared/dynastyMap.mjs';
import { writePackFile } from '../shared/ndjson.mjs';
import { loadDistrictMap, iterateTeiRecords } from '../shared/teiParse.mjs';
import { personFromRecord, placeFromRecord } from './compileRecords.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDbRoot = path.resolve(__dirname, '../../leaf-writer/databases');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const personsPath = arg('--persons', path.join(defaultDbRoot, 'Buddhist_Studies_Person_Authority.xml'));
const placesPath = arg('--places', path.join(defaultDbRoot, 'Buddhist_Studies_Place_Authority.xml'));
const districtsPath = arg('--districts', path.join(defaultDbRoot, 'districts.xml'));
const crosswalkPath = arg('--crosswalk', '');
const outDir = arg('--out', path.resolve(__dirname, '../packs/dila'));

export function compileDila(options = {}) {
  const personsFile = options.personsPath ?? personsPath;
  const placesFile = options.placesPath ?? placesPath;
  const districtsFile = options.districtsPath ?? districtsPath;
  const crosswalk = options.crosswalkPath ?? crosswalkPath;
  const outputDir = options.outDir ?? outDir;

  const dynastyMap = loadCbdbDynastyMap(null);
  const districtMap = loadDistrictMap(districtsFile);
  const { dilaToChgis: chgisByDilaId } = loadChgisDilaCrosswalk(crosswalk || null);

  /** @type {import('../shared/types.mjs').AuthorityCandidate[]} */
  const persons = [];
  for (const record of iterateTeiRecords(personsFile, 'person')) {
    const c = personFromRecord(record, { dynastyMap });
    if (c) persons.push(c);
  }

  /** @type {import('../shared/types.mjs').AuthorityCandidate[]} */
  const places = [];
  for (const record of iterateTeiRecords(placesFile, 'place')) {
    const c = placeFromRecord(record, { districtMap, chgisByDilaId });
    if (c) places.push(c);
  }

  const crosswalkChgisCount = places.filter((c) => c.metadata?.crosswalk?.chgis).length;

  fs.mkdirSync(outputDir, { recursive: true });
  const personOut = writePackFile(outputDir, 'persons.ndjson', persons);
  const placeOut = writePackFile(outputDir, 'places.ndjson', places);

  const manifest = {
    id: 'dila',
    source: 'DILA',
    buildToolVersion: '0.2.0',
    compiledAt: new Date().toISOString(),
    upstream: {
      persons: personsFile,
      places: placesFile,
      districts: districtsFile,
      chgisDilaCrosswalk: crosswalk || undefined,
    },
    license: 'CC-BY-SA-3.0',
    attribution: 'Dharma Drum Institute of Liberal Arts (DILA) Authority Databases.',
    files: {
      'persons.ndjson': { entityCount: personOut.count },
      'places.ndjson': { entityCount: placeOut.count, crosswalkChgisCount },
    },
  };
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    persons: personOut.count,
    places: placeOut.count,
    crosswalkChgisCount,
    outDir: outputDir,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('DILA compile');
  console.log(`  persons:     ${personsPath}`);
  console.log(`  places:      ${placesPath}`);
  console.log(`  crosswalk:   ${crosswalkPath || '(none)'}`);
  console.log(`  out:         ${outDir}`);
  const t0 = Date.now();
  const result = compileDila();
  console.log(
    `  → ${result.persons} persons, ${result.places} places, ${result.crosswalkChgisCount} CHGIS crosswalks (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
}
