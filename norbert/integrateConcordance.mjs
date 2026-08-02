#!/usr/bin/env node
/** Apply reviewed Norbert concordance rows as bidirectional pack crosswalks. */
import path from 'node:path';
import { readNdjson, writeNdjson } from '../shared/ndjson.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
};

function indexById(records) {
  return new Map(records.map((record) => [String(record.authorityId), record]));
}

function addCrosswalk(record, key, value) {
  record.metadata ??= {};
  record.metadata.crosswalk ??= {};
  if (key === 'wikidata') {
    const values = Array.isArray(record.metadata.crosswalk.wikidata)
      ? record.metadata.crosswalk.wikidata
      : record.metadata.crosswalk.wikidata ? [record.metadata.crosswalk.wikidata] : [];
    if (!values.includes(value)) values.push(value);
    record.metadata.crosswalk.wikidata = values;
  } else if (!record.metadata.crosswalk[key]) {
    record.metadata.crosswalk[key] = value;
  }
}

export function integrateConcordance(concordance, norbert, sources) {
  const norbertById = indexById(norbert);
  const sourceIndexes = Object.fromEntries(
    Object.entries(sources).map(([source, records]) => [source, indexById(records)]),
  );
  let applied = 0;
  for (const row of concordance) {
    const nId = row.metadata?.norbert?.authorityId;
    const match = row.metadata?.matched;
    const n = norbertById.get(String(nId));
    const target = match && sourceIndexes[match.source]?.get(String(match.authorityId));
    if (!n || !target) continue;
    const sourceKey = match.source.toLowerCase();
    addCrosswalk(n, sourceKey, String(match.authorityId));
    addCrosswalk(target, 'norbert', String(n.authorityId));
    applied++;
  }
  return { applied, norbert, sources: Object.fromEntries(Object.entries(sources)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const root = arg('--root', '.');
  const concordancePath = arg('--concordance', path.join(root, 'packs/norbert/norbert-concordance.ndjson'));
  const norbertPath = path.join(root, 'packs/norbert/persons.ndjson');
  const sourceDirs = { cbdb: 'packs/cbdb', dila: 'packs/dila', wikidata: 'packs/wikidata/person-zh-hant-pre-ming' };
  const concordance = readNdjson(concordancePath);
  const norbert = readNdjson(norbertPath);
  const sources = {};
  for (const [source, dir] of Object.entries(sourceDirs)) {
    sources[source] = readNdjson(path.join(root, dir, 'persons.ndjson'));
  }
  const result = integrateConcordance(concordance, norbert, sources);
  writeNdjson(norbertPath, result.norbert);
  for (const [source, records] of Object.entries(result.sources)) {
    writeNdjson(path.join(root, sourceDirs[source], 'persons.ndjson'), records);
  }
  console.log(`Applied ${result.applied} bidirectional concordance links`);
}
