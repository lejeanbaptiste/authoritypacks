/**
 * N1c — NDL SPARQL: count, sample, and paginated harvest (persons + places).
 *
 * Usage:
 *   node ndl/run-sparql.mjs count
 *   node ndl/run-sparql.mjs sample --prefix 夏目 --limit 20
 *   node ndl/run-sparql.mjs harvest --out packs/ndl/raw/persons.raw.ndjson
 *   node ndl/run-sparql.mjs count-places
 *   node ndl/run-sparql.mjs sample-places --prefix 東京 --limit 20
 *   node ndl/run-sparql.mjs harvest-places --out packs/ndl/raw/places.raw.ndjson
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorityIdFromUri, NDL_SPARQL_PAGE_SIZE } from './constants.mjs';
import {
  personCountQuery,
  personPageQuery,
  personSampleByPrefixQuery,
  placeCountQuery,
  placePageQuery,
  placeSampleByPrefixQuery,
  orgCountQuery,
  orgPageQuery,
  orgSampleByPrefixQuery,
} from './queries.mjs';
import { bindingValue, bindingsFromJson, runNdlSparql } from './sparqlClient.mjs';
import { parseYear } from './personSearchStrings.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {string[] | undefined} list @param {string | undefined} value */
function pushYomiAlt(list, value) {
  if (!value?.trim()) return list;
  const next = list ?? [];
  if (!next.includes(value)) next.push(value);
  return next;
}

/** @param {{ yomi?: string, yomiAlt?: string[] }} target @param {{ yomi?: string, yomiAlt?: string[] }} incoming */
function mergeYomiFields(target, incoming) {
  if (!target.yomi && incoming.yomi) target.yomi = incoming.yomi;
  else if (incoming.yomi && incoming.yomi !== target.yomi) {
    target.yomiAlt = pushYomiAlt(target.yomiAlt, incoming.yomi);
  }
  if (incoming.yomiAlt?.length) {
    for (const alt of incoming.yomiAlt) target.yomiAlt = pushYomiAlt(target.yomiAlt, alt);
  }
}

/** @param {import('./types.mjs').NdlPersonRaw} existing @param {import('./types.mjs').NdlPersonRaw} incoming */
function mergePersonRaw(existing, incoming) {
  if (!existing.heading && incoming.heading) existing.heading = incoming.heading;
  if (existing.birthYear == null && incoming.birthYear != null) existing.birthYear = incoming.birthYear;
  if (existing.deathYear == null && incoming.deathYear != null) existing.deathYear = incoming.deathYear;
  mergeYomiFields(existing, incoming);
  return existing;
}

/** @param {import('./types.mjs').NdlPlaceRaw} existing @param {import('./types.mjs').NdlPlaceRaw} incoming */
function mergePlaceRaw(existing, incoming) {
  if (!existing.heading && incoming.heading) existing.heading = incoming.heading;
  mergeYomiFields(existing, incoming);
  return existing;
}

/** @param {import('./types.mjs').NdlOrgRaw} existing @param {import('./types.mjs').NdlOrgRaw} incoming */
function mergeOrgRaw(existing, incoming) {
  return mergePlaceRaw(existing, incoming);
}

/** @param {Record<string, { type?: string, value?: string }>} row */
function rawPersonFromBinding(row) {
  const authUri = bindingValue(row.auth);
  const yomiAlt = bindingValue(row.yomiAlt);
  return {
    authorityId: authorityIdFromUri(authUri),
    authUri,
    name: bindingValue(row.name),
    heading: bindingValue(row.heading) || undefined,
    yomi: bindingValue(row.yomi) || undefined,
    yomiAlt: yomiAlt ? [yomiAlt] : undefined,
    birthYear: parseYear(bindingValue(row.birth)),
    deathYear: parseYear(bindingValue(row.death)),
  };
}

/** @param {Record<string, { type?: string, value?: string }>} row */
function rawPlaceFromBinding(row) {
  const authUri = bindingValue(row.auth);
  const yomiAlt = bindingValue(row.yomiAlt);
  return {
    authorityId: authorityIdFromUri(authUri),
    authUri,
    name: bindingValue(row.name),
    heading: bindingValue(row.heading) || undefined,
    yomi: bindingValue(row.yomi) || undefined,
    yomiAlt: yomiAlt ? [yomiAlt] : undefined,
  };
}

/** @param {Record<string, { type?: string, value?: string }>} row */
function rawOrgFromBinding(row) {
  return rawPlaceFromBinding(row);
}

