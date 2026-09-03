/**
 * Clean Tibetan searchStrings in compiled NDJSON packs so the auto-tag matcher
 * can hit in-sentence mentions:
 *   - fold the non-breaking tsheg U+0F0C to the plain tsheg U+0F0B;
 *   - drop a leading or trailing tsheg / shad (U+0F0B–U+0F14). Authority
 *     headwords are stored with a terminal shad ("བཀྲ་ཤིས།") the running text
 *     almost never carries at that spot, so an exact-substring matcher misses
 *     every mid-clause occurrence.
 * Interior tshegs are kept (syllable boundaries, not word ends). `primaryName`
 * and typed `names[]` are left untouched — only the match keys are cleaned.
 * Rows without Tibetan are not rewritten. Idempotent.
 *
 * Usage:
 *   node scripts/normalizeTibetanSearchStrings.mjs
 *   node scripts/normalizeTibetanSearchStrings.mjs --dry-run
 *   node scripts/normalizeTibetanSearchStrings.mjs --path packs/bdrc/persons.ndjson
 *   node scripts/normalizeTibetanSearchStrings.mjs --root /path/to/authority-packs
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { normalizeSurface, normalizeTibetanSearchString } from '../shared/normalize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');
const TIBETAN_RE = /[ༀ-࿿]/;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

/** Pack NDJSON files that ship searchStrings (top-level or sharded). */
function discoverPackFiles(packsRoot) {
  /** @type {string[]} */
  const found = [];
  const ENTITY_FILE_RE = /^(persons|places|orgs|works|offices|person-wrappers)\.ndjson$/;
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
        if (ent.name === 'raw' || ent.name.startsWith('raw-')) continue;
        walk(p);
        continue;
      }
      if (!ent.name.endsWith('.ndjson')) continue;
      if (ENTITY_FILE_RE.test(ent.name) || SHARD_PARENT_RE.test(p)) found.push(p);
    }
  };
  walk(packsRoot);
  return found.sort();
}

async function cleanFile(inPath) {
  const tmp = `${inPath}.tmp`;
  const rl = readline.createInterface({
    input: fs.createReadStream(inPath),
    crlfDelay: Infinity,
  });
  const out = DRY_RUN ? null : fs.createWriteStream(tmp);
  let kept = 0;
  let dropped = 0;
  let rewritten = 0;
  let changedStrings = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const prev = /** @type {string[]} */ (row.searchStrings ?? []);

    if (prev.length === 0 || !prev.some((s) => TIBETAN_RE.test(s))) {
      if (out) out.write(`${JSON.stringify(row)}\n`);
      kept++;
      continue;
    }

    /** @type {string[]} */
    const next = [];
    const seen = new Set();
    for (const raw of prev) {
      const s = normalizeTibetanSearchString(normalizeSurface(raw));
      if (!s || seen.has(s)) continue;
      seen.add(s);
      next.push(s);
    }

    if (next.length === 0) {
      dropped++;
      continue;
    }

    const changed = next.length !== prev.length || next.some((s, i) => s !== prev[i]);
    if (changed) {
      rewritten++;
      changedStrings += prev.length - next.length + next.filter((s, i) => s !== prev[i]).length;
    }
    if (out) out.write(`${JSON.stringify(changed ? { ...row, searchStrings: next } : row)}\n`);
    kept++;
  }

  if (out) {
    await new Promise((resolve, reject) => {
      out.end(() => resolve());
      out.on('error', reject);
    });
    fs.renameSync(tmp, inPath);
  }
  return { kept, dropped, rewritten, changedStrings };
}

async function main() {
  const single = arg('--path');
  const rootArg = arg('--root');
  const packsRoot = rootArg ? path.resolve(rootArg) : path.join(ROOT, 'packs');
  const files = single
    ? [path.isAbsolute(single) ? single : path.join(ROOT, single)]
    : discoverPackFiles(packsRoot);

  if (files.length === 0) {
    console.error('No pack files found.');
    process.exit(1);
  }

  console.log(
    `${DRY_RUN ? 'Dry-run: scanning' : 'Cleaning Tibetan searchStrings in'} ${files.length} pack file(s) under ${packsRoot}…`,
  );

  let totalRewritten = 0;
  let totalDropped = 0;
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.warn(`skip missing: ${file}`);
      continue;
    }
    const stats = await cleanFile(file);
    totalRewritten += stats.rewritten;
    totalDropped += stats.dropped;
    if (stats.rewritten || stats.dropped) {
      console.log(
        `${path.relative(packsRoot, file)}: rewrittenRows=${stats.rewritten} droppedRows=${stats.dropped} kept=${stats.kept}`,
      );
    }
  }
  console.log(
    `Done. rewrittenRows=${totalRewritten} droppedRows=${totalDropped}${DRY_RUN ? ' (dry-run, no writes)' : ''}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
