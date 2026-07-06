#!/usr/bin/env node
/**
 * Build CHGIS↔DILA crosswalk from intermediate TSV extracts.
 *
 * Usage:
 *   node crosswalks/buildChgisDila.mjs \
 *     --chgis reports/chgis-places.tsv \
 *     --dila reports/dila-places.tsv \
 *     --out reports/chgis-dila-crosswalk.tsv
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeChgisDilaCrosswalk } from './buildChgisDila.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const chgisTsv = arg('--chgis', path.resolve(__dirname, '../reports/chgis-places.tsv'));
  const dilaTsv = arg('--dila', path.resolve(__dirname, '../reports/dila-places.tsv'));
  const crosswalkOut = arg('--out', path.resolve(__dirname, '../reports/chgis-dila-crosswalk.tsv'));
  const ambiguousOut = arg(
    '--ambiguous-out',
    path.resolve(__dirname, '../reports/chgis-dila-ambiguous.tsv'),
  );

  const stats = writeChgisDilaCrosswalk(chgisTsv, dilaTsv, { crosswalkOut, ambiguousOut });
  console.log(
    `Crosswalk: ${stats.matched} matched, ${stats.ambiguous} ambiguous, ${stats.noNameMatch} no name match (${stats.chgisTotal} CHGIS rows)`,
  );
  console.log(`  → ${crosswalkOut}`);
  console.log(`  → ${ambiguousOut}`);
}
