#!/usr/bin/env node
/**
 * Build the authority pack bundle and stage release artifacts in `release/`.
 *
 * GitHub Actions uploads everything from `release/`, so this script keeps the
 * workflow thin and makes the release payload local-dev friendly.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const releaseDir = path.join(repoRoot, 'release');
const ref = process.env.GITHUB_REF ?? '';
const isTagRelease = ref.startsWith('refs/tags/v');

execFileSync('node', [path.join(repoRoot, 'scripts/build-pack-bundle.mjs')], {
  stdio: 'inherit',
});

const index = JSON.parse(await fs.readFile(path.join(distDir, 'packs-index.json'), 'utf8'));
const version = index.bundleVersion;

await fs.rm(releaseDir, { recursive: true, force: true });
await fs.mkdir(releaseDir, { recursive: true });

const bundles = [
  {
    name: `authority-packs-chinese-${version}.tar.gz`,
    entries: [
      'authority-packs/cbdb',
      'authority-packs/dila',
      'authority-packs/wikidata/person-zh-hant-tang',
      'authority-packs/wikidata/person-zh-hant-pre-ming',
      'authority-packs/wikidata/person-zh-hant-ming',
      'authority-packs/wikidata/person-zh-hant-qing',
      'authority-packs/wikidata/org-zh-hant',
      'authority-packs/wikidata/work-zh-hant',
    ],
  },
  {
    name: `authority-packs-japanese-${version}.tar.gz`,
    entries: [
      'authority-packs/ndl',
      'authority-packs/wikidata/person-ja-japan',
      'authority-packs/wikidata/org-ja',
      'authority-packs/wikidata/work-ja',
    ],
  },
  {
    name: `authority-packs-tibetan-${version}.tar.gz`,
    entries: [
      'authority-packs/wikidata/person-bo',
      'authority-packs/wikidata/place-bo',
      'authority-packs/wikidata/org-bo',
    ],
  },
];

await fs.copyFile(path.join(distDir, 'packs-index.json'), path.join(releaseDir, 'packs-index.json'));

if (!isTagRelease) {
  console.log(`Staged 1 release artifact in ${releaseDir} for non-tag build.`);
  process.exit(0);
}

for (const bundle of bundles) {
  const entries = [];
  for (const entry of bundle.entries) {
    if (await fs.stat(path.join(distDir, entry)).then(() => true).catch(() => false)) {
      entries.push(entry);
    }
  }
  if (entries.length === 0) {
    throw new Error(`No bundle entries found for ${bundle.name}.`);
  }
  const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'authoritypacks-'));
  try {
    await fs.mkdir(path.join(stageDir, 'authority-packs'), { recursive: true });
    await fs.copyFile(path.join(distDir, 'packs-index.json'), path.join(stageDir, 'packs-index.json'));
    for (const entry of entries) {
      const src = path.join(distDir, entry);
      const dest = path.join(stageDir, entry);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.cp(src, dest, { recursive: true });
    }
    execFileSync('tar', ['-czf', path.join(releaseDir, bundle.name), '-C', stageDir, 'authority-packs', 'packs-index.json'], {
      stdio: 'inherit',
    });
  } finally {
    await fs.rm(stageDir, { recursive: true, force: true });
  }
}

console.log(`Staged ${bundles.length + 1} release artifact(s) in ${releaseDir}.`);
