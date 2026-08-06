#!/usr/bin/env node
/**
 * Collect MaxiRicci7000 targets:
 *
 *   Batch A — every usable Hucker OCR entry (zh + en title + full definition),
 *             plus Rotours (RR) seeds mined from those definitions.
 *   Batch B — CBDB / Huckbot English glosses whose Chinese headword does NOT
 *             appear in the Hucker OCR corpus (true gaps).
 *
 * Writes (gitignored under packs/maxiricci7000/):
 *   rotours-seeds.ndjson
 *   batch-a-targets.ndjson
 *   batch-b-targets.ndjson
 *
 * Usage:
 *   node maxiricci7000/collectTargets.mjs
 *   node maxiricci7000/collectTargets.mjs --include-candidates
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeNdjson } from '../shared/ndjson.mjs';
import {
  CJK_ONLY_RE,
  batchAKey,
  batchBKey,
  cleanEnglishGloss,
  extractRotoursFromFull,
  isHuckerCited,
  readNdjsonLines,
} from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hasFlag = (name) => process.argv.includes(name);

const huckerPath = path.resolve(
  root,
  arg('--hucker', 'skunkworks/scripts/out/hucker_entries.ndjson'),
);
const cbdbSqlitePath = path.resolve(root, arg('--cbdb-sqlite', '.upstream/cbdb.sqlite3'));
const approvedPath = path.resolve(
  root,
  arg('--approved', 'huckbot5000/approved-include.ndjson'),
);
const insidersPath = path.resolve(
  root,
  arg('--insiders', 'huckbot5000/insiders-include.ndjson'),
);
const candidatesPath = path.resolve(
  root,
  arg('--candidates', 'packs/huckbot5000/candidates.ndjson'),
);
const outDir = path.resolve(root, arg('--out', 'packs/maxiricci7000'));
const includeCandidates = hasFlag('--include-candidates');

function loadHuckerEntries(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: Hucker OCR not found: ${filePath}`);
    process.exit(1);
  }
  const rows = readNdjsonLines(filePath);
  const batchA = [];
  const seeds = [];
  const huckerZh = new Set();

  for (const row of rows) {
    const zh = String(row.chinese ?? '').normalize('NFKC').trim();
    if (!zh || !CJK_ONLY_RE.test(zh)) continue;
    huckerZh.add(zh);

    let en = cleanEnglishGloss(row.translation_title);
    const full = String(row.translation_full ?? '').trim();
    // If title is missing/junk but full starts with a short gloss, skip — Batch A
    // needs a clear English title. Prefer real titles only.
    if (!en) continue;

    const rotours = extractRotoursFromFull(full);
    const dynasty = row.dynasty ?? null;
    const key = batchAKey(zh, dynasty, en);

    batchA.push({
      key,
      batch: 'A',
      zh,
      en,
      full: full || null,
      dynasty,
      rotours,
      huckerId: row.id ?? null,
      derivedFromHucker: true,
      provenance: ['Hucker-OCR'],
    });

    for (const fr of rotours) {
      seeds.push({
        zh,
        en,
        fr,
        dynasty,
        source: 'RR',
      });
    }
  }

  // Dedupe Batch A by key (keep richest full).
  const byKey = new Map();
  for (const row of batchA) {
    const prev = byKey.get(row.key);
    if (!prev || (row.full && (!prev.full || row.full.length > prev.full.length))) {
      byKey.set(row.key, row);
    }
  }

  // Dedupe seeds by zh+fr.
  const seedKey = new Set();
  const uniqueSeeds = [];
  for (const s of seeds) {
    const k = `${s.zh}\t${s.fr}`;
    if (seedKey.has(k)) continue;
    seedKey.add(k);
    uniqueSeeds.push(s);
  }

  return {
    batchA: [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key)),
    seeds: uniqueSeeds.sort((a, b) => a.zh.localeCompare(b.zh)),
    huckerZh,
  };
}

async function loadCbdbGapRows(sqlitePath, huckerZh) {
  if (!fs.existsSync(sqlitePath)) {
    console.warn(`WARNING: CBDB sqlite missing at ${sqlitePath} — Batch B skips CBDB.`);
    return [];
  }
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(sqlitePath, { readonly: true });
  try {
    const rows = db
      .prepare(
        `SELECT o.c_office_id AS id, o.c_office_chn AS zh,
                o.c_office_trans AS en, o.c_office_trans_alt AS en_alt,
                d.c_dynasty_chn AS dynasty_chn, d.c_dynasty AS dynasty_en
         FROM OFFICE_CODES o
         LEFT JOIN DYNASTIES d ON o.c_dy = d.c_dy
         WHERE o.c_office_chn IS NOT NULL AND TRIM(o.c_office_chn) != ''`,
      )
      .all();
    const out = [];
    for (const row of rows) {
      const zh = String(row.zh ?? '').normalize('NFKC').trim();
      if (!zh || !CJK_ONLY_RE.test(zh) || huckerZh.has(zh)) continue;
      const dynasty = row.dynasty_chn || row.dynasty_en || null;
      for (const raw of [row.en, row.en_alt]) {
        if (!raw) continue;
        const derived = isHuckerCited(raw);
        const en = cleanEnglishGloss(raw);
        if (!en) continue;
        out.push({
          zh,
          en,
          dynasty,
          officeIds: row.id != null ? [`cbdb:office:${row.id}`] : [],
          provenance: [derived ? 'CBDB-Hucker' : 'CBDB'],
          derivedFromHucker: derived,
        });
      }
    }
    return out;
  } finally {
    db.close();
  }
}

function loadHuckbotGapRows(filePath, provenance, derivedFromHucker, huckerZh) {
  if (!fs.existsSync(filePath)) return [];
  return readNdjsonLines(filePath)
    .filter((r) => r.zh && (r.gloss || r.translation || r.hyp))
    .map((r) => {
      const zh = String(r.zh).normalize('NFKC').trim();
      const en = cleanEnglishGloss(r.gloss ?? r.translation ?? r.hyp);
      return {
        zh,
        en,
        dynasty: r.dynasty ?? null,
        officeIds: r.officeIds ?? r.ids ?? [],
        provenance: [provenance],
        derivedFromHucker,
        _skip: !zh || !en || !CJK_ONLY_RE.test(zh) || huckerZh.has(zh),
      };
    })
    .filter((r) => !r._skip)
    .map(({ _skip, ...r }) => r);
}

function mergeBatchB(rows) {
  /** @type {Map<string, object>} */
  const byKey = new Map();
  for (const row of rows) {
    const key = batchBKey(row.zh, row.en);
    const prev = byKey.get(key);
    const provenance = new Set(prev?.provenance ?? []);
    for (const p of row.provenance ?? []) provenance.add(p);
    const dynasties = new Set(prev?.dynasties ?? []);
    if (row.dynasty) dynasties.add(row.dynasty);
    const officeIds = new Set(prev?.officeIds ?? []);
    for (const id of row.officeIds ?? []) if (id) officeIds.add(String(id));
    byKey.set(key, {
      key,
      batch: 'B',
      zh: row.zh,
      en: row.en,
      dynasty: dynasties.size === 1 ? [...dynasties][0] : null,
      dynasties: [...dynasties].sort(),
      officeIds: [...officeIds].sort(),
      provenance: [...provenance].sort(),
      derivedFromHucker: Boolean(prev?.derivedFromHucker || row.derivedFromHucker),
    });
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

async function main() {
  const { batchA, seeds, huckerZh } = loadHuckerEntries(huckerPath);
  console.log(`  Hucker OCR headwords: ${huckerZh.size}`);
  console.log(`  Batch A targets: ${batchA.length}`);
  console.log(`  Rotours (RR) seeds: ${seeds.length}`);

  const gapRaw = [];
  const cbdb = await loadCbdbGapRows(cbdbSqlitePath, huckerZh);
  console.log(`  CBDB gaps (not in Hucker): ${cbdb.length}`);
  gapRaw.push(...cbdb);

  const approved = loadHuckbotGapRows(approvedPath, 'Huckbot5000', false, huckerZh);
  console.log(`  Huckbot approved gaps: ${approved.length}`);
  gapRaw.push(...approved);

  // Insiders are Hucker collisions — usually the headword IS in Hucker, so this
  // filter should drop most. Kept for any edge case compounds.
  const insiders = loadHuckbotGapRows(insidersPath, 'Hucker-collision', true, huckerZh);
  console.log(`  Huckbot insiders gaps: ${insiders.length}`);
  gapRaw.push(...insiders);

  if (includeCandidates) {
    const candidates = loadHuckbotGapRows(
      candidatesPath,
      'Huckbot5000-candidate',
      false,
      huckerZh,
    );
    console.log(`  Huckbot candidates gaps: ${candidates.length}`);
    gapRaw.push(...candidates);
  }

  const batchB = mergeBatchB(gapRaw);
  console.log(`  Batch B unique (zh, en): ${batchB.length}`);

  fs.mkdirSync(outDir, { recursive: true });
  writeNdjson(path.join(outDir, 'rotours-seeds.ndjson'), seeds);
  writeNdjson(path.join(outDir, 'batch-a-targets.ndjson'), batchA);
  writeNdjson(path.join(outDir, 'batch-b-targets.ndjson'), batchB);

  console.log(`Wrote targets -> ${path.relative(root, outDir)}`);
  console.log('Next: npm run generate:maxiricci7000:a');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
