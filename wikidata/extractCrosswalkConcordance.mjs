#!/usr/bin/env node
/**
 * One pass over a Wikidata JSON dump → authority crosswalk NDJSON + pair sidecars.
 *
 * Streams every entity and copies selected external-id properties (P214 VIAF,
 * P497 CBDB, P349 NDL, etc.) into:
 *   - wikidata-authority-crosswalk.ndjson  (one row per Q-id with any selected id)
 *   - viaf-wikidata-concordance.ndjson
 *   - cbdb-wikidata-concordance.ndjson
 *   - ndl-wikidata-concordance.ndjson
 *   - dila-wikidata-concordance.ndjson   (when `dila` is in --keys)
 *   - bdrc-wikidata-concordance.ndjson   (when `bdrc` is in --keys)
 *
 * Usage:
 *   node wikidata/extractCrosswalkConcordance.mjs \
 *     --dump /home/d/Data/latest-all.json.bz2 \
 *     --out-dir packs/wikidata \
 *     --keys viaf,cbdb,ndl,dila,bdrc \
 *     --resume
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crosswalkFromEntity, loadIdentifierProperties } from './identifierClaims.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** @typedef {'viaf' | 'cbdb' | 'ndl' | 'dila' | 'chgis' | 'bdrc'} CrosswalkKey */

export const DEFAULT_CROSSWALK_KEYS = /** @type {CrosswalkKey[]} */ ([
  'viaf',
  'cbdb',
  'ndl',
  'dila',
  'bdrc',
]);

/** Keys that also get a dedicated `{key}-wikidata-concordance.ndjson` pair file. */
export const PAIR_KEYS = /** @type {CrosswalkKey[]} */ ([
  'viaf',
  'cbdb',
  'ndl',
  'dila',
  'bdrc',
]);

/**
 * @param {string} dumpPath
 * @returns {import('node:stream').Readable}
 */
