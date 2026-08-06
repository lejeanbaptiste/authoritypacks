#!/usr/bin/env node
/**
 * Build authority-reference-norbert-{version}.zip for LJB A6 lookup.
 *
 * Contains:
 *   norbert.sqlite3
 *   manifest.json
 *
 * CBDB used to be bundled here too (cbdb-person.sqlite3), built by stripping
 * the full CBDB sqlite locally and shipping the result via our own GitHub
 * release. As of 2026-08-06 that's no longer how LJB gets CBDB reference
 * data: each install fetches CBDB's own official release directly and strips
 * it locally itself (see leaf-writer's downloadCbdbDirect in
 * apps/desktop/src/authorityDatabases.ts and
 * leaf-writer/docs/huckbot5000-planning.md), so this app is never the one
 * redistributing a repackaged copy of CBDB's data. Norbert has no equivalent
 * concern — it's our own reduced-authority export ("internal-derived-public"
 * in upstream/pins.json), not a third party's copyrighted compilation — so
 * it keeps shipping this way.
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

if (!norbertSql) throw new Error('Missing Norbert public SQL dump');

const norbertOut = path.join(outDir, 'norbert.sqlite3');

console.log('Building Norbert reference sqlite…');
await buildNorbertSqlite({
  sqlPath: norbertSql,
  labelsPath: norbertLabels,
  outPath: norbertOut,
});

const version = pins.norbert?.version ?? 'norbert';

const manifest = {
  id: 'authority-reference-norbert',
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
  },
  notes: [
    'Tagging packs remain separate NDJSON tarballs.',
    'DILA reference TEI is fetched by LJB from Open Content, not included here.',
    'CBDB reference data is fetched directly from CBDB\'s own official release by each LJB install — not bundled here. See leaf-writer/docs/huckbot5000-planning.md.',
  ],
};

const manifestPath = path.join(outDir, 'manifest.json');
await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

await fsp.mkdir(releaseDir, { recursive: true });
const zipName = `authority-reference-norbert-${version.replace(/[^A-Za-z0-9._+-]+/g, '_')}.zip`;
const zipPath = path.join(releaseDir, zipName);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const staging = path.join(outDir, '_zip_stage');
await fsp.rm(staging, { recursive: true, force: true });
await fsp.mkdir(staging, { recursive: true });
await fsp.copyFile(norbertOut, path.join(staging, 'norbert.sqlite3'));
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