/** @param {string} filePath */
function resumeCursorFromFile(filePath) {
  if (!fs.existsSync(filePath)) return { afterAuth: undefined, existingCount: 0 };
  const stat = fs.statSync(filePath);
  if (stat.size === 0) return { afterAuth: undefined, existingCount: 0 };

  const fd = fs.openSync(filePath, 'r');
  try {
    const chunkSize = Math.min(stat.size, 65536);
    const buf = Buffer.alloc(chunkSize);
    fs.readSync(fd, buf, 0, chunkSize, stat.size - chunkSize);
    const tail = buf.toString('utf8');
    const lines = tail.split('\n').filter((l) => l.trim());
    const lastLine = lines[lines.length - 1];
    const row = JSON.parse(lastLine);
    let existingCount = -1;
    if (stat.size < 50_000_000) {
      existingCount = fs.readFileSync(filePath, 'utf8').split('\n').filter((l) => l.trim()).length;
    }
    return { afterAuth: row.authUri, existingCount };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * @param {{
 *   outPath: string;
 *   delayMs: number;
 *   progressEvery: number;
 *   maxPages?: number;
 *   resume?: boolean;
 *   kind: 'person' | 'place' | 'org';
 * }} opts
 */
async function cmdHarvest(opts) {
  fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });

  let afterAuth;
  let total = 0;
  if (opts.resume && fs.existsSync(opts.outPath)) {
    const resume = resumeCursorFromFile(opts.outPath);
    afterAuth = resume.afterAuth;
    total = resume.existingCount;
    if (afterAuth) {
      const n = resume.existingCount >= 0 ? `${resume.existingCount} rows` : 'partial file';
      console.log(`Resuming after ${afterAuth} (${n} already in file)`);
    }
  }

  const pageQuery =
    opts.kind === 'place' ? placePageQuery : opts.kind === 'org' ? orgPageQuery : personPageQuery;
  const mapRow =
    opts.kind === 'place'
      ? rawPlaceFromBinding
      : opts.kind === 'org'
        ? rawOrgFromBinding
        : rawPersonFromBinding;
  const mergeRaw =
    opts.kind === 'place' ? mergePlaceRaw : opts.kind === 'org' ? mergeOrgRaw : mergePersonRaw;
  const label = opts.kind === 'place' ? 'places' : opts.kind === 'org' ? 'orgs' : 'persons';
  const metaKey =
    opts.kind === 'place'
      ? 'placesMatched'
      : opts.kind === 'org'
        ? 'orgsMatched'
        : 'personsMatched';

  const fd = fs.openSync(opts.outPath, opts.resume ? 'a' : 'w');
  let pages = 0;

  try {
    while (true) {
      if (opts.maxPages != null && pages >= opts.maxPages) break;

      const json = await runNdlSparql(pageQuery({ afterAuth, limit: NDL_SPARQL_PAGE_SIZE }));
      const bindings = bindingsFromJson(json);
      if (bindings.length === 0) break;

      let lastAuthUri = afterAuth;
      /** @type {Map<string, import('./types.mjs').NdlPersonRaw | import('./types.mjs').NdlPlaceRaw | import('./types.mjs').NdlOrgRaw>} */
      const pageRows = new Map();

      for (const row of bindings) {
        const raw = mapRow(row);
        if (!raw.authorityId || !raw.name) continue;
        const prev = pageRows.get(raw.authUri);
        pageRows.set(raw.authUri, prev ? mergeRaw(prev, raw) : raw);
      }

      for (const raw of pageRows.values()) {
        fs.writeSync(fd, `${JSON.stringify(raw)}\n`);
        total++;
        lastAuthUri = raw.authUri;
      }

      afterAuth = lastAuthUri;
      pages++;

      if (opts.progressEvery > 0 && total > 0 && total % opts.progressEvery < NDL_SPARQL_PAGE_SIZE) {
        console.log(`  harvested ${total} ${label} (after ${afterAuth})`);
      }
      if (bindings.length < NDL_SPARQL_PAGE_SIZE) break;
      if (opts.delayMs > 0) await sleep(opts.delayMs);
    }
  } finally {
    fs.closeSync(fd);
  }

  const meta = {
    harvestedAt: new Date().toISOString(),
    kind: opts.kind,
    [metaKey]: total,
    pages,
    pageSize: NDL_SPARQL_PAGE_SIZE,
    pagination: 'keyset-after-auth-uri',
    lastAuthUri: afterAuth ?? null,
    resumed: Boolean(opts.resume),
    outPath: opts.outPath,
  };
  const metaPath = opts.outPath.replace(/\.ndjson$/, '-meta.json');
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`Wrote ${total} ${label} → ${opts.outPath}`);
  console.log(`Meta → ${metaPath}`);
  return meta;
}

