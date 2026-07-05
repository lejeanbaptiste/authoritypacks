#!/usr/bin/env node
/**
 * Report top ambiguous search strings in compiled packs.
 * Usage: node cbdb/report.mjs [--persons PATH] [--out PATH]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNdjson } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const personsPath = arg('--persons', path.resolve(__dirname, '../packs/cbdb/persons.ndjson'));
const outPath = arg('--out', path.resolve(__dirname, '../reports/cbdb-ambiguous-top100.csv'));

/** @param {import('../shared/types.mjs').AuthorityCandidate[]} candidates */
function ambiguousStrings(candidates) {
  /** @type {Map<string, Set<string>>} */
  const byString = new Map();
  for (const c of candidates) {
    for (const s of c.searchStrings) {
      let ids = byString.get(s);
      if (!ids) {
        ids = new Set();
        byString.set(s, ids);
      }
      ids.add(c.authorityId);
    }
  }
  return [...byString.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([surface, ids]) => ({ surface, count: ids.size }))
    .sort((a, b) => b.count - a.count);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const persons = readNdjson(personsPath);
  const amb = ambiguousStrings(persons);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const lines = ['surface,authority_count', ...amb.slice(0, 100).map((r) => `"${r.surface.replace(/"/g, '""')}",${r.count}`)];
  fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
  console.log(`CBDB persons: ${persons.length} entities, ${amb.length} ambiguous strings`);
  console.log(`Top 10:`);
  for (const row of amb.slice(0, 10)) console.log(`  ${row.surface}\t${row.count}`);
  console.log(`Wrote ${outPath}`);
}

export { ambiguousStrings };
