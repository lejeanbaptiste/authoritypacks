#!/usr/bin/env node
/**
 * Compile multiple dynasty packs from one master raw NDJSON file.
 *
 * Usage:
 *   node wikidata/compile-all.mjs --raw packs/wikidata/raw-zh-hant-priority1/persons.raw.ndjson --priority 1 --language zh-hant
 *   node wikidata/compile-all.mjs --raw PATH --dynasties tang,song,ming --language zh-hant --out-root packs/wikidata
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { compileWikidataPersonPack } from './compile.mjs';
import { resolveDynastySelection } from './dynastySelect.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

/**
 * @param {{
 *   rawPath: string;
 *   languageId: string;
 *   outRoot: string;
 *   dynastyId?: string;
 *   dynastyIds?: string[];
 *   priority?: number;
 * }} opts
 */
export function compileAllWikidataPersonPacks(opts) {
  const dynasties = loadJson('wikidata/dynasties.json').dynasties;
  const selection = resolveDynastySelection(dynasties, {
    dynastyId: opts.dynastyId,
    dynastyIds: opts.dynastyIds,
    priority: opts.priority,
  });

  /** @type {{ dynastyId: string, count: number, outDir: string }[]} */
  const results = [];
  for (const d of selection.dynasties) {
    const outDir = path.join(opts.outRoot, `person-${opts.languageId}-${d.id}`);
    const result = compileWikidataPersonPack({
      rawPath: opts.rawPath,
      dynastyId: d.id,
      languageId: opts.languageId,
      outDir,
    });
    results.push({ dynastyId: d.id, count: result.count, outDir: result.outDir });
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rawPath = arg('--raw', '');
  const languageId = arg('--language', 'zh-hant');
  const outRoot = path.resolve(arg('--out-root', path.join(ROOT, 'packs/wikidata')));
  const dynastyId = arg('--dynasty', '');
  const dynastiesArg = arg('--dynasties', '');
  const priorityArg = arg('--priority', '');

  if (!rawPath) {
    console.error(
      'Usage: node wikidata/compile-all.mjs --raw PATH (--priority 1 | --dynasties tang,song) [--language zh-hant] [--out-root DIR]',
    );
    process.exit(1);
  }

  const results = compileAllWikidataPersonPacks({
    rawPath: path.resolve(rawPath),
    languageId,
    outRoot,
    dynastyId: dynastyId || undefined,
    dynastyIds: dynastiesArg
      ? dynastiesArg
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
    priority: priorityArg ? Number.parseInt(priorityArg, 10) : undefined,
  });

  for (const r of results) {
    console.log(`${r.dynastyId}: ${r.count} persons → ${r.outDir}/persons.ndjson`);
  }
}
