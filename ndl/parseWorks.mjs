/**
 * N1 — Parse NDL Work authorities batch TSV → raw NDJSON records.
 *
 * Columns (no header row): ID, Name/Title, Variant Names, Creator(s), Date Created, Last Updated
 * Multi-values in variant/creator fields use semicolon separators.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeNdjson } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** @param {string} field */
export function splitSemicolonField(field) {
  if (!field?.trim()) return [];
  return field
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {string} line
 * @returns {import('./types.mjs').NdlWorkRaw | null}
 */
export function parseWorkLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('\t');
  if (parts.length < 2) return null;

  const [id, title, variantsRaw = '', creatorsRaw = '', created = '', updated = ''] = parts;
  if (!id?.trim() || !title?.trim()) return null;

  return {
    id: id.trim(),
    title: title.trim(),
    variants: splitSemicolonField(variantsRaw),
    creators: splitSemicolonField(creatorsRaw),
    created: created.trim() || undefined,
    updated: updated.trim() || undefined,
  };
}

/**
 * @param {string} tsvPath
 * @param {{ limit?: number }} opts
 * @returns {Promise<import('./types.mjs').NdlWorkRaw[]>}
 */
export async function readWorksTsv(tsvPath, opts = {}) {
  const limit = opts.limit ?? Infinity;
  /** @type {import('./types.mjs').NdlWorkRaw[]} */
  const rows = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(tsvPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const row = parseWorkLine(line);
    if (row) rows.push(row);
    if (rows.length >= limit) break;
  }
  return rows;
}

/**
 * @param {{ tsvPath: string, outPath: string, limit?: number }} opts
 */
export async function extractWorksToNdjson(opts) {
  const rows = await readWorksTsv(opts.tsvPath, { limit: opts.limit });
  writeNdjson(opts.outPath, rows);
  return { count: rows.length, outPath: opts.outPath };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tsvPath = arg('--tsv', '');
  const outPath = arg('--out', path.join(ROOT, 'packs/ndl/raw/works.raw.ndjson'));
  const limit = arg('--limit', '');

  if (!tsvPath) {
    console.error('Usage: node ndl/parseWorks.mjs --tsv path/to/work-tsv.tsv [--out FILE] [--limit N]');
    process.exit(1);
  }

  extractWorksToNdjson({
    tsvPath,
    outPath,
    limit: limit ? Number.parseInt(limit, 10) : undefined,
  })
    .then(({ count, outPath: out }) => {
      console.log(`Wrote ${count} work records → ${out}`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