async function main() {
  const mode = process.argv[2];
  if (!mode || mode === '--help' || mode === '-h') {
    console.log(`Usage: node ndl/run-sparql.mjs <count|sample|harvest|count-places|sample-places|harvest-places|count-orgs|sample-orgs|harvest-orgs> [options]
  count
  sample --prefix 夏目 --limit 20
  harvest --out packs/ndl/raw/persons.raw.ndjson [--delay-ms 300] [--progress 10000] [--max-pages N] [--resume]
  count-places
  sample-places --prefix 東京 --limit 20
  harvest-places --out packs/ndl/raw/places.raw.ndjson [--delay-ms 300] [--progress 1000] [--max-pages N] [--resume]
  count-orgs
  sample-orgs --prefix 東大 --limit 20
  harvest-orgs --out packs/ndl/raw/orgs.raw.ndjson [--delay-ms 300] [--progress 10000] [--max-pages N] [--resume]

Note: NDL SPARQL limits OFFSET+LIMIT to 10,000. Harvest uses keyset paging on ?auth URI.`);
    process.exit(0);
  }

  if (mode === 'count') {
    const json = await runNdlSparql(personCountQuery());
    const count = bindingValue(json.results.bindings[0]?.count);
    console.log(`NDL foaf:Person count: ${count}`);
    return;
  }

  if (mode === 'count-places') {
    const json = await runNdlSparql(placeCountQuery());
    const count = bindingValue(json.results.bindings[0]?.count);
    console.log(`NDL geographic name count (no "--" subdivisions): ${count}`);
    return;
  }

  if (mode === 'count-orgs') {
    const json = await runNdlSparql(orgCountQuery());
    const count = bindingValue(json.results.bindings[0]?.count);
    console.log(`NDL corporate body count (no "--" subdivisions): ${count}`);
    return;
  }

  if (mode === 'sample') {
    const prefix = arg('--prefix', '夏目');
    const limit = Number.parseInt(arg('--limit', '20'), 10);
    const json = await runNdlSparql(personSampleByPrefixQuery({ namePrefix: prefix, limit }));
    const rows = bindingsFromJson(json).map(rawPersonFromBinding);
    console.log(`Sample persons (${prefix}*): ${rows.length}`);
    for (const row of rows.slice(0, 5)) {
      console.log(`  ${row.authorityId} ${row.name}`);
    }
    return;
  }

  if (mode === 'sample-places') {
    const prefix = arg('--prefix', '東京');
    const limit = Number.parseInt(arg('--limit', '20'), 10);
    const json = await runNdlSparql(placeSampleByPrefixQuery({ namePrefix: prefix, limit }));
    const rows = bindingsFromJson(json).map(rawPlaceFromBinding);
    console.log(`Sample places (${prefix}*): ${rows.length}`);
    for (const row of rows.slice(0, 5)) {
      console.log(`  ${row.authorityId} ${row.name}`);
    }
    return;
  }

  if (mode === 'sample-orgs') {
    const prefix = arg('--prefix', '東大');
    const limit = Number.parseInt(arg('--limit', '20'), 10);
    const json = await runNdlSparql(orgSampleByPrefixQuery({ namePrefix: prefix, limit }));
    const rows = bindingsFromJson(json).map(rawOrgFromBinding);
    console.log(`Sample orgs (${prefix}*): ${rows.length}`);
    for (const row of rows.slice(0, 5)) {
      console.log(`  ${row.authorityId} ${row.name}`);
    }
    return;
  }

  if (mode === 'harvest' || mode === 'harvest-places' || mode === 'harvest-orgs') {
    const kind =
      mode === 'harvest-places' ? 'place' : mode === 'harvest-orgs' ? 'org' : 'person';
    const defaultOut =
      kind === 'place'
        ? path.join(ROOT, 'packs/ndl/raw/places.raw.ndjson')
        : kind === 'org'
          ? path.join(ROOT, 'packs/ndl/raw/orgs.raw.ndjson')
          : path.join(ROOT, 'packs/ndl/raw/persons.raw.ndjson');
    const outPath = path.resolve(arg('--out', defaultOut));
    const delayMs = Number.parseInt(arg('--delay-ms', '300'), 10);
    const progressEvery = Number.parseInt(
      arg('--progress', kind === 'place' ? '1000' : '10000'),
      10,
    );
    const maxPagesRaw = arg('--max-pages', '');
    const maxPages = maxPagesRaw ? Number.parseInt(maxPagesRaw, 10) : undefined;
    await cmdHarvest({
      outPath,
      delayMs,
      progressEvery,
      maxPages,
      resume: hasFlag('--resume'),
      kind,
    });
    return;
  }

  throw new Error(`Unknown mode "${mode}"`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

export { rawPersonFromBinding, rawPlaceFromBinding, rawOrgFromBinding, cmdHarvest, resumeCursorFromFile };
