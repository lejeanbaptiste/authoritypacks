#!/usr/bin/env node
/**
 * Compile authority packs and produce dist/authority-packs-{version}.tar.gz + packs-index.json.
 *
 * Usage:
 *   node scripts/build-pack-bundle.mjs [--upstream DIR] [--out DIR] [--require-ndl]
 *
 * Expects CBDB/DILA upstream files from fetch-upstream.mjs (or local leaf-writer databases/).
 * NDL is included when raw exports already exist locally under .upstream/ndl/raw/ or packs/ndl/raw/.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileCbdbPack } from '../cbdb/compile.mjs';
import { compileDila } from '../dila/compile.mjs';
import { compileNdlPersonsPack } from '../ndl/compilePersons.mjs';
import { compileNdlWorksPack } from '../ndl/compileWorks.mjs';
import { NDL_ATTRIBUTION, NDL_WORKS_ZIP_URL } from '../ndl/constants.mjs';

/** Compiled Wikidata person packs (optional — staged locally like NDL). */
const WIKIDATA_PACK_DIRS = [
  { slug: 'person-zh-hant-tang', label: 'Tang' },
  { slug: 'person-zh-hant-ming', label: 'Ming' },
  { slug: 'person-zh-hant-qing', label: 'Qing' },
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const pins = JSON.parse(await fsp.readFile(path.join(repoRoot, 'upstream/pins.json'), 'utf8'));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const hasFlag = (name) => process.argv.includes(name);

const upstreamDir = path.resolve(arg('--upstream', path.join(repoRoot, '.upstream')));
const distRoot = path.resolve(arg('--out', path.join(repoRoot, 'dist')));
const requireNdl = hasFlag('--require-ndl');
const packsDir = path.join(distRoot, 'authority-packs');

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

const resolveOptional = (...candidates) => candidates.find((candidate) => fs.existsSync(candidate)) ?? null;

const readJsonIfExists = async (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
};

const compactDate = (value) => {
  const parsed = Date.parse(value ?? '');
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10).replace(/-/g, '');
};

const leafWriterDb = path.resolve(repoRoot, '../leaf-writer/databases');
const localPacksRoot = path.join(repoRoot, 'packs');

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

const ndlPersonsRaw = resolveOptional(
  path.join(upstreamDir, 'ndl/raw/persons.raw.ndjson'),
  path.join(localPacksRoot, 'ndl/raw/persons.raw.ndjson'),
);
const ndlWorksRaw = resolveOptional(
  path.join(upstreamDir, 'ndl/raw/works.raw.ndjson'),
  path.join(localPacksRoot, 'ndl/raw/works.raw.ndjson'),
);
const ndlPersonsMetaPath = resolveOptional(
  path.join(upstreamDir, 'ndl/raw/persons.raw-meta.json'),
  path.join(localPacksRoot, 'ndl/raw/persons.raw-meta.json'),
);
const ndlPersonsMeta = await readJsonIfExists(ndlPersonsMetaPath);
const includeNdl = !!(ndlPersonsRaw && ndlWorksRaw);

const wikidataMetaPath = resolveOptional(
  path.join(upstreamDir, 'wikidata/extract-meta.json'),
  path.join(localPacksRoot, 'wikidata/raw-zh-hant-priority1/extract-meta.json'),
);
const wikidataMeta = await readJsonIfExists(wikidataMetaPath);

const resolveWikidataPackDir = (slug) =>
  resolveOptional(
    path.join(upstreamDir, 'wikidata', slug),
    path.join(localPacksRoot, 'wikidata', slug),
  );

const stagedWikidataPacks = WIKIDATA_PACK_DIRS.map(({ slug, label }) => {
  const srcDir = resolveWikidataPackDir(slug);
  const personsPath = srcDir ? path.join(srcDir, 'persons.ndjson') : null;
  if (!personsPath || !fs.existsSync(personsPath)) return null;
  return { slug, label, srcDir, personsPath };
}).filter(Boolean);

const includeWikidata = stagedWikidataPacks.length > 0;

if (requireNdl && !includeNdl) {
  throw new Error(
    'NDL bundle requested (`--require-ndl`) but staged raw files were not found. ' +
      'Expected `.upstream/ndl/raw/persons.raw.ndjson` and `.upstream/ndl/raw/works.raw.ndjson` ' +
      '(or `packs/ndl/raw/` fallbacks).',
  );
}

const bundleParts = [`cbdb${pins.cbdb.version}`];
if (includeWikidata) {
  bundleParts.push(`wikidata${compactDate(wikidataMeta?.extractedAt) ?? 'local'}`);
}
if (includeNdl) {
  bundleParts.push(`ndl${compactDate(ndlPersonsMeta?.harvestedAt) ?? 'local'}`);
}
const bundleVersion = `${pins.compilePolicyVersion}+${bundleParts.join('+')}`;

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

if (includeNdl) {
  console.log('Compiling NDL persons…');
  compileNdlPersonsPack({
    rawPath: ndlPersonsRaw,
    outDir: path.join(packsDir, 'ndl'),
    packId: 'ndl-persons-ja',
  });

  console.log('Compiling NDL works…');
  compileNdlWorksPack({
    rawPath: ndlWorksRaw,
    outDir: path.join(packsDir, 'ndl'),
    packId: 'ndl-works-ja',
  });
}

