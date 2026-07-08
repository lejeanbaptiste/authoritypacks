/**
 * Stream a Wikidata JSON dump → raw NDJSON for one or more entity kinds (one scan).
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import readline from 'node:readline';
import { countNdjsonLines, resolveExtractSelection } from './dynastySelect.mjs';
import { entityMatchesKind } from './kindMatch.mjs';
import { rawEntityFromKind, rawFileNameForKind } from './rawFromEntity.mjs';

/** @typedef {'person' | 'place' | 'org' | 'work'} WikidataKindId */
/** @typedef {{ languageId: string, labelLangs: string[] }} LanguageSlice */

const VALID_KINDS = /** @type {const} */ (['person', 'place', 'org', 'work']);

/**
 * @param {{
 *   languageId?: string;
 *   labelLang?: string;
 *   labelLangs?: string[];
 *   languageSlices?: LanguageSlice[];
 * }} opts
 * @returns {LanguageSlice[]}
 */
export function normalizeLanguageSlices(opts) {
  if (opts.languageSlices?.length) return opts.languageSlices;
  const labelLangs =
    opts.labelLangs ?? (opts.labelLang ? [opts.labelLang] : undefined);
  if (!opts.languageId || !labelLangs?.length) {
    throw new Error('languageId and labelLang(s) or languageSlices are required');
  }
  return [{ languageId: opts.languageId, labelLangs }];
}

