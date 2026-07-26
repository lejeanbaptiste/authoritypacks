#!/usr/bin/env node
/**
 * Build norbert/surnames.json from an existing persons.ndjson pack (no SQL required).
 *
 * Usage: node norbert/extractSurnamesFromPack.mjs [--in PATH] [--out PATH]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileNorbertSurnamesFromPersons } from './surnames.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const inPath = arg('--in', path.resolve(__dirname, '../packs/norbert/persons.ndjson'));
const outPath = arg('--out', path.resolve(__dirname, '../packs/norbert/surnames.json'));

const lines = fs.readFileSync(inPath, 'utf8').split('\n').filter(Boolean);
const persons = lines.map((line) => JSON.parse(line));
const surnames = compileNorbertSurnamesFromPersons(persons);

fs.writeFileSync(outPath, `${JSON.stringify({ surnames, source: inPath }, null, 2)}\n`);
console.log(`Wrote ${surnames.length} surnames → ${outPath}`);
