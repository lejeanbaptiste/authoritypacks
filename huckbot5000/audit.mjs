#!/usr/bin/env node
/**
 * Run the verbatim-collision filter (Step 4, docs/huckbot5000-planning.md)
 * over generated candidates and produce a human-review CSV. This is an
 * audit only: it never changes a pack or the include file. Mirrors the
 * noble-titles workflow (scripts/audit-noble-titles.mjs) -- decisions live
 * in huckbot5000/approved-include.ndjson (compiled by
 * scripts/compile-huckbot5000-include.mjs from a reviewed copy of this CSV),
 * and re-running this script reflects those decisions back for visibility.
 *
 * Checks two Hucker-text sources: the local OCR-extracted dictionary
 * corpus, and CBDB's own `(Hucker)`-tagged office translations pulled
 * directly from the full upstream sqlite (covers longer compound titles the
 * OCR corpus doesn't headword separately -- see lib.mjs's readCbdbHuckerPairs
 * doc comment). The CBDB source is skipped with a warning, not a hard
 * failure, if `.upstream/cbdb.sqlite3` isn't present locally.
 *
 * Usage: node huckbot5000/audit.mjs [--candidates FILE] [--hucker FILE]
 *   [--cbdb-sqlite FILE] [--out FILE]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNdjson } from '../shared/ndjson.mjs';
import { readHuckerPairs, readCbdbHuckerPairs, indexHuckerByHeadword, detectCollision, detectTransliterationPunt } from './lib.mjs';
import { targetKey } from './resolveTargets.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return path.resolve(root, i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback);
};
const candidatesPath = arg('--candidates', 'packs/huckbot5000/candidates.ndjson');
const huckerPath = arg('--hucker', 'skunkworks/scripts/out/hucker_entries.ndjson');
const cbdbSqlitePath = arg('--cbdb-sqlite', '.upstream/cbdb.sqlite3');
const includePath = path.join(root, 'huckbot5000/approved-include.ndjson');
const outPath = arg('--out', 'reports/huckbot5000-candidate-review.csv');

const csv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function loadApprovedById() {
  if (!fs.existsSync(includePath)) return new Map();
  const byId = new Map();
  for (const line of fs.readFileSync(includePath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue; // schemaVersion header line
    }
    if (row.id) byId.set(row.id, row);
  }
  return byId;
}

async function main() {
  if (!fs.existsSync(candidatesPath)) {
    console.error(`ERROR: candidates file not found: ${candidatesPath}. Run npm run generate:huckbot5000 first.`);
    process.exit(1);
  }
  if (!fs.existsSync(huckerPath)) {
    console.error(`ERROR: Hucker corpus not found: ${huckerPath}`);
    process.exit(1);
  }

  const candidates = readNdjson(candidatesPath);
  const pairs = readHuckerPairs(huckerPath);
  if (fs.existsSync(cbdbSqlitePath)) {
    const cbdbPairs = await readCbdbHuckerPairs(cbdbSqlitePath);
    pairs.push(...cbdbPairs);
    console.log(`Loaded ${cbdbPairs.length} Hucker-tagged translations from CBDB's own sqlite (${path.relative(root, cbdbSqlitePath)})`);
  } else {
    console.warn(
      `WARNING: CBDB sqlite not found at ${cbdbSqlitePath} -- collision check is OCR-corpus-only. `
      + `Run npm run fetch:upstream to get it (~550MB) for full coverage of compound institutional titles.`,
    );
  }
  const huckerByHeadword = indexHuckerByHeadword(pairs);
  const approvedById = loadApprovedById();

  const rows = candidates
    .filter((c) => c.hyp)
    .map((c) => {
      const id = `huckbot5000:${c.key ?? targetKey(c.zh, c.dynasty)}`;
      const collision = detectCollision(c.zh, c.hyp, huckerByHeadword);
      const translit = collision.flag === 'none'
        ? detectTransliterationPunt(c.zh, c.hyp)
        : { flag: 'none', detail: '' };
      const gate = collision.flag !== 'none' ? collision : translit;
      const approved = approvedById.get(id);
      let status;
      if (gate.flag !== 'none') status = 'rejected';
      else if (approved) status = `approved:${id}`;
      else status = 'review';
      return {
        id,
        zh: c.zh,
        dynasty: c.dynasty ?? '',
        officeIds: (c.ids ?? []).join(';'),
        model: c.model ?? '',
        candidateGloss: c.hyp,
        collisionFlag: gate.flag,
        collisionDetail: gate.detail,
        status,
        note: gate.flag !== 'none' ? `hard gate: ${gate.detail}` : '',
      };
    });

  rows.sort((a, b) => a.zh.localeCompare(b.zh));

  const columns = ['id', 'zh', 'dynasty', 'officeIds', 'model', 'candidateGloss', 'collisionFlag', 'collisionDetail', 'status', 'note'];
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    `${columns.join(',')}\n${rows.map((row) => columns.map((key) => csv(row[key])).join(',')).join('\n')}\n`,
  );

  const collided = rows.filter((r) => r.collisionFlag !== 'none').length;
  const pending = rows.filter((r) => r.status === 'review').length;
  console.log(`Huckbot5000 audit: ${rows.length} candidates -> ${outPath}`);
  console.log(`  ${collided} auto-rejected by the collision filter (${rows.length ? ((collided / rows.length) * 100).toFixed(1) : 0}%)`);
  console.log(`  ${pending} pending human review`);
  console.log(`Edit the 'status' column to 'accepted' for rows a reviewer approves, then run:`);
  console.log(`  npm run compile:huckbot5000-include`);
}

await main();

