#!/usr/bin/env node
/**
 * Download pinned CBDB sqlite + DILA XML + NDL batch files into .upstream/ for CI and local bundle builds.
 *
 * NDL persons/places/orgs require SPARQL harvest (slow) — this script downloads pre-built
 * raw files from configurable URLs instead of running SPARQL in CI.
 *
 * Wikidata packs are pre-compiled from dump extracts — this script downloads them from
 * configurable URLs.
 *
 * Usage: node scripts/fetch-upstream.mjs [--out DIR] [--ndl-base URL] [--wikidata-base URL]
 *
 * Environment variables (override pins.json defaults):
 *   NDL_PERSONS_URL      - Direct URL to persons.raw.ndjson
 *   NDL_PLACES_URL       - Direct URL to places.raw.ndjson
 *   NDL_ORGS_URL         - Direct URL to orgs.raw.ndjson
 *   WIKIDATA_BASE_URL    - Base URL for wikidata packs (e.g., https://example.com/wikidata/)
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Load pins, with optional environment variable overrides
const pinsRaw = JSON.parse(await fsp.readFile(path.join(repoRoot, 'upstream/pins.json'), 'utf8'));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const outDir = path.resolve(arg('--out', path.join(repoRoot, '.upstream')));

// Environment variable overrides for NDL raw file URLs
const ndlPersonsUrl = process.env.NDL_PERSONS_URL ?? pinsRaw.ndl?.personsRawUrl;
const ndlPlacesUrl = process.env.NDL_PLACES_URL ?? pinsRaw.ndl?.placesRawUrl;
const ndlOrgsUrl = process.env.NDL_ORGS_URL ?? pinsRaw.ndl?.orgsRawUrl;

// Environment variable override for Wikidata base URL
const wikidataBaseUrl = process.env.WIKIDATA_BASE_URL ?? pinsRaw.wikidata?.baseUrl;

const sha256File = async (filePath) => {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
};

const download = async (url, destPath, expectedSha256) => {
  console.log(`  fetch ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  
  if (expectedSha256) {
    const actualSha256 = createHash('sha256').update(buffer).digest('hex');
    if (actualSha256 !== expectedSha256) {
      throw new Error(`SHA256 mismatch for ${url}: got ${actualSha256}, expected ${expectedSha256}`);
    }
  }
  
  await fsp.writeFile(destPath, buffer);
  return destPath;
};

// ============================================================================
// CBDB sqlite
// ============================================================================
console.log('CBDB sqlite');
await fsp.mkdir(outDir, { recursive: true });

const zipPath = path.join(outDir, 'cbdb.zip');
await download(pinsRaw.cbdb.zipUrl, zipPath);

const sqlitePath = path.join(outDir, 'cbdb.sqlite3');
const zipEntries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);
const sqliteEntry = zipEntries.find((name) => name.endsWith('.sqlite3'));
if (!sqliteEntry) {
  throw new Error(`No .sqlite3 entry in CBDB zip (entries: ${zipEntries.join(', ')})`);
}
execFileSync('sh', ['-c', `unzip -p "${zipPath}" "${sqliteEntry}" > "${sqlitePath}"`], {
  stdio: 'inherit',
  maxBuffer: 1024 * 1024 * 1024,
});

const sqliteDigest = await sha256File(sqlitePath);
if (sqliteDigest !== pinsRaw.cbdb.sqliteSha256) {
  throw new Error(
    `CBDB sqlite sha256 mismatch: got ${sqliteDigest}, expected ${pinsRaw.cbdb.sqliteSha256}`,
  );
}
await fsp.rm(zipPath, { force: true });
console.log(`  → ${sqlitePath} (${sqliteDigest.slice(0, 12)}…)`);

// ============================================================================
// DILA XML
// ============================================================================
console.log('DILA XML');
const dilaBase = `https://raw.githubusercontent.com/DILA-edu/Authority-Databases/${pinsRaw.dila.commit}`;
for (const file of pinsRaw.dila.files) {
  const dest = path.join(outDir, file.localName);
  await download(`${dilaBase}/${file.repoPath}`, dest, file.sha256);
  const digest = await sha256File(dest);
  console.log(`  → ${file.localName} (${digest.slice(0, 12)}…)`);
}

// ============================================================================
// NDL Works (from batch TSV)
// ============================================================================
console.log('NDL works TSV');
const worksZipUrl = pinsRaw.ndl.worksZipUrl;
const worksZipPath = path.join(outDir, 'ndl', 'work-tsv.zip');
const worksTsvPath = path.join(outDir, 'ndl', 'work-tsv.tsv');

// Download the works batch TSV
const worksZipDest = await download(worksZipUrl, worksZipPath);

// Extract the TSV from the zip
const zipEntriesWorks = execFileSync('unzip', ['-Z1', worksZipDest], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);
const tsvEntry = zipEntriesWorks.find((name) => name.endsWith('.tsv'));
if (!tsvEntry) {
  throw new Error(`No .tsv entry in NDL works zip (entries: ${zipEntriesWorks.join(', ')})`);
}
execFileSync('sh', ['-c', `unzip -p "${worksZipDest}" "${tsvEntry}" > "${worksTsvPath}"`], {
  stdio: 'inherit',
  maxBuffer: 1024 * 1024 * 1024,
});
await fsp.rm(worksZipDest, { force: true });

// Convert TSV to raw NDJSON using the parseWorks module
console.log('Converting NDL works TSV to raw NDJSON…');
const { extractWorksToNdjson } = await import('../ndl/parseWorks.mjs');
const rawWorksPath = path.join(outDir, 'ndl', 'raw', 'works.raw.ndjson');
await fsp.mkdir(path.dirname(rawWorksPath), { recursive: true });
await extractWorksToNdjson({
  tsvPath: worksTsvPath,
  outPath: rawWorksPath,
});
const worksMeta = { harvestedAt: new Date().toISOString() };
await fsp.writeFile(
  path.join(outDir, 'ndl', 'raw', 'works.raw-meta.json'),
  JSON.stringify(worksMeta, null, 2)
);
console.log(`  → ${rawWorksPath}`);

// ============================================================================
// NDL Persons (download pre-built or harvest via SPARQL)
// ============================================================================
const ndlRawDir = path.join(outDir, 'ndl', 'raw');
await fsp.mkdir(ndlRawDir, { recursive: true });

if (ndlPersonsUrl) {
  console.log('NDL persons (downloading pre-built raw file)');
  const personsRawPath = path.join(ndlRawDir, 'persons.raw.ndjson');
  await download(ndlPersonsUrl, personsRawPath);
  const personsMeta = { harvestedAt: new Date().toISOString() };
  await fsp.writeFile(
    path.join(ndlRawDir, 'persons.raw-meta.json'),
    JSON.stringify(personsMeta, null, 2)
  );
  console.log(`  → ${personsRawPath}`);
} else {
  console.log('NDL persons: SKIPPED (no NDL_PERSONS_URL or ndl.personsRawUrl in pins.json)');
  console.log('  To include NDL persons, run SPARQL harvest locally:');
  console.log('    npm run ndl:sparql -- harvest --out .upstream/ndl/raw/persons.raw.ndjson --delay-ms 300');
}

// ============================================================================
// NDL Places (download pre-built or harvest via SPARQL)
// ============================================================================
if (ndlPlacesUrl) {
  console.log('NDL places (downloading pre-built raw file)');
  const placesRawPath = path.join(ndlRawDir, 'places.raw.ndjson');
  await download(ndlPlacesUrl, placesRawPath);
  const placesMeta = { harvestedAt: new Date().toISOString() };
  await fsp.writeFile(
    path.join(ndlRawDir, 'places.raw-meta.json'),
    JSON.stringify(placesMeta, null, 2)
  );
  console.log(`  → ${placesRawPath}`);
} else {
  console.log('NDL places: SKIPPED (no NDL_PLACES_URL or ndl.placesRawUrl in pins.json)');
  console.log('  To include NDL places, run SPARQL harvest locally:');
  console.log('    npm run ndl:sparql -- harvest-places --out .upstream/ndl/raw/places.raw.ndjson --delay-ms 300');
}

// ============================================================================
// NDL Orgs (download pre-built or harvest via SPARQL)
// ============================================================================
if (ndlOrgsUrl) {
  console.log('NDL orgs (downloading pre-built raw file)');
  const orgsRawPath = path.join(ndlRawDir, 'orgs.raw.ndjson');
  await download(ndlOrgsUrl, orgsRawPath);
  const orgsMeta = { harvestedAt: new Date().toISOString() };
  await fsp.writeFile(
    path.join(ndlRawDir, 'orgs.raw-meta.json'),
    JSON.stringify(orgsMeta, null, 2)
  );
  console.log(`  → ${orgsRawPath}`);
} else {
  console.log('NDL orgs: SKIPPED (no NDL_ORGS_URL or ndl.orgsRawUrl in pins.json)');
  console.log('  To include NDL orgs, run SPARQL harvest locally:');
  console.log('    npm run ndl:sparql -- harvest-orgs --out .upstream/ndl/raw/orgs.raw.ndjson --delay-ms 300');
}

// ============================================================================
// Wikidata packs (download pre-compiled)
// ============================================================================
const wikidataPacks = pinsRaw.wikidata?.packs ?? [
  { slug: 'person-zh-hant-tang', file: 'persons.ndjson' },
  { slug: 'person-zh-hant-pre-ming', file: 'persons.ndjson' },
  { slug: 'person-zh-hant-ming', file: 'persons.ndjson' },
  { slug: 'person-zh-hant-qing', file: 'persons.ndjson' },
  { slug: 'person-ja-japan', file: 'persons.ndjson' },
  { slug: 'person-bo', file: 'persons.ndjson' },
  { slug: 'place-bo', file: 'places.ndjson' },
  { slug: 'org-zh-hant', file: 'orgs.ndjson' },
  { slug: 'org-ja', file: 'orgs.ndjson' },
  { slug: 'org-bo', file: 'orgs.ndjson' },
  { slug: 'work-zh-hant', file: 'works.ndjson' },
  { slug: 'work-ja', file: 'works.ndjson' },
];

if (wikidataBaseUrl) {
  console.log('Wikidata packs (downloading pre-compiled)');
  const wikidataDir = path.join(outDir, 'wikidata');
  
  for (const pack of wikidataPacks) {
    const packDir = path.join(wikidataDir, pack.slug);
    const packFile = path.join(packDir, pack.file);
    const manifestFile = path.join(packDir, 'manifest.json');
    
    try {
      await fsp.mkdir(packDir, { recursive: true });
      
      // Download the NDJSON file
      const fileUrl = `${wikidataBaseUrl}${pack.slug}/${pack.file}`;
      await download(fileUrl, packFile);
      
      // Download manifest if it exists
      try {
        const manifestUrl = `${wikidataBaseUrl}${pack.slug}/manifest.json`;
        await download(manifestUrl, manifestFile);
      } catch {
        // manifest is optional
      }
      
      console.log(`  → ${packDir}`);
    } catch (err) {
      console.log(`  ⚠  ${pack.slug}: ${err.message}`);
    }
  }
  
  // Write extract meta
  const wikidataMeta = { extractedAt: new Date().toISOString() };
  await fsp.writeFile(
    path.join(wikidataDir, 'extract-meta.json'),
    JSON.stringify(wikidataMeta, null, 2)
  );
} else {
  console.log('Wikidata packs: SKIPPED (no WIKIDATA_BASE_URL or wikidata.baseUrl in pins.json)');
  console.log('  To include Wikidata packs, compile locally and copy to .upstream/wikidata/:');
  console.log('    npm run wikidata:compile-all');
  console.log('  Or set WIKIDATA_BASE_URL environment variable to a base URL hosting the packs.');
}

console.log(`\nUpstream ready in ${outDir}`);
console.log('\nNote: NDL persons/places/orgs and Wikidata packs require pre-built files.');
console.log('      Either set the appropriate _URL environment variables or add them to upstream/pins.json');
console.log('      and ensure the files are hosted at those locations.');

