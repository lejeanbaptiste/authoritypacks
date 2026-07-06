#!/usr/bin/env node
/**
 * Extract DILA place authority → reports/dila-places.tsv (gitignored).
 *
 * Usage:
 *   node dila/extractPlacesTsv.mjs [--places PATH] [--districts PATH] [--out FILE]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeFromRecord } from './compileRecords.mjs';
import { loadDistrictMap, iterateTeiRecords } from '../shared/teiParse.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDbRoot = path.resolve(__dirname, '../../leaf-writer/databases');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const TSV_HEADER = 'pl_id\tprimary_name\tlat\tlon\tsearch_strings';

function tsvCell(value) {
  return String(value ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

/**
 * @param {{ placesPath: string, districtsPath?: string, outPath?: string }} options
 */
export function extractDilaPlacesTsv(options) {
  const placesFile = options.placesPath;
  const districtsFile = options.districtsPath;
  const outPath =
    options.outPath ?? path.resolve(__dirname, '../reports/dila-places.tsv');

  const districtMap = loadDistrictMap(districtsFile ?? null);
  const lines = [TSV_HEADER];
  let count = 0;

  for (const record of iterateTeiRecords(placesFile, 'place')) {
    const candidate = placeFromRecord(record, { districtMap });
    if (!candidate) continue;
    lines.push(
      [
        candidate.authorityId,
        candidate.primaryName,
        candidate.metadata?.geo?.lat ?? '',
        candidate.metadata?.geo?.lon ?? '',
        candidate.searchStrings.join('|'),
      ]
        .map(tsvCell)
        .join('\t'),
    );
    count += 1;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
  return { count, outPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const placesPath = arg('--places', path.join(defaultDbRoot, 'Buddhist_Studies_Place_Authority.xml'));
  const districtsPath = arg('--districts', path.join(defaultDbRoot, 'districts.xml'));
  const outPath = arg('--out', path.resolve(__dirname, '../reports/dila-places.tsv'));

  const result = extractDilaPlacesTsv({ placesPath, districtsPath, outPath });
  console.log(`Wrote ${result.count} rows to ${result.outPath}`);
}
