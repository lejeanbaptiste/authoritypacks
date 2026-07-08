#!/usr/bin/env node
/**
 * Compile all kinds from a Tibetan (bo) multi-kind raw extract.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { compileWikidataKindPack } from './compileKind.mjs';
import { compileWikidataPersonPackFromRaw } from './compile.mjs';
import { compiledFileNameForKind, rawFileNameForKind } from './rawFromEntity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

const languageId = arg('--language', 'bo');
const rawDir = path.resolve(arg('--raw-dir', path.join(ROOT, 'packs/wikidata/raw-bo')));
const outRoot = path.resolve(arg('--out-root', path.join(ROOT, 'packs/wikidata')));

const languages = loadJson('wikidata/languages.json');
const packLang = languages.packLanguages.find((x) => x.id === languageId);
const script = packLang?.script;

/** @type {Array<'person' | 'place' | 'org'>} */
const kinds = ['person', 'place', 'org'];

for (const kind of kinds) {
  const rawPath = path.join(rawDir, rawFileNameForKind(kind));
  if (!fs.existsSync(rawPath)) {
    console.error(`Missing ${rawPath} — run wikidata:extract-bo first`);
    process.exit(1);
  }
}

const results = [];

results.push(
  compileWikidataPersonPackFromRaw({
    rawPath: path.join(rawDir, rawFileNameForKind('person')),
    languageId,
    periodLabel: 'bo',
    outDir: path.join(outRoot, `person-${languageId}`),
  }),
);

for (const kind of ['place', 'org']) {
  results.push(
    compileWikidataKindPack({
      rawPath: path.join(rawDir, rawFileNameForKind(kind)),
      kind,
      languageId,
      outDir: path.join(outRoot, `${kind}-${languageId}`),
      script,
    }),
  );
}

for (const result of results) {
  const kindKey = result.packId.includes('-person-')
    ? 'person'
    : /** @type {'place' | 'org' | 'work'} */ (result.packId.split('-')[1]);
  console.log(
    `${result.packId}: ${result.count} → ${result.outDir}/${compiledFileNameForKind(kindKey)}`,
  );
}
