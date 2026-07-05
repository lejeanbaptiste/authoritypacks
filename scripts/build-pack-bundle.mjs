#!/usr/bin/env node
/**
 * Compile CBDB + DILA packs and produce dist/authority-packs-{version}.tar.gz + packs-index.json.
 *
 * Usage:
 *   node scripts/build-pack-bundle.mjs [--upstream DIR] [--out DIR]
 *
 * Expects upstream files from fetch-upstream.mjs (or local leaf-writer databases/).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileCbdbPack } from '../cbdb/compile.mjs';
import { compileDila } from '../dila/compile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const pins = JSON.parse(await fsp.readFile(path.join(repoRoot, 'upstream/pins.json'), 'utf8'));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const upstreamDir = path.resolve(arg('--upstream', path.join(repoRoot, '.upstream')));
const distRoot = path.resolve(arg('--out', path.join(repoRoot, 'dist')));
const packsDir = path.join(distRoot, 'authority-packs');
const bundleVersion = `${pins.compilePolicyVersion}+cbdb${pins.cbdb.version}`;

const sha256File = async (filePath) => {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
};

const resolveUpstream = (fileName, fallbacks) => {
  const candidates = [path.join(upstreamDir, fileName), ...fallbacks];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Missing ${fileName}. Run: node scripts/fetch-upstream.mjs`);
};

const leafWriterDb = path.resolve(repoRoot, '../leaf-writer/databases');

const sqlitePath = resolveUpstream('cbdb.sqlite3', [
  path.join(leafWriterDb, 'cbdb_20260627.sqlite3'),
]);
const personsPath = resolveUpstream('dila-person.xml', [
  path.join(leafWriterDb, 'Buddhist_Studies_Person_Authority.xml'),
]);
const placesPath = resolveUpstream('dila-place.xml', [
  path.join(leafWriterDb, 'Buddhist_Studies_Place_Authority.xml'),
]);
const districtsPath = resolveUpstream('dila-districts.xml', [path.join(leafWriterDb, 'districts.xml')]);

await fsp.rm(packsDir, { recursive: true, force: true });
await fsp.mkdir(packsDir, { recursive: true });

console.log('Compiling CBDB…');
await compileCbdbPack({
  sqlitePath,
  outDir: path.join(packsDir, 'cbdb'),
});

console.log('Compiling DILA…');
await compileDila({
  personsPath,
  placesPath,
  districtsPath,
  outDir: path.join(packsDir, 'dila'),
});

const patchManifest = async (sourceId, extras) => {
  const manifestPath = path.join(packsDir, sourceId, 'manifest.json');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  Object.assign(manifest, extras);
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
};

await patchManifest('cbdb', {
  license: pins.cbdb.license,
  attribution: pins.cbdb.attribution,
  upstream: {
    version: pins.cbdb.version,
    sqliteSha256: pins.cbdb.sqliteSha256,
    zipUrl: pins.cbdb.zipUrl,
  },
});

await patchManifest('dila', {
  license: pins.dila.license,
  attribution: pins.dila.attribution,
  upstream: {
    commit: pins.dila.commit,
    versionLabel: pins.dila.versionLabel,
  },
});

const packFiles = [];
for (const sourceId of ['cbdb', 'dila']) {
  const sourceDir = path.join(packsDir, sourceId);
  for (const entry of await fsp.readdir(sourceDir)) {
    const filePath = path.join(sourceDir, entry);
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) continue;
    packFiles.push({
      path: `${sourceId}/${entry}`,
      bytes: stat.size,
      sha256: await sha256File(filePath),
    });
  }
}

const tarballName = `authority-packs-${bundleVersion}.tar.gz`;
const tarballPath = path.join(distRoot, tarballName);

await fsp.mkdir(distRoot, { recursive: true });
execFileSync('tar', ['-czf', tarballPath, '-C', distRoot, 'authority-packs'], {
  stdio: 'inherit',
});

const tarballSha256 = await sha256File(tarballPath);
const tarballBytes = (await fsp.stat(tarballPath)).size;

const packsIndex = {
  schemaVersion: 1,
  bundleVersion,
  compilePolicyVersion: pins.compilePolicyVersion,
  builtAt: new Date().toISOString(),
  buildTool: {
    repo: 'authority-extraction',
    packageVersion: JSON.parse(await fsp.readFile(path.join(repoRoot, 'package.json'), 'utf8'))
      .version,
  },
  upstream: {
    cbdb: { version: pins.cbdb.version, sqliteSha256: pins.cbdb.sqliteSha256 },
    dila: { commit: pins.dila.commit, versionLabel: pins.dila.versionLabel },
  },
  tarball: {
    fileName: tarballName,
    bytes: tarballBytes,
    sha256: tarballSha256,
  },
  files: packFiles,
  licenses: {
    cbdb: pins.cbdb.license,
    dila: pins.dila.license,
  },
  attribution: {
    cbdb: pins.cbdb.attribution,
    dila: pins.dila.attribution,
  },
};

const indexPath = path.join(distRoot, 'packs-index.json');
await fsp.writeFile(indexPath, `${JSON.stringify(packsIndex, null, 2)}\n`);

console.log(`\nBundle: ${tarballPath}`);
console.log(`Index:  ${indexPath}`);
console.log(`Version: ${bundleVersion}`);
console.log(`Tarball sha256: ${tarballSha256}`);
