#!/usr/bin/env node
/**
 * Download pinned CBDB sqlite + DILA XML into .upstream/ for CI and local bundle builds.
 *
 * Usage: node scripts/fetch-upstream.mjs [--out DIR]
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const pins = JSON.parse(await fsp.readFile(path.join(repoRoot, 'upstream/pins.json'), 'utf8'));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const outDir = path.resolve(arg('--out', path.join(repoRoot, '.upstream')));

const sha256File = async (filePath) => {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
};

const download = async (url, destPath) => {
  console.log(`  fetch ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  await fsp.writeFile(destPath, buffer);
  return destPath;
};

await fsp.mkdir(outDir, { recursive: true });

console.log('CBDB sqlite');
const zipPath = path.join(outDir, 'cbdb.zip');
await download(pins.cbdb.zipUrl, zipPath);

const sqlitePath = path.join(outDir, 'cbdb.sqlite3');
execFileSync('sh', ['-c', `unzip -p "${zipPath}" > "${sqlitePath}"`], {
  stdio: 'inherit',
  maxBuffer: 1024 * 1024 * 1024,
});

const sqliteDigest = await sha256File(sqlitePath);
if (sqliteDigest !== pins.cbdb.sqliteSha256) {
  throw new Error(
    `CBDB sqlite sha256 mismatch: got ${sqliteDigest}, expected ${pins.cbdb.sqliteSha256}`,
  );
}
await fsp.rm(zipPath, { force: true });
console.log(`  → ${sqlitePath} (${sqliteDigest.slice(0, 12)}…)`);

console.log('DILA XML');
const dilaBase = `https://raw.githubusercontent.com/DILA-edu/Authority-Databases/${pins.dila.commit}`;
for (const file of pins.dila.files) {
  const dest = path.join(outDir, file.localName);
  await download(`${dilaBase}/${file.repoPath}`, dest);
  const digest = await sha256File(dest);
  console.log(`  → ${file.localName} (${digest.slice(0, 12)}…)`);
}

console.log(`Upstream ready in ${outDir}`);
