#!/usr/bin/env node
/**
 * Drop persName/placeName/title authority-candidate records whose
 * primaryName is composed entirely of Chinese numeral characters
 * (一二三四五六七八九十百千萬), and strip any such strings out of
 * surviving records' searchStrings (full alternate-name strings).
 *
 * Does NOT touch `names[]` entries: those are structural name
 * components (family/given/字/號/…), where single characters like
 * 萬/千/十/百 are legitimate surnames/given-name characters, not
 * numeral junk.
 *
 * Usage: node scripts/filterNumeralOnlyEntries.mjs [--dry-run] [file ...]
 * With no file args, runs over the default set of compiled persons/
 * places/works packs (skips raw/*.raw.ndjson intermediates).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { isChineseNumeralOnly } from '../shared/normalize.mjs';

const DEFAULT_FILES = [
  'packs/cbdb/persons.ndjson',
  'packs/cbdb/places.ndjson',
  'packs/dila/persons.ndjson',
  'packs/dila/places.ndjson',
  'packs/chgis/places.ndjson',
  'packs/ndl/persons.ndjson',
  'packs/ndl/places.ndjson',
  'packs/ndl/places-ja/places.ndjson',
  'packs/ndl/works.ndjson',
  'packs/ndl/works-ja/works.ndjson',
  'packs/norbert/persons.ndjson',
  'packs/norbert/person-wrappers.ndjson',
  'packs/wikidata/person-zh-hant-tang/persons.ndjson',
  'packs/wikidata/person-zh-hant-pre-ming/persons.ndjson',
  'packs/wikidata/person-zh-hant-ming/persons.ndjson',
  'packs/wikidata/person-zh-hant-qing/persons.ndjson',
  'packs/wikidata/person-ja-japan/persons.ndjson',
  'packs/wikidata/person-bo/persons.ndjson',
  'packs/wikidata/place-zh-hant/places.ndjson',
  'packs/wikidata/place-ja/places.ndjson',
  'packs/wikidata/place-bo/places.ndjson',
  'packs/wikidata/work-zh-hant/works.ndjson',
  'packs/wikidata/work-ja/works.ndjson',
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fileArgs = args.filter((a) => !a.startsWith('--'));
const files = fileArgs.length > 0 ? fileArgs : DEFAULT_FILES;

let totalDroppedRecords = 0;
let totalStrippedStrings = 0;

for (const file of files) {
  if (!existsSync(file)) {
    console.log(`skip (missing): ${file}`);
    continue;
  }
  const lines = readFileSync(file, 'utf8').split('\n');
  const out = [];
  let droppedRecords = 0;
  let strippedStrings = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);

    if (isChineseNumeralOnly(record.primaryName)) {
      droppedRecords++;
      continue;
    }

    if (Array.isArray(record.searchStrings)) {
      const before = record.searchStrings.length;
      record.searchStrings = record.searchStrings.filter((s) => !isChineseNumeralOnly(s));
      strippedStrings += before - record.searchStrings.length;
    }

    out.push(JSON.stringify(record));
  }

  totalDroppedRecords += droppedRecords;
  totalStrippedStrings += strippedStrings;

  if (droppedRecords || strippedStrings) {
    console.log(
      `${file}: dropped ${droppedRecords} record(s), stripped ${strippedStrings} string(s)`,
    );
    if (!dryRun) {
      writeFileSync(file, out.join('\n') + '\n', 'utf8');
    }
  }
}

console.log(
  `\nTotal: dropped ${totalDroppedRecords} record(s), stripped ${totalStrippedStrings} string(s)${dryRun ? ' (dry run — no files written)' : ''}`,
);
