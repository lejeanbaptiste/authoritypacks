#!/usr/bin/env node
/**
 * MaxiRicci7000 Batch A — GPT-4o French glosses from full Hucker dictionary entries.
 *
 * Requires OPENAI_API_KEY. Reads batch-a-targets + rotours-seeds from collectTargets.
 *
 * Usage:
 *   OPENAI_API_KEY=... node maxiricci7000/generateBatchA.mjs --dry-run
 *   OPENAI_API_KEY=... node maxiricci7000/generateBatchA.mjs --sample 50
 *   OPENAI_API_KEY=... node maxiricci7000/generateBatchA.mjs --resume
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNdjson, writeNdjson } from '../shared/ndjson.mjs';
import {
  SYSTEM_BATCH_A,
  callOpenAi,
  cleanFrenchGloss,
  mulberry32,
  renderBatchAPrompt,
  shuffle,
} from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hasFlag = (name) => process.argv.includes(name);

const model = arg('--model', 'gpt-4o');
const sample = arg('--sample', null);
const limit = arg('--limit', null);
const seed = Number(arg('--seed', '7'));
const dryRun = hasFlag('--dry-run');
const resume = hasFlag('--resume');
const targetsPath = path.resolve(
  root,
  arg('--targets', 'packs/maxiricci7000/batch-a-targets.ndjson'),
);
const seedsPath = path.resolve(
  root,
  arg('--seeds', 'packs/maxiricci7000/rotours-seeds.ndjson'),
);
const outPath = path.resolve(
  root,
  arg('--out', 'packs/maxiricci7000/candidates-a.ndjson'),
);

async function main() {
  if (!dryRun && !process.env.OPENAI_API_KEY) {
    console.error('ERROR: set OPENAI_API_KEY in your shell first.');
    process.exit(1);
  }
  if (!fs.existsSync(targetsPath)) {
    console.error(`ERROR: ${targetsPath} missing. Run npm run collect:maxiricci7000`);
    process.exit(1);
  }

  let targets = readNdjson(targetsPath);
  const rotoursSeeds = fs.existsSync(seedsPath) ? readNdjson(seedsPath) : [];
  // Prefer diverse few-shots: shuffle then take a stable style card.
  const styleCard = shuffle(rotoursSeeds, mulberry32(seed)).slice(0, 12);

  const rand = mulberry32(seed);
  if (sample) targets = shuffle(targets, rand).slice(0, Number(sample));
  else targets = shuffle(targets, rand);
  if (limit) targets = targets.slice(0, Number(limit));

  let existing = [];
  let already = new Set();
  if (resume && fs.existsSync(outPath)) {
    existing = readNdjson(outPath);
    already = new Set(existing.map((r) => r.key));
    console.log(`--resume: ${already.size} already done`);
  }
  const pending = targets.filter((t) => !already.has(t.key));
  console.log(
    `Batch A  model=${model}  pending=${pending.length}  dryRun=${dryRun}`
      + `  RR-seeds=${rotoursSeeds.length}`,
  );

  if (dryRun) {
    for (const t of pending.slice(0, 2)) {
      console.log('---');
      console.log(renderBatchAPrompt(t, { rotoursSeeds: styleCard }));
    }
    console.log(`Dry run — would call OpenAI for ${pending.length} Batch A rows.`);
    return;
  }

  const results = [...existing];
  const t0 = Date.now();
  for (let i = 0; i < pending.length; i += 1) {
    const target = pending[i];
    // Prefer the entry's own RR as style; fall back to global card.
    const seedsForPrompt = target.rotours?.length
      ? [
          ...target.rotours.map((fr) => ({ zh: target.zh, fr, en: target.en })),
          ...styleCard,
        ]
      : styleCard;
    const prompt = renderBatchAPrompt(target, { rotoursSeeds: seedsForPrompt });
    try {
      const raw = await callOpenAi({
        model,
        system: SYSTEM_BATCH_A,
        prompt,
      });
      const fr = cleanFrenchGloss(raw);
      if (!fr) {
        console.log(`  [${i + 1}/${pending.length}] ${target.zh} → (empty)`);
        continue;
      }
      results.push({
        key: target.key,
        batch: 'A',
        zh: target.zh,
        en: target.en,
        fr,
        dynasty: target.dynasty ?? null,
        dynasties: target.dynasty ? [target.dynasty] : [],
        officeIds: [],
        provenance: target.provenance ?? ['Hucker-OCR'],
        derivedFromHucker: true,
        rotoursInEntry: target.rotours ?? [],
        model,
        method: 'batch-a-hucker-full',
        generatedAt: new Date().toISOString(),
      });
      if ((i + 1) % 10 === 0 || i === pending.length - 1) {
        writeNdjson(outPath, results);
        const elapsed = (Date.now() - t0) / 1000;
        const rate = (i + 1) / elapsed;
        const eta = rate > 0 ? (pending.length - i - 1) / rate : 0;
        console.log(
          `  ${i + 1}/${pending.length}  (${rate.toFixed(2)}/s, eta ${eta.toFixed(0)}s)`
            + `  last: ${target.zh} → ${fr}`,
        );
      }
    } catch (err) {
      writeNdjson(outPath, results);
      console.error(`  ERROR at ${target.zh}: ${err.message}`);
      process.exit(1);
    }
  }

  writeNdjson(outPath, results);
  console.log(`Wrote ${results.length} Batch A candidates -> ${outPath}`);
  console.log('Next: npm run generate:maxiricci7000:b');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
