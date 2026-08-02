#!/usr/bin/env node
/**
 * Build `packs/wikidata/viaf-wikidata-concordance.ndjson` from compiled (or raw)
 * Wikidata pack NDJSON that already carries `metadata.crosswalk.viaf` (P214).
 *
 * Usage:
 *   node wikidata/buildViafConcordance.mjs \
 *     --in packs/wikidata/place-ja/places.ndjson \
 *     --in packs/wikidata/person-bo/persons.ndjson \
 *     --out packs/wikidata/viaf-wikidata-concordance.ndjson
 *
 * Or scan every compiled Wikidata pack under packs/wikidata:
 *   node wikidata/buildViafConcordance.mjs --scan-packs packs/wikidata \
 *     --out packs/wikidata/viaf-wikidata-concordance.ndjson
 */

import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

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
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
function normalizeViafId(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const fromUrl = trimmed.match(/viaf\.org\/(?:[a-z]{2}\/)?viaf\/(\d+)/i)?.[1];
  if (fromUrl) return fromUrl;
  const digits = trimmed.match(/^(\d+)$/);
  return digits ? digits[1] : null;
}

/**
 * @param {string} filePath
 * @param {Map<string, string>} pairs viaf → qid (first wins; log multiples)
 * @returns {Promise<{ rows: number, pairs: number, multi: number }>}
 */
async function ingestFile(filePath, pairs) {
  let rows = 0;
  let added = 0;
  let multi = 0;
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows += 1;
    let row;
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const crosswalk = row.metadata?.crosswalk ?? row.crosswalk;
    if (!crosswalk?.viaf) continue;
    const viafValues = Array.isArray(crosswalk.viaf) ? crosswalk.viaf : [crosswalk.viaf];
    /** @type {Set<string>} */
    const qids = new Set();
    const fromAuthority = normalizeWikidataQid(row.authorityId ?? row.qid);
    if (fromAuthority) qids.add(fromAuthority);
    if (crosswalk.wikidata != null) {
      for (const entry of Array.isArray(crosswalk.wikidata)
        ? crosswalk.wikidata
        : [crosswalk.wikidata]) {
        const qid = normalizeWikidataQid(String(entry));
        if (qid) qids.add(qid);
      }
    }
    if (qids.size === 0) continue;
    for (const viafRaw of viafValues) {
      const viaf = normalizeViafId(String(viafRaw));
      if (!viaf) continue;
      for (const qid of qids) {
        const existing = pairs.get(viaf);
        if (existing && existing !== qid) {
          multi += 1;
          continue;
        }
        if (!existing) {
          pairs.set(viaf, qid);
          added += 1;
        }
      }
    }
  }
  return { rows, pairs: added, multi };
}

/**
 * @param {string} root
 * @returns {string[]}
 */
function findPackNdjson(root) {
  /** @type {string[]} */
  const out = [];
  const skip = new Set(['raw', 'node_modules']);
  /**
   * @param {string} dir
   */
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
        if (skip.has(entry.name) || entry.name.startsWith('raw-')) continue;
        walk(full);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.ndjson') && !entry.name.includes('concordance')) {
        out.push(full);
      }
    }
  }
  walk(root);
  return out.sort();
}

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function argsAll(name) {
  /** @type {string[]} */
  const values = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === name && process.argv[i + 1]) values.push(process.argv[i + 1]);
  }
  return values;
}

async function main() {
  const outPath = arg('--out', 'packs/wikidata/viaf-wikidata-concordance.ndjson');
  const scanRoot = arg('--scan-packs', '');
  const inputs = [
    ...argsAll('--in'),
    ...(scanRoot ? findPackNdjson(path.resolve(scanRoot)) : []),
  ].map((p) => path.resolve(p));

  if (inputs.length === 0) {
    console.error(
      'Usage: node wikidata/buildViafConcordance.mjs --in PACK.ndjson [--in …] --out packs/wikidata/viaf-wikidata-concordance.ndjson\n' +
        '   or: node wikidata/buildViafConcordance.mjs --scan-packs packs/wikidata --out …',
    );
    process.exit(1);
  }

  /** @type {Map<string, string>} */
  const pairs = new Map();
  let totalRows = 0;
  let totalMulti = 0;
  for (const file of inputs) {
    if (!fs.existsSync(file)) {
      console.warn(`skip missing: ${file}`);
      continue;
    }
    const stats = await ingestFile(file, pairs);
    totalRows += stats.rows;
    totalMulti += stats.multi;
    console.log(
      `${path.relative(process.cwd(), file)}: ${stats.rows} rows, +${stats.pairs} pairs` +
        (stats.multi ? ` (${stats.multi} multi-Q skipped)` : ''),
    );
  }

  const lines = [...pairs.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
    .map(([viaf, wikidata]) => JSON.stringify({ wikidata, viaf }));

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.length ? `${lines.join('\n')}\n` : '', 'utf8');
  console.log(
    `Wrote ${lines.length} pairs → ${outPath} (scanned ${totalRows} rows` +
      (totalMulti ? `, ${totalMulti} ambiguous VIAF→Q skipped` : '') +
      ')',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
