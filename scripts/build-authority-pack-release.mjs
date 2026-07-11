#!/usr/bin/env node
/**
 * Build the authority pack bundle and stage release artifacts in `release/`.
 *
 * GitHub Actions uploads everything from `release/`, so this script keeps the
 * workflow thin and makes the release payload local-dev friendly.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const releaseDir = path.join(repoRoot, 'release');

execFileSync('node', [path.join(repoRoot, 'scripts/build-pack-bundle.mjs')], {
  stdio: 'inherit',
});

const index = JSON.parse(await fs.readFile(path.join(distDir, 'packs-index.json'), 'utf8'));
const version = index.bundleVersion;

const sha256File = async (filePath) => {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fsSync.createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
};

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

const releaseBundles = [];
for (const bundle of bundles) {
  const tarballPath = path.join(releaseDir, bundle.name);
  const prefixes = bundle.entries.map((entry) => `${entry.replace(/^authority-packs\//, '')}/`);
  const files = (index.files ?? []).filter((file) =>
    prefixes.some((prefix) => file.path.startsWith(prefix)),
  );
  releaseBundles.push({
    id: bundle.name.includes('-chinese-')
      ? 'chinese'
      : bundle.name.includes('-japanese-')
        ? 'japanese'
        : 'tibetan',
    fileName: bundle.name,
    bytes: (await fs.stat(tarballPath)).size,
    sha256: await sha256File(tarballPath),
    pathPrefix: 'authority-packs',
    fileCount: files.length,
    files,
  });
}

const indexMetadata = { ...index };
delete indexMetadata.tarball;
delete indexMetadata.files;
await fs.writeFile(
  path.join(releaseDir, 'packs-index.json'),
  `${JSON.stringify({
    ...indexMetadata,
    defaultBundleId: 'chinese',
    bundles: releaseBundles,
  }, null, 2)}\n`,
);

console.log(`Staged ${bundles.length + 1} release artifact(s) in ${releaseDir}.`);
