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

/**
 * @param {{ inputPath?: string, outDir?: string }} [options]
 */
export function compileHuckbotInsiders(options = {}) {
  const includeFile = options.inputPath ?? inputPath;
  const outputDir = options.outDir ?? outDir;
  if (!fs.existsSync(includeFile)) {
    throw new Error(
      `Missing ${includeFile}. Run npm run compile:huckbot5000-include first `
        + '(writes both approved-include and insiders-include).',
    );
  }
  const includeRows = readInsidersRows(includeFile);

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

  fs.mkdirSync(outputDir, { recursive: true });
  writeNdjson(path.join(outputDir, 'translations.ndjson'), translations);

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
      'translations.ndjson': {
        count: translations.length,
        entityCount: translations.length,
      },
    },
    policy: {
      version: '2026-08-06',
      rulesRef: 'huckbot5000-planning.md (leaf-writer/docs) Step 4',
      gate: 'huckbot5000/insiders-include.ndjson — collisionFlag !== none; local only',
      redistribute: false,
    },
  };
  const manifestBody = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), manifestBody);
  fs.writeFileSync(path.join(outputDir, 'translations-manifest.json'), manifestBody);
  writePluginWrapper(outputDir, translations.length);

  return { count: translations.length, outDir: outputDir };
}

/**
 * Local-only LJB plugin so Tools → Plugins → Install from folder works.
 * @param {string} outputDir
 * @param {number} count
 */
function writePluginWrapper(outputDir, count) {
  const pluginManifest = {
    manifestVersion: '1.0.0',
    id: 'huckbot5000-insiders',
    name: 'Huckbot5000 insiders (internal)',
    version: '0.1.0',
    description:
      'Private Hucker collision-archive office glosses. Local use only — do not publish or redistribute.',
    author: 'Daniel Patrick Morgan',
    license: 'UNLICENSED',
    ljb: { minVersion: '0.1.0' },
    languages: ['zh-hant', 'zh-hans', 'lzh'],
    languagePrompt: {
      message:
        'An internal Huckbot5000 insiders gloss pack is available. Open Tools → Plugins to install it.',
      documentLanguages: ['zh-hant', 'zh-hans', 'lzh'],
    },
    entry: {
      kind: 'javascript',
      module: 'dist/register.mjs',
    },
    contributions: {
      authorityPacks: [
        {
          id: 'huckbot5000-insiders',
          label: 'Huckbot5000 insiders (Hucker, local)',
          defaultTag: '',
          install: { source: 'bundled', path: 'translations.ndjson' },
        },
      ],
    },
    bundled: ['dist/register.mjs', 'translations.ndjson', 'manifest.json'],
  };
  fs.writeFileSync(
    path.join(outputDir, 'plugin.manifest.json'),
    `${JSON.stringify(pluginManifest, null, 2)}\n`,
  );
  const distDir = path.join(outputDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(
    path.join(distDir, 'register.mjs'),
    `export async function register(context) {\n`
      + `  context.log('Huckbot5000 insiders pack loaded (${count} Hucker collision glosses)');\n`
      + `}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = compileHuckbotInsiders();
    console.log(
      `Compiled ${result.count} collision-archive translations -> ${path.join(result.outDir, 'translations.ndjson')} `
        + '(local provenance/audit only — do not redistribute)',
    );
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
