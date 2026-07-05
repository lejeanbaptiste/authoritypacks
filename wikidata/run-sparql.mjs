#!/usr/bin/env node
/**
 * W1 — Run Wikidata Query Service prototypes and write CSV reports.
 *
 * Usage:
 *   node wikidata/run-sparql.mjs count --dynasty tang --language zh-hant
 *   node wikidata/run-sparql.mjs sample --dynasty tang --language zh-hant
 *   node wikidata/run-sparql.mjs ambiguous --dynasty tang --language zh-hant
 *   node wikidata/run-sparql.mjs matrix --language zh-hant
 *   node wikidata/run-sparql.mjs place-count --language zh-hant
 *
 * Reports land in reports/w1-*.csv (gitignored).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  personAmbiguityQuery,
  personCountQuery,
  personSampleQuery,
  placeAmbiguityQuery,
  placeCountQuery,
} from './queries.mjs';
import { summarizeWikidataNameFilter } from './personSearchStrings.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WDQS = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'authority-extraction/0.1 (leaf-writer DH; contact: local dev)';

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {string} sparql */
async function runSparql(sparql, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(WDQS, {
        method: 'POST',
        headers: {
          Accept: 'text/csv',
          'Content-Type': 'application/sparql-query',
          'User-Agent': USER_AGENT,
        },
        body: sparql,
      });
      if (!res.ok) {
        const text = await res.text();
        const retryable = res.status >= 500 || res.status === 429;
        if (retryable && attempt < retries) {
          await sleep(2000 * attempt);
          continue;
        }
        throw new Error(`WDQS ${res.status}: ${text.slice(0, 500)}`);
      }
      return res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(2000 * attempt);
        continue;
      }
    }
  }
  throw lastErr ?? new Error('WDQS request failed');
}

