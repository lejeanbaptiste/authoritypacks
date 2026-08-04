/**
 * Re-apply Japanese pack filters to already-compiled NDJSON packs
 * (when raw extracts are missing or predate the new policy).
 *
 * Usage:
 *   node scripts/refilterJaPacks.mjs
 *   node scripts/refilterJaPacks.mjs --persons packs/wikidata/person-ja-japan/persons.ndjson
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  isAcceptableJapanesePersonName,
  sanitizeJapanesePersonSearchSurface,
} from '../shared/japanesePersonName.mjs';
import { isBlockedKindSearchString } from '../wikidata/kindSearchStrings.mjs';
import { normalizeSurface } from '../shared/normalize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * @param {string} inPath
 * @param {(row: Record<string, unknown>) => Record<string, unknown> | null} mapRow
 */
async function rewriteNdjson(inPath, mapRow) {
  const tmp = `${inPath}.tmp`;
  const input = fs.createReadStream(inPath);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const out = fs.createWriteStream(tmp);
  let kept = 0;
  let dropped = 0;
  let rewritten = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const next = mapRow(row);
    if (!next) {
      dropped++;
      continue;
    }
    if (JSON.stringify(next) !== JSON.stringify(row)) rewritten++;
    out.write(`${JSON.stringify(next)}\n`);
    kept++;
  }
  await new Promise((resolve, reject) => {
    out.end(() => resolve());
    out.on('error', reject);
  });
  fs.renameSync(tmp, inPath);
  return { kept, dropped, rewritten };
}

/**
 * @param {Record<string, unknown>} row
 */
function refilterPerson(row) {
  const primary = normalizeSurface(String(row.primaryName ?? ''));
  if (!isAcceptableJapanesePersonName(primary)) return null;

  /** @type {string[]} */
  const nextStrings = [];
  const seen = new Set();
  for (const raw of /** @type {string[]} */ (row.searchStrings ?? [])) {
    const s = sanitizeJapanesePersonSearchSurface(raw);
    if (!s || seen.has(s)) continue;
    if (!isAcceptableJapanesePersonName(s)) continue;
    seen.add(s);
    nextStrings.push(s);
  }
  if (!nextStrings.includes(primary)) {
    const p = sanitizeJapanesePersonSearchSurface(primary);
    if (p && isAcceptableJapanesePersonName(p)) nextStrings.unshift(p);
  }
  if (nextStrings.length === 0) return null;
  return { ...row, searchStrings: nextStrings };
}

/**
 * @param {Record<string, unknown>} row
 * @param {'place' | 'org' | 'work'} kind
 */
function refilterKind(row, kind) {
  /** @type {string[]} */
  const nextStrings = [];
  const seen = new Set();
  for (const raw of /** @type {string[]} */ (row.searchStrings ?? [])) {
    const s = normalizeSurface(raw);
    if (!s || seen.has(s)) continue;
    if (isBlockedKindSearchString(s, kind)) continue;
    seen.add(s);
    nextStrings.push(s);
  }
  if (nextStrings.length === 0) return null;
  return { ...row, searchStrings: nextStrings };
}

async function main() {
  const persons =
    arg('--persons', path.join(ROOT, 'packs/wikidata/person-ja-japan/persons.ndjson'));
  const places = arg('--places', path.join(ROOT, 'packs/wikidata/place-ja/places.ndjson'));
  const orgs = arg('--orgs', path.join(ROOT, 'packs/wikidata/org-ja/orgs.ndjson'));
  const ndlPersons = arg(
    '--ndl-persons',
    path.join(ROOT, 'packs/ndl/raw/persons.raw.ndjson'),
  );

  if (fs.existsSync(persons)) {
    const stats = await rewriteNdjson(persons, refilterPerson);
    console.log(`person-ja-japan: kept=${stats.kept} dropped=${stats.dropped} rewritten=${stats.rewritten}`);
    const manifestPath = path.join(path.dirname(persons), 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.files?.['persons.ndjson']) {
        manifest.files['persons.ndjson'].entityCount = stats.kept;
        manifest.compiledAt = new Date().toISOString();
        manifest.personNamePolicy = 'full-or-dharma-ja-v1';
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      }
    }
  } else {
    console.warn(`skip persons (missing): ${persons}`);
  }

  if (fs.existsSync(places)) {
    const stats = await rewriteNdjson(places, (row) => refilterKind(row, 'place'));
    console.log(`place-ja: kept=${stats.kept} dropped=${stats.dropped} rewritten=${stats.rewritten}`);
    console.warn(
      'note: place-ja Japan (P17) scoping still requires re-extract with --membership country --country japan',
    );
  }

  if (fs.existsSync(orgs)) {
    const stats = await rewriteNdjson(orgs, (row) => refilterKind(row, 'org'));
    console.log(`org-ja: kept=${stats.kept} dropped=${stats.dropped} rewritten=${stats.rewritten}`);
  }

  // Prefer recompiling NDL from raw when present.
  if (fs.existsSync(ndlPersons)) {
    const { compileNdlPersonsPack } = await import('../ndl/compilePersons.mjs');
    const outDir = path.join(ROOT, 'packs/ndl/persons-ja');
    const result = compileNdlPersonsPack({
      rawPath: ndlPersons,
      outDir,
      packId: 'ndl-persons-ja',
    });
    console.log(`ndl-persons-ja: compiled ${result.count} → ${result.outDir}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
