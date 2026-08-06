#!/usr/bin/env node
/**
 * Compile huckbot5000/approved-include.ndjson (human-reviewed, collision-
 * filtered rows) into the shippable pack, packs/huckbot5000/translations.ndjson.
 * The build reads only the approved include -- never candidates.ndjson or
 * the raw Hucker corpus -- same reviewed-boundary shape as noble-titles.
 *
 * Every row is tagged source: 'Huckbot5000' (never 'Hucker') so a downstream
 * consumer (plugin-norbert) can distinguish an AI-inferred gap-fill gloss
 * from Hucker's actual scholarship -- see docs/entity-display-translations-planning.md
 * decision 4 and docs/huckbot5000-planning.md's Step 4.
 *
 * Usage: node huckbot5000/compileTranslations.mjs [--input FILE] [--out DIR]
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
const inputPath = arg('--input', 'huckbot5000/approved-include.ndjson');
const outDir = arg('--out', 'packs/huckbot5000');

function readApprovedRows(filePath) {
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
    console.error(`ERROR: ${inputPath} not found. Run npm run compile:huckbot5000-include first.`);
    process.exit(1);
  }
  const approved = readApprovedRows(inputPath);

  const translations = approved.map((row) => ({
    source: 'Huckbot5000',
    kind: 'office',
    zh: row.zh,
    dynasty: row.dynasty ?? null,
    translation: row.gloss,
    officeIds: row.officeIds ?? [],
    metadata: {
      generatedByModel: row.model ?? null,
      reviewedVia: 'huckbot5000-candidate-review.csv',
    },
  }));

  fs.mkdirSync(outDir, { recursive: true });
  writeNdjson(path.join(outDir, 'translations.ndjson'), translations);

  const manifest = {
    id: 'huckbot5000-translations',
    source: 'Huckbot5000',
    buildToolVersion: '0.1.0',
    compiledAt: new Date().toISOString(),
    upstream: {
      source: 'GPT-4o and/or procedural rules for offices that lack a publishable English gloss; '
        + 'candidates collision-filtered against known Hucker / CBDB-(Hucker) wording and '
        + 'human-reviewed row by row. Publishable rows are independent gap-fill glosses, not '
        + 'dictionary excerpts — see leaf-writer/docs/huckbot5000-planning.md.',
    },
    license: 'internal-pending-review',
    attribution:
      'Reviewed gap-fill English glosses for Chinese office titles (source: Huckbot5000). '
      + 'Distinct from Hucker\'s Dictionary of Official Titles; candidates matching known '
      + 'Hucker wording are excluded from this pack. Pending rights review (EU sui generis '
      + 'database right, US copyright) before any public redistribution — see '
      + 'leaf-writer/docs/huckbot5000-planning.md Legal note.',
    files: {
      'translations.ndjson': {
        count: translations.length,
        entityCount: translations.length,
      },
    },
    policy: {
      version: '2026-08-06',
      rulesRef: 'huckbot5000-planning.md (leaf-writer/docs) Step 4',
      gate: 'huckbot5000/approved-include.ndjson rows only; collision-filter hard-gated '
        + 'and human-reviewed via reports/huckbot5000-candidate-review.csv',
    },
  };
  // Bundle helpers expect manifest.json (CHGIS/noble-title pattern). Keep the
  // older translations-manifest.json name as a copy for local tooling.
  const manifestBody = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(path.join(outDir, 'manifest.json'), manifestBody);
  fs.writeFileSync(path.join(outDir, 'translations-manifest.json'), manifestBody);

  console.log(`Compiled ${translations.length} Huckbot5000 translations -> ${path.join(outDir, 'translations.ndjson')}`);
}

main();
