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
  const text = fs.readFileSync(filePath, 'utf8');
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
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