export function openDumpStream(dumpPath) {
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
export async function* iterateDumpEntities(stream) {
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
 * @param {unknown} entity
 * @param {CrosswalkKey[]} keys
 * @returns {{ wikidata: string, crosswalk: Record<string, string> } | null}
 */
export function crosswalkRowFromEntity(entity, keys) {
  const qid = typeof entity?.id === 'string' ? entity.id.toUpperCase() : null;
  if (!qid || !/^Q\d+$/.test(qid)) return null;

  const full = crosswalkFromEntity(entity);
  /** @type {Record<string, string>} */
  const crosswalk = {};
  for (const key of keys) {
    const value = full[key];
    if (value == null) continue;
    if (Array.isArray(value)) {
      if (value[0]) crosswalk[key] = String(value[0]);
      continue;
    }
    crosswalk[key] = String(value);
  }
  if (!Object.keys(crosswalk).length) return null;
  return { wikidata: qid, crosswalk };
}

/**
 * @param {string} qid
 * @param {Record<string, string>} crosswalk
 * @param {Record<CrosswalkKey, { map: Map<string, string>, ambiguous: number }>} pairState
 */
export function addCrosswalkToPairMaps(qid, crosswalk, pairState) {
  for (const key of PAIR_KEYS) {
    const value = crosswalk[key];
    if (!value) continue;
    const state = pairState[key];
    if (!state) continue;
    const existing = state.map.get(value);
    if (existing && existing !== qid) {
      state.ambiguous += 1;
      continue;
    }
    if (!existing) state.map.set(value, qid);
  }
}

/**
 * @param {Record<CrosswalkKey, { map: Map<string, string>, ambiguous: number }>} pairState
 * @param {string} outDir
 */
export function writePairConcordanceFiles(pairState, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const key of PAIR_KEYS) {
    const state = pairState[key];
    if (!state || state.map.size === 0) continue;
    const fileName = `${key}-wikidata-concordance.ndjson`;
    const lines = [...state.map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
      .map(([authorityId, wikidata]) => JSON.stringify({ wikidata, [key]: authorityId }));
    fs.writeFileSync(path.join(outDir, fileName), lines.length ? `${lines.join('\n')}\n` : '', 'utf8');
  }
}

/**
 * Rebuild pair maps from an existing crosswalk NDJSON file (for --resume).
 *
 * @param {string} crosswalkPath
 * @param {Record<CrosswalkKey, { map: Map<string, string>, ambiguous: number }>} pairState
 * @returns {number} row count
 */
export function ingestCrosswalkNdjson(crosswalkPath, pairState) {
  if (!fs.existsSync(crosswalkPath)) return 0;
  const contents = fs.readFileSync(crosswalkPath, 'utf8');
  let rows = 0;
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows += 1;
    const row = JSON.parse(trimmed);
    const qid = row.wikidata;
    const crosswalk = row.crosswalk;
    if (!qid || !crosswalk) continue;
    addCrosswalkToPairMaps(qid, crosswalk, pairState);
  }
  return rows;
}

/** @returns {Record<CrosswalkKey, { map: Map<string, string>, ambiguous: number }>} */
export function createPairState() {
  return {
    viaf: { map: new Map(), ambiguous: 0 },
    cbdb: { map: new Map(), ambiguous: 0 },
    ndl: { map: new Map(), ambiguous: 0 },
    dila: { map: new Map(), ambiguous: 0 },
    bdrc: { map: new Map(), ambiguous: 0 },
  };
}

/**
 * @param {{
 *   dumpPath: string;
 *   outDir: string;
 *   keys?: CrosswalkKey[];
 *   progressEvery?: number;
 *   checkpointEvery?: number;
 *   resume?: boolean;
 *   maxRows?: number;
 * }} opts
 */
export async function extractCrosswalkConcordance(opts) {
  const keys = opts.keys ?? DEFAULT_CROSSWALK_KEYS;
  const spec = loadIdentifierProperties();
  const allowedKeys = new Set(spec.properties.map((prop) => prop.key));
  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unknown crosswalk key "${key}". See wikidata/identifierProperties.json`);
    }
  }

  fs.mkdirSync(opts.outDir, { recursive: true });
  const crosswalkPath = path.join(opts.outDir, 'wikidata-authority-crosswalk.ndjson');
  const checkpointPath = path.join(opts.outDir, 'crosswalk-extract.checkpoint.json');
  const metaPath = path.join(opts.outDir, 'crosswalk-extract-meta.json');

  const existingCheckpoint =
    opts.resume && fs.existsSync(checkpointPath)
      ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8'))
      : null;

  if (
    existingCheckpoint &&
    path.resolve(String(existingCheckpoint.dumpPath)) !== path.resolve(opts.dumpPath)
  ) {
    throw new Error(
      `Checkpoint dump path mismatch.\n  checkpoint: ${existingCheckpoint.dumpPath}\n  requested: ${opts.dumpPath}`,
    );
  }

  const pairState = createPairState();
  const skipUntil = existingCheckpoint?.entitiesScanned ?? 0;
  let entitiesScanned = 0;
  let rowsMatched =
    existingCheckpoint?.rowsMatched ??
    (opts.resume ? ingestCrosswalkNdjson(crosswalkPath, pairState) : 0);

  if (opts.resume && skipUntil > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `Resuming after ${skipUntil.toLocaleString()} entities (${rowsMatched.toLocaleString()} crosswalk rows already in file)`,
    );
  }

  const progressEvery = opts.progressEvery ?? 500_000;
  const checkpointEvery = opts.checkpointEvery ?? progressEvery;
  const stream = openDumpStream(opts.dumpPath);
  const fd = fs.openSync(crosswalkPath, opts.resume && skipUntil > 0 ? 'a' : 'w');

  const checkpointData = () => ({
    updatedAt: new Date().toISOString(),
    dumpPath: opts.dumpPath,
    keys,
    entitiesScanned,
    rowsMatched,
    skipUntil: entitiesScanned,
    crosswalkPath,
  });

  let interrupted = false;
  const onSignal = () => {
    interrupted = true;
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    for await (const entity of iterateDumpEntities(stream)) {
      if (interrupted) break;

      entitiesScanned += 1;

      if (entitiesScanned <= skipUntil) {
        if (progressEvery && entitiesScanned % progressEvery === 0) {
          // eslint-disable-next-line no-console
          console.log(
            `  skipping… ${entitiesScanned.toLocaleString()} / ${skipUntil.toLocaleString()}`,
          );
        }
        continue;
      }

      if (progressEvery && entitiesScanned % progressEvery === 0) {
        // eslint-disable-next-line no-console
        console.log(
          `  scanned ${entitiesScanned.toLocaleString()} … matched ${rowsMatched.toLocaleString()}`,
        );
      }

      const row = crosswalkRowFromEntity(entity, keys);
      if (row) {
        fs.writeSync(fd, `${JSON.stringify(row)}\n`);
        rowsMatched += 1;
        addCrosswalkToPairMaps(row.wikidata, row.crosswalk, pairState);
      }

      if (opts.maxRows && rowsMatched >= opts.maxRows) break;

      if (checkpointEvery && entitiesScanned % checkpointEvery === 0) {
        fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpointData(), null, 2)}\n`);
      }
    }
  } finally {
    fs.closeSync(fd);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    if (interrupted || (opts.maxRows && rowsMatched >= opts.maxRows)) {
      fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpointData(), null, 2)}\n`);
    }
  }

  const complete = !interrupted && !(opts.maxRows && rowsMatched >= opts.maxRows);
  writePairConcordanceFiles(pairState, opts.outDir);

  const meta = {
    extractedAt: new Date().toISOString(),
    dumpPath: opts.dumpPath,
    keys,
    entitiesScanned,
    rowsMatched,
    pairCounts: Object.fromEntries(
      PAIR_KEYS.map((key) => [key, pairState[key]?.map.size ?? 0]),
    ),
    ambiguousSkipped: Object.fromEntries(
      PAIR_KEYS.map((key) => [key, pairState[key]?.ambiguous ?? 0]),
    ),
    resumed: Boolean(existingCheckpoint),
    complete,
    interrupted,
  };

  fs.writeFileSync(checkpointPath, `${JSON.stringify({ ...checkpointData(), ...meta }, null, 2)}\n`);
  if (complete) {
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
    if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);
  }

  return meta;
}

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dumpPath = arg('--dump', '');
  const outDir = path.resolve(arg('--out-dir', path.join(ROOT, 'packs/wikidata')));
  const keysArg = arg('--keys', DEFAULT_CROSSWALK_KEYS.join(','));
  const keys = /** @type {CrosswalkKey[]} */ (
    keysArg
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const maxRows = arg('--max', '') ? Number.parseInt(arg('--max', ''), 10) : undefined;
  const progressEvery = Number.parseInt(arg('--progress', '500000'), 10);
  const checkpointEvery = arg('--checkpoint-every', '')
    ? Number.parseInt(arg('--checkpoint-every', ''), 10)
    : undefined;

  if (!dumpPath) {
    console.error(
      'Usage: node wikidata/extractCrosswalkConcordance.mjs --dump PATH [--out-dir packs/wikidata] [--keys viaf,cbdb,ndl,dila,bdrc] [--resume] [--max N] [--progress N]',
    );
    process.exit(1);
  }

  extractCrosswalkConcordance({
    dumpPath: path.resolve(dumpPath),
    outDir,
    keys,
    progressEvery,
    checkpointEvery,
    resume: hasFlag('--resume'),
    maxRows,
  })
    .then((meta) => {
      // eslint-disable-next-line no-console
      console.log('Crosswalk extract complete.');
      for (const key of PAIR_KEYS) {
        const count = meta.pairCounts[key];
        const ambiguous = meta.ambiguousSkipped[key];
        if (count) {
          // eslint-disable-next-line no-console
          console.log(
            `  ${key}: ${Number(count).toLocaleString()} pairs` +
              (ambiguous ? ` (${Number(ambiguous).toLocaleString()} ambiguous skipped)` : ''),
          );
        }
      }
      // eslint-disable-next-line no-console
      console.log(
        `  rows: ${meta.rowsMatched.toLocaleString()} → ${path.join(outDir, 'wikidata-authority-crosswalk.ndjson')}`,
      );
      if (meta.interrupted) process.exit(130);
      if (!meta.complete) process.exit(0);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
