#!/usr/bin/env node
/**
 * MaxiRicci7000 Batch B — GPT-4o French for offices absent from Hucker,
 * with retrieval + French lexicon mined from completed Batch A.
 *
 * Requires OPENAI_API_KEY and packs/maxiricci7000/candidates-a.ndjson.
 *
 * Usage:
 *   OPENAI_API_KEY=... node maxiricci7000/generateBatchB.mjs --dry-run
 *   OPENAI_API_KEY=... node maxiricci7000/generateBatchB.mjs --sample 50
 *   OPENAI_API_KEY=... node maxiricci7000/generateBatchB.mjs --resume
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNdjson, writeNdjson } from '../shared/ndjson.mjs';
import {
  SYSTEM_BATCH_B,
  buildFrenchRetrievalIndex,
  callOpenAi,
  cleanFrenchGloss,
  mineFrenchLexicon,
  mulberry32,
  renderBatchBPrompt,
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
  arg('--targets', 'packs/maxiricci7000/batch-b-targets.ndjson'),
);
const batchAPath = path.resolve(
  root,
  arg('--batch-a', 'packs/maxiricci7000/candidates-a.ndjson'),
);
const seedsPath = path.resolve(
  root,
  arg('--seeds', 'packs/maxiricci7000/rotours-seeds.ndjson'),
);
const outPath = path.resolve(
  root,
  arg('--out', 'packs/maxiricci7000/candidates-b.ndjson'),
);
const lexiconOut = path.resolve(
  root,
  arg('--lexicon-out', 'packs/maxiricci7000/french-lexicon.ndjson'),
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
  if (!fs.existsSync(batchAPath)) {
    console.error(
      `ERROR: Batch A candidates missing at ${batchAPath}. `
        + 'Finish npm run generate:maxiricci7000:a first (Batch B retrieves against it).',
    );
    process.exit(1);
  }

  const batchA = readNdjson(batchAPath).filter((r) => r.zh && r.fr);
  if (!batchA.length) {
    console.error('ERROR: Batch A has no French rows yet.');
    process.exit(1);
  }

  const pairs = batchA.map((r) => ({
    zh: r.zh,
    en: r.en,
    fr: r.fr,
    dynasty: r.dynasty ?? null,
  }));
  const lexicon = mineFrenchLexicon(pairs);
  const retrieval = buildFrenchRetrievalIndex(pairs);
  const rotoursSeeds = fs.existsSync(seedsPath) ? readNdjson(seedsPath) : [];
  const styleCard = shuffle(rotoursSeeds, mulberry32(seed)).slice(0, 8);

  // Persist lexicon for inspection / reuse.
  const lexiconRows = [...lexicon.entries()].map(([zh, glosses]) => ({ zh, glosses }));
  fs.mkdirSync(path.dirname(lexiconOut), { recursive: true });
  writeNdjson(lexiconOut, lexiconRows);
  console.log(
    `  Batch A French pairs: ${pairs.length}; lexicon grams: ${lexicon.size}`
      + ` -> ${path.relative(root, lexiconOut)}`,
  );

  let targets = readNdjson(targetsPath);
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
  console.log(`Batch B  model=${model}  pending=${pending.length}  dryRun=${dryRun}`);

  if (dryRun) {
    for (const t of pending.slice(0, 2)) {
      console.log('---');
      console.log(renderBatchBPrompt(t, retrieval, lexicon, { rotoursSeeds: styleCard }));
    }
    console.log(`Dry run — would call OpenAI for ${pending.length} Batch B rows.`);
    return;
  }

  const results = [...existing];
  const t0 = Date.now();
  for (let i = 0; i < pending.length; i += 1) {
    const target = pending[i];
    const prompt = renderBatchBPrompt(target, retrieval, lexicon, {
      rotoursSeeds: styleCard,
    });
    try {
      const raw = await callOpenAi({
        model,
        system: SYSTEM_BATCH_B,
        prompt,
      });
      const fr = cleanFrenchGloss(raw);
      if (!fr) {
        console.log(`  [${i + 1}/${pending.length}] ${target.zh} → (empty)`);
        continue;
      }
      results.push({
        key: target.key,
        batch: 'B',
        zh: target.zh,
        en: target.en,
        fr,
        dynasty: target.dynasty ?? null,
        dynasties: target.dynasties ?? (target.dynasty ? [target.dynasty] : []),
        officeIds: target.officeIds ?? [],
        provenance: target.provenance ?? [],
        derivedFromHucker: Boolean(target.derivedFromHucker),
        model,
        method: 'batch-b-retrieval',
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
  console.log(`Wrote ${results.length} Batch B candidates -> ${outPath}`);
  console.log('Next: npm run compile:maxiricci7000');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
