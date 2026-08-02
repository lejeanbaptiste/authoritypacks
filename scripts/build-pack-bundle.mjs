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
import { compileNdlPlacesPack } from '../ndl/compilePlaces.mjs';
import { compileNdlOrgsPack } from '../ndl/compileOrgs.mjs';
import { compileNdlWorksPack } from '../ndl/compileWorks.mjs';
import { NDL_ATTRIBUTION, NDL_WORKS_ZIP_URL } from '../ndl/constants.mjs';
import { compileNorbertPack } from '../norbert/compile.mjs';
import { buildNorbertConcordance } from '../norbert/concordance.mjs';
import { integrateConcordance } from '../norbert/integrateConcordance.mjs';
import {
  buildOfficeConcordance,
  integrateOfficeConcordance,
} from '../norbert/officeConcordance.mjs';
import { readNdjson, writeNdjson } from '../shared/ndjson.mjs';
import { writeDateChunks } from '../shared/dateChunks.mjs';
import { attachAppointmentsToPersons } from '../shared/appointmentIndex.mjs';

/** Compiled Wikidata packs (optional — staged locally like NDL). `file` is the
 * NDJSON basename compile.mjs writes for that kind (persons/places/orgs/works). */
const WIKIDATA_PACK_DIRS = [
  { slug: 'person-zh-hant-tang', label: 'Tang', file: 'persons.ndjson' },
  { slug: 'person-zh-hant-pre-ming', label: 'pre-Ming', file: 'persons.ndjson' },
  { slug: 'person-zh-hant-ming', label: 'Ming', file: 'persons.ndjson' },
  { slug: 'person-zh-hant-qing', label: 'Qing', file: 'persons.ndjson' },
  { slug: 'place-zh-hant', label: 'Places (zh-hant)', file: 'places.ndjson' },
  { slug: 'person-ja-japan', label: 'Japan (ja)', file: 'persons.ndjson' },
  { slug: 'place-ja', label: 'Places (ja)', file: 'places.ndjson' },
  { slug: 'person-bo', label: 'Tibetan (bo)', file: 'persons.ndjson' },
  { slug: 'place-bo', label: 'Tibetan places (bo)', file: 'places.ndjson' },
  { slug: 'org-zh-hant', label: 'Organizations (zh-hant)', file: 'orgs.ndjson' },
  { slug: 'org-ja', label: 'Organizations (ja)', file: 'orgs.ndjson' },
  { slug: 'org-bo', label: 'Organizations (bo)', file: 'orgs.ndjson' },
  { slug: 'work-zh-hant', label: 'Works (zh-hant)', file: 'works.ndjson' },
  { slug: 'work-ja', label: 'Works (ja)', file: 'works.ndjson' },
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

const isLfsPointer = (contents) =>
  contents.startsWith('version https://git-lfs.github.com/spec/v1');

const isUsableFile = async (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return false;
  const handle = await fsp.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(64);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return !isLfsPointer(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await handle.close();
  }
};

const resolveOptional = async (...candidates) => {
  for (const candidate of candidates) {
    if (await isUsableFile(candidate)) return candidate;
  }
  return null;
};

const readJsonIfExists = async (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const contents = await fsp.readFile(filePath, 'utf8');
  if (isLfsPointer(contents)) {
    return null;
  }
  return JSON.parse(contents);
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
const norbertSqlPath = resolveUpstream('norbert-authority.sql', [
  path.join(repoRoot, 'norbert_public/norbert-authority.sql'),
  path.join(repoRoot, '../norbert_public/norbert-authority.sql'),
]);
const personsPath = resolveUpstream('dila-person.xml', [
  path.join(leafWriterDb, 'Buddhist_Studies_Person_Authority.xml'),
  path.join(upstreamDir, 'Buddhist_Studies_Person_Authority.xml'),
]);
const placesPath = resolveUpstream('dila-place.xml', [
  path.join(leafWriterDb, 'Buddhist_Studies_Place_Authority.xml'),
  path.join(upstreamDir, 'Buddhist_Studies_Place_Authority.xml'),
]);
const districtsPath = resolveUpstream('dila-districts.xml', [
  path.join(leafWriterDb, 'districts.xml'),
  path.join(upstreamDir, 'districts.xml'),
]);

// CHGIS is compiled locally (maintainer has the Dataverse shapefiles on disk;
// see chgis/README.md) and checked in via Git LFS, so CI just stages the
// already-compiled pack rather than parsing shapefiles. The CHGIS<->DILA
// crosswalk TSV is likewise built locally and checked in, so DILA's own
// compile step below can stamp `crosswalkChgisCount` without recompiling CHGIS.
const chgisPlacesPath = path.join(localPacksRoot, 'chgis/places.ndjson');
const chgisManifestPath = path.join(localPacksRoot, 'chgis/manifest.json');
const chgisDilaCrosswalkPath = path.join(repoRoot, 'reports/chgis-dila-crosswalk.tsv');
const includeChgis = await isUsableFile(chgisPlacesPath);
const chgisDilaCrosswalkAvailable =
  includeChgis && fs.existsSync(chgisDilaCrosswalkPath);

const ndlPersonsRaw = await resolveOptional(
  path.join(upstreamDir, 'ndl/raw/persons.raw.ndjson'),
  path.join(localPacksRoot, 'ndl/raw/persons.raw.ndjson'),
);
const ndlWorksRaw = await resolveOptional(
  path.join(upstreamDir, 'ndl/raw/works.raw.ndjson'),
  path.join(localPacksRoot, 'ndl/raw/works.raw.ndjson'),
);
const ndlPlacesRaw = await resolveOptional(
  path.join(upstreamDir, 'ndl/raw/places.raw.ndjson'),
  path.join(localPacksRoot, 'ndl/raw/places.raw.ndjson'),
);
const ndlOrgsRaw = await resolveOptional(
  path.join(upstreamDir, 'ndl/raw/orgs.raw.ndjson'),
  path.join(localPacksRoot, 'ndl/raw/orgs.raw.ndjson'),
);
const ndlPersonsMetaPath = await resolveOptional(
  path.join(upstreamDir, 'ndl/raw/persons.raw-meta.json'),
  path.join(localPacksRoot, 'ndl/raw/persons.raw-meta.json'),
);
const ndlPersonsMeta = await readJsonIfExists(ndlPersonsMetaPath);
const ndlPlacesMetaPath = await resolveOptional(
  path.join(upstreamDir, 'ndl/raw/places.raw-meta.json'),
  path.join(localPacksRoot, 'ndl/raw/places.raw-meta.json'),
);
const ndlPlacesMeta = await readJsonIfExists(ndlPlacesMetaPath);
const ndlOrgsMetaPath = await resolveOptional(
  path.join(upstreamDir, 'ndl/raw/orgs.raw-meta.json'),
  path.join(localPacksRoot, 'ndl/raw/orgs.raw-meta.json'),
);
const ndlOrgsMeta = await readJsonIfExists(ndlOrgsMetaPath);
const includeNdlPersons = !!ndlPersonsRaw;
const includeNdlWorks = !!ndlWorksRaw;
const includeNdlPlaces = !!ndlPlacesRaw;
const includeNdlOrgs = !!ndlOrgsRaw;
const includeNdl = includeNdlPersons || includeNdlWorks || includeNdlPlaces || includeNdlOrgs;

const wikidataMetaPath = await resolveOptional(
  path.join(upstreamDir, 'wikidata/extract-meta.json'),
  path.join(localPacksRoot, 'wikidata/raw-zh-hant-priority1/extract-meta.json'),
);
const wikidataMeta = await readJsonIfExists(wikidataMetaPath);

const resolveWikidataPackDir = (slug) =>
  [
    path.join(upstreamDir, 'wikidata', slug),
    path.join(localPacksRoot, 'wikidata', slug),
  ].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) ?? null;

const stagedWikidataPacks = (await Promise.all(WIKIDATA_PACK_DIRS.map(async ({ slug, label, file }) => {
  const srcDir = resolveWikidataPackDir(slug);
  const dataPath = srcDir ? path.join(srcDir, file) : null;
  if (!dataPath || !(await isUsableFile(dataPath))) return null;
  return { slug, label, file, srcDir, dataPath };
}))).filter(Boolean);

const includeWikidata = stagedWikidataPacks.length > 0;

if (requireNdl && !includeNdl) {
  throw new Error(
    'NDL bundle requested (`--require-ndl`) but staged raw files were not found. ' +
      'Expected `.upstream/ndl/raw/persons.raw.ndjson` and `.upstream/ndl/raw/works.raw.ndjson` ' +
      '(or `packs/ndl/raw/` fallbacks).',
  );
}

const bundleParts = [`cbdb${pins.cbdb.version}`, `norbert${pins.norbert.version}`];
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
  crosswalkPath: chgisDilaCrosswalkAvailable ? chgisDilaCrosswalkPath : '',
  outDir: path.join(packsDir, 'dila'),
});

