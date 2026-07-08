/**
 * N2 — Compile raw NDL org NDJSON → LJB AuthorityCandidate pack.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NDL_ATTRIBUTION } from './constants.mjs';
import { orgSearchStringsFromRaw } from './orgSearchStrings.mjs';
import { yomiReadingsFromRaw } from './yomiReadings.mjs';
import { readNdjson, writePackFile } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * @param {import('./types.mjs').NdlOrgRaw} raw
 * @returns {import('../shared/types.mjs').AuthorityCandidate | null}
 */
export function orgCandidateFromRaw(raw) {
  if (!raw?.authorityId || !raw.name) return null;
  const searchStrings = orgSearchStringsFromRaw(raw);
  if (searchStrings.length === 0) return null;

  const readings = yomiReadingsFromRaw(raw);
  /** @type {import('../shared/types.mjs').CandidateMetadata} */
  const metadata = {
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
    kind: 'org',
    primaryName: raw.name,
    searchStrings,
    metadata,
  };
}

/**
 * @param {{ rawPath: string, outDir: string, packId?: string }} opts
 */
export function compileNdlOrgsPack(opts) {
  const rawRows = readNdjson(opts.rawPath);
  /** @type {import('../shared/types.mjs').AuthorityCandidate[]} */
  const candidates = [];
  for (const raw of rawRows) {
    const c = orgCandidateFromRaw(raw);
    if (c) candidates.push(c);
  }

  const packId = opts.packId ?? 'ndl-orgs-ja';
  fs.mkdirSync(opts.outDir, { recursive: true });
  const orgsOut = writePackFile(opts.outDir, 'orgs.ndjson', candidates);

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
      'orgs.ndjson': { entityCount: orgsOut.count },
    },
  };
  fs.writeFileSync(path.join(opts.outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return { packId, count: orgsOut.count, outDir: opts.outDir };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rawPath = arg('--raw', '');
  const outDir = arg('--out', path.join(ROOT, 'packs/ndl/orgs-ja'));

  if (!rawPath) {
    console.error('Usage: node ndl/compileOrgs.mjs --raw packs/ndl/raw/orgs.raw.ndjson [--out DIR]');
    process.exit(1);
  }

  const result = compileNdlOrgsPack({ rawPath, outDir });
  console.log(`Compiled ${result.count} orgs → ${result.outDir}`);
}