/** @param {string} outDir @param {string} languageId @param {boolean} multiLang */
function rawDirForLanguage(outDir, languageId, multiLang) {
  if (!multiLang) return outDir;
  const dir = path.join(outDir, languageId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** @param {Record<string, unknown>} checkpoint @returns {string[]} */
function checkpointLanguageIds(checkpoint) {
  if (Array.isArray(checkpoint.languageIds) && checkpoint.languageIds.length) {
    return /** @type {string[]} */ (checkpoint.languageIds);
  }
  if (checkpoint.languageId) return [String(checkpoint.languageId)];
  return [];
}

/** @param {Record<string, unknown>} matched @param {string} languageId @param {WikidataKindId} kind */
function matchedCount(matched, languageId, kind) {
  const byLang = matched[languageId];
  if (byLang && typeof byLang === 'object') {
    return Number(/** @type {Record<string, number>} */ (byLang)[kind] ?? 0);
  }
  return Number(/** @type {Record<string, number>} */ (matched)[kind] ?? 0);
}

/** @param {string} dumpPath */
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

function sameStringArray(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

/**
 * @param {string[]} kinds
 * @returns {WikidataKindId[]}
 */
export function parseKindList(kinds) {
  const parsed = kinds.map((k) => k.trim()).filter(Boolean);
  for (const kind of parsed) {
    if (!VALID_KINDS.includes(/** @type {WikidataKindId} */ (kind))) {
      throw new Error(`Unknown kind "${kind}" — use person, place, org, work`);
    }
  }
  if (!parsed.length) throw new Error('At least one kind is required');
  return /** @type {WikidataKindId[]} */ (parsed);
}

/**
 * @param {{
 *   dumpPath: string;
 *   kinds: WikidataKindId[];
 *   languageId?: string;
 *   labelLang?: string;
 *   labelLangs?: string[];
 *   languageSlices?: LanguageSlice[];
 *   membership: 'dynasty-p27' | 'pre-ming' | 'country-p27' | 'label-only';
 *   selection: ReturnType<typeof resolveExtractSelection>;
 *   countryId?: string;
 *   kindQueries: typeof import('./kind-queries.json').kinds;
 *   outDir: string;
 *   maxMatches?: number;
 *   progressEvery?: number;
 *   checkpointEvery?: number;
 *   resume?: boolean;
 * }} opts
 */
export async function extractWikidataKinds(opts) {
  const languageSlices = normalizeLanguageSlices(opts);
  const languageIds = languageSlices.map((slice) => slice.languageId);
  const multiLang = languageSlices.length > 1;

  fs.mkdirSync(opts.outDir, { recursive: true });

  /** @type {Record<string, Record<WikidataKindId, string>>} */
  const outFiles = {};
  /** @type {Record<string, Record<WikidataKindId, number>>} */
  const fds = {};
  /** @type {Record<string, Record<WikidataKindId, number>>} */
  const matched = {};

  for (const slice of languageSlices) {
    const rawDir = rawDirForLanguage(opts.outDir, slice.languageId, multiLang);
    outFiles[slice.languageId] = {};
    matched[slice.languageId] = {};
    for (const kind of opts.kinds) {
      const outFile = path.join(rawDir, rawFileNameForKind(kind));
      outFiles[slice.languageId][kind] = outFile;
      matched[slice.languageId][kind] = 0;
    }
  }

  const checkpointPath = path.join(opts.outDir, 'extract.checkpoint.json');
  const existingCheckpoint = opts.resume ? readCheckpoint(checkpointPath) : null;

  if (opts.resume && !existingCheckpoint) {
    throw new Error(`--resume requested but no checkpoint at ${checkpointPath}`);
  }

  if (existingCheckpoint) {
    if (path.resolve(String(existingCheckpoint.dumpPath)) !== path.resolve(opts.dumpPath)) {
      throw new Error('Checkpoint dumpPath does not match --dump');
    }
    if (!sameStringArray(checkpointLanguageIds(existingCheckpoint), languageIds)) {
      throw new Error('Checkpoint languageIds do not match current --language/--languages');
    }
    if (existingCheckpoint.membership !== opts.membership) {
      throw new Error('Checkpoint membership does not match current --membership');
    }
    if (!sameStringArray(existingCheckpoint.kinds ?? [], opts.kinds)) {
      throw new Error('Checkpoint kinds do not match current --kinds');
    }
    if (opts.membership === 'country-p27' && existingCheckpoint.countryId !== opts.countryId) {
      throw new Error('Checkpoint countryId does not match current --country');
    }
    if (
      opts.membership === 'dynasty-p27' &&
      !sameStringArray(existingCheckpoint.dynastyIds ?? [], opts.selection.ids)
    ) {
      throw new Error('Checkpoint dynastyIds do not match current dynasty selection');
    }
  }

  const skipUntil = existingCheckpoint?.entitiesScanned ?? 0;
  let entitiesScanned = 0;

  if (existingCheckpoint?.matched) {
    for (const slice of languageSlices) {
      for (const kind of opts.kinds) {
        matched[slice.languageId][kind] = matchedCount(existingCheckpoint.matched, slice.languageId, kind);
      }
    }
  } else if (opts.resume) {
    for (const slice of languageSlices) {
      for (const kind of opts.kinds) {
        matched[slice.languageId][kind] = countNdjsonLines(outFiles[slice.languageId][kind]);
      }
    }
  }

  for (const slice of languageSlices) {
    fds[slice.languageId] = {};
    for (const kind of opts.kinds) {
      fds[slice.languageId][kind] = fs.openSync(
        outFiles[slice.languageId][kind],
        opts.resume ? 'a' : 'w',
      );
    }
  }

  if (opts.resume && skipUntil > 0) {
    const totalMatched = languageSlices.reduce(
      (sum, slice) =>
        sum + opts.kinds.reduce((kindSum, kind) => kindSum + matched[slice.languageId][kind], 0),
      0,
    );
    // eslint-disable-next-line no-console
    console.log(
      `Resuming after ${skipUntil.toLocaleString()} entities (${totalMatched.toLocaleString()} rows already across languages/kinds)`,
    );
  }

  const checkpointEvery = opts.checkpointEvery ?? opts.progressEvery ?? 500_000;

  const membershipOpts = {
    membership: opts.membership,
    dynastyQids: opts.membership === 'dynasty-p27' ? opts.selection.qids : undefined,
    countryQids: opts.membership === 'country-p27' ? opts.selection.qids : undefined,
    preMingSpec: opts.selection.preMingSpec ?? undefined,
  };

  const checkpointData = () => ({
    updatedAt: new Date().toISOString(),
    dumpPath: opts.dumpPath,
    kinds: opts.kinds,
    membership: opts.membership,
    dynastyIds: opts.membership === 'dynasty-p27' ? opts.selection.ids : undefined,
    countryId: opts.membership === 'country-p27' ? opts.countryId : undefined,
    dynastyQids: opts.selection.qids,
    languageIds,
    languageSlices,
    entitiesScanned,
    matched,
    skipUntil: entitiesScanned,
    outFiles,
  });

  let interrupted = false;
  const onSignal = () => {
    interrupted = true;
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const stream = openDumpStream(opts.dumpPath);

  try {
    for await (const entity of iterateDumpEntities(stream)) {
      if (interrupted) break;

      entitiesScanned++;

      if (entitiesScanned <= skipUntil) {
        if (opts.progressEvery && entitiesScanned % opts.progressEvery === 0) {
          // eslint-disable-next-line no-console
          console.log(
            `  skipping… ${entitiesScanned.toLocaleString()} / ${skipUntil.toLocaleString()}`,
          );
        }
        continue;
      }

      if (opts.progressEvery && entitiesScanned % opts.progressEvery === 0) {
        const parts = languageSlices.flatMap((slice) =>
          opts.kinds.map(
            (kind) => `${slice.languageId}:${kind} ${matched[slice.languageId][kind].toLocaleString()}`,
          ),
        );
        // eslint-disable-next-line no-console
        console.log(`  scanned ${entitiesScanned.toLocaleString()} … matched ${parts.join(', ')}`);
      }

      let wroteAny = false;
      for (const slice of languageSlices) {
        const sliceOpts = { labelLangs: slice.labelLangs, ...membershipOpts };
        for (const kind of opts.kinds) {
          if (!entityMatchesKind(entity, kind, opts.kindQueries, sliceOpts)) continue;
          const raw = rawEntityFromKind(entity, kind, slice.labelLangs);
          if (!raw) continue;
          fs.writeSync(fds[slice.languageId][kind], `${JSON.stringify(raw)}\n`);
          matched[slice.languageId][kind]++;
          wroteAny = true;
        }
      }

      if (opts.maxMatches) {
        const total = languageSlices.reduce(
          (sum, slice) =>
            sum + opts.kinds.reduce((kindSum, kind) => kindSum + matched[slice.languageId][kind], 0),
          0,
        );
        if (total >= opts.maxMatches) break;
      }

      if (checkpointEvery && entitiesScanned % checkpointEvery === 0) {
        writeCheckpoint(checkpointPath, checkpointData());
      }

      if (!wroteAny && checkpointEvery && entitiesScanned % checkpointEvery === 0) {
        writeCheckpoint(checkpointPath, checkpointData());
      }
    }
  } finally {
    for (const slice of languageSlices) {
      for (const kind of opts.kinds) fs.closeSync(fds[slice.languageId][kind]);
    }
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  const complete = !interrupted && !opts.maxMatches;
  const meta = {
    extractedAt: new Date().toISOString(),
    dumpPath: opts.dumpPath,
    kinds: opts.kinds,
    membership: opts.membership,
    dynastyIds: opts.membership === 'dynasty-p27' ? opts.selection.ids : undefined,
    countryId: opts.membership === 'country-p27' ? opts.countryId : undefined,
    dynastyQids: opts.selection.qids,
    dynastySlug: opts.selection.slug,
    languageIds,
    languageSlices,
    entitiesScanned,
    matched,
    includeFictional: opts.kinds.includes('person'),
    resumed: Boolean(existingCheckpoint),
    complete,
    interrupted,
    outFiles,
  };

  writeCheckpoint(checkpointPath, { ...checkpointData(), complete, interrupted });

  if (complete) {
    fs.writeFileSync(path.join(opts.outDir, 'extract-meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
    if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);
  } else {
    // eslint-disable-next-line no-console
    console.log(`Checkpoint saved → ${checkpointPath}`);
    if (interrupted) {
      // eslint-disable-next-line no-console
      console.log('Interrupted — re-run with --resume to continue.');
    }
  }

  return { ...meta, count: matched };
}

/** @param {string} checkpointPath */
function readCheckpoint(checkpointPath) {
  if (!fs.existsSync(checkpointPath)) return null;
  return JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
}

/** @param {string} checkpointPath @param {Record<string, unknown>} data */
function writeCheckpoint(checkpointPath, data) {
  fs.writeFileSync(checkpointPath, `${JSON.stringify(data, null, 2)}\n`);
}