if (includeChgis) {
  console.log('Staging CHGIS…');
  const chgisDestDir = path.join(packsDir, 'chgis');
  await fsp.mkdir(chgisDestDir, { recursive: true });
  await fsp.copyFile(chgisPlacesPath, path.join(chgisDestDir, 'places.ndjson'));
  await fsp.copyFile(chgisManifestPath, path.join(chgisDestDir, 'manifest.json'));
}

console.log('Compiling Norbert…');
await compileNorbertPack({
  sqlPath: norbertSqlPath,
  outDir: path.join(packsDir, 'norbert'),
});

if (includeNdl) {
  if (includeNdlPersons) {
    console.log('Compiling NDL persons…');
    compileNdlPersonsPack({
      rawPath: ndlPersonsRaw,
      outDir: path.join(packsDir, 'ndl'),
      packId: 'ndl-persons-ja',
    });
  }

  if (includeNdlWorks) {
    console.log('Compiling NDL works…');
    compileNdlWorksPack({
      rawPath: ndlWorksRaw,
      outDir: path.join(packsDir, 'ndl'),
      packId: 'ndl-works-ja',
    });
  }

  if (includeNdlPlaces) {
    console.log('Compiling NDL places…');
    compileNdlPlacesPack({
      rawPath: ndlPlacesRaw,
      outDir: path.join(packsDir, 'ndl'),
      packId: 'ndl-places-ja',
    });
  }

  if (includeNdlOrgs) {
    console.log('Compiling NDL orgs…');
    compileNdlOrgsPack({
      rawPath: ndlOrgsRaw,
      outDir: path.join(packsDir, 'ndl'),
      packId: 'ndl-orgs-ja',
    });
  }
}