if (includeWikidata) {
  console.log('Staging Wikidata person packs…');
  const wikidataFiles = {};
  for (const pack of stagedWikidataPacks) {
    const destDir = path.join(packsDir, 'wikidata', pack.slug);
    await fsp.mkdir(destDir, { recursive: true });
    await fsp.copyFile(pack.personsPath, path.join(destDir, 'persons.ndjson'));
    const srcManifest = path.join(pack.srcDir, 'manifest.json');
    if (fs.existsSync(srcManifest)) {
      await fsp.copyFile(srcManifest, path.join(destDir, 'manifest.json'));
      const sub = JSON.parse(await fsp.readFile(srcManifest, 'utf8'));
      const count = sub.files?.['persons.ndjson']?.entityCount;
      if (typeof count === 'number') {
        wikidataFiles[`${pack.slug}/persons.ndjson`] = { entityCount: count };
      }
    }
    console.log(`  ${pack.slug}`);
  }
  await fsp.writeFile(
    path.join(packsDir, 'wikidata/manifest.json'),
    `${JSON.stringify(
      {
        id: 'wikidata-person-zh-hant-priority1',
        source: 'Wikidata',
        buildToolVersion: '0.1.0',
        compiledAt: new Date().toISOString(),
        language: 'zh-hant',
        files: wikidataFiles,
      },
      null,
      2,
    )}\n`,
  );
}

const patchManifest = async (sourceId, extras) => {
  const manifestPath = path.join(packsDir, sourceId, 'manifest.json');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  Object.assign(manifest, extras);
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}
`);
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

if (includeNdl) {
  await patchManifest('ndl', {
    id: 'ndl-bundle-ja',
    source: 'NDL',
    license: pins.ndl.license,
    attribution: pins.ndl.attribution,
    upstream: {
      personsRaw: ndlPersonsRaw,
      worksRaw: ndlWorksRaw,
      worksZipUrl: pins.ndl.worksZipUrl,
      personsHarvestedAt: ndlPersonsMeta?.harvestedAt,
      personsMatched: ndlPersonsMeta?.personsMatched,
      pages: ndlPersonsMeta?.pages,
      pageSize: ndlPersonsMeta?.pageSize,
    },
  });
}

if (includeWikidata) {
  await patchManifest('wikidata', {
    id: 'wikidata-person-zh-hant-priority1',
    source: 'Wikidata',
    license: pins.wikidata.license,
    attribution: pins.wikidata.attribution,
    upstream: {
      extractMeta: wikidataMetaPath,
      extractedAt: wikidataMeta?.extractedAt,
      personsMatched: wikidataMeta?.personsMatched,
      dynastyIds: wikidataMeta?.dynastyIds,
      packs: stagedWikidataPacks.map((p) => p.slug),
    },
  });
}

const packFiles = [];
const bundleSourceIds = ['cbdb', 'dila'];
if (includeWikidata) bundleSourceIds.push('wikidata');
if (includeNdl) bundleSourceIds.push('ndl');

const collectPackFiles = async (sourceId, dir, prefix = '') => {
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectPackFiles(sourceId, filePath, rel);
      continue;
    }
    if (!entry.isFile()) continue;
    packFiles.push({
      path: `${sourceId}/${rel}`,
      bytes: (await fsp.stat(filePath)).size,
      sha256: await sha256File(filePath),
    });
  }
};

for (const sourceId of bundleSourceIds) {
  await collectPackFiles(sourceId, path.join(packsDir, sourceId));
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
    ...(includeNdl
      ? {
          ndl: {
            worksZipUrl: pins.ndl.worksZipUrl,
            personsHarvestedAt: ndlPersonsMeta?.harvestedAt,
            personsMatched: ndlPersonsMeta?.personsMatched,
          },
        }
      : {}),
    ...(includeWikidata
      ? {
          wikidata: {
            extractedAt: wikidataMeta?.extractedAt,
            personsMatched: wikidataMeta?.personsMatched,
            packs: stagedWikidataPacks.map((p) => p.slug),
          },
        }
      : {}),
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
    ...(includeWikidata ? { wikidata: pins.wikidata.license } : {}),
    ...(includeNdl ? { ndl: pins.ndl.license } : {}),
  },
  attribution: {
    cbdb: pins.cbdb.attribution,
    dila: pins.dila.attribution,
    ...(includeWikidata ? { wikidata: pins.wikidata.attribution } : {}),
    ...(includeNdl ? { ndl: pins.ndl.attribution } : {}),
  },
};

const indexPath = path.join(distRoot, 'packs-index.json');
await fsp.writeFile(indexPath, `${JSON.stringify(packsIndex, null, 2)}
`);

console.log(`
Bundle: ${tarballPath}`);
console.log(`Index:  ${indexPath}`);
console.log(`Version: ${bundleVersion}`);
console.log(`Tarball sha256: ${tarballSha256}`);
if (!includeNdl) {
  console.log('NDL not included: add packs/ndl/raw/persons.raw.ndjson and packs/ndl/raw/works.raw.ndjson (or .upstream/ndl/raw/ equivalents).');
}
if (!includeWikidata) {
  console.log(
    'Wikidata not included: compile Tang/Ming/Qing packs under packs/wikidata/person-zh-hant-{tang,ming,qing}/ (or copy to .upstream/wikidata/).',
  );
}
