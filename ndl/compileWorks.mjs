/**
 * N2 — Compile raw NDL work NDJSON → LJB AuthorityCandidate pack.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NDL_ATTRIBUTION } from './constants.mjs';
import { workSearchStringsFromRaw } from './workSearchStrings.mjs';
import { readNdjson, writePackFile } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * @param {import('./types.mjs').NdlWorkRaw} raw
 * @returns {import('../shared/types.mjs').AuthorityCandidate | null}
 */
export function workCandidateFromRaw(raw) {
  if (!raw?.id || !raw.title) return null;
  const searchStrings = workSearchStringsFromRaw(raw);
  if (searchStrings.length === 0) return null;

  const creators = raw.creators?.length ? raw.creators.join('; ') : undefined;
  return {
    source: 'NDL',
    authorityId: raw.id,
    kind: 'work',
    primaryName: raw.title,
    searchStrings,
    metadata: {
      description: creators
        ? `${raw.title} (${creators}, NDL ${raw.id})`
        : `${raw.title} (NDL ${raw.id})`,
    },
  };
}

/**
 * @param {{ rawPath: string, outDir: string, packId?: string }} opts
 */
export function compileNdlWorksPack(opts) {
  const rawRows = readNdjson(opts.rawPath);
  /** @type {import('../shared/types.mjs').AuthorityCandidate[]} */
  const candidates = [];
  for (const raw of rawRows) {
    const c = workCandidateFromRaw(raw);
    if (c) candidates.push(c);
  }

  const packId = opts.packId ?? 'ndl-works-ja';
  fs.mkdirSync(opts.outDir, { recursive: true });
  const worksOut = writePackFile(opts.outDir, 'works.ndjson', candidates);

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
      'works.ndjson': { entityCount: worksOut.count },
    },
  };
  fs.writeFileSync(path.join(opts.outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return { packId, count: worksOut.count, outDir: opts.outDir };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rawPath = arg('--raw', '');
  const outDir = arg('--out', path.join(ROOT, 'packs/ndl/works-ja'));

  if (!rawPath) {
    console.error('Usage: node ndl/compileWorks.mjs --raw packs/ndl/raw/works.raw.ndjson [--out DIR]');
    process.exit(1);
  }

  const result = compileNdlWorksPack({ rawPath, outDir });
  console.log(`Compiled ${result.count} works → ${result.outDir}`);
}
