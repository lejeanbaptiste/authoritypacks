/**
 * N2 — Compile raw NDL person NDJSON → LJB AuthorityCandidate pack.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NDL_ATTRIBUTION } from './constants.mjs';
import { personSearchStringsFromRaw } from './personSearchStrings.mjs';
import { yomiReadingsFromRaw } from './yomiReadings.mjs';
import { readNdjson, writePackFile } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * @param {import('./types.mjs').NdlPersonRaw} raw
 * @returns {import('../shared/types.mjs').AuthorityCandidate | null}
 */
export function personCandidateFromRaw(raw) {
  if (!raw?.authorityId || !raw.name) return null;
  const searchStrings = personSearchStringsFromRaw(raw);
  if (searchStrings.length === 0) return null;

  const readings = yomiReadingsFromRaw(raw);
  /** @type {import('../shared/types.mjs').CandidateMetadata} */
  const metadata = {
    startYear: raw.birthYear,
    endYear: raw.deathYear,
    description: `${raw.name} (NDL ${raw.authorityId})`,
    ana: 'historical',
  };
  if (readings.primaryKatakana) {
    metadata.yomi = readings.primaryKatakana;
    metadata.yomiHiragana = readings.primaryHiragana;
  }

  return {
    source: 'NDL',
    authorityId: raw.authorityId,
    kind: 'person',
    primaryName: raw.name,
    searchStrings,
    metadata,
  };
}

/**
 * @param {{ rawPath: string, outDir: string, packId?: string }} opts
 */
export function compileNdlPersonsPack(opts) {
  const rawRows = readNdjson(opts.rawPath);
  /** @type {import('../shared/types.mjs').AuthorityCandidate[]} */
  const candidates = [];
  for (const raw of rawRows) {
    const c = personCandidateFromRaw(raw);
    if (c) candidates.push(c);
  }

  const packId = opts.packId ?? 'ndl-persons-ja';
  fs.mkdirSync(opts.outDir, { recursive: true });
  const personsOut = writePackFile(opts.outDir, 'persons.ndjson', candidates);

  const manifest = {
    id: packId,
    source: 'NDL',
    buildToolVersion: '0.1.0',
    compiledAt: new Date().toISOString(),
    upstream: { raw: opts.rawPath },
    license: 'NDL Terms of Use (attribution required)',
    attribution: NDL_ATTRIBUTION,
    language: 'ja',
    files: {
      'persons.ndjson': { entityCount: personsOut.count },
    },
  };
  fs.writeFileSync(path.join(opts.outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return { packId, count: personsOut.count, outDir: opts.outDir };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rawPath = arg('--raw', '');
  const outDir = arg('--out', path.join(ROOT, 'packs/ndl/persons-ja'));

  if (!rawPath) {
    console.error('Usage: node ndl/compilePersons.mjs --raw packs/ndl/raw/persons.raw.ndjson [--out DIR]');
    process.exit(1);
  }

  const result = compileNdlPersonsPack({ rawPath, outDir });
  console.log(`Compiled ${result.count} persons → ${result.outDir}`);
}
