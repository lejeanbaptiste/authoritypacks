#!/usr/bin/env node
/**
 * Compile MaxiRicci7000 Batch A + B candidates into the French pack.
 *
 * Drops rows with garbage English inputs (numeric codes, CJK-in-en, etc.) or
 * unusable French outputs (CJK leftovers, empty). Rejected rows go to
 * reports/maxiricci7000-rejected.ndjson for inspection.
 *
 * Also attaches CBDB/Norbert `officeIds` by Chinese headword when the candidate
 * row lacks them (Batch A Hucker OCR entries).
 *
 * Usage: node maxiricci7000/compileTranslations.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeNdjson } from '../shared/ndjson.mjs';
import { assessFrenchCandidate, readNdjsonLines } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return path.resolve(root, i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback);
};

const batchAPath = arg('--batch-a', 'packs/maxiricci7000/candidates-a.ndjson');
const batchBPath = arg('--batch-b', 'packs/maxiricci7000/candidates-b.ndjson');
const outDir = arg('--out', 'packs/maxiricci7000');
const rejectedPath = arg('--rejected', 'reports/maxiricci7000-rejected.ndjson');
const cbdbOfficesPath = arg('--cbdb-offices', 'packs/cbdb/offices.ndjson');
const norbertOfficesPath = arg('--norbert-offices', 'packs/norbert/offices.ndjson');

function normalizeZh(zh) {
  return String(zh ?? '').normalize('NFKC').trim();
}

/** Map zh headword → office entity ids from CBDB / Norbert office packs. */
function buildOfficeIdIndex(filePaths) {
  /** @type {Map<string, Set<string>>} */
  const byZh = new Map();
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    for (const row of readNdjsonLines(filePath)) {
      const zh = normalizeZh(row.primaryName);
      if (!zh) continue;
      const ids = byZh.get(zh) ?? new Set();
      const entityId = row.metadata?.entityId || row.metadata?.canonicalEntityId;
      if (entityId) ids.add(String(entityId));
      const source = String(row.source ?? '').trim().toLowerCase();
      if (source && row.authorityId) ids.add(`${source}:office:${row.authorityId}`);
      if (ids.size) byZh.set(zh, ids);
    }
  }
  return byZh;
}

function toPackRow(row, officeIdsByZh) {
  const zh = normalizeZh(row.zh);
  const fromRow = (row.officeIds ?? []).map(String).filter(Boolean);
  const fromIndex = [...(officeIdsByZh.get(zh) ?? [])];
  const officeIds = [...new Set([...fromRow, ...fromIndex])].sort();

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
    officeIds,
    metadata: {
      generatedByModel: row.model ?? null,
      method: row.method ?? null,
      englishProvenance: row.provenance ?? [],
      englishFromHucker: Boolean(row.derivedFromHucker),
      rotoursInEntry: row.rotoursInEntry ?? undefined,
      pack: 'maxiricci7000',
      officeIdsEnriched: fromRow.length === 0 && officeIds.length > 0,
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

  const officeIdsByZh = buildOfficeIdIndex([cbdbOfficesPath, norbertOfficesPath]);
  console.log(`  office headwords indexed for id attach: ${officeIdsByZh.size}`);

  const kept = [];
  const rejected = [];
  for (const row of [...a, ...b]) {
    const verdict = assessFrenchCandidate({ en: row.en, fr: row.fr });
    if (!verdict.ok) {
      rejected.push({
        ...row,
        rejectReason: verdict.reason,
      });
      continue;
    }
    kept.push(toPackRow(row, officeIdsByZh));
  }

  const fromHuckerEn = kept.filter((t) => t.metadata.englishFromHucker).length;
  const withIds = kept.filter((t) => t.officeIds.length > 0).length;
  const enriched = kept.filter((t) => t.metadata.officeIdsEnriched).length;

  fs.mkdirSync(outDir, { recursive: true });
  writeNdjson(path.join(outDir, 'translations.ndjson'), kept);

  fs.mkdirSync(path.dirname(rejectedPath), { recursive: true });
  writeNdjson(rejectedPath, rejected);

  const reasonCounts = {};
  for (const r of rejected) {
    reasonCounts[r.rejectReason] = (reasonCounts[r.rejectReason] ?? 0) + 1;
  }

  const manifest = {
    id: 'maxiricci7000-translations',
    source: 'MaxiRicci7000',
    language: 'fr',
    buildToolVersion: '0.1.2',
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
        count: kept.length,
        batchAKept: kept.filter((t) => t.batch === 'A').length,
        batchBKept: kept.filter((t) => t.batch === 'B').length,
        withOfficeIds: withIds,
        officeIdsEnrichedFromPacks: enriched,
        englishFromHucker: fromHuckerEn,
        englishNotFromHucker: kept.length - fromHuckerEn,
        rejected: rejected.length,
        rejectReasons: reasonCounts,
      },
    },
    policy: {
      version: '2026-08-06',
      redistribute: true,
      note:
        'Owner accepts redistribution risk for AI French derived from Hucker-informed '
        + 'prompts; distinct from English Huckbot collision-archive policy. Compile drops '
        + 'numeric/CJK English inputs and French rows that still contain CJK. Office ids '
        + 'attached from CBDB/Norbert packs by Chinese headword when missing.',
      gate: 'candidates-a/b after assessFrenchCandidate()',
      rejectedReport: path.relative(root, rejectedPath),
    },
  };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  // Bundle staging prefers manifest.json; keep translations-manifest.json too.
  fs.writeFileSync(path.join(outDir, 'manifest.json'), manifestJson);
  fs.writeFileSync(path.join(outDir, 'translations-manifest.json'), manifestJson);

  console.log(
    `Compiled ${kept.length} French translations`
      + ` (${withIds} with officeIds, ${enriched} enriched)`
      + ` (rejected ${rejected.length}: ${JSON.stringify(reasonCounts)})`
      + ` -> ${path.join(outDir, 'translations.ndjson')}`,
  );
  console.log(`Rejected rows -> ${path.relative(root, rejectedPath)}`);
}

main();