/** @param {string} csv */
function parseCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    /** @type {Record<string, string>} */
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function dynastyById(dynasties, id) {
  const d = dynasties.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown dynasty id "${id}" — see wikidata/dynasties.json`);
  return d;
}

function packLanguage(languages, id) {
  const lang = languages.packLanguages.find((x) => x.id === id);
  if (!lang) throw new Error(`Unknown pack language "${id}" — see wikidata/languages.json`);
  return lang;
}

function personExclude(kindQueries) {
  return (kindQueries.kinds.person.excludeInstanceOf ?? []).map((q) => q.replace(/^Q/, 'Q'));
}

function placeTypes(kindQueries) {
  return kindQueries.kinds.place.instanceOf.map((q) => q.replace(/^Q/, 'Q'));
}

function reportPath(slug) {
  const outDir = path.join(ROOT, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  return path.join(outDir, slug);
}

async function cmdCount(dynasty, labelLang, exclude) {
  const sparql = personCountQuery({
    dynastyQid: dynasty.qid,
    labelLang,
    excludeInstanceOf: exclude,
  });
  const csv = await runSparql(sparql);
  const rows = parseCsv(csv);
  const count = rows[0]?.count ?? '?';
  console.log(`${dynasty.id} (${dynasty.qid}) ${labelLang}: ${count} persons`);
  return { dynasty: dynasty.id, labelLang, count: Number.parseInt(String(count), 10) || count, csv };
}

async function cmdSample(dynasty, labelLang, exclude, limit) {
  const sparql = personSampleQuery({
    dynastyQid: dynasty.qid,
    labelLang,
    excludeInstanceOf: exclude,
    limit,
  });
  const csv = await runSparql(sparql);
  const rows = parseCsv(csv);
  console.log(`Sample: ${rows.length} rows for ${dynasty.id} ${labelLang}`);
  return csv;
}

async function cmdFilteredStats(dynasty, labelLang, exclude, limit) {
  const sparql = personSampleQuery({
    dynastyQid: dynasty.qid,
    labelLang,
    excludeInstanceOf: exclude,
    limit,
  });
  const csv = await runSparql(sparql);
  const rows = parseCsv(csv);

  /** @type {Map<string, { primaryLabel: string, aliases: string[], familyName?: string }>} */
  const byItem = new Map();
  for (const row of rows) {
    const item = row.item ?? '';
    let entry = byItem.get(item);
    if (!entry) {
      entry = {
        primaryLabel: row.itemLabel ?? '',
        aliases: [],
        familyName: row.familyName || undefined,
      };
      byItem.set(item, entry);
    }
    const alias = row.alias?.trim();
    if (alias && !entry.aliases.includes(alias)) entry.aliases.push(alias);
    if (row.familyName && !entry.familyName) entry.familyName = row.familyName;
  }

  let rawStrings = 0;
  let filteredStrings = 0;
  /** @type {string[]} */
  const droppedExamples = [];

  for (const entry of byItem.values()) {
    const summary = summarizeWikidataNameFilter(entry);
    rawStrings += summary.rawCount;
    filteredStrings += summary.filteredCount;
    for (const d of summary.dropped) {
      if (droppedExamples.length < 40) droppedExamples.push(d);
    }
  }

  const uniqueDropped = [...new Set(droppedExamples)].slice(0, 25);
  console.log(`Entities in sample: ${byItem.size}`);
  console.log(`Raw label+alias strings: ${rawStrings}`);
  console.log(`After CBDB-aligned filter: ${filteredStrings}`);
  console.log(
    `Dropped ${rawStrings - filteredStrings} (${rawStrings ? (((rawStrings - filteredStrings) / rawStrings) * 100).toFixed(1) : 0}%)`,
  );
  console.log('Sample dropped strings:', uniqueDropped.join(', '));

  const out = reportPath(`w1-person-filter-stats-${labelLang}-${dynasty.id}.txt`);
  fs.writeFileSync(
    out,
    [
      `dynasty: ${dynasty.id} (${dynasty.qid})`,
      `language: ${labelLang}`,
      `entities: ${byItem.size}`,
      `raw_strings: ${rawStrings}`,
      `filtered_strings: ${filteredStrings}`,
      `dropped_pct: ${rawStrings ? (((rawStrings - filteredStrings) / rawStrings) * 100).toFixed(1) : 0}`,
      '',
      'sample_dropped:',
      ...uniqueDropped.map((s) => `- ${s}`),
    ].join('\n'),
  );
  console.log(`Wrote ${out}`);
}

async function cmdAmbiguous(dynasty, labelLang, exclude, limit) {
  const sparql = personAmbiguityQuery({
    dynastyQid: dynasty.qid,
    labelLang,
    excludeInstanceOf: exclude,
    limit,
  });
  const csv = await runSparql(sparql);
  const rows = parseCsv(csv);
  console.log(`Ambiguous labels: ${rows.length} (top entityCount ${rows[0]?.entityCount ?? '—'})`);
  if (rows[0]) console.log(`  e.g. "${rows[0].label}" → ${rows[0].entityCount} entities`);
  return csv;
}

async function main() {
  const mode = process.argv[2];
  if (!mode || mode === '--help' || mode === '-h') {
    console.log(`Usage: node wikidata/run-sparql.mjs <count|sample|ambiguous|filtered-stats|matrix|place-count|place-ambiguous> [options]
  --dynasty tang       Dynasty id from dynasties.json (default: tang)
  --language zh-hant   Pack language id from languages.json (default: zh-hant)
  --limit 500          Row limit for sample/ambiguous queries
  --delay-ms 2000      Pause between matrix requests (default: 2000)`);
    process.exit(0);
  }

  const dynasties = loadJson('wikidata/dynasties.json').dynasties;
  const kindQueries = loadJson('wikidata/kind-queries.json');
  const languages = loadJson('wikidata/languages.json');

  const dynastyId = arg('--dynasty', 'tang');
  const languageId = arg('--language', 'zh-hant');
  const limit = Number.parseInt(arg('--limit', '500'), 10);
  const delayMs = Number.parseInt(arg('--delay-ms', '2000'), 10);

  const dynasty = dynastyById(dynasties, dynastyId);
  const packLang = packLanguage(languages, languageId);
  const labelLang = packLang.wikidataLabelLanguages[0];
  const exclude = personExclude(kindQueries);

  if (mode === 'count') {
    const { csv } = await cmdCount(dynasty, labelLang, exclude);
    const out = reportPath(`w1-person-count-${languageId}-${dynastyId}.csv`);
    fs.writeFileSync(out, csv);
    console.log(`Wrote ${out}`);
    return;
  }

  if (mode === 'sample') {
    const csv = await cmdSample(dynasty, labelLang, exclude, limit);
    const out = reportPath(`w1-person-sample-${languageId}-${dynastyId}.csv`);
    fs.writeFileSync(out, csv);
    console.log(`Wrote ${out}`);
    return;
  }

  if (mode === 'ambiguous') {
    const csv = await cmdAmbiguous(dynasty, labelLang, exclude, limit);
    const out = reportPath(`w1-person-ambiguous-${languageId}-${dynastyId}.csv`);
    fs.writeFileSync(out, csv);
    console.log(`Wrote ${out}`);
    return;
  }

  if (mode === 'filtered-stats') {
    await cmdFilteredStats(dynasty, labelLang, exclude, limit);
    return;
  }

  if (mode === 'matrix') {
    const targets = dynasties.filter((d) => d.priority === 1);
    const header = 'dynasty_id,dynasty_qid,label_lang,person_count';
    const lines = [header];
    for (const d of targets) {
      try {
        const { count } = await cmdCount(d, labelLang, exclude);
        lines.push(`${d.id},${d.qid},${labelLang},${count}`);
      } catch (err) {
        console.error(`  skip ${d.id}: ${err.message}`);
        lines.push(`${d.id},${d.qid},${labelLang},ERROR`);
      }
      await sleep(delayMs);
    }
    const out = reportPath(`w1-person-count-matrix-${languageId}.csv`);
    fs.writeFileSync(out, `${lines.join('\n')}\n`);
    console.log(`Wrote ${out}`);
    return;
  }

  if (mode === 'place-count') {
    const types = placeTypes(kindQueries);
    const excludePlace = kindQueries.kinds.place.excludeInstanceOf ?? [];
    const sparql = placeCountQuery({
      labelLang,
      instanceOf: types,
      excludeInstanceOf: excludePlace,
    });
    const csv = await runSparql(sparql);
    const rows = parseCsv(csv);
    console.log(`Places (${labelLang}): ${rows[0]?.count ?? '?'} items`);
    const out = reportPath(`w1-place-count-${languageId}.csv`);
    fs.writeFileSync(out, csv);
    console.log(`Wrote ${out}`);
    return;
  }

  if (mode === 'place-ambiguous') {
    const types = placeTypes(kindQueries);
    const excludePlace = kindQueries.kinds.place.excludeInstanceOf ?? [];
    const sparql = placeAmbiguityQuery({
      labelLang,
      instanceOf: types,
      excludeInstanceOf: excludePlace,
      limit,
    });
    const csv = await runSparql(sparql);
    const out = reportPath(`w1-place-ambiguous-${languageId}.csv`);
    fs.writeFileSync(out, csv);
    const rows = parseCsv(csv);
    console.log(`Place ambiguous labels: ${rows.length}`);
    console.log(`Wrote ${out}`);
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
