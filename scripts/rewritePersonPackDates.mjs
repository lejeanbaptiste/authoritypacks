#!/usr/bin/env node
/**
 * Rewrite compiled Wikidata (or other) person packs so dynasty spans are not
 * stored as birth–death. Use when raw extracts are gone and a full recompile
 * is not possible.
 *
 * Heuristic:
 *   - start+end exactly match the dynasty range → nationality only
 *   - a bound that equals the dynasty start/end alone is dropped
 *   - remaining years become dateSource: fine
 *
 *   node scripts/rewritePersonPackDates.mjs [packs/wikidata/person-* …]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNdjson, writeNdjson } from '../shared/ndjson.mjs';
import { resolveDynastyByLabel, STATIC_DYNASTY_ALIASES } from '../shared/dynastyMap.mjs';
import { personDateMetadata } from '../shared/personDates.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Build a minimal dynasty map from static aliases (label → range). */
function staticMap() {
  /** @type {Map<string, { label: string, startYear: number, endYear: number }>} */
  const byChn = new Map();
  for (const [label, range] of Object.entries(STATIC_DYNASTY_ALIASES)) {
    byChn.set(label, { label, startYear: range.startYear, endYear: range.endYear });
  }
  return { byChn, byCode: new Map() };
}

/**
 * @param {any} row
 * @param {Map<string, { label: string, startYear: number, endYear: number }>} dynastyMap
 */
export function rewritePersonDates(row, dynastyMap) {
  const md = row.metadata ?? {};
  const dynasty =
    resolveDynastyByLabel(md.dynasty, dynastyMap) ??
    (md.nationality ?? [])
      .map((n) => resolveDynastyByLabel(n.label, dynastyMap))
      .find(Boolean);
  const dynStart = dynasty?.startYear ?? null;
  const dynEnd = dynasty?.endYear ?? null;
  const start = md.startYear ?? null;
  const end = md.endYear ?? null;

  const fullSpan =
    dynStart != null &&
    dynEnd != null &&
    start === dynStart &&
    end === dynEnd;
  const startIsDynasty = dynStart != null && start === dynStart;
  const endIsDynasty = dynEnd != null && end === dynEnd;

  let birthYear = null;
  let deathYear = null;
  if (!fullSpan) {
    if (start != null && !startIsDynasty) birthYear = start;
    if (end != null && !endIsDynasty) deathYear = end;
  }

  const dates = personDateMetadata({
    birthYear,
    deathYear,
    flEarliest: md.flStart,
    flLatest: md.flEnd,
    indexYear: md.indexYear,
  });

  row.metadata = {
    ...md,
    // Drop previous years before applying the segregated set.
    startYear: undefined,
    endYear: undefined,
    dateSource: undefined,
    flStart: undefined,
    flEnd: undefined,
    indexYear: undefined,
    ...dates,
  };
  // Remove keys left undefined so NDJSON stays tidy.
  for (const key of ['startYear', 'endYear', 'flStart', 'flEnd', 'indexYear', 'dateSource']) {
    if (row.metadata[key] === undefined) delete row.metadata[key];
  }
  return row;
}

function defaultPackPaths() {
  const wd = path.join(root, 'packs/wikidata');
  if (!fs.existsSync(wd)) return [];
  return fs
    .readdirSync(wd, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('person-'))
    .map((e) => path.join(wd, e.name, 'persons.ndjson'))
    .filter((p) => fs.existsSync(p));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2).length ? process.argv.slice(2) : defaultPackPaths();
  const dynastyMap = staticMap();
  let rewritten = 0;
  for (const file of paths) {
    const abs = path.resolve(file);
    const rows = readNdjson(abs);
    let changed = 0;
    for (const row of rows) {
      const before = JSON.stringify(row.metadata ?? {});
      rewritePersonDates(row, dynastyMap);
      if (JSON.stringify(row.metadata ?? {}) !== before) changed++;
    }
    writeNdjson(abs, rows);
    rewritten += changed;
    console.log(`${path.relative(root, abs)}: ${changed}/${rows.length} rows adjusted`);
  }
  console.log(`Done. ${rewritten} rows rewritten across ${paths.length} packs.`);
}
