#!/usr/bin/env node
/**
 * Compile MaxiRicci7000 Batch A + B candidates into the French pack.
 *
 * source: 'MaxiRicci7000', language: 'fr'
 * Policy (2026-08-06): AI-generated French glosses are treated as a new
 * expressive layer (not a reprint of Hucker's English). Pack is intended for
 * redistribution; provenance still records whether English input came from
 * Hucker OCR / CBDB-(Hucker) / Huckbot.
 *
 * Usage: node maxiricci7000/compileTranslations.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeNdjson } from '../shared/ndjson.mjs';
import { readNdjsonLines } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return path.resolve(root, i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback);
};

const batchAPath = arg('--batch-a', 'packs/maxiricci7000/candidates-a.ndjson');
const batchBPath = arg('--batch-b', 'packs/maxiricci7000/candidates-b.ndjson');
const outDir = arg('--out', 'packs/maxiricci7000');

function toPackRow(row) {
  return {
    source: 'MaxiRicci7000',
    kind: 'office',
    language: 'fr',
    batch: row.batch ?? null,
    zh: row.zh,
    en: row.en ?? null,
    dynasty: row.dynasty ?? null,
    dynasties: row.dynasties ?? [],
    translation: row.fr,
    officeIds: row.officeIds ?? [],
    metadata: {
      generatedByModel: row.model ?? null,
      method: row.method ?? null,
      englishProvenance: row.provenance ?? [],
      // Audit only: whether the *English input* came from Hucker-linked text.
      // The French gloss itself is source-tagged MaxiRicci7000.
      englishFromHucker: Boolean(row.derivedFromHucker),
      rotoursInEntry: row.rotoursInEntry ?? undefined,
      pack: 'maxiricci7000',
    },
  };
}

function main() {
  const a = fs.existsSync(batchAPath)
    ? readNdjsonLines(batchAPath).filter((r) => r.zh && r.fr)
    : [];
  const b = fs.existsSync(batchBPath)
    ? readNdjsonLines(batchBPath).filter((r) => r.zh && r.fr)
    : [];
  if (!a.length && !b.length) {
    console.error(
      'ERROR: no candidates. Run generate:maxiricci7000:a and/or :b first.',
    );
    process.exit(1);
  }

  const translations = [...a, ...b].map(toPackRow);
  const fromHuckerEn = translations.filter((t) => t.metadata.englishFromHucker).length;

  fs.mkdirSync(outDir, { recursive: true });
  writeNdjson(path.join(outDir, 'translations.ndjson'), translations);

  const manifest = {
    id: 'maxiricci7000',
    source: 'MaxiRicci7000',
    language: 'fr',
    buildToolVersion: '0.1.0',
    compiledAt: new Date().toISOString(),
    upstream: {
      source:
        'French office-title glosses via GPT-4o. Batch A: full Hucker OCR entries '
        + '(zh + English title + definition) with Robert des Rotours (RR) seeds. '
        + 'Batch B: CBDB/Huckbot offices absent from Hucker, retrieved against Batch A '
        + 'French + mined French morpheme lexicon. Named after Matteo Ricci — ambitious '
        + 'cross-linguistic glossary work, not a claim of equivalence to Grand Ricci.',
    },
    license: 'internal-pending-review',
    attribution:
      'AI-generated French scholarly glosses for Chinese office titles (source: MaxiRicci7000). '
      + 'English inputs may include Hucker OCR / CBDB-(Hucker) / Huckbot5000; the shipped '
      + 'artifact is the French gloss, not Hucker\'s English prose. Project policy (2026-08-06): '
      + 'treat as redistributable AI output; provenance kept in metadata.englishFromHucker.',
    files: {
      'translations.ndjson': {
        count: translations.length,
        batchA: a.length,
        batchB: b.length,
        englishFromHucker: fromHuckerEn,
        englishNotFromHucker: translations.length - fromHuckerEn,
      },
    },
    policy: {
      version: '2026-08-06',
      redistribute: true,
      note:
        'Owner accepts redistribution risk for AI French derived from Hucker-informed '
        + 'prompts; distinct from English Huckbot collision-archive policy.',
      gate: 'candidates-a.ndjson + candidates-b.ndjson from GPT-4o MaxiRicci7000 generate',
    },
  };
  fs.writeFileSync(
    path.join(outDir, 'translations-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  console.log(
    `Compiled ${translations.length} French translations`
      + ` (A=${a.length}, B=${b.length}, englishFromHucker=${fromHuckerEn})`
      + ` -> ${path.join(outDir, 'translations.ndjson')}`,
  );
}

main();
