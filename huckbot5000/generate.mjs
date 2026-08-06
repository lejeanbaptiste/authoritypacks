#!/usr/bin/env node
/**
 * Generate Huckbot5000 candidate office-title translations: GPT-4o +
 * retrieval (mined morpheme lexicon + nearest Hucker exemplars), the
 * approach docs/huckbot5000-planning.md's Step 3 benchmark found clears the
 * rule-based floor (14.0% exact / 0.386 F1 vs. 4.8% / 0.314). Output is
 * staging only -- packs/huckbot5000/candidates.ndjson is gitignored and
 * never shipped as-is. It must pass huckbot5000/audit.mjs's collision
 * filter and a human review pass (see huckbot5000/README.md) before any row
 * can enter the shippable pack.
 *
 * Targets are resolved period-aware from CBDB + dated Norbert-only offices,
 * with office concordance to avoid duplicate generation. Targets already
 * covered by a Hucker entry for that dynasty are skipped (no API call — we
 * do not copy his gloss). Place+suffix compounds and allowlisted parentOf
 * compounds are translated procedurally — see proceduralPlaceSuffix.mjs and
 * proceduralParentOf.mjs — and never sent to the LLM.
 *
 * Requires OPENAI_API_KEY in the environment (never read from a file/argument).
 *
 * Usage:
 *   OPENAI_API_KEY=... node huckbot5000/generate.mjs [--model gpt-4o] [--sample 300]
 *     [--limit N] [--targets packs/cbdb/offices.ndjson] [--out packs/huckbot5000/candidates.ndjson]
 *     [--seed 7] [--resume] [--dry-run] [--procedural-only]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNdjson, writeNdjson } from '../shared/ndjson.mjs';
import { readHuckerPairs, mineLexicon, buildRetrievalIndex, readCbdbHuckerPairs } from './lib.mjs';
import { resolveGenerationTargets, targetKey } from './resolveTargets.mjs';
import {
  buildSuffixGlossIndex,
  partitionProceduralTargets,
} from './proceduralPlaceSuffix.mjs';
import {
  buildOfficeGlossIndex,
  loadParentOfIndex,
  partitionParentOfTargets,
} from './proceduralParentOf.mjs';
import { indexHuckerOfficeEntries } from '../norbert/huckerOfficeContinuity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const API_URL = 'https://api.openai.com/v1/chat/completions';

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
const proceduralOnly = hasFlag('--procedural-only');
const targetsPath = path.resolve(root, arg('--targets', 'packs/cbdb/offices.ndjson'));
const norbertPath = path.resolve(root, arg('--norbert', 'packs/norbert/offices.ndjson'));
const concordancePath = path.resolve(root, arg('--concordance', 'packs/norbert/office-concordance.ndjson'));
const relationsPath = path.resolve(
  root,
  arg('--relations', 'packs/norbert/office-relations.ndjson'),
);
const huckerPath = path.resolve(
  root,
  arg('--hucker', 'skunkworks/scripts/out/hucker_entries.ndjson'),
);
const cbdbSqlitePath = path.resolve(root, arg('--cbdb-sqlite', '.upstream/cbdb.sqlite3'));
const outPath = path.resolve(root, arg('--out', 'packs/huckbot5000/candidates.ndjson'));

const PROCEDURAL_METHODS = new Set(['procedural-place-suffix', 'procedural-parentOf']);

const API_KEY = process.env.OPENAI_API_KEY;
if (!dryRun && !proceduralOnly && !API_KEY) {
  console.error('ERROR: set OPENAI_API_KEY in your shell first (not as a script argument).');
  process.exit(1);
}

// Small seeded PRNG so --sample is reproducible without a dependency.
function mulberry32(a) {
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(items, rand) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function loadTargets(huckerByZh, cbdbHuckerHeadwords) {
  const { targets, stats } = resolveGenerationTargets({
    root,
    cbdbPath: targetsPath,
    norbertPath,
    concordancePath,
    huckerByZh,
    cbdbHuckerHeadwords,
  });
  console.log(
    `  target resolution: ${stats.totalTargets} targets`
      + ` (${stats.cbdbTargetGroups} CBDB groups, ${stats.norbertOnlyTargets} Norbert-only`
      + `, ${stats.norbertSkippedViaConcordance} Norbert skipped via concordance`
      + `, ${stats.skippedHuckerPeriod ?? 0} skipped (Hucker OCR period)`
      + `, ${stats.skippedCbdbHuckerHeadword ?? 0} skipped (CBDB Hucker headword)`
      + `, ${stats.concordanceLinks} concordance links)`,
  );
  return targets;
}

function proceduralMethod(rule) {
  if (rule === 'parentOf') return 'procedural-parentOf';
  return 'procedural-place-suffix';
}

function buildProceduralCandidate(target, procedural) {
  const method = proceduralMethod(procedural.rule);
  return {
    key: target.key,
    zh: target.zh,
    dynasty: target.dynasty,
    startYear: target.startYear,
    endYear: target.endYear,
    ids: target.ids,
    sources: target.sources,
    model: method,
    method,
    hyp: procedural.gloss,
    raw: '',
    procedural,
    generatedAt: new Date().toISOString(),
  };
}

const SYSTEM = (
  'You are an expert sinologist translating premodern Chinese office titles into '
  + 'concise scholarly English, in the style of standard reference dictionaries of '
  + 'imperial Chinese official titles. Output ONLY the English translation phrase, '
  + 'nothing else -- no explanation, no Chinese characters, no quotes.'
);

function renderPrompt(target, retrieval, lexicon) {
  const periodParts = [];
  if (target.dynasty) periodParts.push(`Dynasty: ${target.dynasty}`);
  if (target.startYear != null || target.endYear != null) {
    periodParts.push(`Years: ${target.startYear ?? '?'} to ${target.endYear ?? '?'}`);
  }
  const lines = [`Chinese office title: ${target.zh}`];
  if (periodParts.length) lines.push(...periodParts);
  else lines.push('Dynasty: unspecified');
  const lx = retrieval.lexiconFor(target.zh, lexicon);
  if (lx.length) {
    lines.push('Morpheme lexicon (mined correspondences; gloss + confidence):');
    for (const [g, glosses] of lx) {
      lines.push(`  ${g} -> ${glosses.map((entry) => `${entry.gloss} (${entry.p})`).join(', ')}`);
    }
  }
  const exemplars = retrieval.retrieve(target.zh);
  if (exemplars.length) {
    lines.push('Similar reference translations:');
    for (const ex of exemplars) lines.push(`  ${ex.zh} [${ex.dynasty || '?'}] = ${ex.en}`);
  }
  return lines.join('\n');
}

function cleanOutput(s) {
  let out = (s ?? '').trim().replace(/^["'*]+|["'*]+$/g, '');
  out = out.replace(/^(English translation:|Translation:|Answer:)\s*/i, '');
  out = out.split('\n')[0].trim();
  out = out.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return out;
}

