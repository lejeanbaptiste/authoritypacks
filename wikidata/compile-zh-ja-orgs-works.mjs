#!/usr/bin/env node
/**
 * Compile org + work packs from a multi-language raw extract (zh-hant + ja).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { compileWikidataKindPack } from './compileKind.mjs';
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

const rawDir = path.resolve(arg('--raw-dir', path.join(ROOT, 'packs/wikidata/raw-zh-hant-ja-org-work')));
const outRoot = path.resolve(arg('--out-root', path.join(ROOT, 'packs/wikidata')));
const languagesArg = arg('--languages', 'zh-hant,ja');
const languageIds = languagesArg
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** @type {Array<'org' | 'work'>} */
const kinds = ['org', 'work'];
const languages = loadJson('wikidata/languages.json');

for (const languageId of languageIds) {
  for (const kind of kinds) {
    const rawPath = path.join(rawDir, languageId, rawFileNameForKind(kind));
    if (!fs.existsSync(rawPath)) {
      console.error(`Missing ${rawPath} — run wikidata:extract-zh-ja-orgs-works first`);
      process.exit(1);
    }
  }
}

for (const languageId of languageIds) {
  const packLang = languages.packLanguages.find((x) => x.id === languageId);
  for (const kind of kinds) {
    const result = compileWikidataKindPack({
      rawPath: path.join(rawDir, languageId, rawFileNameForKind(kind)),
      kind,
      languageId,
      outDir: path.join(outRoot, `${kind}-${languageId}`),
      script: packLang?.script,
    });
    console.log(
      `${result.packId}: ${result.count} → ${result.outDir}/${compiledFileNameForKind(kind)}`,
    );
  }
}
