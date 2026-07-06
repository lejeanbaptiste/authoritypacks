#!/usr/bin/env node
/**
 * W2 — Stream a Wikidata JSON dump (or .jsonl fixture) → raw person NDJSON.
 *
 * Usage:
 *   node wikidata/extract.mjs --dump PATH --dynasty tang --language zh-hant --out packs/wikidata/raw-tang
 *   node wikidata/extract.mjs --dump PATH --priority 1 --language zh-hant --out packs/wikidata/raw-zh-hant-priority1
 *   node wikidata/extract.mjs --dump PATH --dynasties tang,song,ming --language zh-hant --out DIR --resume
 *
 * Options:
 *   --max N              Stop after N matching persons (dev / smoke)
 *   --progress N         Log every N entities scanned (default 500000)
 *   --checkpoint-every N Write checkpoint every N entities scanned (default: same as --progress)
 *   --resume             Continue from extract.checkpoint.json in --out dir
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { entityMatchesPersonSlice, rawPersonFromEntity } from './entityParse.mjs';
import { countNdjsonLines, resolveDynastySelection } from './dynastySelect.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function packLanguage(languages, id) {
  const lang = languages.packLanguages.find((x) => x.id === id);
  if (!lang) throw new Error(`Unknown pack language "${id}"`);
  return lang;
}

/** @param {string} dumpPath */
function openDumpStream(dumpPath) {
  if (dumpPath.endsWith('.bz2')) {
    const proc = spawn('bzcat', [dumpPath], { stdio: ['ignore', 'pipe', 'inherit'] });
    if (!proc.stdout) throw new Error('bzcat failed to open stdout');
    return proc.stdout;
  }
  return createReadStream(dumpPath);
}

/**
 * @param {import('node:stream').Readable} stream
 */
async function* iterateDumpEntities(stream) {
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    let trimmed = line.trim();
    if (!trimmed || trimmed === '[' || trimmed === ']') continue;
    if (trimmed.endsWith(',')) trimmed = trimmed.slice(0, -1);
    if (!trimmed.startsWith('{')) continue;
    try {
      yield JSON.parse(trimmed);
    } catch {
      // skip malformed lines in huge dumps
    }
  }
}

/** @param {string} checkpointPath */
function readCheckpoint(checkpointPath) {
  if (!fs.existsSync(checkpointPath)) return null;
  return JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
}

/**
 * @param {string} checkpointPath
 * @param {Record<string, unknown>} data
 */
function writeCheckpoint(checkpointPath, data) {
  fs.writeFileSync(checkpointPath, `${JSON.stringify(data, null, 2)}\n`);
}

