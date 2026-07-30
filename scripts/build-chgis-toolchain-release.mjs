#!/usr/bin/env node
/**
 * Package the CHGIS compile toolchain (source + pure-JS runtime deps, no
 * better-sqlite3) as a tarball LJB's desktop app downloads and bundles into
 * packaged installs. CHGIS's license forbids redistributing compiled packs
 * (see chgis/README.md) — users must download raw shapefiles from Dataverse
 * themselves and compile locally, so LJB ships the *toolchain*, not data.
 *
 * Usage: node scripts/build-chgis-toolchain-release.mjs
 * Output: release/chgis-toolchain-<version>.tar.gz
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const releaseDir = path.join(repoRoot, 'release');

const rootPkg = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'));
// On a tag push, CI sets GITHUB_REF_NAME to the tag (e.g. "v0.1.7") — that's the
// name the GitHub Release is created under, so the tarball must be named to match
// (LJB's download-authority-extraction.mjs pins this same tag string). Local/manual
// runs fall back to the package.json version for a sane filename.
const version = process.env.GITHUB_REF_NAME || `v${rootPkg.version}`;

const FILES = [
  'chgis/compile.mjs',
  'chgis/compileRecords.mjs',
  'chgis/discover.mjs',
  'chgis/parseShapefile.mjs',
  'chgis/crs.mjs',
  'chgis/fieldMap.mjs',
  'chgis/cbdbCrosswalk.mjs',
  'chgis/README.md',
  'crosswalks/loadChgisDila.mjs',
  'crosswalks/buildChgisDila.mjs',
  'shared/clue.mjs',
  'shared/normalize.mjs',
  'shared/ndjson.mjs',
  'shared/types.mjs',
];

const RUNTIME_DEPS = ['shapefile', 'proj4', 'sax'];

const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chgis-toolchain-'));
try {
  for (const file of FILES) {
    const dest = path.join(stageDir, file);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(path.join(repoRoot, file), dest);
  }

  const toolchainPkg = {
    name: 'chgis-compile-toolchain',
    version,
    private: true,
    type: 'module',
    dependencies: Object.fromEntries(
      RUNTIME_DEPS.map((name) => [name, rootPkg.dependencies[name]]),
    ),
  };
  await fs.writeFile(
    path.join(stageDir, 'package.json'),
    `${JSON.stringify(toolchainPkg, null, 2)}\n`,
  );

  console.log(`[chgis-toolchain] Installing runtime deps: ${RUNTIME_DEPS.join(', ')}`);
  execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: stageDir,
    stdio: 'inherit',
  });

  // Sanity check: fail loudly if npm pulled in a native module we didn't ask for
  // (this bundle must stay pure-JS so it runs under Electron's node without a rebuild).
  const nativeModules = (
    await fs.readdir(path.join(stageDir, 'node_modules'), { withFileTypes: true })
  ).filter((entry) => entry.isDirectory());
  for (const entry of nativeModules) {
    const bindingGyp = path.join(stageDir, 'node_modules', entry.name, 'binding.gyp');
    if (fsSync.existsSync(bindingGyp)) {
      throw new Error(
        `[chgis-toolchain] Native module detected in dependency tree: ${entry.name}. ` +
          'This bundle must remain pure-JS — remove or replace the dependency that pulled it in.',
      );
    }
  }

  await fs.mkdir(releaseDir, { recursive: true });
  const tarballName = `chgis-toolchain-${version}.tar.gz`;
  const tarballPath = path.join(releaseDir, tarballName);
  execFileSync('tar', ['-czf', tarballPath, '-C', stageDir, '.'], { stdio: 'inherit' });

  console.log(`[chgis-toolchain] Wrote ${tarballPath}`);
} finally {
  await fs.rm(stageDir, { recursive: true, force: true });
}
