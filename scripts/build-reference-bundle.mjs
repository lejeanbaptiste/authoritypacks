#!/usr/bin/env node
/**
 * Build authority-reference-person-{version}.zip for LJB A6 lookup.
 *
 * Contains:
 *   norbert.sqlite3
 *   cbdb-person.sqlite3
 *   manifest.json
 *
 * Usage:
 *   node scripts/build-reference-bundle.mjs [--upstream DIR] [--out DIR]
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNorbertSqlite } from '../norbert/sqlToSqlite.mjs';
import { stripCbdbReferenceDb } from '../cbdb/stripReferenceDb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const pins = JSON.parse(await fsp.readFile(path.join(repoRoot, 'upstream/pins.json'), 'utf8'));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const upstreamDir = path.resolve(arg('--upstream', path.join(repoRoot, '.upstream')));
const outDir = path.resolve(arg('--out', path.join(repoRoot, 'dist/reference')));
const releaseDir = path.resolve(arg('--release', path.join(repoRoot, 'release')));

const sha256File = async (filePath) => {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
};

const resolveExisting = (...candidates) => {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
};

await fsp.mkdir(outDir, { recursive: true });

const norbertSql = resolveExisting(
  path.join(repoRoot, pins.norbert?.file ?? 'norbert_public/norbert-authority.sql'),
  path.join(repoRoot, 'norbert_secret/norbert-authority.sql'),
  path.join(repoRoot, '../norbert_public/norbert-authority.sql'),
);
const norbertLabels = resolveExisting(
  path.join(path.dirname(norbertSql ?? ''), 'dynasty-labels.json'),
  path.join(repoRoot, 'norbert_secret/dynasty-labels.json'),
  path.join(repoRoot, 'norbert_public/dynasty-labels.json'),
);
const cbdbSqlite = resolveExisting(
  path.join(upstreamDir, 'cbdb.sqlite3'),
  path.join(repoRoot, '../leaf-writer/databases/cbdb_20260627.sqlite3'),
);

if (!norbertSql) throw new Error('Missing Norbert public SQL dump');
if (!cbdbSqlite) throw new Error('Missing CBDB sqlite — run fetch:upstream');

const norbertOut = path.join(outDir, 'norbert.sqlite3');
const cbdbOut = path.join(outDir, 'cbdb-person.sqlite3');

console.log('Building Norbert reference sqlite…');
await buildNorbertSqlite({
  sqlPath: norbertSql,
  labelsPath: norbertLabels,
  outPath: norbertOut,
});

console.log('Stripping CBDB person reference sqlite…');
stripCbdbReferenceDb({ sqlitePath: cbdbSqlite, outPath: cbdbOut });

const version = [
  pins.cbdb?.version ?? 'cbdb',
  pins.norbert?.version ?? 'norbert',
].join('+');

const manifest = {
  id: 'authority-reference-person',
  version,
  compiledAt: new Date().toISOString(),
  compilePolicyVersion: pins.compilePolicyVersion,
  files: {
    'norbert.sqlite3': {
      sha256: await sha256File(norbertOut),
      bytes: fs.statSync(norbertOut).size,
      license: pins.norbert?.license,
      attribution: pins.norbert?.attribution,
      sourceVersion: pins.norbert?.version,
    },
    'cbdb-person.sqlite3': {
      sha256: await sha256File(cbdbOut),
      bytes: fs.statSync(cbdbOut).size,
      license: pins.cbdb?.license,
      attribution: pins.cbdb?.attribution,
      sourceVersion: pins.cbdb?.version,
    },
  },
  notes: [
    'Tagging packs remain separate NDJSON tarballs.',
    'DILA reference TEI is fetched by LJB from Open Content, not included here.',
  ],
};

const manifestPath = path.join(outDir, 'manifest.json');
await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

await fsp.mkdir(releaseDir, { recursive: true });
const zipName = `authority-reference-person-${version.replace(/[^A-Za-z0-9._+-]+/g, '_')}.zip`;
const zipPath = path.join(releaseDir, zipName);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const staging = path.join(outDir, '_zip_stage');
await fsp.rm(staging, { recursive: true, force: true });
await fsp.mkdir(staging, { recursive: true });
await fsp.copyFile(norbertOut, path.join(staging, 'norbert.sqlite3'));
await fsp.copyFile(cbdbOut, path.join(staging, 'cbdb-person.sqlite3'));
await fsp.copyFile(manifestPath, path.join(staging, 'manifest.json'));

execFileSync('zip', ['-r', '-q', zipPath, '.'], { cwd: staging, stdio: 'inherit' });
await fsp.rm(staging, { recursive: true, force: true });

const zipSha = await sha256File(zipPath);
await fsp.writeFile(
  path.join(releaseDir, 'reference-index.json'),
  `${JSON.stringify({
    version,
    artifact: zipName,
    sha256: zipSha,
    bytes: fs.statSync(zipPath).size,
    manifest,
  }, null, 2)}\n`,
);

console.log(`Reference bundle → ${zipPath}`);
console.log(`  sha256 ${zipSha}`);
