import fs from 'node:fs';
import path from 'node:path';

/** @typedef {import('./types.mjs').AuthorityCandidate} AuthorityCandidate */

/**
 * @param {string} filePath
 * @param {Iterable<AuthorityCandidate>} candidates
 */
export function writeNdjson(filePath, candidates) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const fd = fs.openSync(filePath, 'w');
  try {
    for (const c of candidates) {
      fs.writeSync(fd, `${JSON.stringify(c)}\n`);
    }
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * @param {string} filePath
 * @returns {AuthorityCandidate[]}
 */
export function readNdjson(filePath) {
  // Read as a Buffer and decode line-by-line rather than fs.readFileSync(filePath, 'utf8'):
  // V8 caps string length below what a single large ndjson file can produce
  // (ERR_STRING_TOO_LONG), but a Buffer has a much higher ceiling.
  const buf = fs.readFileSync(filePath);
  const records = [];
  let start = 0;
  while (start <= buf.length) {
    let end = buf.indexOf(0x0a, start);
    if (end === -1) end = buf.length;
    if (end > start) {
      const line = buf.toString('utf8', start, end).trim();
      if (line) records.push(JSON.parse(line));
    }
    start = end + 1;
  }
  return records;
}

/**
 * @param {string} outDir
 * @param {string} name
 * @param {AuthorityCandidate[]} candidates
 */
export function writePackFile(outDir, name, candidates) {
  const filePath = path.join(outDir, name);
  writeNdjson(filePath, candidates);
  return { filePath, count: candidates.length };
}
