#!/usr/bin/env node
/**
 * Compile CHGIS v6 shapefiles → AuthorityCandidate NDJSON.
 *
 * Usage:
 *   node chgis/compile.mjs --input PATH [--cbdb-sqlite PATH] [--crosswalk PATH] [--out DIR]
 *
 * `--input` may be a .shp file or a directory (searched recursively for shapefiles).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChgisDilaCrosswalk } from '../crosswalks/loadChgisDila.mjs';
import { loadCbdbChgisCrosswalk } from './cbdbCrosswalk.mjs';
import { compileChgisPlaces } from './compileRecords.mjs';
import { discoverShapefiles } from './discover.mjs';
import { iterateShapefileRows } from './parseShapefile.mjs';
import { writePackFile } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const inputPath = arg('--input', '');
const cbdbSqlite = arg('--cbdb-sqlite', '');
const crosswalkPath = arg('--crosswalk', '');
const outDir = arg('--out', path.resolve(__dirname, '../packs/chgis'));

export async function compileChgisPack(options = {}) {
  const input = options.inputPath ?? inputPath;
  const outputDir = options.outDir ?? outDir;
  const sqlite = options.cbdbSqlite ?? cbdbSqlite;
  const crosswalk = options.crosswalkPath ?? crosswalkPath;

  if (!input) {
    throw new Error('Missing --input (shapefile or directory of CHGIS layers).');
  }
  if (!fs.existsSync(input)) {
    throw new Error(`CHGIS input not found: ${input}`);
  }

  const shapefiles = discoverShapefiles(input);
  if (!shapefiles.length) {
    throw new Error(`No .shp files found under ${input}`);
  }

  const cbdbByChgisId = loadCbdbChgisCrosswalk(sqlite || null);
  const { chgisToDila: dilaByChgisId } = loadChgisDilaCrosswalk(crosswalk || null);

  /** @type {import('../shared/types.mjs').AuthorityCandidate[]} */
  const places = [];
  const layerCounts = [];

  for (const shp of shapefiles) {
    const layer = path.basename(shp, '.shp');
    const rows = iterateShapefileRows(shp);
    /** @type {import('./fieldMap.mjs').ChgisRow[]} */
    const batch = [];
    for await (const row of rows) batch.push(row);
    const compiled = compileChgisPlaces(batch, { cbdbByChgisId, dilaByChgisId, layer });
    places.push(...compiled);
    layerCounts.push({ layer, count: compiled.length });
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const placeOut = writePackFile(outputDir, 'places.ndjson', places);
  const stringCount = places.reduce((n, c) => n + c.searchStrings.length, 0);
  const crosswalkCbdbCount = places.filter((c) => c.metadata?.crosswalk?.cbdb).length;
  const crosswalkDilaCount = places.filter((c) => c.metadata?.crosswalk?.dila).length;

  const manifest = {
    id: 'chgis',
    source: 'CHGIS',
    buildToolVersion: '0.2.0',
    compiledAt: new Date().toISOString(),
    upstream: {
      input,
      layers: layerCounts.map((l) => l.layer),
      cbdbSqlite: sqlite || undefined,
      chgisDilaCrosswalk: crosswalk || undefined,
    },
    license: 'CHGIS-Academic',
    attribution:
      'CHGIS v6, Fairbank Center for Chinese Studies (Harvard University) and Center for Historical Geographical Studies (Fudan University), 2016.',
    redistribution: 'local-compile-only',
    files: {
      'places.ndjson': {
        entityCount: placeOut.count,
        stringCount,
        crosswalkCbdbCount,
        crosswalkDilaCount,
      },
    },
    policy: {
      version: '2026-07-06',
      rulesRef: 'chgis/README.md',
      minMatchLength: 2,
      nameField: 'NAME_FT',
      layerCounts,
    },
  };
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    places: placeOut.count,
    strings: stringCount,
    crosswalkCount: crosswalkCbdbCount,
    crosswalkDilaCount,
    layers: layerCounts.length,
    layerCounts,
    outDir: outputDir,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('CHGIS compile');
  console.log(`  input:      ${inputPath || '(required)'}`);
  console.log(`  cbdb:       ${cbdbSqlite || '(none)'}`);
  console.log(`  crosswalk:  ${crosswalkPath || '(none)'}`);
  console.log(`  out:        ${outDir}`);
  const t0 = Date.now();
  compileChgisPack()
    .then((result) => {
      for (const { layer, count } of result.layerCounts) {
        console.log(`  layer ${layer}: ${count.toLocaleString()} places`);
      }
      console.log(
        `  → ${result.places} places, ${result.strings} strings, ${result.crosswalkCount} CBDB crosswalks, ${result.crosswalkDilaCount} DILA crosswalks, ${result.layers} layers (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