async function callOpenAi(prompt, retries = 4, timeoutMs = 60000) {
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 40,
  });
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
          continue;
        }
        console.error(`  HTTP ${res.status}: ${text.slice(0, 300)}`);
        return '';
      }
      const json = await res.json();
      return (json.choices?.[0]?.message?.content ?? '').trim();
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries - 1) {
        console.error(`  ERROR after ${retries} tries: ${err.message}`);
        return '';
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return '';
}

async function main() {
  if (!fs.existsSync(targetsPath)) {
    console.error(`ERROR: targets file not found: ${targetsPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(huckerPath)) {
    console.error(`ERROR: Hucker corpus not found: ${huckerPath} (run skunkworks/scripts/parse_entries.py first)`);
    process.exit(1);
  }

  const huckerPairs = readHuckerPairs(huckerPath);
  const lexicon = mineLexicon(huckerPairs);
  const retrieval = buildRetrievalIndex(huckerPairs);
  const huckerByZh = indexHuckerOfficeEntries(huckerPairs);

  /** @type {Set<string>} */
  const cbdbHuckerHeadwords = new Set();
  if (fs.existsSync(cbdbSqlitePath)) {
    const cbdbPairs = await readCbdbHuckerPairs(cbdbSqlitePath);
    for (const pair of cbdbPairs) {
      const zh = String(pair.zh ?? '').normalize('NFKC').trim();
      if (zh) cbdbHuckerHeadwords.add(zh);
    }
    console.log(
      `  loaded ${cbdbHuckerHeadwords.size} CBDB Hucker headwords for generation skip`
        + ` (${path.relative(root, cbdbSqlitePath)})`,
    );
  } else {
    console.warn(
      `WARNING: CBDB sqlite not found at ${cbdbSqlitePath} -- generation skip is OCR-period-only.`
        + ' Run npm run fetch:upstream for full CBDB Hucker headword coverage.',
    );
  }

  const cbdbOffices = readNdjson(targetsPath);
  const norbertOffices = fs.existsSync(norbertPath) ? readNdjson(norbertPath) : [];
  const glossIndex = buildSuffixGlossIndex(cbdbOffices);
  const officeGlossIndex = buildOfficeGlossIndex([...cbdbOffices, ...norbertOffices]);
  const parentOfByChild = fs.existsSync(relationsPath)
    ? loadParentOfIndex(relationsPath)
    : new Map();

  const allTargets = loadTargets(huckerByZh, cbdbHuckerHeadwords);
  const placeSplit = partitionProceduralTargets(allTargets, glossIndex);
  const parentOfSplit = partitionParentOfTargets(
    placeSplit.llm,
    parentOfByChild,
    officeGlossIndex,
  );
  const proceduralRows = [...placeSplit.procedural, ...parentOfSplit.procedural];
  const llmTargets = parentOfSplit.llm;
  console.log(
    `${allTargets.length} generation targets resolved`
      + ` (${placeSplit.procedural.length} place+suffix,`
      + ` ${parentOfSplit.procedural.length} parentOf,`
      + ` ${llmTargets.length} LLM)`,
  );

  let targets = proceduralOnly ? [] : llmTargets;

  const rand = mulberry32(seed);
  if (!proceduralOnly) {
    if (sample) targets = shuffle(targets, rand).slice(0, Number(sample));
    else targets = shuffle(targets, rand);
    if (limit) targets = targets.slice(0, Number(limit));
  }

  let already = new Set();
  let existing = [];
  if (resume && fs.existsSync(outPath)) {
    existing = readNdjson(outPath);
    already = new Set(existing.map((r) => r.key ?? targetKey(r.zh, r.dynasty)));
  }

  // --procedural-only rewrites every procedural row (useful after rule changes)
  // while keeping any existing LLM candidates.
  const pendingProcedural = proceduralOnly
    ? proceduralRows
    : proceduralRows.filter(({ target }) => !already.has(target.key));
  const pendingLlm = targets.filter((t) => !already.has(t.key));
  if (resume && already.size) {
    console.log(
      `--resume: ${already.size} already generated,`
        + ` ${pendingProcedural.length} procedural + ${pendingLlm.length} LLM remaining`,
    );
  }
  targets = pendingLlm;

  console.log(
    `model=${model}  llmTargets=${targets.length}  dryRun=${dryRun}`
      + `  proceduralOnly=${proceduralOnly}`,
  );

  if (dryRun) {
    const placeExamples = pendingProcedural.filter(({ target, procedural }) =>
      procedural.rule === 'place+suffix'
      && ['遷安固太守', '遼東太守', '枝江令'].includes(target.zh),
    );
    const parentExamples = pendingProcedural.filter(({ procedural }) =>
      procedural.rule === 'parentOf',
    );
    const examples = [
      ...(placeExamples.length ? placeExamples : pendingProcedural.filter((r) => r.procedural.rule === 'place+suffix').slice(0, 2)),
      ...parentExamples.slice(0, 3),
    ];
    for (const example of (examples.length ? examples : pendingProcedural.slice(0, 3))) {
      console.log(`--- procedural (${example.procedural.rule}) ---`);
      console.log(`${example.target.zh} [${example.target.dynasty || '?'}] -> ${example.procedural.gloss}`);
    }
    for (const t of targets.slice(0, 3)) {
      console.log('--- llm ---');
      console.log(renderPrompt(t, retrieval, lexicon));
    }
    console.log(
      `\n(dry run -- ${pendingProcedural.length} procedural + ${targets.length} LLM`
        + ' prompts would be written/sent, no API calls made)',
    );
    return;
  }

  let results = [];
  if (proceduralOnly && fs.existsSync(outPath)) {
    results = readNdjson(outPath).filter((r) => !PROCEDURAL_METHODS.has(r.method));
  } else if (resume && existing.length) {
    results = existing;
  }
  for (const row of pendingProcedural) {
    results.push(buildProceduralCandidate(row.target, row.procedural));
  }
  if (pendingProcedural.length) {
    writeNdjson(outPath, results);
    console.log(`  wrote ${pendingProcedural.length} procedural candidates -> ${outPath}`);
  }

  if (proceduralOnly) {
    console.log(`Wrote ${results.length} candidates -> ${outPath} (procedural-only)`);
    console.log('Next: npm run audit:huckbot5000');
    return;
  }

  const t0 = Date.now();
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const prompt = renderPrompt(target, retrieval, lexicon);
    const raw = await callOpenAi(prompt);
    const hyp = cleanOutput(raw);
    results.push({
      key: target.key,
      zh: target.zh,
      dynasty: target.dynasty,
      startYear: target.startYear,
      endYear: target.endYear,
      ids: target.ids,
      sources: target.sources,
      model,
      method: 'llm',
      hyp,
      raw,
      generatedAt: new Date().toISOString(),
    });
    if ((i + 1) % 25 === 0 || i === targets.length - 1) {
      writeNdjson(outPath, results);
      const elapsed = (Date.now() - t0) / 1000;
      const rate = (i + 1) / elapsed;
      const eta = rate > 0 ? (targets.length - i - 1) / rate : 0;
      console.log(`  ${i + 1}/${targets.length}  (${rate.toFixed(2)}/s, eta ${eta.toFixed(0)}s)  -> ${outPath}`);
    }
  }
  console.log(`Wrote ${results.length} candidates -> ${outPath}`);
  console.log('Next: npm run audit:huckbot5000');
}

main();