if (includeWikidata) {
  console.log('Staging Wikidata packs…');
  const wikidataFiles = {};
  for (const pack of stagedWikidataPacks) {
    const destDir = path.join(packsDir, 'wikidata', pack.slug);
    await fsp.mkdir(destDir, { recursive: true });
    await fsp.copyFile(pack.dataPath, path.join(destDir, pack.file));
    const srcManifest = path.join(pack.srcDir, 'manifest.json');
    if (fs.existsSync(srcManifest)) {
      await fsp.copyFile(srcManifest, path.join(destDir, 'manifest.json'));
      const sub = JSON.parse(await fsp.readFile(srcManifest, 'utf8'));
      const count = sub.files?.[pack.file]?.entityCount;
      if (typeof count === 'number') {
        wikidataFiles[`${pack.slug}/${pack.file}`] = { entityCount: count };
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

console.log('Building Norbert concordance…');
const norbertDir = path.join(packsDir, 'norbert');
const concordanceSources = {
  CBDB: readNdjson(path.join(packsDir, 'cbdb/persons.ndjson')),
  DILA: readNdjson(path.join(packsDir, 'dila/persons.ndjson')),
};
for (const pack of stagedWikidataPacks.filter((p) => p.file === 'persons.ndjson')) {
  const records = readNdjson(path.join(packsDir, 'wikidata', pack.slug, pack.file));
  concordanceSources.Wikidata = [...(concordanceSources.Wikidata ?? []), ...records];
}
const concordance = buildNorbertConcordance(
  readNdjson(path.join(norbertDir, 'persons.ndjson')),
  concordanceSources,
);
writeNdjson(path.join(norbertDir, 'concordance.ndjson'), concordance);
const integrated = integrateConcordance(
  concordance,
  readNdjson(path.join(norbertDir, 'persons.ndjson')),
  concordanceSources,
);
const cbdbAppointments = readNdjson(path.join(packsDir, 'cbdb/appointments.ndjson'));
const norbertAppointments = readNdjson(path.join(norbertDir, 'appointments.ndjson'));
const allAppointments = [...cbdbAppointments, ...norbertAppointments];
attachAppointmentsToPersons(integrated.norbert, allAppointments);
for (const records of Object.values(integrated.sources)) {
  attachAppointmentsToPersons(records, allAppointments);
}
writeNdjson(path.join(norbertDir, 'appointments.ndjson'), allAppointments);
writeNdjson(path.join(norbertDir, 'persons.ndjson'), integrated.norbert);
for (const [source, records] of Object.entries(integrated.sources)) {
  const sourceDir = source === 'CBDB' ? 'cbdb' : source === 'DILA' ? 'dila' : null;
  if (sourceDir) writeNdjson(path.join(packsDir, sourceDir, 'persons.ndjson'), records);
}
console.log(`  ${concordance.length} Norbert concordance matches; ${integrated.applied} links applied`);

console.log('Building Norbert office concordance…');
const norbertOfficesPath = path.join(norbertDir, 'offices.ndjson');
const norbertOfficeRelationsPath = path.join(norbertDir, 'office-relations.ndjson');
const officeConcordance = buildOfficeConcordance(
  readNdjson(norbertOfficesPath),
  readNdjson(path.join(packsDir, 'cbdb/offices.ndjson')),
);
writeNdjson(path.join(norbertDir, 'office-concordance.ndjson'), officeConcordance);
const integratedOffices = integrateOfficeConcordance(
  officeConcordance,
  readNdjson(norbertOfficesPath),
  readNdjson(norbertOfficeRelationsPath),
);
writeNdjson(norbertOfficesPath, integratedOffices.offices);
writeNdjson(norbertOfficeRelationsPath, integratedOffices.relations);
console.log(
  `  ${officeConcordance.length} office matches; ${integratedOffices.applied} links applied`,
);

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

await patchManifest('norbert', {
  license: pins.norbert.license,
  attribution: pins.norbert.attribution,
  source: 'Norbert',
  upstream: { sql: norbertSqlPath, sha256: pins.norbert.sqlSha256, version: pins.norbert.version },
  concordance: { file: 'concordance.ndjson', match: 'primary+style+dynasty', count: concordance.length },
  officeConcordance: {
    file: 'office-concordance.ndjson',
    match: 'exact-name+period-compatible+unique',
    count: officeConcordance.length,
  },
  appointments: {
    file: 'appointments.ndjson',
    sources: ['Norbert', 'CBDB'],
    count: allAppointments.length,
    temporalFields: 'omitted-for-disambiguation',
  },
});

if (includeChgis) {
  await patchManifest('chgis', {
    license: pins.chgis.license,
    attribution: pins.chgis.attribution,
    redistribution: pins.chgis.redistribution,
    redistributionNote: pins.chgis.redistributionNote,
    upstream: {
      version: pins.chgis.version,
      chgisDilaCrosswalk: chgisDilaCrosswalkAvailable ? 'reports/chgis-dila-crosswalk.tsv' : undefined,
    },
  });
}

if (includeNdl) {
  await patchManifest('ndl', {
    id: 'ndl-bundle-ja',
    source: 'NDL',
    license: pins.ndl.license,
    attribution: pins.ndl.attribution,
    upstream: {
      personsRaw: ndlPersonsRaw,
      worksRaw: ndlWorksRaw,
      placesRaw: ndlPlacesRaw ?? undefined,
      orgsRaw: ndlOrgsRaw ?? undefined,
      worksZipUrl: pins.ndl.worksZipUrl,
      personsHarvestedAt: ndlPersonsMeta?.harvestedAt,
      personsMatched: ndlPersonsMeta?.personsMatched,
      placesHarvestedAt: ndlPlacesMeta?.harvestedAt,
      placesMatched: ndlPlacesMeta?.placesMatched,
      orgsHarvestedAt: ndlOrgsMeta?.harvestedAt,
      orgsMatched: ndlOrgsMeta?.orgsMatched,
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

// Partition every large, candidate-shaped pack after all concordance work has
// finished. The runtime remains compatible with single-file packs; this only
// adds a manifest-described date layout where it will buy us memory/IPC time.
const DATE_CHUNK_THRESHOLD_BYTES = 10 * 1024 * 1024;
const writeLargePackDateChunks = async (dir) => {
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await writeLargePackDateChunks(target);
      continue;
    }
    if (!entry.isFile() || entry.name !== 'manifest.json') continue;
    const manifest = JSON.parse(await fsp.readFile(target, 'utf8'));
    let changed = false;
    for (const [name, info] of Object.entries(manifest.files ?? {})) {
      const packPath = path.join(dir, name);
      if (!name.endsWith('.ndjson') || !fs.existsSync(packPath)) continue;
      if ((await fsp.stat(packPath)).size < DATE_CHUNK_THRESHOLD_BYTES) continue;
      const rows = readNdjson(packPath);
      if (!rows.length || !rows.every((row) => row.source && row.authorityId && row.searchStrings)) continue;
      info.dateChunks = writeDateChunks(dir, name, rows, {
        includeUndatedForLimit: /places?\.ndjson$/i.test(name),
      });
      changed = true;
    }
    if (changed) await fsp.writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`);
  }
};

await writeLargePackDateChunks(packsDir);

const packFiles = [];
const bundleSourceIds = ['cbdb', 'dila', 'norbert'];
if (includeChgis) bundleSourceIds.push('chgis');
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
    ...(includeChgis ? { chgis: { version: pins.chgis.version } } : {}),
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
    ...(includeChgis ? { chgis: pins.chgis.license } : {}),
    ...(includeWikidata ? { wikidata: pins.wikidata.license } : {}),
    ...(includeNdl ? { ndl: pins.ndl.license } : {}),
  },
  attribution: {
    cbdb: pins.cbdb.attribution,
    dila: pins.dila.attribution,
    ...(includeChgis ? { chgis: pins.chgis.attribution } : {}),
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
if (!includeChgis) {
  console.log('CHGIS not included: run `npm run compile:chgis` locally and check in packs/chgis/places.ndjson (see chgis/README.md).');
}
if (!includeNdl) {
  console.log('NDL not included: add packs/ndl/raw/persons.raw.ndjson and packs/ndl/raw/works.raw.ndjson (or .upstream/ndl/raw/ equivalents).');
}
if (!includeWikidata) {
  console.log(
    'Wikidata not included: compile packs under packs/wikidata/<slug>/ (see WIKIDATA_PACK_DIRS in this script), or copy to .upstream/wikidata/.',
  );
}
