/**
 * Drop searchStrings that contain Latin letters from compiled NDJSON packs.
 * Rows left with zero searchStrings are removed.
 *
 * Usage:
 *   node scripts/purgeLatinSearchStrings.mjs
 *   node scripts/purgeLatinSearchStrings.mjs --dry-run
 *   node scripts/purgeLatinSearchStrings.mjs --path packs/ndl/works-ja/works.ndjson
 *   node scripts/purgeLatinSearchStrings.mjs --root /path/to/authority-packs
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { containsLatinLetters, normalizeSurface } from '../shared/normalize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

/**
 * @param {string} packsRoot
 * Pack NDJSON files that ship searchStrings (top-level or dynasty shards).
 */
function discoverPackFiles(packsRoot) {
  /** @type {string[]} */
  const found = [];
  const ENTITY_FILE_RE =
    /^(persons|places|orgs|works|offices|person-wrappers)\.ndjson$/;
  const SHARD_PARENT_RE = /(^|\/)(persons|places|orgs|works|offices)(\/|$)/;

  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (
          ent.name === 'raw' ||
          ent.name.startsWith('raw-') ||
          ent.name === 'bak-crosswalk-2026-08-03' ||
          ent.name === 'viaf-wikidata-concordance'
        ) {
          continue;
        }
        walk(p);
        continue;
      }
      if (!ent.name.endsWith('.ndjson')) continue;
      if (ENTITY_FILE_RE.test(ent.name) || SHARD_PARENT_RE.test(p)) {
        found.push(p);
      }
    }
  };
  walk(packsRoot);
  return found.sort();
}

/**
 * @param {string} inPath
 * @returns {Promise<{ kept: number, dropped: number, rewritten: number, purgedStrings: number }>}
 */
async function purgeFile(inPath) {
  const tmp = `${inPath}.tmp`;
  const input = fs.createReadStream(inPath);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const out = DRY_RUN ? null : fs.createWriteStream(tmp);
  let kept = 0;
  let dropped = 0;
  let rewritten = 0;
  let purgedStrings = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const prev = /** @type {string[]} */ (row.searchStrings ?? []);

    // Leave pre-existing empty searchStrings alone (separate hygiene issue).
    if (prev.length === 0) {
      if (out) out.write(`${JSON.stringify(row)}\n`);
      kept++;
      continue;
    }

    /** @type {string[]} */
    const nextStrings = [];
    const seen = new Set();
    for (const raw of prev) {
      const s = normalizeSurface(raw);
      if (!s) continue;
      if (containsLatinLetters(s)) {
        purgedStrings++;
        continue;
      }
      if (seen.has(s)) continue;
      seen.add(s);
      nextStrings.push(s);
    }

    // Drop only when Latin purge emptied an entity that previously had strings.
    if (nextStrings.length === 0) {
      dropped++;
      continue;
    }

    const changed =
      nextStrings.length !== prev.length ||
      nextStrings.some((s, i) => s !== prev[i]);
    if (changed) rewritten++;

    const next = changed ? { ...row, searchStrings: nextStrings } : row;
    if (out) out.write(`${JSON.stringify(next)}\n`);
    kept++;
  }

  if (out) {
    await new Promise((resolve, reject) => {
      out.end(() => resolve());
      out.on('error', reject);
    });
    fs.renameSync(tmp, inPath);
  }

  return { kept, dropped, rewritten, purgedStrings };
}

async function main() {
  const single = arg('--path');
  const rootArg = arg('--root');
  const packsRoot = rootArg
    ? path.resolve(rootArg)
    : path.join(ROOT, 'packs');
  const files = single
    ? [path.isAbsolute(single) ? single : path.join(ROOT, single)]
    : discoverPackFiles(packsRoot);

  if (files.length === 0) {
    console.error('No pack files found.');
    process.exit(1);
  }

  console.log(
    DRY_RUN
      ? `Dry-run: scanning ${files.length} pack file(s) under ${packsRoot}…`
      : `Purging Latin searchStrings in ${files.length} pack file(s) under ${packsRoot}…`,
  );

  let totalPurged = 0;
  let totalDropped = 0;
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.warn(`skip missing: ${file}`);
      continue;
    }
    const stats = await purgeFile(file);
    totalPurged += stats.purgedStrings;
    totalDropped += stats.dropped;
    if (stats.purgedStrings || stats.dropped || stats.rewritten) {
      console.log(
        `${path.relative(packsRoot, file)}: purgedStrings=${stats.purgedStrings} rewrittenRows=${stats.rewritten} droppedRows=${stats.dropped} kept=${stats.kept}`,
      );
    }
  }
  console.log(
    `Done. purgedStrings=${totalPurged} droppedRows=${totalDropped}${DRY_RUN ? ' (dry-run, no writes)' : ''}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
