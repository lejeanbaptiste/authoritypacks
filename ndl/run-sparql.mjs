/**
 * N1b — NDL SPARQL: count, sample, and paginated person harvest.
 *
 * Usage:
 *   node ndl/run-sparql.mjs count
 *   node ndl/run-sparql.mjs sample --prefix 夏目 --limit 20
 *   node ndl/run-sparql.mjs harvest --out packs/ndl/raw/persons.raw.ndjson
 *   node ndl/run-sparql.mjs harvest --out ... --resume   # continue partial file
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorityIdFromUri, NDL_SPARQL_PAGE_SIZE } from './constants.mjs';
import { personCountQuery, personPageQuery, personSampleByPrefixQuery } from './queries.mjs';
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

/** @param {Record<string, { type?: string, value?: string }>} row */
function rawPersonFromBinding(row) {
  const authUri = bindingValue(row.auth);
  return {
    authorityId: authorityIdFromUri(authUri),
    authUri,
    name: bindingValue(row.name),
    heading: bindingValue(row.heading) || undefined,
    yomi: bindingValue(row.yomi) || undefined,
    birthYear: parseYear(bindingValue(row.birth)),
    deathYear: parseYear(bindingValue(row.death)),
  };
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

async function cmdCount() {
  const json = await runNdlSparql(personCountQuery());
  const count = bindingValue(json.results.bindings[0]?.count);
  console.log(`NDL foaf:Person count: ${count}`);
  return Number.parseInt(count, 10) || count;
}

async function cmdSample(prefix, limit) {
  const json = await runNdlSparql(personSampleByPrefixQuery({ namePrefix: prefix, limit }));
  const rows = bindingsFromJson(json).map(rawPersonFromBinding);
  console.log(`Sample (${prefix}*): ${rows.length} persons`);
  for (const row of rows.slice(0, 5)) {
    console.log(`  ${row.authorityId} ${row.name}${row.birthYear ? ` (${row.birthYear}-${row.deathYear ?? ''})` : ''}`);
  }
  return rows;
}

/**
 * @param {{
 *   outPath: string;
 *   delayMs: number;
 *   progressEvery: number;
 *   maxPages?: number;
 *   resume?: boolean;
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

  const fd = fs.openSync(opts.outPath, opts.resume ? 'a' : 'w');
  let pages = 0;

  try {
    while (true) {
      if (opts.maxPages != null && pages >= opts.maxPages) break;

      const json = await runNdlSparql(personPageQuery({ afterAuth, limit: NDL_SPARQL_PAGE_SIZE }));
      const bindings = bindingsFromJson(json);
      if (bindings.length === 0) break;

      let lastAuthUri = afterAuth;
      for (const row of bindings) {
        const raw = rawPersonFromBinding(row);
        if (!raw.authorityId || !raw.name) continue;
        fs.writeSync(fd, `${JSON.stringify(raw)}\n`);
        total++;
        lastAuthUri = raw.authUri;
      }

      afterAuth = lastAuthUri;
      pages++;

      if (opts.progressEvery > 0 && total > 0 && total % opts.progressEvery < NDL_SPARQL_PAGE_SIZE) {
        console.log(`  harvested ${total} persons (after ${afterAuth})`);
      }
      if (bindings.length < NDL_SPARQL_PAGE_SIZE) break;
      if (opts.delayMs > 0) await sleep(opts.delayMs);
    }
  } finally {
    fs.closeSync(fd);
  }

  const meta = {
    harvestedAt: new Date().toISOString(),
    personsMatched: total,
    pages,
    pageSize: NDL_SPARQL_PAGE_SIZE,
    pagination: 'keyset-after-auth-uri',
    lastAuthUri: afterAuth ?? null,
    resumed: Boolean(opts.resume),
    outPath: opts.outPath,
  };
  const metaPath = opts.outPath.replace(/\.ndjson$/, '-meta.json');
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`Wrote ${total} persons → ${opts.outPath}`);
  console.log(`Meta → ${metaPath}`);
  return meta;
}

async function main() {
  const mode = process.argv[2];
  if (!mode || mode === '--help' || mode === '-h') {
    console.log(`Usage: node ndl/run-sparql.mjs <count|sample|harvest> [options]
  count
  sample --prefix 夏目 --limit 20
  harvest --out packs/ndl/raw/persons.raw.ndjson [--delay-ms 300] [--progress 10000] [--max-pages N] [--resume]

Note: NDL SPARQL limits OFFSET+LIMIT to 10,000. Harvest uses keyset paging on ?auth URI.`);
    process.exit(0);
  }

  if (mode === 'count') {
    await cmdCount();
    return;
  }

  if (mode === 'sample') {
    const prefix = arg('--prefix', '夏目');
    const limit = Number.parseInt(arg('--limit', '20'), 10);
    await cmdSample(prefix, limit);
    return;
  }

  if (mode === 'harvest') {
    const outPath = path.resolve(arg('--out', path.join(ROOT, 'packs/ndl/raw/persons.raw.ndjson')));
    const delayMs = Number.parseInt(arg('--delay-ms', '300'), 10);
    const progressEvery = Number.parseInt(arg('--progress', '10000'), 10);
    const maxPagesRaw = arg('--max-pages', '');
    const maxPages = maxPagesRaw ? Number.parseInt(maxPagesRaw, 10) : undefined;
    await cmdHarvest({
      outPath,
      delayMs,
      progressEvery,
      maxPages,
      resume: hasFlag('--resume'),
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

export { rawPersonFromBinding, cmdHarvest, resumeCursorFromFile };
