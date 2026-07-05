#!/usr/bin/env node
/**
 * W2 — Stream a Wikidata JSON dump (or .jsonl fixture) → raw person NDJSON.
 *
 * Usage:
 *   node wikidata/extract.mjs --dump /path/to/latest-all.json.bz2 --dynasty tang --language zh-hant --out packs/wikidata/raw-tang
 *   node wikidata/extract.mjs --dump wikidata/fixtures/tang-persons.jsonl --dynasty tang --language zh-hant --out packs/wikidata/raw-tang
 *
 * Options:
 *   --max N          Stop after N matching persons (dev / smoke)
 *   --progress N     Log every N entities scanned
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { entityMatchesPersonSlice, rawPersonFromEntity } from './entityParse.mjs';
import { writeNdjson } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function dynastyById(dynasties, id) {
  const d = dynasties.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown dynasty "${id}"`);
  return d;
}

function packLanguage(languages, id) {
  const lang = languages.packLanguages.find((x) => x.id === id);
  if (!lang) throw new Error(`Unknown pack language "${id}"`);
  return lang;
}

/** @param {string} dumpPath */
function openDumpStream(dumpPath) {
  if (dumpPath.endsWith('.bz2')) {
    const proc = spawn('bzcat', [dumpPath], { stdio: ['ignore', 'pipe', 'inherit'] });
    if (!proc.stdout) throw new Error('bzcat failed to open stdout');
    return proc.stdout;
  }
  return createReadStream(dumpPath);
}

/**
 * @param {import('node:stream').Readable} stream
 */
async function* iterateDumpEntities(stream) {
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    let trimmed = line.trim();
    if (!trimmed || trimmed === '[' || trimmed === ']') continue;
    if (trimmed.endsWith(',')) trimmed = trimmed.slice(0, -1);
    if (!trimmed.startsWith('{')) continue;
    try {
      yield JSON.parse(trimmed);
    } catch {
      // skip malformed lines in huge dumps
    }
  }
}

/**
 * @param {{
 *   dumpPath: string;
 *   dynastyId: string;
 *   languageId: string;
 *   outDir: string;
 *   maxMatches?: number;
 *   progressEvery?: number;
 * }} opts
 */
export async function extractWikidataPersons(opts) {
  const dynasties = loadJson('wikidata/dynasties.json').dynasties;
  const languages = loadJson('wikidata/languages.json');
  const dynasty = dynastyById(dynasties, opts.dynastyId);
  const packLang = packLanguage(languages, opts.languageId);
  const labelLang = packLang.wikidataLabelLanguages[0];

  const stream = openDumpStream(opts.dumpPath);
  /** @type {import('./entityParse.mjs').RawPerson[]} */
  const rawPersons = [];
  let scanned = 0;

  for await (const entity of iterateDumpEntities(stream)) {
    scanned++;
    if (opts.progressEvery && scanned % opts.progressEvery === 0) {
      // eslint-disable-next-line no-console
      console.log(`  scanned ${scanned.toLocaleString()} … matched ${rawPersons.length}`);
    }

    if (
      !entityMatchesPersonSlice(entity, {
        dynastyQid: dynasty.qid,
        labelLang,
      })
    ) {
      continue;
    }

    const raw = rawPersonFromEntity(entity, labelLang);
    if (raw) rawPersons.push(raw);

    if (opts.maxMatches && rawPersons.length >= opts.maxMatches) break;
  }

  fs.mkdirSync(opts.outDir, { recursive: true });
  const outFile = path.join(opts.outDir, 'persons.raw.ndjson');
  writeNdjson(outFile, rawPersons);

  const meta = {
    extractedAt: new Date().toISOString(),
    dumpPath: opts.dumpPath,
    dynasty: dynasty.id,
    dynastyQid: dynasty.qid,
    language: opts.languageId,
    labelLang,
    entitiesScanned: scanned,
    personsMatched: rawPersons.length,
    includeFictional: true,
  };
  fs.writeFileSync(path.join(opts.outDir, 'extract-meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

  return { ...meta, outFile, count: rawPersons.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dumpPath = arg('--dump', '');
  const dynastyId = arg('--dynasty', 'tang');
  const languageId = arg('--language', 'zh-hant');
  const outDir = arg('--out', path.join(ROOT, 'packs/wikidata/raw-tang'));
  const maxMatches = arg('--max', '') ? Number.parseInt(arg('--max', ''), 10) : undefined;
  const progressEvery = arg('--progress', '1000000')
    ? Number.parseInt(arg('--progress', '1000000'), 10)
    : undefined;

  if (!dumpPath) {
    console.error('Usage: node wikidata/extract.mjs --dump PATH --dynasty tang --language zh-hant [--out DIR]');
    process.exit(1);
  }

  extractWikidataPersons({
    dumpPath: path.resolve(dumpPath),
    dynastyId,
    languageId,
    outDir: path.resolve(outDir),
    maxMatches,
    progressEvery,
  })
    .then((result) => {
      console.log(`Extracted ${result.count} persons (${result.entitiesScanned} entities scanned)`);
      console.log(`Wrote ${result.outFile}`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
