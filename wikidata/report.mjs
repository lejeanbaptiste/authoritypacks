#!/usr/bin/env node
/**
 * W3 — Ambiguity report for compiled Wikidata person packs.
 *
 * Usage:
 *   node wikidata/report.mjs
 *   node wikidata/report.mjs --persons packs/wikidata/person-zh-hant-tang/persons.ndjson --out reports/w3-ambiguity.csv
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNdjson } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function csvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/**
 * @param {import('../shared/types.mjs').AuthorityCandidate[]} candidates
 * @param {{ sampleSize?: number, limit?: number }} [opts]
 * @returns {{ surface: string, count: number, authorityIds: string[], primaryNames: string[] }[]}
 */
export function ambiguousRows(candidates, opts = {}) {
  const sampleSize = opts.sampleSize ?? 8;
  /** @type {Map<string, Map<string, string>>} */
  const byString = new Map();

  for (const c of candidates) {
    for (const s of c.searchStrings) {
      let ids = byString.get(s);
      if (!ids) {
        ids = new Map();
        byString.set(s, ids);
      }
      ids.set(c.authorityId, c.primaryName);
    }
  }

  const rows = [...byString.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([surface, ids]) => ({
      surface,
      count: ids.size,
      authorityIds: [...ids.keys()].slice(0, sampleSize),
      primaryNames: [...ids.values()].slice(0, sampleSize),
    }))
    .sort((a, b) => b.count - a.count || a.surface.localeCompare(b.surface, 'zh-Hant'));

  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

/**
 * @param {{ surface: string, count: number, authorityIds: string[], primaryNames: string[] }[]} rows
 */
export function ambiguityCsv(rows) {
  const header = 'surface,authority_count,sample_qids,sample_names';
  const lines = rows.map((row) =>
    [
      csvCell(row.surface),
      row.count,
      csvCell(row.authorityIds.join('; ')),
      csvCell(row.primaryNames.join('; ')),
    ].join(','),
  );
  return `${[header, ...lines].join('\n')}\n`;
}

/**
 * @param {import('../shared/types.mjs').AuthorityCandidate[]} candidates
 */
export function ambiguityStats(candidates) {
  /** @type {Set<string>} */
  const surfaces = new Set();
  let stringCount = 0;
  for (const c of candidates) {
    for (const s of c.searchStrings) {
      stringCount += 1;
      surfaces.add(s);
    }
  }
  const rows = ambiguousRows(candidates);
  return {
    entityCount: candidates.length,
    searchStringCount: stringCount,
    uniqueSurfaces: surfaces.size,
    ambiguousSurfaceCount: rows.length,
  };
}

/**
 * @param {{
 *   personsPath: string;
 *   outPath: string;
 *   limit?: number;
 * }} opts
 */
export function writeAmbiguityReport(opts) {
  const persons = readNdjson(opts.personsPath);
  const stats = ambiguityStats(persons);
  const rows = ambiguousRows(persons, { limit: opts.limit });
  fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
  fs.writeFileSync(opts.outPath, ambiguityCsv(rows));

  return { stats, rows, outPath: opts.outPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const personsPath = path.resolve(
    arg('--persons', path.join(ROOT, 'packs/wikidata/person-zh-hant-tang/persons.ndjson')),
  );
  const outPath = path.resolve(arg('--out', path.join(ROOT, 'reports/w3-ambiguity.csv')));
  const limitArg = arg('--limit', '');
  const limit = limitArg ? Number.parseInt(limitArg, 10) : undefined;

  const { stats, rows } = writeAmbiguityReport({ personsPath, outPath, limit });

  console.log(`Wikidata persons: ${stats.entityCount} entities`);
  console.log(`Search strings: ${stats.searchStringCount} total, ${stats.uniqueSurfaces} unique surfaces`);
  console.log(`Ambiguous surfaces: ${stats.ambiguousSurfaceCount}`);
  console.log(`Top 10:`);
  for (const row of rows.slice(0, 10)) {
    console.log(`  ${row.surface}\t${row.count}\t${row.primaryNames.slice(0, 3).join('; ')}`);
  }
  console.log(`Wrote ${outPath}${limit ? ` (top ${limit})` : ''}`);
}
