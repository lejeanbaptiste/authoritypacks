import fs from 'node:fs';
import path from 'node:path';

import { writeNdjson } from './ndjson.mjs';

export const DATE_CHUNK_YEARS = 200;
export const MAX_CHUNKABLE_DATE_SPAN_YEARS = 400;

const intervalFor = (candidate) => {
  const start = candidate.metadata?.startYear;
  const end = candidate.metadata?.endYear ?? start;
  if (!Number.isFinite(start) && !Number.isFinite(end)) return null;
  const lo = Number.isFinite(start) ? start : end;
  const hi = Number.isFinite(end) ? end : start;
  // Zero is a common source sentinel, and multi-century / implausible spans
  // are not useful temporal evidence. Keep these people in undated instead of
  // copying them into every historical block.
  if (lo === 0 || hi === 0 || Math.abs(lo) > 3000 || Math.abs(hi) > 3000) return null;
  if (Math.abs(hi - lo) > MAX_CHUNKABLE_DATE_SPAN_YEARS) return null;
  return { start: lo, end: hi };
};

const blockStart = (year, blockYears) => Math.floor((year - 1) / blockYears) * blockYears + 1;
const blockEnd = (start, blockYears) => start + blockYears - 1;
const chunkName = (start, end) => `${String(start).padStart(5, '0')}-${String(end).padStart(5, '0')}.ndjson`;
const keyOf = (candidate) => `${candidate.source}\u0000${candidate.authorityId}`;

/** Write overlap-safe date chunks and return a manifest fragment. */
export function writeDateChunks(packDir, baseName, candidates, options = {}) {
  const blockYears = options.blockYears ?? DATE_CHUNK_YEARS;
  const chunkDir = path.join(packDir, path.basename(baseName, '.ndjson'));
  const byStart = new Map();
  const undated = [];
  for (const candidate of candidates) {
    const interval = intervalFor(candidate);
    if (!interval) {
      undated.push(candidate);
      continue;
    }
    const lo = Math.min(interval.start, interval.end);
    const hi = Math.max(interval.start, interval.end);
    for (let start = blockStart(lo, blockYears); start <= hi; start += blockYears) {
      const rows = byStart.get(start) ?? [];
      rows.push(candidate);
      byStart.set(start, rows);
    }
  }
  fs.rmSync(chunkDir, { recursive: true, force: true });
  const chunks = [...byStart.entries()].sort(([a], [b]) => a - b).map(([start, rows]) => {
    const end = blockEnd(start, blockYears);
    const file = chunkName(start, end);
    writeNdjson(path.join(chunkDir, file), rows);
    return { path: `${path.basename(chunkDir)}/${file}`, start, end, entityCount: rows.length };
  });
  let undatedPath;
  if (undated.length) {
    const file = 'undated.ndjson';
    writeNdjson(path.join(chunkDir, file), undated);
    undatedPath = `${path.basename(chunkDir)}/${file}`;
  }
  const distinctInput = new Set(candidates.map(keyOf));
  const emitted = new Set([...byStart.values(), undated].flat().map(keyOf));
  if (emitted.size !== distinctInput.size) throw new Error(`Date chunking lost entities for ${baseName}`);
  const inputStrings = new Set(candidates.flatMap((row) => row.searchStrings ?? []));
  const outputStrings = new Set([...byStart.values(), undated].flat().flatMap((row) => row.searchStrings ?? []));
  if (inputStrings.size !== outputStrings.size || [...inputStrings].some((value) => !outputStrings.has(value))) {
    throw new Error(`Date chunking lost search strings for ${baseName}`);
  }
  return {
    version: 1,
    blockYears,
    chunks,
    ...(undatedPath ? { undatedPath } : {}),
    inputEntityCount: candidates.length,
    distinctEntityCount: distinctInput.size,
    distinctStringCount: inputStrings.size,
    physicalEntityCount: chunks.reduce((total, chunk) => total + chunk.entityCount, 0) + undated.length,
    includeUndatedForLimit: options.includeUndatedForLimit === true,
  };
}
