#!/usr/bin/env node
/**
 * Build P279* subclass closure for each kind in kind-queries.json.
 *
 * Usage:
 *   node wikidata/buildKindClosure.mjs [--kind work|place|org|person] [--out PATH]
 *
 * Writes wikidata/kind-instance-closure.json (used by dump extract for P31/P279* matching).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSubclassClosure } from './sparqlClient.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {string[]} roots */
async function buildClosureForRoots(roots) {
  /** @type {Set<string>} */
  const closure = new Set();
  for (const root of roots) {
    // eslint-disable-next-line no-console
    console.log(`  P279* ${root}…`);
    const subs = await fetchSubclassClosure(root);
    for (const qid of subs) closure.add(qid);
    // eslint-disable-next-line no-console
    console.log(`    → ${subs.length.toLocaleString()} types (running total ${closure.size.toLocaleString()})`);
    await sleep(1500);
  }
  return [...closure].sort((a, b) => Number.parseInt(a.slice(1), 10) - Number.parseInt(b.slice(1), 10));
}

async function main() {
  const kindFilter = arg('--kind', '');
  const outPath = path.resolve(arg('--out', path.join(__dirname, 'kind-instance-closure.json')));
  const kindsDoc = loadJson('wikidata/kind-queries.json').kinds;

  /** @type {Record<string, import('./kindInstanceClosure.mjs').KindClosureEntry>} */
  const existing = fs.existsSync(outPath)
    ? JSON.parse(fs.readFileSync(outPath, 'utf8')).kinds ?? {}
    : {};

  const kindIds = Object.keys(kindsDoc).filter((kind) => !kindFilter || kind === kindFilter);
  if (!kindIds.length) {
    console.error(`Unknown kind "${kindFilter}"`);
    process.exit(1);
  }

  /** @type {Record<string, import('./kindInstanceClosure.mjs').KindClosureEntry>} */
  const kinds = { ...existing };

  for (const kindId of kindIds) {
    const spec = kindsDoc[kindId];
    const includeRoots = spec.instanceOf ?? [];
    const excludeRoots = spec.excludeInstanceOf ?? [];

    // eslint-disable-next-line no-console
    console.log(`\n${kindId}: ${includeRoots.length} include roots`);
    const instanceOfClosure = await buildClosureForRoots(includeRoots);

    /** @type {string[]} */
    let excludeInstanceOfClosure = [];
    if (excludeRoots.length) {
      // eslint-disable-next-line no-console
      console.log(`${kindId}: ${excludeRoots.length} exclude roots`);
      excludeInstanceOfClosure = await buildClosureForRoots(excludeRoots);
    }

    kinds[kindId] = {
      instanceOfRoots: includeRoots,
      instanceOfClosure,
      excludeInstanceOfRoots: excludeRoots,
      excludeInstanceOfClosure,
    };
  }

  const doc = {
    version: 1,
    builtAt: new Date().toISOString(),
    source: 'Wikidata Query Service (P279* per root in kind-queries.json)',
    kinds,
  };

  fs.writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
  // eslint-disable-next-line no-console
  console.log(`\nWrote ${outPath}`);
  for (const kindId of kindIds) {
    const entry = kinds[kindId];
    // eslint-disable-next-line no-console
    console.log(
      `  ${kindId}: ${entry.instanceOfClosure.length.toLocaleString()} include, ${entry.excludeInstanceOfClosure.length.toLocaleString()} exclude`,
    );
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
