#!/usr/bin/env node
/**
 * Join retained Wikidata authority-crosswalk sidecars onto compiled person packs.
 *
 * No dump crawl: reads `wikidata-authority-crosswalk.ndjson` (and optional
 * viaf/cbdb/ndl pair files) and writes `metadata.crosswalk` on each person row,
 * preserving any existing keys (e.g. `norbert` from concordance integrate).
 *
 * Usage:
 *   node wikidata/attachAuthorityCrosswalk.mjs \
 *     [--wikidata-root packs/wikidata] \
 *     [--crosswalk packs/wikidata/wikidata-authority-crosswalk.ndjson] \
 *     [--packs person-zh-hant-tang,person-ja-japan] \
 *     [--also-pairs]
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { writeNdjson } from '../shared/ndjson.mjs';
import { compiledCrosswalkFromRaw } from './identifierClaims.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
};

const hasFlag = (name) => process.argv.includes(name);

/** Normalize pack / sidecar Q-ids to `Q123` form. */
export function normalizeQid(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const bare = raw.replace(/^Q/i, '');
  return /^\d+$/.test(bare) ? `Q${bare}` : '';
}

/**
 * Merge sidecar identifiers into an existing crosswalk without dropping
 * Norbert (or other) links already on the row.
 * @param {Record<string, string | string[]> | undefined} existing
 * @param {Record<string, string | string[]> | undefined} incoming
 * @param {string} qid  Q-prefixed or bare
 */
export function mergePersonCrosswalk(existing, incoming, qid) {
  /** @type {Record<string, string | string[]>} */
  const merged = { ...(existing ?? {}) };
  for (const [key, value] of Object.entries(incoming ?? {})) {
    if (key === 'wikidata' || key === 'norbert') continue;
    if (merged[key] == null || merged[key] === '') merged[key] = value;
  }
  return compiledCrosswalkFromRaw({ qid: normalizeQid(qid) || qid, crosswalk: merged });
}

/**
 * Collect QIDs from person pack NDJSON files.
 * @param {string[]} personFiles
 */
