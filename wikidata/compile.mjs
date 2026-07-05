/**
 * W4 — Compile raw Wikidata person NDJSON → LJB AuthorityCandidate pack.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { personSearchStringsFromWikidata } from './personSearchStrings.mjs';
import { readNdjson, writePackFile } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function dynastyById(dynasties, id) {
  const d = dynasties.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown dynasty "${id}"`);
  return d;
}

/**
 * @param {import('./entityParse.mjs').ReturnType<typeof import('./entityParse.mjs').rawPersonFromEntity>} raw
 * @param {{ dynasty: { id: string, labelZh: string, startYear: number, endYear: number } }} ctx
 * @returns {import('../shared/types.mjs').AuthorityCandidate | null}
 */
export function personCandidateFromRaw(raw, ctx) {
  if (!raw?.qid || !raw.primaryLabel) return null;

  const searchStrings = personSearchStringsFromWikidata({
    primaryLabel: raw.primaryLabel,
    aliases: raw.aliases,
    familyName: raw.familyName,
    givenName: raw.givenName,
  });
  if (searchStrings.length === 0) return null;

  const isFictional = (raw.p31 ?? []).some((t) =>
    ['Q15632617', 'Q28037560', 'Q3658341'].includes(t),
  );

  return {
    source: 'Wikidata',
    authorityId: raw.qid,
    kind: 'person',
    primaryName: raw.primaryLabel,
    searchStrings,
    metadata: {
      dynasty: ctx.dynasty.labelZh,
      startYear: raw.birthYear ?? ctx.dynasty.startYear,
      endYear: raw.deathYear ?? ctx.dynasty.endYear,
      description: `${raw.primaryLabel} (${ctx.dynasty.labelZh}${isFictional ? ', fictional' : ''}, Wikidata ${raw.qid})`,
      ana: isFictional ? 'fictional' : 'historical',
      crosswalk: { wikidata: [raw.qid.replace(/^Q/, '')] },
    },
  };
}

/**
 * @param {{
 *   rawPath: string;
 *   dynastyId: string;
 *   languageId: string;
 *   outDir: string;
 *   packId?: string;
 * }} opts
 */
export function compileWikidataPersonPack(opts) {
  const dynasties = loadJson('wikidata/dynasties.json').dynasties;
  const dynasty = dynastyById(dynasties, opts.dynastyId);
  const rawRows = readNdjson(opts.rawPath);

  /** @type {import('../shared/types.mjs').AuthorityCandidate[]} */
  const candidates = [];
  for (const raw of rawRows) {
    const c = personCandidateFromRaw(raw, { dynasty });
    if (c) candidates.push(c);
  }

  const packId =
    opts.packId ?? `wikidata-person-${opts.languageId}-${opts.dynastyId}`;
  fs.mkdirSync(opts.outDir, { recursive: true });
  const personOut = writePackFile(opts.outDir, 'persons.ndjson', candidates);

  const manifest = {
    id: packId,
    source: 'Wikidata',
    buildToolVersion: '0.1.0',
    compiledAt: new Date().toISOString(),
    upstream: { raw: opts.rawPath },
    license: 'CC0',
    attribution: 'Data from Wikidata (CC0).',
    dynasty: dynasty.id,
    language: opts.languageId,
    includeFictional: true,
    files: {
      'persons.ndjson': { entityCount: personOut.count },
    },
  };
  fs.writeFileSync(path.join(opts.outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return { packId, count: personOut.count, outDir: opts.outDir };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rawPath = arg('--raw', '');
  const dynastyId = arg('--dynasty', 'tang');
  const languageId = arg('--language', 'zh-hant');
  const outDir = arg('--out', path.join(ROOT, 'packs/wikidata/person-zh-hant-tang'));

  if (!rawPath) {
    console.error(
      'Usage: node wikidata/compile.mjs --raw packs/wikidata/raw-tang/persons.raw.ndjson --dynasty tang --language zh-hant',
    );
    process.exit(1);
  }

  const result = compileWikidataPersonPack({
    rawPath: path.resolve(rawPath),
    dynastyId,
    languageId,
    outDir: path.resolve(outDir),
  });
  console.log(`Compiled ${result.count} persons → ${result.outDir}/persons.ndjson`);
}
