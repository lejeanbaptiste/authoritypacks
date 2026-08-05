#!/usr/bin/env node
/** Apply reviewed Norbert concordance rows as bidirectional pack crosswalks. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNdjson, writeNdjson } from '../shared/ndjson.mjs';
import { barePersonId } from './concordanceHelpers.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
};

/** Index records by authorityId; keep every copy (Wikidata QIDs can appear in several packs). */
function indexByIdMulti(records) {
  /** @type {Map<string, any[]>} */
  const map = new Map();
  for (const record of records) {
    const id = String(record.authorityId);
    const list = map.get(id) ?? [];
    list.push(record);
    map.set(id, list);
  }
  return map;
}

/** Norbert rows are addressable as bare `12` or typed `person-12`. */
function indexNorbertById(records) {
  /** @type {Map<string, any[]>} */
  const map = new Map();
  for (const record of records) {
    const keys = new Set([String(record.authorityId), barePersonId(record.authorityId)]);
    for (const key of keys) {
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(record);
      map.set(key, list);
    }
  }
  return map;
}

function addCrosswalk(record, key, value) {
  record.metadata ??= {};
  record.metadata.crosswalk ??= {};
  if (key === 'wikidata') {
    const values = Array.isArray(record.metadata.crosswalk.wikidata)
      ? record.metadata.crosswalk.wikidata
      : record.metadata.crosswalk.wikidata
        ? [record.metadata.crosswalk.wikidata]
        : [];
    if (!values.includes(value)) values.push(value);
    record.metadata.crosswalk.wikidata = values;
  } else if (!record.metadata.crosswalk[key]) {
    record.metadata.crosswalk[key] = value;
  }
}

/**
 * @param {any[]} concordance
 * @param {any[]} norbert
 * @param {Record<string, any[]>} sources
 */
export function integrateConcordance(concordance, norbert, sources) {
  const norbertById = indexNorbertById(norbert);
  const sourceIndexes = Object.fromEntries(
    Object.entries(sources).map(([source, records]) => [source, indexByIdMulti(records)]),
  );
  let applied = 0;
  let skipped = 0;
  for (const row of concordance) {
    const nId = row.metadata?.norbert?.authorityId;
    const match = row.metadata?.matched;
    const nRecords =
      nId != null
        ? norbertById.get(String(nId)) ?? norbertById.get(barePersonId(nId))
        : undefined;
    const targets =
      match && sourceIndexes[match.source]?.get(String(match.authorityId));
    if (!nRecords?.length || !targets?.length) {
      skipped++;
      continue;
    }
    const sourceKey = String(match.source).toLowerCase();
    for (const n of nRecords) {
      addCrosswalk(n, sourceKey, String(match.authorityId));
    }
    for (const target of targets) {
      addCrosswalk(target, 'norbert', String(nRecords[0].authorityId));
    }
    applied++;
  }
  return {
    applied,
    skipped,
    norbert,
    sources: Object.fromEntries(Object.entries(sources)),
  };
}

/** List `packs/wikidata/person-zh-hant-…/persons.ndjson` files that exist. */
export function listWikidataZhHantPersonPacks(wikidataRoot) {
  if (!fs.existsSync(wikidataRoot)) return [];
  return fs
    .readdirSync(wikidataRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('person-zh-hant-'))
    .map((entry) => path.join(wikidataRoot, entry.name, 'persons.ndjson'))
    .filter((file) => fs.existsSync(file));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(arg('--root', '.'));
  const concordancePath = path.resolve(
    root,
    arg('--concordance', path.join('packs/norbert/norbert-concordance.ndjson')),
  );
  const norbertPath = path.join(root, 'packs/norbert/persons.ndjson');
  const singleDirs = {
    cbdb: path.join(root, 'packs/cbdb/persons.ndjson'),
    dila: path.join(root, 'packs/dila/persons.ndjson'),
  };
  const wikidataFiles = listWikidataZhHantPersonPacks(path.join(root, 'packs/wikidata'));

  const concordance = readNdjson(concordancePath);
  const norbert = readNdjson(norbertPath);
  /** @type {Record<string, any[]>} */
  const sources = {};
  /** @type {{ file: string, records: any[] }[]} */
  const writeBack = [];

  for (const [source, file] of Object.entries(singleDirs)) {
    const records = readNdjson(file);
    sources[source] = records;
    writeBack.push({ file, records });
  }

  const wikidataRecords = [];
  for (const file of wikidataFiles) {
    const records = readNdjson(file);
    wikidataRecords.push(...records);
    writeBack.push({ file, records });
  }
  if (wikidataRecords.length) sources.wikidata = wikidataRecords;

  const result = integrateConcordance(concordance, norbert, sources);
  writeNdjson(norbertPath, result.norbert);
  for (const { file, records } of writeBack) {
    writeNdjson(file, records);
  }
  console.log(
    `Applied ${result.applied} bidirectional concordance links` +
      (result.skipped ? ` (${result.skipped} skipped — missing pack row)` : ''),
  );
}