function sameStringArray(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

/**
 * @param {{
 *   dumpPath: string;
 *   dynastyId?: string;
 *   dynastyIds?: string[];
 *   priority?: number;
 *   languageId: string;
 *   outDir: string;
 *   maxMatches?: number;
 *   progressEvery?: number;
 *   checkpointEvery?: number;
 *   resume?: boolean;
 * }} opts
 */
export async function extractWikidataPersons(opts) {
  const dynastiesDoc = loadJson('wikidata/dynasties.json');
  const languages = loadJson('wikidata/languages.json');
  const selection = resolveDynastySelection(dynastiesDoc.dynasties, {
    dynastyId: opts.dynastyId,
    dynastyIds: opts.dynastyIds,
    priority: opts.priority,
  });
  const packLang = packLanguage(languages, opts.languageId);
  const labelLang = packLang.wikidataLabelLanguages[0];

  fs.mkdirSync(opts.outDir, { recursive: true });
  const outFile = path.join(opts.outDir, 'persons.raw.ndjson');
  const checkpointPath = path.join(opts.outDir, 'extract.checkpoint.json');

  const existingCheckpoint = opts.resume ? readCheckpoint(checkpointPath) : null;
  if (opts.resume && !existingCheckpoint) {
    throw new Error(`--resume requested but no checkpoint at ${checkpointPath}`);
  }
  if (existingCheckpoint) {
    if (path.resolve(String(existingCheckpoint.dumpPath)) !== path.resolve(opts.dumpPath)) {
      throw new Error('Checkpoint dumpPath does not match --dump');
    }
    if (existingCheckpoint.languageId !== opts.languageId) {
      throw new Error('Checkpoint languageId does not match --language');
    }
    if (!sameStringArray(existingCheckpoint.dynastyIds ?? [], selection.ids)) {
      throw new Error('Checkpoint dynastyIds do not match current dynasty selection');
    }
  }

  const skipUntil = existingCheckpoint?.entitiesScanned ?? 0;
  let entitiesScanned = 0;
  let personsMatched =
    existingCheckpoint?.personsMatched ?? (opts.resume ? countNdjsonLines(outFile) : 0);

  if (opts.resume && skipUntil > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `Resuming after ${skipUntil.toLocaleString()} entities (${personsMatched.toLocaleString()} persons already in file)`,
    );
  }

  const stream = openDumpStream(opts.dumpPath);
  const fd = fs.openSync(outFile, opts.resume ? 'a' : 'w');

  const checkpointEvery = opts.checkpointEvery ?? opts.progressEvery ?? 500_000;

  const checkpointData = () => ({
    updatedAt: new Date().toISOString(),
    dumpPath: opts.dumpPath,
    dynastyIds: selection.ids,
    dynastyQids: selection.qids,
    languageId: opts.languageId,
    labelLang,
    entitiesScanned,
    personsMatched,
    skipUntil: entitiesScanned,
    outFile,
  });

  let interrupted = false;
  const onSignal = () => {
    interrupted = true;
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    for await (const entity of iterateDumpEntities(stream)) {
      if (interrupted) break;

      entitiesScanned++;

      if (entitiesScanned <= skipUntil) {
        if (opts.progressEvery && entitiesScanned % opts.progressEvery === 0) {
          // eslint-disable-next-line no-console
          console.log(
            `  skipping… ${entitiesScanned.toLocaleString()} / ${skipUntil.toLocaleString()}`,
          );
        }
        continue;
      }

      if (opts.progressEvery && entitiesScanned % opts.progressEvery === 0) {
        // eslint-disable-next-line no-console
        console.log(
          `  scanned ${entitiesScanned.toLocaleString()} … matched ${personsMatched.toLocaleString()}`,
        );
      }

      if (
        !entityMatchesPersonSlice(entity, {
          dynastyQids: selection.qids,
          labelLang,
        })
      ) {
        if (checkpointEvery && entitiesScanned % checkpointEvery === 0) {
          writeCheckpoint(checkpointPath, checkpointData());
        }
        continue;
      }

      const raw = rawPersonFromEntity(entity, labelLang);
      if (raw) {
        fs.writeSync(fd, `${JSON.stringify(raw)}\n`);
        personsMatched++;
      }

      if (opts.maxMatches && personsMatched >= opts.maxMatches) break;

      if (checkpointEvery && entitiesScanned % checkpointEvery === 0) {
        writeCheckpoint(checkpointPath, checkpointData());
      }
    }
  } finally {
    fs.closeSync(fd);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  const complete = !interrupted && !opts.maxMatches;
  const meta = {
    extractedAt: new Date().toISOString(),
    dumpPath: opts.dumpPath,
    dynastyIds: selection.ids,
    dynastyQids: selection.qids,
    dynastySlug: selection.slug,
    language: opts.languageId,
    labelLang,
    entitiesScanned,
    personsMatched,
    includeFictional: true,
    resumed: Boolean(existingCheckpoint),
    complete,
    interrupted,
  };

  writeCheckpoint(checkpointPath, { ...checkpointData(), complete, interrupted });

  if (complete) {
    fs.writeFileSync(path.join(opts.outDir, 'extract-meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
    if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);
  } else {
    // eslint-disable-next-line no-console
    console.log(`Checkpoint saved → ${checkpointPath}`);
    if (interrupted) {
      // eslint-disable-next-line no-console
      console.log('Interrupted — re-run with --resume to continue.');
    }
  }

  return { ...meta, outFile, count: personsMatched };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dumpPath = arg('--dump', '');
  const dynastyId = arg('--dynasty', '');
  const dynastiesArg = arg('--dynasties', '');
  const priorityArg = arg('--priority', '');
  const languageId = arg('--language', 'zh-hant');
  const outDirArg = arg('--out', '');
  const maxMatches = arg('--max', '') ? Number.parseInt(arg('--max', ''), 10) : undefined;
  const progressEvery = Number.parseInt(arg('--progress', '500000'), 10);
  const checkpointEvery = arg('--checkpoint-every', '')
    ? Number.parseInt(arg('--checkpoint-every', ''), 10)
    : undefined;

  if (!dumpPath) {
    console.error(`Usage: node wikidata/extract.mjs --dump PATH (--dynasty tang | --dynasties a,b | --priority 1) \\
  [--language zh-hant] [--out DIR] [--resume] [--progress N] [--checkpoint-every N]`);
    process.exit(1);
  }

  const dynastyIds = dynastiesArg
    ? dynastiesArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const priority = priorityArg ? Number.parseInt(priorityArg, 10) : undefined;

  let outDir = outDirArg;
  if (!outDir) {
    if (priority != null) {
      outDir = path.join(ROOT, `packs/wikidata/raw-${languageId}-priority${priority}`);
    } else if (dynastyId) {
      outDir = path.join(ROOT, `packs/wikidata/raw-${dynastyId}`);
    } else {
      outDir = path.join(ROOT, 'packs/wikidata/raw-multi');
    }
  }

  extractWikidataPersons({
    dumpPath: path.resolve(dumpPath),
    dynastyId: dynastyId || undefined,
    dynastyIds,
    priority,
    languageId,
    outDir: path.resolve(outDir),
    maxMatches,
    progressEvery,
    checkpointEvery,
    resume: hasFlag('--resume'),
  })
    .then((result) => {
      console.log(`Extracted ${result.count} persons (${result.entitiesScanned} entities scanned)`);
      console.log(`Wrote ${result.outFile}`);
      if (!result.complete) process.exit(result.interrupted ? 130 : 0);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
