#!/usr/bin/env node
/**
 * Compile cleaned BDRC CSV name lists → private LJB authority packs.
 *
 * Usage:
 *   node bdrc/compile.mjs
 *   node bdrc/compile.mjs --persons bdrc/cleaned-bdrc-personNames.csv \
 *     --places bdrc/cleaned-bdrc-placeNames.csv --out packs/bdrc
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../norbert/mergeReviewCsv.mjs';
import { writePackFile } from '../shared/ndjson.mjs';
import { personFromRows, placeFromRows } from './compileRecords.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const personsCsv = path.resolve(arg('--persons', path.join(ROOT, 'bdrc/cleaned-bdrc-personNames.csv')));
const placesCsv = path.resolve(arg('--places', path.join(ROOT, 'bdrc/cleaned-bdrc-placeNames.csv')));
const outRoot = path.resolve(arg('--out', path.join(ROOT, 'packs/bdrc')));

/**
 * @param {string} filePath
 * @returns {{ p: string, n: string, nt: string, bo: string }[]}
 */
function readCleanedCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return parseCsv(text).map((row) => ({
    p: row.p ?? '',
    n: row.n ?? '',
    nt: row.nt ?? '',
    bo: row.bo ?? '',
  }));
}

/**
 * @param {{ p: string, n: string, nt: string, bo: string }[]} rows
 */
function groupById(rows) {
  /** @type {Map<string, { p: string, n: string, nt: string, bo: string }[]>} */
  const byId = new Map();
  for (const row of rows) {
    const id = row.p.trim();
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(row);
  }
  return byId;
}

/**
 * @param {{
 *   personsCsv?: string;
 *   placesCsv?: string;
 *   outRoot?: string;
 * }} [options]
 */
export function compileBdrc(options = {}) {
  const personsPath = options.personsCsv ?? personsCsv;
  const placesPath = options.placesCsv ?? placesCsv;
  const outputRoot = options.outRoot ?? outRoot;

  if (!fs.existsSync(personsPath)) {
    throw new Error(`Missing persons CSV: ${personsPath}`);
  }
  if (!fs.existsSync(placesPath)) {
    throw new Error(`Missing places CSV: ${placesPath}`);
  }

  const personRows = readCleanedCsv(personsPath);
  const placeRows = readCleanedCsv(placesPath);

  /** @type {import('../shared/types.mjs').AuthorityCandidate[]} */
  const persons = [];
  for (const [authorityId, rows] of groupById(personRows)) {
    const candidate = personFromRows(authorityId, rows);
    if (candidate) persons.push(candidate);
  }

  /** @type {import('../shared/types.mjs').AuthorityCandidate[]} */
  const places = [];
  for (const [authorityId, rows] of groupById(placeRows)) {
    const candidate = placeFromRows(authorityId, rows);
    if (candidate) places.push(candidate);
  }

  fs.mkdirSync(outputRoot, { recursive: true });
  for (const leftover of ['person-bo', 'place-bo']) {
    fs.rmSync(path.join(outputRoot, leftover), { recursive: true, force: true });
  }

  const personOut = writePackFile(outputRoot, 'persons.ndjson', persons);
  const placeOut = writePackFile(outputRoot, 'places.ndjson', places);

  const compiledAt = new Date().toISOString();
  const license = 'local-use-only-do-not-redistribute';
  const attribution =
    'Buddhist Digital Resource Center (BDRC) authority name lists. '
    + 'Private research material — do not publish, redistribute, or share.';
  const policy = {
    version: '2026-09-03',
    redistribute: false,
    note: 'Compiled from gitignored bdrc/ CSVs for internal use by named researchers only.',
  };

  const packManifest = {
    id: 'bdrc-authority',
    source: 'BDRC',
    buildToolVersion: '0.1.0',
    compiledAt,
    upstream: { persons: personsPath, places: placesPath },
    license,
    attribution,
    language: 'bo',
    membership: 'label-only',
    policy,
    files: {
      'persons.ndjson': { entityCount: personOut.count },
      'places.ndjson': { entityCount: placeOut.count },
    },
  };
  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(packManifest, null, 2)}\n`);

  writePluginWrapper(outputRoot, packManifest);

  return {
    persons: personOut.count,
    places: placeOut.count,
    personRows: personRows.length,
    placeRows: placeRows.length,
    outRoot: outputRoot,
  };
}

/**
 * Write a local-only LJB plugin folder (plugin.manifest.json + stub entry)
 * so Tools → Plugins → Install from folder works.
 * @param {string} outputRoot
 * @param {Record<string, unknown>} packManifest
 */
function writePluginWrapper(outputRoot, packManifest) {
  const pluginManifest = {
    manifestVersion: '1.0.0',
    id: 'bdrc-authority',
    name: 'BDRC authority (internal)',
    version: '0.1.0',
    description:
      'Private BDRC person and place name pack for offline tagging. Do not publish or redistribute.',
    author: 'Daniel Patrick Morgan',
    license: 'UNLICENSED',
    ljb: { minVersion: '0.1.0' },
    languages: ['bo'],
    languagePrompt: {
      message:
        'An internal BDRC person/place authority pack is available. Open Tools → Plugins to install “BDRC authority (internal)”.',
      documentLanguages: ['bo'],
    },
    entry: {
      kind: 'javascript',
      module: 'dist/register.mjs',
    },
    contributions: {
      autoTagging: [
        {
          id: 'bdrc-authority-bomb',
          label: 'Tag from BDRC authority pack',
          description: 'Match Tibetan person and place names from the private BDRC name lists.',
          kind: 'authority-tag-bomb',
          defaultEnabled: true,
          tags: ['persName', 'placeName'],
        },
      ],
      authorityPacks: [
        {
          id: 'bdrc-persons-bo',
          label: 'BDRC persons (bo)',
          defaultTag: 'persName',
          install: { source: 'bundled', path: 'persons.ndjson' },
        },
        {
          id: 'bdrc-places-bo',
          label: 'BDRC places (bo)',
          defaultTag: 'placeName',
          install: { source: 'bundled', path: 'places.ndjson' },
        },
      ],
    },
    bundled: ['dist/register.mjs', 'persons.ndjson', 'places.ndjson', 'manifest.json'],
  };
  fs.writeFileSync(
    path.join(outputRoot, 'plugin.manifest.json'),
    `${JSON.stringify(pluginManifest, null, 2)}\n`,
  );

  const distDir = path.join(outputRoot, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(
    path.join(distDir, 'register.mjs'),
    `export async function register(context) {\n`
      + `  context.log('BDRC internal authority pack loaded '\n`
      + `    + '(${packManifest.files['persons.ndjson'].entityCount} persons, '\n`
      + `    + '${packManifest.files['places.ndjson'].entityCount} places)');\n`
      + `}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('BDRC compile');
  console.log(`  persons: ${personsCsv}`);
  console.log(`  places:  ${placesCsv}`);
  console.log(`  out:     ${outRoot}`);
  const t0 = Date.now();
  const result = compileBdrc();
  console.log(
    `  → ${result.persons} persons (${result.personRows} name rows), `
      + `${result.places} places (${result.placeRows} name rows) `
      + `(${(Date.now() - t0) / 1000}s)`,
  );
}
