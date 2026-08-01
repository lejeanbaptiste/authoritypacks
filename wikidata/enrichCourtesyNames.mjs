/**
 * Enrich a compiled Wikidata person pack with courtesy names (P1782) fetched
 * live from the Wikidata Query Service. Adds a `names` array (matching the
 * shape used by Norbert/CBDB/DILA packs) to each person record so the
 * Norbert concordance can match on style names against Wikidata too.
 *
 * Checkpointed: partial P1782 results are written to a sidecar file as
 * batches complete, so an interrupted run can resume without re-querying
 * QIDs already fetched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSparql } from './sparqlClient.mjs';
import { readNdjson, writeNdjson } from '../shared/ndjson.mjs';
import { collapseTypedNamesAfterZiClean } from '../norbert/personNames.mjs';
import { normalizeSurface } from '../shared/normalize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadCheckpoint(file) {
  if (!fs.existsSync(file)) return new Map();
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  return new Map(rows);
}

function saveCheckpoint(file, map) {
  fs.writeFileSync(file, JSON.stringify([...map.entries()]));
}

/**
 * @param {{ dir: string, batchSize?: number, pauseMs?: number }} opts
 */
export async function enrichCourtesyNames(opts) {
  const { dir, batchSize = 150, pauseMs = 400 } = opts;
  const personsPath = path.join(dir, 'persons.ndjson');
  const persons = readNdjson(personsPath);
  const qids = [...new Set(persons.map((p) => p.authorityId).filter(Boolean))];

  const checkpointFile = path.join(dir, '.p1782-checkpoint.json');
  const done = loadCheckpoint(checkpointFile);
  const remaining = qids.filter((q) => !done.has(q));

  console.log(`${dir}: ${qids.length} qids total, ${done.size} already cached, ${remaining.length} to query`);

  for (let i = 0; i < remaining.length; i += batchSize) {
    const batch = remaining.slice(i, i + batchSize);
    const values = batch.map((q) => `wd:${q}`).join(' ');
    const query = `SELECT ?item ?courtesy WHERE { VALUES ?item { ${values} } ?item wdt:P1782 ?courtesy . }`;
    const res = await runSparql(query);
    const byQid = new Map();
    for (const row of res.results.bindings) {
      const qid = row.item.value.split('/').pop();
      const list = byQid.get(qid) ?? [];
      list.push(row.courtesy.value);
      byQid.set(qid, list);
    }
    for (const qid of batch) {
      done.set(qid, byQid.get(qid) ?? []);
    }
    saveCheckpoint(checkpointFile, done);
    console.log(`  ${dir}: ${Math.min(i + batchSize, remaining.length)}/${remaining.length} queried, ${[...done.values()].filter((v) => v.length).length} with P1782 so far`);
    if (i + batchSize < remaining.length) await sleep(pauseMs);
  }

  let withCourtesy = 0;
  for (const person of persons) {
    const courtesies = (done.get(person.authorityId) ?? []).filter(Boolean);
    if (courtesies.length === 0) continue;
    withCourtesy++;
    const existing = Array.isArray(person.names) ? person.names : [];
    const primary =
      existing.find((n) => n.type === 'primary') ??
      (person.primaryName
        ? { type: 'primary', text: normalizeSurface(person.primaryName) }
        : null);
    const family =
      existing.find((n) => n.type === 'family') ??
      null;
    const merged = [
      ...(primary ? [primary] : []),
      ...(family ? [family] : []),
      ...existing.filter((n) => n.type !== 'primary' && n.type !== 'family'),
      ...courtesies.map((text) => ({ type: 'courtesy', text: normalizeSurface(text) })),
    ];
    person.names = collapseTypedNamesAfterZiClean(merged);
  }
  writeNdjson(personsPath, persons);
  fs.rmSync(checkpointFile, { force: true });
  console.log(`${dir}: done. ${withCourtesy}/${persons.length} persons now carry a P1782 courtesy name.`);
  return { total: persons.length, withCourtesy };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = arg('--dir');
  const batchSize = Number(arg('--batch', '150'));
  if (!dir) {
    console.error('Usage: node wikidata/enrichCourtesyNames.mjs --dir packs/wikidata/person-zh-hant-tang [--batch 150]');
    process.exit(1);
  }
  await enrichCourtesyNames({ dir: path.resolve(dir), batchSize });
}
