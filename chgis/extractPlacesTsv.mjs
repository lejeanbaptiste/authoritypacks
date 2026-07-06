#!/usr/bin/env node
/**
 * Extract CHGIS point rows → reports/chgis-places.tsv (gitignored).
 *
 * Usage:
 *   node chgis/extractPlacesTsv.mjs --input PATH [--out FILE]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChgisSearchStrings } from './compileRecords.mjs';
import { discoverShapefiles } from './discover.mjs';
import {
  chgisAdminType,
  chgisChineseName,
  chgisSystemId,
  chgisYear,
  isPointRow,
} from './fieldMap.mjs';
import { iterateShapefileRows } from './parseShapefile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const TSV_HEADER = 'sys_id\tname_ft\ttype_ch\tbeg_yr\tend_yr\tlat\tlon\tlayer\tsearch_strings';

function tsvCell(value) {
  return String(value ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

/**
 * @param {{ inputPath: string, outPath?: string }} options
 */
export async function extractChgisPlacesTsv(options) {
  const input = options.inputPath;
  const outPath =
    options.outPath ?? path.resolve(__dirname, '../reports/chgis-places.tsv');

  const shapefiles = discoverShapefiles(input);
  if (!shapefiles.length) {
    throw new Error(`No .shp files found under ${input}`);
  }

  const lines = [TSV_HEADER];
  let count = 0;

  for (const shp of shapefiles) {
    const layer = path.basename(shp, '.shp');
    for await (const row of iterateShapefileRows(shp)) {
      if (!isPointRow(row)) continue;
      const sysId = chgisSystemId(row);
      const nameFt = chgisChineseName(row);
      if (!sysId || !nameFt) continue;
      const typeCh = chgisAdminType(row);
      const searchStrings = buildChgisSearchStrings(nameFt, typeCh).join('|');
      lines.push(
        [
          sysId,
          nameFt,
          typeCh ?? '',
          chgisYear(row, 'BEG_YR') ?? '',
          chgisYear(row, 'END_YR') ?? '',
          row.lat ?? '',
          row.lon ?? '',
          layer,
          searchStrings,
        ]
          .map(tsvCell)
          .join('\t'),
      );
      count += 1;
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
  return { count, outPath, layers: shapefiles.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputPath = arg('--input', '');
  const outPath = arg('--out', path.resolve(__dirname, '../reports/chgis-places.tsv'));
  if (!inputPath) {
    console.error('Missing --input');
    process.exit(1);
  }
  extractChgisPlacesTsv({ inputPath, outPath })
    .then((result) => {
      console.log(`Wrote ${result.count} rows to ${result.outPath} (${result.layers} layers)`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
