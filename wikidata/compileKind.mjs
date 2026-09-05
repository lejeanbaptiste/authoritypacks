/**
 * Compile raw Wikidata NDJSON (non-person kinds) → Grognard AuthorityCandidate packs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kindSearchStringsFromWikidata, workSearchStringsFromWikidata } from './kindSearchStrings.mjs';
import { compiledFileNameForKind } from './rawFromEntity.mjs';
import { compiledCrosswalkFromRaw } from './identifierClaims.mjs';
import { rawPlaceMatchesCountry } from './entityParse.mjs';
import { readNdjson, writePackFile } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * @param {Record<string, unknown>} raw
 * @param {'place' | 'org' | 'work'} kind
 * @param {{ languageId: string, script?: string, disableCrosswalkKeys?: string[] }} ctx
 */
export function kindCandidateFromRaw(raw, kind, ctx) {
  if (!raw?.qid || !raw.primaryLabel) return null;

  const searchStrings =
    kind === 'work'
      ? workSearchStringsFromWikidata(raw)
      : kindSearchStringsFromWikidata(raw, { script: ctx.script, kind });

  if (searchStrings.length === 0) return null;

  const metadata = {
    description: raw.description ?? `${raw.primaryLabel} (Wikidata ${raw.qid})`,
  };
  if (raw.publicationYear !== undefined) metadata.startYear = raw.publicationYear;
  if (raw.inceptionYear !== undefined) metadata.startYear = raw.inceptionYear;
  if (raw.dissolvedYear !== undefined) metadata.endYear = raw.dissolvedYear;

  const crosswalk = compiledCrosswalkFromRaw(raw, { disableKeys: ctx.disableCrosswalkKeys });
  if (crosswalk) metadata.crosswalk = crosswalk;

  /** @type {import('../shared/types.mjs').AuthorityCandidate} */
  return {
    source: 'Wikidata',
    authorityId: String(raw.qid),
    kind,
    primaryName: String(raw.primaryLabel),
    searchStrings,
    metadata,
  };
}

/**
 * @param {{
 *   rawPath: string;
 *   kind: 'place' | 'org' | 'work';
 *   languageId: string;
 *   outDir: string;
 *   packId?: string;
 *   script?: string;
 *   disableCrosswalkKeys?: string[];
 *   countryId?: string;
 *   countryQid?: string;
 * }} opts
 */
export function compileWikidataKindPack(opts) {
  const rawRows = readNdjson(opts.rawPath);
  /** @type {import('../shared/types.mjs').AuthorityCandidate[]} */
  const candidates = [];
  for (const raw of rawRows) {
    if (opts.kind === 'place' && opts.countryQid) {
      if (!rawPlaceMatchesCountry(raw, opts.countryQid)) continue;
    }
    const c = kindCandidateFromRaw(raw, opts.kind, {
      languageId: opts.languageId,
      script: opts.script,
      disableCrosswalkKeys: opts.disableCrosswalkKeys,
    });
    if (c) candidates.push(c);
  }

  const packId =
    opts.packId ??
    (opts.countryId
      ? `wikidata-${opts.kind}-${opts.languageId}-${opts.countryId}`
      : `wikidata-${opts.kind}-${opts.languageId}`);
  fs.mkdirSync(opts.outDir, { recursive: true });
  const outName = compiledFileNameForKind(opts.kind);
  const fileOut = writePackFile(opts.outDir, outName, candidates);

  const membership = opts.countryQid ? 'country-p17' : 'label-only';
  const manifest = {
    id: packId,
    source: 'Wikidata',
    buildToolVersion: '0.1.0',
    compiledAt: new Date().toISOString(),
    upstream: { raw: opts.rawPath },
    license: 'CC0',
    attribution: 'Data from Wikidata (CC0).',
    kind: opts.kind,
    language: opts.languageId,
    membership,
    ...(opts.countryId ? { country: opts.countryId } : {}),
    disabledCrosswalkKeys: opts.disableCrosswalkKeys ?? [],
    files: {
      [outName]: { entityCount: fileOut.count },
    },
  };
  fs.writeFileSync(path.join(opts.outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return { packId, count: fileOut.count, outDir: opts.outDir };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rawPath = arg('--raw', '');
  const kind = arg('--kind', 'work');
  const languageId = arg('--language', 'zh-hant');
  const outDir = arg('--out', '');
  const disableCrosswalkArg = arg('--disable-crosswalk', '');
  const countryId = arg('--country', '');

  if (!rawPath || !['place', 'org', 'work'].includes(kind)) {
    console.error(
      'Usage: node wikidata/compileKind.mjs --raw PATH --kind work|place|org --language LANG [--out DIR] [--country japan] [--disable-crosswalk key1,key2]',
    );
    process.exit(1);
  }

  const languages = loadJson('wikidata/languages.json');
  const packLang = languages.packLanguages.find((x) => x.id === languageId);
  const script = packLang?.script;

  let countryQid;
  if (countryId) {
    const countries = loadJson('wikidata/countries.json').countries;
    const country = countries.find((c) => c.id === countryId);
    if (!country) {
      console.error(`Unknown country "${countryId}" — see wikidata/countries.json`);
      process.exit(1);
    }
    countryQid = country.qid;
  }

  const defaultOut = path.join(
    ROOT,
    countryId ? `packs/wikidata/${kind}-${languageId}` : `packs/wikidata/${kind}-${languageId}`,
  );
  const result = compileWikidataKindPack({
    rawPath: path.resolve(rawPath),
    kind: /** @type {'place' | 'org' | 'work'} */ (kind),
    languageId,
    outDir: path.resolve(outDir || defaultOut),
    script,
    countryId: countryId || undefined,
    countryQid,
    disableCrosswalkKeys: disableCrosswalkArg
      ? disableCrosswalkArg.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined,
  });
  console.log(`Compiled ${result.count} ${kind} → ${result.outDir}/${compiledFileNameForKind(kind)}`);
}
