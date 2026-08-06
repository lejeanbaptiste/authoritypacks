#!/usr/bin/env node
/**
 * Convert a human-reviewed copy of huckbot5000-candidate-review.csv into:
 *   - huckbot5000/approved-include.ndjson — shippable boundary (accepted +
 *     collisionFlag === 'none') for compileTranslations.mjs
 *   - huckbot5000/insiders-include.ndjson — local collision archive (any row with
 *     collisionFlag !== 'none' and a gloss) for compileInsidersTranslations.mjs
 *
 * Mirrors scripts/compile-noble-title-include.mjs for the approved path.
 *
 * The collision filter is a hard gate for the *publishable* pack: a row with
 * collisionFlag !== 'none' is never included in approved-include even if a
 * reviewer marked it 'accepted' -- see docs/huckbot5000-planning.md Step 4.
 * Those collision rows go to the collision archive instead (source: Hucker,
 * provenance/audit only, not for redistribution).
 *
 * Both includes dedupe by (zh, dynasty), matching generate/audit target keys.
 *
 * Usage: node scripts/compile-huckbot5000-include.mjs [--input FILE]
 *   [--output FILE] [--insiders-output FILE]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { targetKey } from '../huckbot5000/resolveTargets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return path.resolve(root, index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback);
};
const input = arg('--input', 'reports/huckbot5000-candidate-review.csv');
const output = arg('--output', 'huckbot5000/approved-include.ndjson');
const insidersOutput = arg('--insiders-output', 'huckbot5000/insiders-include.ndjson');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const push = () => { row.push(field); field = ''; };
  const finish = () => { push(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') push();
    else if (c === '\n') finish();
    else if (c !== '\r') field += c;
  }
  if (field || row.length) finish();
  const headers = rows.shift();
  return rows.filter((r) => r.length && r.some(Boolean)).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

function writeInclude(filePath, sourceLabel, rules) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ schemaVersion: 1, source: path.relative(root, input), kind: sourceLabel })}\n${rules.map((r) => JSON.stringify(r)).join('\n')}\n`,
  );
}

/** @param {Array<{ status: string, collisionFlag: string, id?: string, zh: string, dynasty?: string, officeIds?: string, candidateGloss: string, model?: string }>} rows */
export function compileApprovedIncludeRows(rows) {
  const rejectedByGate = [];
  const rules = [];
  const seen = new Set();
  for (const row of rows) {
    const humanAccepted = row.status === 'accepted' || String(row.status ?? '').startsWith('approved:');
    if (!humanAccepted) continue;
    if (row.collisionFlag !== 'none') {
      rejectedByGate.push(row);
      continue;
    }
    const dynasty = row.dynasty || null;
    const key = targetKey(row.zh, dynasty);
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push({
      id: row.id || `huckbot5000:${key}`,
      zh: row.zh,
      dynasty,
      officeIds: row.officeIds ? row.officeIds.split(';').filter(Boolean) : [],
      gloss: row.candidateGloss,
      model: row.model || null,
      note: 'Compiled from huckbot5000-candidate-review.csv; human-reviewed, no collision flag.',
    });
  }
  return { rules, rejectedByGate };
}

/**
 * Collision-flagged rows for the local collision archive (provenance/audit).
 * Admission ticket is the collision itself — no human `accepted` required.
 *
 * @param {Array<{ collisionFlag?: string, collisionDetail?: string, id?: string, zh: string, dynasty?: string, officeIds?: string, candidateGloss: string, model?: string }>} rows
 */
export function compileInsidersIncludeRows(rows) {
  const rules = [];
  const seen = new Set();
  for (const row of rows) {
    const flag = row.collisionFlag ?? 'none';
    if (flag === 'none' || flag === '') continue;
    const gloss = String(row.candidateGloss ?? '').trim();
    if (!gloss || !row.zh) continue;
    const dynasty = row.dynasty || null;
    const key = targetKey(row.zh, dynasty);
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push({
      id: row.id || `huckbot5000-insiders:${key}`,
      zh: row.zh,
      dynasty,
      officeIds: row.officeIds ? row.officeIds.split(';').filter(Boolean) : [],
      gloss,
      model: row.model || null,
      collisionFlag: flag,
      collisionDetail: row.collisionDetail || '',
      note: 'Collision archive: matched Hucker / CBDB-(Hucker) text; not for redistribution.',
    });
  }
  return { rules };
}

function main() {
  if (!fs.existsSync(input)) {
    console.error(`ERROR: review CSV not found: ${input}. Run npm run audit:huckbot5000 first.`);
    process.exit(1);
  }
  const rows = parseCsv(fs.readFileSync(input, 'utf8'));
  const { rules, rejectedByGate } = compileApprovedIncludeRows(rows);
  const { rules: insiders } = compileInsidersIncludeRows(rows);

  writeInclude(output, 'approved', rules);
  writeInclude(insidersOutput, 'insiders', insiders);

  console.log(`Compiled ${rules.length} approved Huckbot5000 rows from ${rows.length} review rows -> ${output}`);
  console.log(`Compiled ${insiders.length} collision-archive rows -> ${insidersOutput}`);
  if (rejectedByGate.length) {
    console.log(`Hard gate blocked ${rejectedByGate.length} row(s) marked 'accepted' but flagged by the collision filter (routed to collision archive):`);
    for (const row of rejectedByGate.slice(0, 10)) {
      console.log(`  ${row.zh} [${row.dynasty || '?'}] "${row.candidateGloss}" -- ${row.collisionFlag}: ${row.collisionDetail}`);
    }
    if (rejectedByGate.length > 10) console.log(`  ... and ${rejectedByGate.length - 10} more`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