export async function collectPersonQids(personFiles) {
  /** @type {Set<string>} */
  const qids = new Set();
  for (const file of personFiles) {
    if (!fs.existsSync(file)) continue;
    const rl = readline.createInterface({
      input: fs.createReadStream(file),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const qid = normalizeQid(JSON.parse(trimmed).authorityId);
      if (qid) qids.add(qid);
    }
  }
  return qids;
}

/**
 * Index authority-crosswalk rows for the requested QIDs only.
 * Row shape: `{ wikidata: "Q1", crosswalk: { viaf, cbdb, ndl, … } }`
 * @param {string} crosswalkPath
 * @param {Set<string>} wantedQids
 */
export async function indexAuthorityCrosswalk(crosswalkPath, wantedQids) {
  /** @type {Map<string, Record<string, string | string[]>>} */
  const index = new Map();
  if (!fs.existsSync(crosswalkPath)) {
    throw new Error(`Missing crosswalk sidecar: ${crosswalkPath}`);
  }
  const rl = readline.createInterface({
    input: fs.createReadStream(crosswalkPath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const row = JSON.parse(trimmed);
    const qid = normalizeQid(row.wikidata);
    if (!qid || !wantedQids.has(qid)) continue;
    const cw = row.crosswalk && typeof row.crosswalk === 'object' ? row.crosswalk : {};
    index.set(qid, { ...cw });
  }
  return index;
}

/**
 * Fill missing keys from pair sidecars (`{ wikidata, viaf|cbdb|ndl }`).
 * @param {Map<string, Record<string, string | string[]>>} index
 * @param {Set<string>} wantedQids
 * @param {{ file: string, key: string }[]} pairs
 */
export async function enrichFromPairFiles(index, wantedQids, pairs) {
  for (const { file, key } of pairs) {
    if (!fs.existsSync(file)) continue;
    const rl = readline.createInterface({
      input: fs.createReadStream(file),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const row = JSON.parse(trimmed);
      const qid = normalizeQid(row.wikidata);
      if (!qid || !wantedQids.has(qid)) continue;
      const value = row[key];
      if (value == null || value === '') continue;
      const existing = index.get(qid) ?? {};
      if (existing[key] == null || existing[key] === '') {
        existing[key] = String(value);
        index.set(qid, existing);
      }
    }
  }
}

/**
 * Attach crosswalks onto one persons.ndjson (rewrites in place via temp file).
 * @param {string} personsPath
 * @param {Map<string, Record<string, string | string[]>>} index
 */
export async function attachCrosswalkToPersonFile(personsPath, index) {
  const stats = {
    rows: 0,
    withSidecar: 0,
    withCrosswalk: 0,
    keys: /** @type {Record<string, number>} */ ({}),
  };
  /** @type {any[]} */
  const out = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(personsPath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const row = JSON.parse(trimmed);
    stats.rows++;
    const qid = normalizeQid(row.authorityId);
    const incoming = qid ? index.get(qid) : undefined;
    if (incoming && Object.keys(incoming).length) stats.withSidecar++;
    row.metadata ??= {};
    const merged = mergePersonCrosswalk(row.metadata.crosswalk, incoming, row.authorityId);
    if (merged) {
      row.metadata.crosswalk = merged;
      stats.withCrosswalk++;
      for (const key of Object.keys(merged)) {
        stats.keys[key] = (stats.keys[key] ?? 0) + 1;
      }
    }
    out.push(row);
  }
  writeNdjson(personsPath, out);
  return stats;
}

/** List `person-*` pack dirs that contain persons.ndjson. */
export function listPersonPackDirs(wikidataRoot, packFilter) {
  const wanted = packFilter?.length
    ? new Set(packFilter.map((name) => name.trim()).filter(Boolean))
    : null;
  return fs
    .readdirSync(wikidataRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('person-'))
    .filter((entry) => !wanted || wanted.has(entry.name))
    .map((entry) => path.join(wikidataRoot, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'persons.ndjson')));
}

/**
 * @param {{
 *   wikidataRoot: string,
 *   crosswalkPath: string,
 *   packs?: string[],
 *   alsoPairs?: boolean,
 * }} opts
 */
export async function attachAuthorityCrosswalk(opts) {
  const packDirs = listPersonPackDirs(opts.wikidataRoot, opts.packs);
  if (!packDirs.length) {
    throw new Error(`No person packs under ${opts.wikidataRoot}`);
  }
  const personFiles = packDirs.map((dir) => path.join(dir, 'persons.ndjson'));
  const wantedQids = await collectPersonQids(personFiles);
  const index = await indexAuthorityCrosswalk(opts.crosswalkPath, wantedQids);

  if (opts.alsoPairs) {
    await enrichFromPairFiles(index, wantedQids, [
      { file: path.join(opts.wikidataRoot, 'viaf-wikidata-concordance.ndjson'), key: 'viaf' },
      { file: path.join(opts.wikidataRoot, 'cbdb-wikidata-concordance.ndjson'), key: 'cbdb' },
      { file: path.join(opts.wikidataRoot, 'ndl-wikidata-concordance.ndjson'), key: 'ndl' },
      { file: path.join(opts.wikidataRoot, 'dila-wikidata-concordance.ndjson'), key: 'dila' },
      { file: path.join(opts.wikidataRoot, 'bdrc-wikidata-concordance.ndjson'), key: 'bdrc' },
    ]);
  }

  /** @type {Record<string, Awaited<ReturnType<typeof attachCrosswalkToPersonFile>>>} */
  const byPack = {};
  for (const dir of packDirs) {
    const name = path.basename(dir);
    byPack[name] = await attachCrosswalkToPersonFile(path.join(dir, 'persons.ndjson'), index);
  }

  return {
    personQids: wantedQids.size,
    indexed: index.size,
    packs: byPack,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const wikidataRoot = path.resolve(ROOT, arg('--wikidata-root', 'packs/wikidata'));
  const crosswalkPath = path.resolve(
    ROOT,
    arg('--crosswalk', path.join(wikidataRoot, 'wikidata-authority-crosswalk.ndjson')),
  );
  const packsArg = arg('--packs', '');
  const packs = packsArg ? packsArg.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

  const result = await attachAuthorityCrosswalk({
    wikidataRoot,
    crosswalkPath,
    packs,
    alsoPairs: hasFlag('--also-pairs'),
  });

  console.log(
    `Indexed ${result.indexed.toLocaleString()} / ${result.personQids.toLocaleString()} person QIDs from ${path.relative(ROOT, crosswalkPath)}`,
  );
  for (const [name, stats] of Object.entries(result.packs)) {
    const keySummary = Object.entries(stats.keys)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, n]) => `${k}=${n}`)
      .join(', ');
    console.log(
      `  ${name}: ${stats.rows.toLocaleString()} rows; ` +
        `${stats.withSidecar.toLocaleString()} sidecar hits; ` +
        `${stats.withCrosswalk.toLocaleString()} with crosswalk` +
        (keySummary ? ` (${keySummary})` : ''),
    );
  }
}
