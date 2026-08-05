#!/usr/bin/env node
/**
 * Merge reviewed Tier-2 CSV `link` rows into the accepted Norbert person
 * concordance NDJSON. Idempotent: skips triples already present.
 *
 *   node norbert/mergeReviewCsv.mjs \
 *     [--csv reports/norbert-person-concordance-review.csv] \
 *     [--concordance packs/norbert/norbert-concordance.ndjson]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNdjson, writeNdjson } from '../shared/ndjson.mjs';
import { concordanceRow } from './concordanceHelpers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
};

/** Minimal CSV parser (quoted fields, "" escapes). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const finishRow = () => {
    pushField();
    if (row.length && row.some(Boolean)) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      finishRow();
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field || row.length) finishRow();
  if (!rows.length) return [];
  const headers = rows.shift().map((h) => h.trim());
  return rows.map((cells) =>
    Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()])),
  );
}

/** Dedup key: norbert id + target source + target id. */
export function concordanceTripleKey(row) {
  const nId = row?.metadata?.norbert?.authorityId;
  const matched = row?.metadata?.matched;
  if (nId == null || !matched?.source || matched?.authorityId == null) return '';
  return `${nId}\t${String(matched.source).toLowerCase()}\t${matched.authorityId}`;
}

/**
 * Parse dynasty cell (`唐` or `東晉|前秦`) into a string array.
 * @param {string} raw
 */
export function parseDynastiesCell(raw) {
  if (!raw?.trim()) return [];
  return raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Map one CSV review row with action=link to a concordance NDJSON record.
 * @param {Record<string, string>} csvRow
 */
export function linkRowToConcordance(csvRow) {
  const norbertId = String(csvRow.norbert_id ?? '').trim();
  const source = String(csvRow.candidate_source ?? '').trim().toLowerCase();
  const matchedId = String(csvRow.candidate_id ?? '').trim();
  const norbertName = String(csvRow.norbert_name ?? '').trim();
  const candidateName = String(csvRow.candidate_name ?? '').trim() || norbertName;
  if (!norbertId || !source || !matchedId) return null;

  const dynasties = parseDynastiesCell(csvRow.dynasties);
  const match = String(csvRow.match_rule ?? 'tier2-reviewed-link').trim() || 'tier2-reviewed-link';
  const tier = String(csvRow.tier ?? '2').trim() || '2';

  /** @type {Record<string, unknown>} */
  const evidence = {
    tier,
    reason: 'reviewed-link',
    score: csvRow.score ? Number(csvRow.score) || csvRow.score : undefined,
    shared: csvRow.shared || undefined,
    dynasties: dynasties.length ? dynasties : undefined,
    styleName: csvRow.style || undefined,
    family: csvRow.family || undefined,
    temple: csvRow.temple || undefined,
    posthumous: csvRow.posthumous || undefined,
    familySource: csvRow.family_source || undefined,
  };
  // Drop empty/undefined evidence keys so NDJSON stays tidy.
  for (const key of Object.keys(evidence)) {
    if (evidence[key] === undefined || evidence[key] === '') delete evidence[key];
  }

  return concordanceRow(
    norbertId,
    source,
    matchedId,
    match,
    evidence,
    { primaryName: norbertName },
    { primaryName: candidateName },
  );
}

/**
 * Merge link rows from a parsed CSV into existing concordance records.
 * @param {any[]} existing
 * @param {Record<string, string>[]} csvRows
 */
export function mergeReviewLinks(existing, csvRows) {
  const seen = new Set(existing.map(concordanceTripleKey).filter(Boolean));
  const added = [];
  let linkRows = 0;
  let skippedDup = 0;
  let skippedBad = 0;

  for (const csvRow of csvRows) {
    if (String(csvRow.action ?? '').trim() !== 'link') continue;
    linkRows++;
    const row = linkRowToConcordance(csvRow);
    if (!row) {
      skippedBad++;
      continue;
    }
    const key = concordanceTripleKey(row);
    if (!key || seen.has(key)) {
      skippedDup++;
      continue;
    }
    seen.add(key);
    added.push(row);
  }

  return {
    merged: [...existing, ...added],
    added,
    stats: {
      existing: existing.length,
      linkRows,
      added: added.length,
      skippedDup,
      skippedBad,
      total: existing.length + added.length,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const csvPath = path.resolve(root, arg('--csv', 'reports/norbert-person-concordance-review.csv'));
  const concordancePath = path.resolve(
    root,
    arg('--concordance', 'packs/norbert/norbert-concordance.ndjson'),
  );

  if (!fs.existsSync(csvPath)) {
    throw new Error(`Review CSV not found: ${csvPath}`);
  }
  if (!fs.existsSync(concordancePath)) {
    throw new Error(`Concordance not found: ${concordancePath}`);
  }

  const csvRows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const existing = readNdjson(concordancePath);
  const result = mergeReviewLinks(existing, csvRows);
  writeNdjson(concordancePath, result.merged);

  const { stats } = result;
  console.log(
    `Merged review links → ${concordancePath}\n` +
      `  existing ${stats.existing}, link rows ${stats.linkRows}, ` +
      `added ${stats.added}, skippedDup ${stats.skippedDup}, skippedBad ${stats.skippedBad}\n` +
      `  total ${stats.total}`,
  );
}
