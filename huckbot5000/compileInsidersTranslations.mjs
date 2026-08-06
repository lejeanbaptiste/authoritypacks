#!/usr/bin/env node
/**
 * Compile huckbot5000/insiders-include.ndjson (collision-flagged rows) into
 * packs/huckbot5000-insiders/translations.ndjson — local collision archive.
 *
 * These glosses matched Hucker's text (OCR corpus and/or CBDB `(Hucker)`-
 * cited fields). They are tagged source: 'Hucker' per
 * leaf-writer/docs/huckbot5000-planning.md Step 4 and kept for provenance
 * and audit only. Do not add this directory to a public release tarball or
 * GitHub asset.
 *
 * Usage: node huckbot5000/compileInsidersTranslations.mjs [--input FILE] [--out DIR]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeNdjson } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return path.resolve(root, i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback);
};
const inputPath = arg('--input', 'huckbot5000/insiders-include.ndjson');
const outDir = arg('--out', 'packs/huckbot5000-insiders');

function readInsidersRows(filePath) {
  const rows = [];
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.zh && row.gloss) rows.push(row);
  }
  return rows;
}

function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(
      `ERROR: ${inputPath} not found. Run npm run compile:huckbot5000-include first `
        + '(writes both approved-include and insiders-include).',
    );
    process.exit(1);
  }
  const includeRows = readInsidersRows(inputPath);

  const translations = includeRows.map((row) => ({
    source: 'Hucker',
    kind: 'office',
    zh: row.zh,
    dynasty: row.dynasty ?? null,
    translation: row.gloss,
    officeIds: row.officeIds ?? [],
    metadata: {
      generatedByModel: row.model ?? null,
      collisionFlag: row.collisionFlag ?? null,
      collisionDetail: row.collisionDetail ?? null,
      pack: 'huckbot5000-insiders',
      reviewedVia: 'huckbot5000-candidate-review.csv',
      redistribution: 'forbidden',
    },
  }));

  fs.mkdirSync(outDir, { recursive: true });
  writeNdjson(path.join(outDir, 'translations.ndjson'), translations);

  const manifest = {
    id: 'huckbot5000-insiders',
    source: 'Hucker',
    buildToolVersion: '0.1.0',
    compiledAt: new Date().toISOString(),
    upstream: {
      source:
        'Huckbot5000 candidates that matched Hucker OCR and/or CBDB '
        + '(Hucker)-cited office translations. Local collision archive for '
        + 'provenance and audit only. See leaf-writer/docs/huckbot5000-planning.md Step 4.',
    },
    license: 'local-use-only-do-not-redistribute',
    attribution:
      'Archive of generated candidates that match Charles O. Hucker\'s Dictionary of Official '
      + 'Titles (or CBDB\'s cited lifts of the same). Retained locally for provenance/audit; '
      + 'must not be published or bundled into authoritypacks releases. Publishable gap-fill '
      + 'glosses live in packs/huckbot5000/ (source: Huckbot5000).',
    files: {
      'translations.ndjson': { count: translations.length },
    },
    policy: {
      version: '2026-08-06',
      rulesRef: 'huckbot5000-planning.md (leaf-writer/docs) Step 4',
      gate: 'huckbot5000/insiders-include.ndjson — collisionFlag !== none; local only',
      redistribute: false,
    },
  };
  fs.writeFileSync(path.join(outDir, 'translations-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `Compiled ${translations.length} collision-archive translations -> ${path.join(outDir, 'translations.ndjson')} `
      + '(local provenance/audit only — do not redistribute)',
  );
}

main();
