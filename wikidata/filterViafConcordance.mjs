#!/usr/bin/env node
/**
 * Filter a dump-scale VIAF↔Wikidata concordance to QIDs present in shipped
 * Wikidata packs, then write a single NDJSON plus optional id-prefix chunks.
 *
 *   node wikidata/filterViafConcordance.mjs \
 *     --concordance packs/wikidata/viaf-wikidata-concordance.ndjson \
 *     --scan-packs packs/wikidata \
 *     --out packs/wikidata/viaf-wikidata-concordance.filtered.ndjson \
 *     --chunk-dir packs/wikidata/viaf-wikidata-concordance \
 *     --chunk-digits 2
 *
 * Chunk files are named by the first N digits of the VIAF id (zero-padded),
 * e.g. `00.ndjson` … `99.ndjson`, plus `manifest.json` listing chunk paths.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { createWriteStream } from 'node:fs';

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
}

/**
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
function normalizeWikidataQid(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const fromUrl = trimmed.match(/wikidata\.org\/(?:wiki|entity)\/(Q\d+)/i)?.[1];
  if (fromUrl) return fromUrl.toUpperCase();
  const withQ = trimmed.match(/^Q?(\d+)$/i);
  if (withQ) return `Q${withQ[1]}`;
  return null;
}

/**
 * Collect QIDs from compiled pack NDJSON (skip concordance / raw).
 * @param {string} root
 * @returns {Set<string>}
 */
function collectPackQids(root) {
  /** @type {Set<string>} */
  const qids = new Set();
  const skipDirs = new Set(['raw', 'node_modules']);

  /** @param {string} dir */
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name) || entry.name.startsWith('raw-')) continue;
        // Skip the filtered concordance chunk dir itself if nested.
        if (entry.name === 'viaf-wikidata-concordance') continue;
        walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.ndjson')) continue;
      if (entry.name.includes('concordance') || entry.name.includes('crosswalk')) continue;
      const stream = fs.createReadStream(full, { encoding: 'utf8' });
      // Synchronous collect via readFile is fine for person packs; stream large place packs.
      const stat = fs.statSync(full);
      if (stat.size > 40 * 1024 * 1024) {
        // Defer: still use read for simplicity in build tooling; places are <100MB locally.
      }
      const text = fs.readFileSync(full, 'utf8');
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let row;
        try {
          row = JSON.parse(trimmed);
        } catch {
          continue;
        }
        const qid = normalizeWikidataQid(row.authorityId ?? row.qid);
        if (qid) qids.add(qid);
        const cross = row.metadata?.crosswalk?.wikidata ?? row.crosswalk?.wikidata;
        if (cross != null) {
          for (const entry of Array.isArray(cross) ? cross : [cross]) {
            const nested = normalizeWikidataQid(String(entry));
            if (nested) qids.add(nested);
          }
        }
      }
    }
  }
  walk(path.resolve(root));
  return qids;
}

/**
 * @param {string} viaf
 * @param {number} digits
 */
function chunkKey(viaf, digits) {
  const digitsOnly = String(viaf).replace(/\D/g, '');
  const padded = digitsOnly.padStart(digits, '0');
  return padded.slice(0, digits);
}

async function main() {
  const concordancePath = arg(
    '--concordance',
    'packs/wikidata/viaf-wikidata-concordance.ndjson',
  );
  const scanRoot = arg('--scan-packs', 'packs/wikidata');
  const outPath = arg('--out', 'packs/wikidata/viaf-wikidata-concordance.filtered.ndjson');
  const chunkDir = arg('--chunk-dir', 'packs/wikidata/viaf-wikidata-concordance');
  const chunkDigits = Number(arg('--chunk-digits', '2')) || 2;
  const includePlaces = !process.argv.includes('--persons-only');

  if (!fs.existsSync(concordancePath)) {
    console.error(`Missing concordance: ${concordancePath}`);
    process.exit(1);
  }

  console.log(`Collecting QIDs from ${scanRoot}…`);
  const allow = collectPackQids(scanRoot);
  // Optional: restrict to person packs only by deleting place QIDs — kept inclusive by default.
  void includePlaces;
  console.log(`Allowlist: ${allow.size} QIDs`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(chunkDir)) fs.rmSync(chunkDir, { recursive: true, force: true });
  fs.mkdirSync(chunkDir, { recursive: true });

  /** @type {Map<string, import('node:fs').WriteStream>} */
  const chunkStreams = new Map();
  /** @type {Map<string, number>} */
  const chunkCounts = new Map();
  const outStream = createWriteStream(outPath, { encoding: 'utf8' });

  let total = 0;
  let kept = 0;
  const rl = createInterface({
    input: fs.createReadStream(concordancePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    total += 1;
    let row;
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const qid = normalizeWikidataQid(row.wikidata);
    const viaf = row.viaf == null ? null : String(row.viaf).trim();
    if (!qid || !viaf || !allow.has(qid)) continue;
    kept += 1;
    const serialized = `${JSON.stringify({ wikidata: qid, viaf })}\n`;
    outStream.write(serialized);

    const key = chunkKey(viaf, chunkDigits);
    let stream = chunkStreams.get(key);
    if (!stream) {
      stream = createWriteStream(path.join(chunkDir, `${key}.ndjson`), { encoding: 'utf8' });
      chunkStreams.set(key, stream);
      chunkCounts.set(key, 0);
    }
    stream.write(serialized);
    chunkCounts.set(key, (chunkCounts.get(key) ?? 0) + 1);
  }

  await new Promise((resolve, reject) => {
    outStream.end(() => resolve(undefined));
    outStream.on('error', reject);
  });
  await Promise.all(
    [...chunkStreams.values()].map(
      (stream) =>
        new Promise((resolve, reject) => {
          stream.end(() => resolve(undefined));
          stream.on('error', reject);
        }),
    ),
  );

  const chunks = [...chunkCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entityCount]) => ({
      path: `${key}.ndjson`,
      viafPrefix: key,
      entityCount,
    }));

  const manifest = {
    id: 'wikidata-viaf-concordance',
    kind: 'viaf-wikidata-concordance',
    filtered: true,
    allowlistQids: allow.size,
    pairCount: kept,
    sourcePairs: total,
    chunkDigits,
    chunks,
    undatedPath: null,
    singleFile: path.basename(outPath),
  };
  fs.writeFileSync(path.join(chunkDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  // Convenience copy next to single file.
  fs.copyFileSync(
    path.join(chunkDir, 'manifest.json'),
    path.join(path.dirname(outPath), 'viaf-wikidata-concordance.manifest.json'),
  );

  console.log(
    `Kept ${kept}/${total} pairs → ${outPath} (${chunks.length} chunks under ${chunkDir})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
